'use strict';

const { PLAN_IDS, ENTITLEMENTS, getPlan, hasEntitlement } = require('./plans');

const ACTIVE_STATUSES = new Set(['trialing', 'active']);

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function trialEndsAt(startedAt, trialDays = 14) {
  const start = asDate(startedAt);
  if (!start) return null;
  return new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000);
}

function isTrialActive(subscription, now = new Date()) {
  if (!subscription || subscription.plan_id !== PLAN_IDS.TRIAL) return false;
  if (subscription.status && subscription.status !== 'trialing') return false;
  const end = asDate(subscription.trial_ends_at) || trialEndsAt(subscription.trial_started_at, 14);
  return Boolean(end && end.getTime() > asDate(now).getTime());
}

function isSubscriptionActive(subscription, now = new Date()) {
  if (!subscription) return false;

  if (subscription.plan_id === PLAN_IDS.BUSINESS_LIFETIME && subscription.lifetime_access === true) {
    return subscription.status !== 'canceled';
  }

  if (subscription.plan_id === PLAN_IDS.TRIAL) return isTrialActive(subscription, now);
  if (!ACTIVE_STATUSES.has(subscription.status)) return false;

  const periodEnd = asDate(subscription.current_period_ends_at);
  return !periodEnd || periodEnd.getTime() > asDate(now).getTime();
}

function effectivePlanId(subscription, now = new Date()) {
  if (!isSubscriptionActive(subscription, now)) return null;
  return getPlan(subscription.plan_id) ? subscription.plan_id : null;
}

function canUse(subscription, entitlement, now = new Date()) {
  const planId = effectivePlanId(subscription, now);
  return Boolean(planId && hasEntitlement(planId, entitlement));
}

function canCreateInvoice(subscription, now) {
  return canUse(subscription, ENTITLEMENTS.INVOICES, now);
}

function canUseProjectPhotos(subscription, now) {
  return canUse(subscription, ENTITLEMENTS.PROJECT_PHOTOS, now);
}

function canCreateChangeOrder(subscription, now) {
  return canUse(subscription, ENTITLEMENTS.CHANGE_ORDERS, now);
}

function canUseAI(subscription, now) {
  return canUse(subscription, ENTITLEMENTS.AI, now);
}

function canUseTeam(subscription, now) {
  return canUse(subscription, ENTITLEMENTS.TEAM, now);
}

function maxUsers(subscription, now = new Date()) {
  const planId = effectivePlanId(subscription, now);
  if (!planId) return 0;
  const plan = getPlan(planId);
  if (!plan) return 0;
  if (plan.tier === 'pro') return 1;
  if (plan.tier === 'business' || plan.tier === 'trial') return null; // null = no enforced seat cap yet
  return 0;
}

function accessSnapshot(subscription, now = new Date()) {
  const planId = effectivePlanId(subscription, now);
  const plan = planId ? getPlan(planId) : null;
  return {
    active: Boolean(plan),
    planId,
    tier: plan?.tier || null,
    invoices: canCreateInvoice(subscription, now),
    projectPhotos: canUseProjectPhotos(subscription, now),
    changeOrders: canCreateChangeOrder(subscription, now),
    ai: canUseAI(subscription, now),
    team: canUseTeam(subscription, now),
    maxUsers: maxUsers(subscription, now)
  };
}

module.exports = {
  trialEndsAt,
  isTrialActive,
  isSubscriptionActive,
  effectivePlanId,
  canUse,
  canCreateInvoice,
  canUseProjectPhotos,
  canCreateChangeOrder,
  canUseAI,
  canUseTeam,
  maxUsers,
  accessSnapshot
};
