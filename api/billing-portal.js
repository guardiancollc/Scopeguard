'use strict';
const {userFromBearer}=require('../lib/google-email');
const {requireMembership,requireRole}=require('../lib/company-membership');
const {readSubscription}=require('../lib/subscription-store');
const {stripeRequest}=require('../lib/stripe');

function origin(req){
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0];
  if(!host) throw Object.assign(new Error('Application URL is not configured.'),{status:500});
  return `${proto}://${host}`;
}

module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const user=await userFromBearer(req);
    const companyId=String(req.body?.companyId||'').trim();
    if(!companyId) return res.status(400).json({error:'Company ID is required.'});
    requireRole(await requireMembership(user.id,companyId),['owner']);
    const subscription=await readSubscription(companyId);
    if(!subscription?.stripe_customer_id || !subscription?.stripe_subscription_id ||
      subscription.lifetime_access || subscription.plan_id==='business_lifetime'){
      return res.status(400).json({error:'No recurring subscription is available to manage.'});
    }
    const session=await stripeRequest('/billing_portal/sessions',{
      customer:subscription.stripe_customer_id,
      return_url:`${origin(req)}/plans.html`
    });
    if(!session?.url) throw new Error('Stripe did not return a billing portal URL.');
    return res.json({url:session.url});
  }catch(error){
    console.error(error);
    return res.status(error.status||500).json({error:error.message||'Could not open subscription management.'});
  }
};
