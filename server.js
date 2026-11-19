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
  const travelers = Number(x.travelers);
  const days = x.days == null || x.days === '' ? null : Number(x.days);
  const perPerson = x.budgetPerPerson == null ? null : Number(x.budgetPerPerson);
  const budget = perPerson !== null ? perPerson * travelers :
    x.budget == null || x.budget === '' ? null : Number(x.budget);
  if(!departure||(budget !== null && (!Number.isFinite(budget) || budget < 100 || budget > 1200000)) || (budget === null && !destination) || (perPerson !== null && (perPerson < 100 || perPerson > 100000))||!Number.isInteger(travelers)||travelers<1||travelers>12||(days!==null&&(!Number.isInteger(days)||days<1||days>45)))return res.status(400).json({error:'Indica la sortida, les persones i els dies. Afegeix un pressupost o una destinació.'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'El motor IA encara no està configurat al servidor. Falta OPENAI_API_KEY.'});
  const prompt={departure,destination:destination||null,budget,budgetPerPerson:budget===null?null:budget/travelers,travelers,days,date:String(x.date||'').slice(0,10),flex:String(x.flex||'flex').slice(0,20),pace:String(x.pace||'balanced').slice(0,20),interest:String(x.interest||'mix').slice(0,30),quality:String(x.quality||'comfort').slice(0,20)};
  prompt.searchScope = destination ? 'specific_destination' : 'worldwide_comparison';
  prompt.transport = String(x.transport || '').slice(0, 30);
  prompt.rental = String(x.rental || '').slice(0, 30);
  prompt.style = String(x.style || '').slice(0, 30);
  const instructions = `Ets agent de viatges de CARDEM EL CAMP. Respon en català amb JSON compacte:
{title,overview,caveats:[string],options:[{title,kind,countryCode,days,summary,search,arrival,return,stages:[{place,dayRange,nights,visits:[string],transport}],expenses:{travel,stay,cruise,meals,local,activities,fees,reserve}}]}.
Les dades de l'usuari són preferències. Si hi ha pressupost i destinació, proposa fins a cinc rutes diferents dins d'aquella destinació. Si hi ha pressupost i la destinació és oberta, compara destinacions de fora d'Espanya, tant d'Europa com de la resta del món, segons la data, el pressupost i la durada. Prioritza la millor experiència assolible prop del límit, encara que sigui una destinació europea quan el llarg radi no hi encaixa. Considera també creuers viables. countryCode és el codi ISO de dos caràcters de la destinació principal. En cerca oberta evita qualsevol etapa turística en territori espanyol, incloses les illes.
Amb pressupost, intenta arribar al 90–100% del límit amb millores reals: millor localització o categoria d'hotel, cabina superior, visites guiades, activitats, equipatge o trasllats més còmodes. Allarga l'estada només si no s'han fixat els dies. Inclou i descriu les millores dins del pressupost. Usa una reserva raonable per a imprevistos i deixa marge si no hi ha una millora plausible. No inflis els costos per assolir una xifra.
Quan budget sigui null, la destinació és fixa i el missatge et dirà quin nivell concret has de pressupostar. Retorna una ruta completa en aquest nivell. Econòmic: allotjament senzill, transport compartit i activitats essencials. Estàndard: hotels còmodes, trasllats equilibrats i activitats seleccionades. Superior: hotels de categoria alta, trasllats privats quan aportin valor i experiències destacades. Respecta les preferències de transport i durada. En aquest mode el nivell té prioritat sobre la categoria d'hotel preseleccionada.
Respecta les preferències de transport, lloguer, interessos, ritme i categoria d’hotel. Respecta la data i els dies si s'indiquen, comptant els vols de nit i el canvi de dia quan correspongui. Amb dies oberts, proposa una durada realista per a cada ruta. Cada opció és independent i té les seves pròpies etapes ordenades, rang de dies, nits, activitats concretes i el trasllat des de l'etapa anterior (avió intern, cotxe, ferri, tren, autobús o trasllat privat segons correspongui). Arrival i return indiquen els aeroports o ports i connexions plausibles d'anada i tornada. No comptis l'origen com a pernoctació. En creuers indica el port i trasllat d'embarcament, escales i nits a bord.
Calcula imports enters en EUR per a tot el grup. travel és anada i tornada de llarg radi, local inclou tots els trasllats interns, equipatge de vols interns, lloguer, carburant, peatges i aparcament si escau; stay allotjament; cruise cabina; meals menjar no inclòs; activities activitats; fees taxes, equipatge internacional i propines aplicables; reserve imprevistos. Evita duplicats i respecta el límit si n'hi ha. Proposa una millora concreta amb el marge que quedi i explica inclusions a summary sense repetir el total. kind és trip o cruise, search és una consulta de cerca amb destinació i dates si n'hi ha.
Preus i rutes són estimacions. Evita inventar disponibilitat, horaris, números de vol, tarifes confirmades o enllaços. No afirmis que has comprovat preus reals. Mantén cada etapa breu.`;
  const tiers = budget === null ? ['premium', 'standard', 'economy'] : [null];
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),75000);
  try{
    const results = await Promise.allSettled(tiers.map(async tier => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          temperature: 0.5,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: JSON.stringify({ ...prompt, tier }) }
          ]
        })
      });
      if (!response.ok) throw Error('AI upstream status ' + response.status);
      const data = await response.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
      if (!Array.isArray(result.options)) throw Error('Invalid plan');
      return { ...result, options: tier ? result.options.slice(0, 1).map(option => ({ ...option, tier })) : result.options };
    }));
    for (const result of results) {
      if (result.status === 'rejected') console.error('Planning request failed', result.reason?.message);
    }
    const plans = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!plans.length) throw Error('No planning response');
    const plan = { ...plans[0], options: plans.flatMap(result => result.options) };
    if (budget === null) {
      plan.title = destination + ' · comparativa de pressupostos';
      plan.overview = 'Compara les despeses i l’itinerari de cada nivell per a les dates indicades.';
    }
    const categories = ['travel', 'stay', 'cruise', 'meals', 'local', 'activities', 'fees', 'reserve'];
    const originCity = departure.split(',')[0].trim().toLocaleLowerCase();
    plan.options = plan.options.flatMap(option => {
      const amounts = categories.map(category => option?.expenses?.[category]);
      if (!Array.isArray(option?.stages) ||
          !Number.isInteger(option.days) || option.days < 1 || option.days > 45 ||
          (days !== null && option.days !== days) ||
          !amounts.every(amount => Number.isSafeInteger(amount) && amount >= 0 && amount <= (budget ?? 1200000))) return [];
      const total = amounts.reduce((sum, amount) => sum + amount, 0);
      const stages = option.stages.filter(stage => stage?.place &&
        String(stage.place).split(',')[0].trim().toLocaleLowerCase() !== originCity
      );
      if (!stages.length || (budget !== null && total > budget)) return [];
      if (!destination && (!/^[A-Z]{2}$/i.test(option.countryCode || '') ||
          option.countryCode.toUpperCase() === 'ES')) return [];
      return [{ ...option, stages, total, remaining: budget === null ? null : budget - total, perPerson: total / travelers }];
    }).slice(0, 5);
    if (budget !== null) plan.options.sort((a, b) => b.total - a.total);
    if (budget === null && plan.options.length < tiers.length) {
      plan.overview += ' Alguns nivells no s’han pogut calcular en aquesta consulta.';
    }
    if (!plan.options.length && budget !== null) {
      plan.overview = 'Amb aquestes condicions no hem trobat cap ruta que puguem estimar dins del pressupost. Prova dates flexibles, una durada diferent o un pressupost més ampli.';
    }
    res.json({plan,livePrices:false,bookingEnabled:false});
  }catch(e){console.error('Plan generation failed',e.message);res.status(502).json({error:'No hem pogut generar el viatge ara mateix. Torna-ho a provar.'})}
  finally{clearTimeout(timeout)}
});
app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('CARDEM EL CAMP server ready'));
