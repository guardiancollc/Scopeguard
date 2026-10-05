'use strict';

const { serviceHeaders, supabaseUrl } = require('./google-email');

async function readSubscription(companyId) {
  if (!companyId) throw Object.assign(new Error('Company ID is required.'), { status: 400 });
  const url = `${supabaseUrl()}/rest/v1/company_subscriptions?company_id=eq.${encodeURIComponent(companyId)}&select=*&limit=1`;
  const response = await fetch(url, { headers: serviceHeaders() });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not read subscription: ${detail}`);
  }
  return (await response.json())[0] || null;
}

async function createTrial(companyId, now = new Date()) {
  if (!companyId) throw Object.assign(new Error('Company ID is required.'), { status: 400 });
  const started = now instanceof Date ? now : new Date(now);
  const ends = new Date(started.getTime() + 14 * 24 * 60 * 60 * 1000);
  const row = {
    company_id: companyId,
    plan_id: 'trial',
    status: 'trialing',
    trial_started_at: started.toISOString(),
    trial_ends_at: ends.toISOString(),
    lifetime_access: false
  };
  const response = await fetch(`${supabaseUrl()}/rest/v1/company_subscriptions?on_conflict=company_id`, {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not create trial: ${detail}`);
  }
  const created = await response.json();
  return created[0] || readSubscription(companyId);
}

async function getOrCreateSubscription(companyId, now = new Date()) {
  return (await readSubscription(companyId)) || createTrial(companyId, now);
}

module.exports = { readSubscription, createTrial, getOrCreateSubscription };
