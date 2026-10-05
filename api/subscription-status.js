'use strict';

const { userFromBearer } = require('../lib/google-email');
const { getOrCreateSubscription } = require('../lib/subscription-store');
const { accessSnapshot } = require('../lib/entitlements');
const { getPlan } = require('../lib/plans');
const { requireMembership } = require('../lib/company-membership');

function requestedCompanyId(req) {
  return String(req.query?.companyId || req.headers['x-scopeguard-company-id'] || '').trim();
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await userFromBearer(req);
    const companyId = requestedCompanyId(req);
    if (!companyId) return res.status(400).json({ error: 'Company ID is required.' });

    const membership = await requireMembership(user.id, companyId);
    const subscription = await getOrCreateSubscription(companyId);
    const access = accessSnapshot(subscription);
    const plan = access.planId ? getPlan(access.planId) : null;

    return res.json({
      membership: { role: membership.role, companyId: membership.company_id },
      subscription: {
        planId: subscription.plan_id,
        status: subscription.status,
        trialStartedAt: subscription.trial_started_at || null,
        trialEndsAt: subscription.trial_ends_at || null,
        currentPeriodEndsAt: subscription.current_period_ends_at || null,
        lifetimeAccess: Boolean(subscription.lifetime_access)
      },
      plan: plan ? {
        id: plan.id,
        tier: plan.tier,
        name: plan.name,
        priceCents: plan.priceCents,
        billingInterval: plan.billingInterval
      } : null,
      access
    });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error: error.message || 'Could not read subscription.' });
  }
};
