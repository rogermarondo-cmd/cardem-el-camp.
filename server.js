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
  const instructions=`Ets un planificador de viatges professional de CARDEM EL CAMP. Respon NOMÉS JSON vàlid amb claus: title (string), overview (string), itinerary (array d'objectes {place,nights,visits,transport,reason}), logistics (array strings), budget_notes (array strings), booking_searches (array d'objectes {kind,query}), caveats (array strings). En català. Construeix un itinerari nou segons les preferències, amb diferents pobles i ciutats, nits coherents i transports realistes. Si els dies no s'especifiquen, proposa una durada raonable i explica-la. Quan no hi ha destinació, proposa un itinerari concret i esmenta 2 alternatives a overview. No inventis preus, disponibilitat, puntuacions hoteleres, vols, distàncies exactes, reserves ni ofertes. No afirmis haver consultat dades en temps real. Els pressupostos són límits, no cal gastar-los per força. Valora cotxe, tren, transport públic o conductor segons geografia i seguretat. Moto només si legal, assegurada i adequada al conductor. No incloguis instruccions per pagar. Els enllaços de cerca els construirà la web.`;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),35000);
  try{
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',response_format:{type:'json_object'},temperature:0.5,messages:[{role:'system',content:instructions},{role:'user',content:JSON.stringify(prompt)}]})});
    if(!response.ok){console.error('AI upstream status',response.status);return res.status(502).json({error:'El servei IA no ha respost correctament.'})}
    const data=await response.json();const plan=JSON.parse(data.choices?.[0]?.message?.content||'{}');
    if(!Array.isArray(plan.itinerary)||!plan.itinerary.length)throw Error('Invalid itinerary');
    res.json({plan,livePrices:false,bookingEnabled:false});
  }catch(e){console.error('Plan generation failed',e.message);res.status(502).json({error:'No hem pogut generar el viatge ara mateix. Torna-ho a provar.'})}
  finally{clearTimeout(timeout)}
});
app.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('CARDEM EL CAMP server ready'));
