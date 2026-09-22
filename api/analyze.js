function heuristic(body){
  const note=String(body.note||'').toLowerCase();
  const triggers=['extra','additional','not in scope','not shown','not on','asked us','requested','changed','change','rework','redo','outside scope','added','directed us','gc asked','owner asked'];
  const matched=triggers.filter(t=>note.includes(t));
  const hours=Number(body.crewCount||0)*Number(body.hoursEach||0);
  const cost=hours*Number(body.laborRate||0)+Number(body.directCost||0);
  const value=Math.round(cost*(1+Number(body.markup||20)/100));
  return {is_extra:matched.length>0,confidence:matched.length>1?.88:matched.length?.72:.35,title:matched.length?'Potential out-of-scope field work':'Field work appears consistent with scope',reason:matched.length?`Change language detected: ${matched.slice(0,3).join(', ')}.`:'No strong change-order language was detected.',labor_hours:hours,estimated_cost:cost,estimated_value:value,source:'ScopeGuard rules'};
}
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  const body=req.body||{};
  if(!process.env.OPENAI_API_KEY) return res.status(200).json(heuristic(body));
  try{
    const prompt=`You are ScopeGuard, a construction subcontractor field-cost analyst. Compare the original contracted scope to today's field note. Decide whether the note likely describes extra, changed, rework, directed, or out-of-scope work. Be conservative: do not claim legal entitlement. Return ONLY valid JSON with keys is_extra (boolean), confidence (0-1), title (short string), reason (one sentence), labor_hours (number), estimated_cost (number), estimated_value (number). Estimated cost = crew_count * hours_each * labor_rate + direct_cost. Estimated value = estimated cost * (1 + markup/100).\n\nORIGINAL SCOPE:\n${body.scope||'(none)'}\n\nFIELD NOTE:\n${body.note||''}\n\ncrew_count=${body.crewCount||0}; hours_each=${body.hoursEach||0}; labor_rate=${body.laborRate||0}; direct_cost=${body.directCost||0}; markup=${body.markup||20}`;
    const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-5.6-luna',input:prompt})});
    if(!r.ok) throw new Error(`OpenAI ${r.status}`);
    const data=await r.json();
    const text=data.output_text || (data.output||[]).flatMap(o=>o.content||[]).map(c=>c.text||'').join('');
    const parsed=JSON.parse(String(text).replace(/^```json\s*|\s*```$/g,''));
    parsed.source='ScopeGuard AI'; return res.status(200).json(parsed);
  }catch(err){ const h=heuristic(body); h.source='ScopeGuard rules (AI fallback)'; return res.status(200).json(h); }
}
