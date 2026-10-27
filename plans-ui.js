'use strict';
let db=null,session=null,companyId='';
const nativeBillingBlocked=Boolean(window.SCOPEGUARD_NATIVE?.enabled);
const cfg={supabaseUrl:'https://yqgovlrxyizobsnqycko.supabase.co',supabasePublishableKey:'sb_publishable_w3NPUZg6sWB4u64imbKxpg_f7UM_JTz'};
const esc=v=>String(v??'').replace(/[&<>"']/g,'');
function notice(text,type='info'){const el=document.getElementById('checkoutMessage');el.textContent=text;el.className=`checkout-message ${type}`;}
async function headers(){const {data}=await db.auth.getSession();session=data.session;if(!session)throw new Error('Please sign in first.');return {Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json','x-scopeguard-company-id':companyId};}
async function startCheckout(planId,button){if(nativeBillingBlocked){notice('Subscriptions are not available in this mobile development build.','info');return;}const original=button.textContent;document.querySelectorAll('.checkout-btn').forEach(b=>b.disabled=true);button.textContent='Opening secure checkout…';try{const r=await fetch('/api/billing-checkout',{method:'POST',headers:await headers(),body:JSON.stringify({companyId,planId})});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Could not start checkout.');if(!body.url)throw new Error('Stripe did not return a checkout URL.');location.href=body.url;}catch(e){notice(e.message,'error');document.querySelectorAll('.checkout-btn').forEach(b=>b.disabled=false);button.textContent=original;}}
async function openBillingPortal(button){if(nativeBillingBlocked){notice('Subscription management is not available in this mobile development build.','info');return;}
  button.disabled=true;
  button.textContent='Opening subscription management…';
  try{
    const r=await fetch('/api/billing-portal',{method:'POST',headers:await headers(),body:JSON.stringify({companyId})});
    const body=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(body.error||'Could not open subscription management.');
    if(!body.url)throw new Error('Stripe did not return a billing portal URL.');
    location.href=body.url;
  }catch(e){
    notice(e.message||'Could not open subscription management.','error');
    button.disabled=false;
    button.textContent='Manage subscription / Cancel plan';
  }
}
(async()=>{try{db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);const {data}=await db.auth.getSession();session=data.session;if(!session){location.href='/';return;}const {data:members,error}=await db.from('company_members').select('company_id,role').eq('user_id',session.user.id).limit(1);if(error)throw error;if(!members?.length)throw new Error('No company found.');companyId=members[0].company_id;
const checkoutButtons=[...document.querySelectorAll('.checkout-btn')];
if(nativeBillingBlocked){
  checkoutButtons.forEach(b=>{b.disabled=true;b.hidden=true;});
  notice('Mobile purchases are not yet available in this development build.','info');
}else if(members[0].role!=='owner'){
  checkoutButtons.forEach(b=>b.disabled=true);
  notice('Only the company owner can purchase or change the ScopeGuard plan.','info');
}else{
  checkoutButtons.forEach(btn=>btn.addEventListener('click',()=>startCheckout(btn.dataset.plan,btn)));
}
const r=await fetch(`/api/subscription-status?companyId=${encodeURIComponent(companyId)}`,{headers:await headers()});const body=await r.json();if(!r.ok)throw new Error(body.error||'Unable to load subscription.');document.getElementById('currentPlan').innerHTML=`<span class="pill">Current plan: ${esc(body.plan?.name||'ScopeGuard')}</span>`;const manageBtn=document.getElementById('manageSubscriptionBtn');if(!nativeBillingBlocked&&members[0].role==='owner'&&body.subscription?.planId!=='business_lifetime'&&body.subscription?.planId!=='trial'&&body.subscription?.status!=='canceled'){manageBtn.classList.remove('hidden');manageBtn.addEventListener('click',()=>openBillingPortal(manageBtn));}const q=new URLSearchParams(location.search);if(q.get('checkout')==='success')notice('Payment completed. ScopeGuard is confirming your access.','success');else if(q.get('checkout')==='cancelled')notice('Checkout cancelled. No changes were made.','info');}catch(e){notice(e.message||'Unable to load subscription.','error');document.getElementById('currentPlan').innerHTML=`<span class="pill">${esc(e.message||'Unable to load plan')}</span>`;}})();
