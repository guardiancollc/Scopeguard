'use strict';

/**
 * ScopeGuard monetization foundation.
 *
 * IMPORTANT: This module is intentionally isolated from the existing app.
 * Nothing imports it yet, so adding it cannot change current production behavior.
 * Prices are stored in integer cents to avoid floating-point money errors.
 */

const PLAN_IDS = Object.freeze({
  TRIAL: 'trial',
  PRO_MONTHLY: 'pro_monthly',
  PRO_YEARLY: 'pro_yearly',
  BUSINESS_MONTHLY: 'business_monthly',
  BUSINESS_YEARLY: 'business_yearly',
  BUSINESS_LIFETIME: 'business_lifetime'
});

const TIER_IDS = Object.freeze({
  TRIAL: 'trial',
  PRO: 'pro',
  BUSINESS: 'business'
});

const ENTITLEMENTS = Object.freeze({
  INVOICES: 'invoices',
  PROJECT_PHOTOS: 'project_photos',
  CHANGE_ORDERS: 'change_orders',
  AI: 'ai',
  TEAM: 'team',
  FULL_APP: 'full_app'
});

const PLANS = Object.freeze({
  [PLAN_IDS.TRIAL]: Object.freeze({
    id: PLAN_IDS.TRIAL,
    tier: TIER_IDS.TRIAL,
    name: 'Free Trial',
    trialDays: 14,
    priceCents: 0,
    billingInterval: 'trial',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: true,
      ai: true,
      team: true,
      full_app: true
    })
  }),

  [PLAN_IDS.PRO_MONTHLY]: Object.freeze({
    id: PLAN_IDS.PRO_MONTHLY,
    tier: TIER_IDS.PRO,
    name: 'Pro Monthly',
    priceCents: 1999,
    billingInterval: 'month',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: false,
      ai: false,
      team: false,
      full_app: false
    })
  }),

  [PLAN_IDS.PRO_YEARLY]: Object.freeze({
    id: PLAN_IDS.PRO_YEARLY,
    tier: TIER_IDS.PRO,
    name: 'Pro Yearly',
    priceCents: 20000,
    billingInterval: 'year',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: false,
      ai: false,
      team: false,
      full_app: false
    })
  }),

  [PLAN_IDS.BUSINESS_MONTHLY]: Object.freeze({
    id: PLAN_IDS.BUSINESS_MONTHLY,
    tier: TIER_IDS.BUSINESS,
    name: 'Business Monthly',
    priceCents: 5999,
    billingInterval: 'month',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: true,
      ai: true,
      team: true,
      full_app: true
    })
  }),

  [PLAN_IDS.BUSINESS_YEARLY]: Object.freeze({
    id: PLAN_IDS.BUSINESS_YEARLY,
    tier: TIER_IDS.BUSINESS,
    name: 'Business Yearly',
    priceCents: 60000,
    billingInterval: 'year',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: true,
      ai: true,
      team: true,
      full_app: true
    })
  }),

  [PLAN_IDS.BUSINESS_LIFETIME]: Object.freeze({
    id: PLAN_IDS.BUSINESS_LIFETIME,
    tier: TIER_IDS.BUSINESS,
    name: 'Business Lifetime',
    priceCents: 159999,
    billingInterval: 'lifetime',
    entitlements: Object.freeze({
      invoices: true,
      project_photos: true,
      change_orders: true,
      ai: true,
      team: true,
      full_app: true
    })
  })
});

function getPlan(planId) {
  return PLANS[planId] || null;
}

function hasEntitlement(planId, entitlement) {
  const plan = getPlan(planId);
  return Boolean(plan?.entitlements?.[entitlement]);
}

function isBusinessPlan(planId) {
  return getPlan(planId)?.tier === TIER_IDS.BUSINESS;
}

function isProPlan(planId) {
  return getPlan(planId)?.tier === TIER_IDS.PRO;
}

module.exports = {
  PLAN_IDS,
  TIER_IDS,
  ENTITLEMENTS,
  PLANS,
  getPlan,
  hasEntitlement,
  isBusinessPlan,
  isProPlan
};
