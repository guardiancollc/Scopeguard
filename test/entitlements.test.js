'use strict';

const assert = require('assert');
const {
  isSubscriptionActive,
  accessSnapshot
} = require('../lib/entitlements');

const NOW = new Date('2026-10-05T12:00:00Z');

function active(plan_id, extra = {}) {
  return {
    plan_id,
    status: plan_id === 'trial' ? 'trialing' : 'active',
    current_period_ends_at: '2026-11-05T12:00:00Z',
    ...extra
  };
}

// Full-feature 14-day trial.
let s = accessSnapshot(active('trial', {
  trial_started_at: '2026-10-01T12:00:00Z',
  trial_ends_at: '2026-10-15T12:00:00Z'
}), NOW);
assert.equal(s.active, true);
assert.equal(s.invoices, true);
assert.equal(s.projectPhotos, true);
assert.equal(s.changeOrders, true);
assert.equal(s.ai, true);
assert.equal(s.team, true);

// Expired trial gets no paid entitlements.
s = accessSnapshot(active('trial', {
  trial_started_at: '2026-09-01T12:00:00Z',
  trial_ends_at: '2026-09-15T12:00:00Z'
}), NOW);
assert.equal(s.active, false);
assert.equal(s.invoices, false);

// Pro: one user, unlimited invoice entitlement + photos, no CO/AI/team.
s = accessSnapshot(active('pro_monthly'), NOW);
assert.equal(s.active, true);
assert.equal(s.invoices, true);
assert.equal(s.projectPhotos, true);
assert.equal(s.changeOrders, false);
assert.equal(s.ai, false);
assert.equal(s.team, false);
assert.equal(s.maxUsers, 1);

s = accessSnapshot(active('pro_yearly'), NOW);
assert.equal(s.invoices, true);
assert.equal(s.projectPhotos, true);
assert.equal(s.changeOrders, false);
assert.equal(s.maxUsers, 1);

// Business: full app + team access.
for (const plan of ['business_monthly', 'business_yearly']) {
  s = accessSnapshot(active(plan), NOW);
  assert.equal(s.active, true);
  assert.equal(s.invoices, true);
  assert.equal(s.projectPhotos, true);
  assert.equal(s.changeOrders, true);
  assert.equal(s.ai, true);
  assert.equal(s.team, true);
  assert.equal(s.maxUsers, null);
}

// Lifetime business remains active without a recurring period end.
s = accessSnapshot({
  plan_id: 'business_lifetime',
  status: 'active',
  lifetime_access: true
}, NOW);
assert.equal(s.active, true);
assert.equal(s.changeOrders, true);
assert.equal(s.ai, true);
assert.equal(s.team, true);

// Canceled/expired paid subscriptions are denied.
assert.equal(isSubscriptionActive(active('pro_monthly', { status: 'canceled' }), NOW), false);
assert.equal(isSubscriptionActive(active('business_monthly', { status: 'expired' }), NOW), false);

console.log('ScopeGuard entitlement tests passed.');
