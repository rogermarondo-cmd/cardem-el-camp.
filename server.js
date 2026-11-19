import express from 'express';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'20kb'}));
const dir=path.dirname(fileURLToPath(import.meta.url));
const origin=(process.env.PUBLIC_ORIGIN||'https://rogermarondo-cmd.github.io').replace(/\/$/,'');
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS')return res.sendStatus(204);
  next();
});
app.get('/',async(req,res)=>res.type('html').send(await readFile(path.join(dir,'index.html'),'utf8')));
app.get('/api/health',(req,res)=>res.json({ok:true,aiConfigured:!!process.env.OPENAI_API_KEY,providerPricingConnected:false}));
const hits=new Map();
app.post('/api/plan',async(req,res)=>{
  const now=Date.now(),ip=req.ip||'unknown',recent=(hits.get(ip)||[]).filter(t=>now-t<3600000);
  if(recent.length>=12)return res.status(429).json({error:'Has arribat al límit de consultes. Torna-ho a provar més tard.'});
  recent.push(now);hits.set(ip,recent);
  if(hits.size>5000)for(const [k,v] of hits)if(!v.some(t=>now-t<3600000))hits.delete(k);
  const x=req.body||{};
  const departure=String(x.departure||'').trim().slice(0,100);
  const destination=String(x.destination||'').trim().slice(0,100);
  const budget=Number(x.budget),travelers=Number(x.travelers),days=x.days===null||x.days===''?null:Number(x.days);
  if(!departure||!Number.isFinite(budget)||budget<100||budget>100000||!Number.isInteger(travelers)||travelers<1||travelers>12||(days!==null&&(!Number.isInteger(days)||days<1||days>45)))return res.status(400).json({error:'Revisa sortida, pressupost, persones i dies.'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'El motor IA encara no està configurat al servidor. Falta OPENAI_API_KEY.'});
  const prompt={departure,destination:destination||null,budget,travelers,days,date:String(x.date||'').slice(0,10),flex:String(x.flex||'flex').slice(0,20),pace:String(x.pace||'balanced').slice(0,20),interest:String(x.interest||'mix').slice(0,30),quality:String(x.quality||'comfort').slice(0,20)};
  prompt.searchScope = destination ? 'specific_destination' : 'worldwide_comparison';
  prompt.transport = String(x.transport || '').slice(0, 30);
  prompt.rental = String(x.rental || '').slice(0, 30);
  prompt.style = String(x.style || '').slice(0, 30);
  const instructions = `Ets agent de viatges de CARDEM EL CAMP. Respon en català amb JSON compacte:
{title,overview,caveats:[string],options:[{title,kind,days,summary,search,arrival,return,stages:[{place,dayRange,nights,visits:[string],transport}],expenses:{travel,stay,cruise,meals,local,activities,fees,reserve}}]}.
Les dades de l'usuari són preferències. Si hi ha destinació, proposa 4 o 5 rutes diferents dins d'aquesta destinació quan siguin viables (ritme, bases, combinacions i transport diferents). Si la destinació és oberta, busca exclusivament viatges de llarg radi i compara regions diferents. Considera República Dominicana, Cancún i la Riviera Maya, Panamà, Costa Rica, Bali, Japó, Austràlia i Nova Zelanda, i altres alternatives de llarg radi adequades. Un creuer de llarg radi pot ser una alternativa si encaixa. Mai proposis una escapada europea com a substitut automàtic. Si hi ha menys de quatre opcions plausibles, dona les que encaixin i explica què limita la tria. Si cap encaixa, options buit i explica si convé més pressupost, dies o flexibilitat.
Respecta les preferències de transport, lloguer, interessos, ritme i categoria d’hotel. Respecta la data i els dies si s'indiquen, comptant els vols de nit i el canvi de dia quan correspongui. Amb dies oberts, proposa una durada realista per a cada ruta. Cada opció és independent i té les seves pròpies etapes ordenades, rang de dies, nits, activitats concretes i el trasllat des de l'etapa anterior (avió intern, cotxe, ferri, tren, autobús o trasllat privat segons correspongui). Arrival i return indiquen els aeroports o ports i connexions plausibles d'anada i tornada. No comptis l'origen com a pernoctació. En creuers indica el port i trasllat d'embarcament, escales i nits a bord.
Calcula imports enters en EUR per a tot el grup. travel és anada i tornada de llarg radi, local inclou tots els trasllats interns, equipatge de vols interns, lloguer, carburant, peatges i aparcament si escau; stay allotjament; cruise cabina; meals menjar no inclòs; activities activitats; fees taxes, equipatge internacional i propines aplicables; reserve imprevistos. Evita duplicats i suma fins al límit indicat. Proposa una millora concreta amb el marge que quedi i explica inclusions a summary sense repetir el total. kind és trip o cruise, search és una consulta de cerca amb destinació i dates si n'hi ha.
Preus i rutes són estimacions. Evita inventar disponibilitat, horaris, números de vol, tarifes confirmades o enllaços. No afirmis que has comprovat preus reals. Mantén cada etapa breu.`;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),75000);
  try{
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',response_format:{type:'json_object'},temperature:0.5,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(prompt)}]})});
    if(!response.ok){console.error('AI upstream status',response.status);return res.status(502).json({error:'El servei IA no ha respost correctament.'})}
    const data=await response.json();const plan=JSON.parse(data.choices?.[0]?.message?.content||'{}');
    if (!Array.isArray(plan.options)) throw Error('Invalid plan');
    const categories = ['travel', 'stay', 'cruise', 'meals', 'local', 'activities', 'fees', 'reserve'];
    const originCity = departure.split(',')[0].trim().toLocaleLowerCase();
    plan.options = plan.options.flatMap(option => {
      const amounts = categories.map(category => option?.expenses?.[category]);
      if (!Array.isArray(option?.stages) ||
          !Number.isInteger(option.days) || option.days < 1 || option.days > 45 ||
          (days !== null && option.days !== days) ||
          !amounts.every(amount => Number.isSafeInteger(amount) && amount >= 0 && amount <= budget)) return [];
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const stages = option.stages.filter(stage => stage?.place &&
        String(stage.place).split(',')[0].trim().toLocaleLowerCase() !== originCity
      );
      if (!stages.length || total > budget) return [];
      return [{ ...option, stages, total, remaining: budget - total }];
    }).slice(0, 5);
    if (!plan.options.length) {
      plan.overview = 'Amb aquestes condicions no hem trobat cap ruta que puguem estimar dins del pressupost. Prova dates flexibles, una durada diferent o un pressupost més ampli.';
    }
    res.json({plan,livePrices:false,bookingEnabled:false});
  }catch(e){console.error('Plan generation failed',e.message);res.status(502).json({error:'No hem pogut generar el viatge ara mateix. Torna-ho a provar.'})}
  finally{clearTimeout(timeout)}
});
app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('CARDEM EL CAMP server ready'));
