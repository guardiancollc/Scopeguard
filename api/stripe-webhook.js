'use strict';

const crypto = require('crypto');
const { serviceHeaders, supabaseUrl } = require('../lib/google-email');
const { getPlan, PLAN_IDS } = require('../lib/plans');

function webhookSecret() {
  const value = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!value) throw Object.assign(new Error('STRIPE_WEBHOOK_SECRET is not configured.'), { status: 503 });
  return value;
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length) return Buffer.concat(chunks);

  throw Object.assign(new Error('Stripe webhook raw body is unavailable.'), { status: 400 });
}

function verifyStripeSignature(body, header, secret, toleranceSeconds = 300) {
  const parts = String(header || '').split(',').map(v => v.trim());
  const timestamp = parts.find(v => v.startsWith('t='))?.slice(2);
  const signatures = parts.filter(v => v.startsWith('v1=')).map(v => v.slice(3));
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now()/1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex');
  return signatures.some(sig => {
    try {
      const a = Buffer.from(sig, 'hex'), b = Buffer.from(expected, 'hex');
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (_) { return false; }
  });
}

async function patchSubscription(companyId, values) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/company_subscriptions?company_id=eq.${encodeURIComponent(companyId)}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ ...values, updated_at: new Date().toISOString() })
  });
  if (!r.ok) throw new Error(`Could not update subscription: ${await r.text()}`);
}

function companyIdOf(object) {
  return String(object?.metadata?.company_id || object?.client_reference_id || '').trim();
}

async function activateCheckout(session) {
  const companyId = companyIdOf(session);
  const planId = String(session?.metadata?.plan_id || '').trim();
  const plan = getPlan(planId);
  if (!companyId || !plan) throw new Error('Checkout event is missing ScopeGuard billing metadata.');

  const paid = session.payment_status === 'paid' || session.mode === 'subscription';
  if (!paid) return;

  await patchSubscription(companyId, {
    plan_id: planId,
    status: 'active',
    stripe_customer_id: session.customer || null,
    stripe_subscription_id: session.subscription || null,
    lifetime_access: planId === PLAN_IDS.BUSINESS_LIFETIME,
    trial_ends_at: null
  });
}

async function syncSubscription(subscription, deleted = false) {
  const companyId = companyIdOf(subscription);
  const planId = String(subscription?.metadata?.plan_id || '').trim();
  if (!companyId || !planId) return;
  const plan = getPlan(planId);
  if (!plan) return;

  const status = deleted ? 'canceled' : String(subscription.status || 'active');
  await patchSubscription(companyId, {
    plan_id: planId,
    status,
    stripe_customer_id: subscription.customer || null,
    stripe_subscription_id: subscription.id || null,
    current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    lifetime_access: false
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = await rawBody(req);
    if (!verifyStripeSignature(body, req.headers['stripe-signature'], webhookSecret())) {
      return res.status(400).json({ error: 'Invalid Stripe signature.' });
    }

    const event = JSON.parse(body.toString('utf8'));
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await activateCheckout(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await syncSubscription(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object, true);
        break;
      default:
        break;
    }
    return res.json({ received: true });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({ error: error.message || 'Stripe webhook failed.' });
  }
};

module.exports.config = { api: { bodyParser: false } };
