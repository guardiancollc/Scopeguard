'use strict';
const { PLAN_IDS, PLANS } = require('./plans');

// Public billing catalog. Provider product/price IDs stay in environment variables,
// so no secret or provider-specific identifier is committed to the browser bundle.
const PURCHASABLE = Object.freeze([
  PLAN_IDS.PRO_MONTHLY,
  PLAN_IDS.PRO_YEARLY,
  PLAN_IDS.BUSINESS_MONTHLY,
  PLAN_IDS.BUSINESS_YEARLY,
  PLAN_IDS.BUSINESS_LIFETIME
]);

const ENV_KEYS = Object.freeze({
  [PLAN_IDS.PRO_MONTHLY]: 'BILLING_PRICE_PRO_MONTHLY',
  [PLAN_IDS.PRO_YEARLY]: 'BILLING_PRICE_PRO_YEARLY',
  [PLAN_IDS.BUSINESS_MONTHLY]: 'BILLING_PRICE_BUSINESS_MONTHLY',
  [PLAN_IDS.BUSINESS_YEARLY]: 'BILLING_PRICE_BUSINESS_YEARLY',
  [PLAN_IDS.BUSINESS_LIFETIME]: 'BILLING_PRICE_BUSINESS_LIFETIME'
});

function publicCatalog(){
  return PURCHASABLE.map(id=>{
    const p=PLANS[id];
    return {id:p.id,tier:p.tier,name:p.name,priceCents:p.priceCents,billingInterval:p.billingInterval,entitlements:p.entitlements};
  });
}

function providerPriceId(planId,env=process.env){
  const key=ENV_KEYS[planId];
  return key ? (env[key]||null) : null;
}

function isPurchasable(planId){return PURCHASABLE.includes(planId);}

module.exports={PURCHASABLE,ENV_KEYS,publicCatalog,providerPriceId,isPurchasable};
