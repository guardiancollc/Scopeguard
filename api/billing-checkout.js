'use strict';
const {userFromBearer}=require('../lib/google-email');
const {requireMembership}=require('../lib/company-membership');
const {providerPriceId,isPurchasable}=require('../lib/billing-catalog');
const {stripeRequest}=require('../lib/stripe');
const {getPlan}=require('../lib/plans');

function origin(req){
  const configured=String(process.env.APP_URL||'').trim().replace(/\/$/,'');
  if(configured) return configured;
  const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0];
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0];
  if(!host) throw Object.assign(new Error('Application URL is not configured.'),{status:500});
  return `${proto}://${host}`;
}

module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const user=await userFromBearer(req);
    const companyId=String(req.body?.companyId||req.headers['x-scopeguard-company-id']||'').trim();
    const planId=String(req.body?.planId||'').trim();
    if(!companyId||!isPurchasable(planId)) return res.status(400).json({error:'A valid company and plan are required.'});
    const membership=await requireMembership(user.id,companyId,['owner']);
    const price=providerPriceId(planId);
    if(!price) return res.status(503).json({error:'This ScopeGuard plan is not connected to Stripe yet.'});
    const plan=getPlan(planId);
    const base=origin(req);
    const params={
      'line_items[0][price]':price,
      'line_items[0][quantity]':1,
      mode:plan.billingInterval==='lifetime'?'payment':'subscription',
      success_url:`${base}/plans.html?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:`${base}/plans.html?checkout=cancelled`,
      client_reference_id:companyId,
      customer_email:user.email||'',
      'metadata[company_id]':companyId,
      'metadata[plan_id]':planId,
      'metadata[purchaser_user_id]':user.id,
      allow_promotion_codes:'true'
    };
    if(plan.billingInterval!=='lifetime'){
      params['subscription_data[metadata][company_id]']=companyId;
      params['subscription_data[metadata][plan_id]']=planId;
    }else{
      params['payment_intent_data[metadata][company_id]']=companyId;
      params['payment_intent_data[metadata][plan_id]']=planId;
    }
    const session=await stripeRequest('/checkout/sessions',params);
    return res.json({url:session.url,id:session.id,planId,membershipRole:membership.role});
  }catch(error){
    console.error(error);
    return res.status(error.status||500).json({error:error.message||'Could not start checkout.'});
  }
};
