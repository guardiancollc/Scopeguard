'use strict';

const { serviceHeaders, supabaseUrl } = require('./google-email');

const ROLES = Object.freeze({ OWNER:'owner', ADMIN:'admin', FOREMAN:'foreman', WORKER:'worker' });
const ACTIVE = 'active';

async function membershipFor(userId, companyId) {
  if (!userId || !companyId) return null;
  const query = `${supabaseUrl()}/rest/v1/company_members?user_id=eq.${encodeURIComponent(userId)}&company_id=eq.${encodeURIComponent(companyId)}&select=company_id,user_id,role&limit=1`;
  const r = await fetch(query, { headers: serviceHeaders() });
  if (!r.ok) throw new Error(`Could not verify company membership: ${await r.text()}`);
  return (await r.json())[0] || null;
}

async function requireMembership(userId, companyId) {
  const membership = await membershipFor(userId, companyId);
  if (!membership) throw Object.assign(new Error('You do not have access to this company.'), { status:403 });
  return membership;
}

function roleAllowed(membership, roles) {
  return Boolean(membership && roles.includes(membership.role));
}

function requireRole(membership, roles) {
  if (!roleAllowed(membership, roles)) throw Object.assign(new Error('You do not have permission to perform this action.'), { status:403 });
  return membership;
}

function canManageTeam(membership) {
  return roleAllowed(membership, [ROLES.OWNER, ROLES.ADMIN]);
}

function canManageBilling(membership) {
  return roleAllowed(membership, [ROLES.OWNER]);
}

module.exports = { ROLES, membershipFor, requireMembership, roleAllowed, requireRole, canManageTeam, canManageBilling };
