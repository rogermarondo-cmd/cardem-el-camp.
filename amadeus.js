const dateOK = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const limited = new Map();
export function installAmadeus(app) {
  app.post('/api/amadeus/flights', async (req,res) => {
    res.set('Cache-Control','no-store');
    const key=process.env.AMADEUS_CLIENT_ID, secret=process.env.AMADEUS_CLIENT_SECRET;
    if (!key || !secret) return res.status(503).json({error:'Amadeus pendent de credencials.'});
    const {from,to,outbound,inbound,adults}=req.body||{};
    const a=Number(adults);
    if (!/^[A-Z]{3}$/.test(from)|| !/^[A-Z]{3}$/.test(to)||from===to||
      !dateOK(outbound)||outbound<new Date().toISOString().slice(0,10)||
      (inbound && (!dateOK(inbound)||inbound<outbound))||
      !Number.isInteger(a)||a<1||a>9) return res.status(400).json({error:'Aeroports, dates o passatgers incorrectes.'});
    const ip=req.ip||'unknown', now=Date.now(), entry=limited.get(ip)||{at:now,count:0};
    if(now-entry.at>60000){entry.at=now;entry.count=0;}
    if(++entry.count>5)return res.status(429).json({error:'Massa consultes. Torna-ho a provar en un minut.'});
    limited.set(ip,entry);
    if(limited.size>500)for(const [k,v] of limited)if(now-v.at>60000)limited.delete(k);
    const base=process.env.AMADEUS_ENV==='production'?'https://api.amadeus.com':'https://test.api.amadeus.com';
    try{
      const auth=await fetch(base+'/v1/security/oauth2/token',{method:'POST',signal:AbortSignal.timeout(12000),
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({grant_type:'client_credentials',client_id:key,client_secret:secret})});
      if(!auth.ok)throw new Error('Amadeus authentication '+auth.status);
      const token=(await auth.json()).access_token;
      if(!token)throw new Error('Missing Amadeus access token');
      const params=new URLSearchParams({originLocationCode:from,destinationLocationCode:to,departureDate:outbound,adults:String(a),currencyCode:'EUR',max:'10'});
      if(inbound)params.set('returnDate',inbound);
      const response=await fetch(base+'/v2/shopping/flight-offers?'+params,{signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+token}});
      if(!response.ok)throw new Error('Amadeus flight search '+response.status);
      const json=await response.json();
      const offers=(Array.isArray(json.data)?json.data:[]).filter(o=>o.price?.grandTotal&&o.price?.currency==='EUR')
        .map(o=>({amount:Number(o.price.grandTotal),currency:'EUR',airline:o.validatingAirlineCodes?.[0]||'',legs:(o.itineraries||[]).map(i=>(i.segments||[]).map(s=>({from:s.departure?.iataCode,to:s.arrival?.iataCode,departure:s.departure?.at,arrival:s.arrival?.at}))),lastTicketingDate:o.lastTicketingDate}))
        .filter(o=>Number.isFinite(o.amount)&&o.amount>0).sort((a,b)=>a.amount-b.amount);
      return res.json({provider:'Amadeus',environment:process.env.AMADEUS_ENV==='production'?'production':'test',searchedAt:new Date().toISOString(),offers});
    }catch(e){console.error('Amadeus API failure:',e.message);return res.status(502).json({error:'No s’han pogut consultar els vols a Amadeus.'});}
  });
}
