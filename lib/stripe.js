'use strict';

const STRIPE_API='https://api.stripe.com/v1';

function secret(){
  const key=String(process.env.STRIPE_SECRET_KEY||'').trim();
  if(!key) throw Object.assign(new Error('Stripe is not configured yet.'),{status:503});
  return key;
}

async function stripeRequest(path,params={}){
  const body=new URLSearchParams();
  for(const [key,value] of Object.entries(params)){
    if(value===undefined||value===null||value==='') continue;
    body.append(key,String(value));
  }
  const response=await fetch(`${STRIPE_API}${path}`,{
    method:'POST',
    headers:{Authorization:`Bearer ${secret()}`,'Content-Type':'application/x-www-form-urlencoded'},
    body
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const error=new Error(data?.error?.message||'Stripe request failed.');
    error.status=response.status;
    throw error;
  }
  return data;
}

module.exports={stripeRequest};
