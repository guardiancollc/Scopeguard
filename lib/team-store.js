'use strict';

const crypto = require('crypto');
const { serviceHeaders, supabaseUrl } = require('./google-email');
const { requireMembership, canManageTeam } = require('./company-membership');

const INVITE_ROLES = new Set(['admin','foreman','worker']);
const sha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

async function listTeam(companyId) {
  const r = await fetch(`${supabaseUrl()}/rest/v1/company_memberships?company_id=eq.${encodeURIComponent(companyId)}&select=id,company_id,user_id,role,status,created_at&order=created_at.asc`, { headers:serviceHeaders() });
  if(!r.ok) throw new Error(`Could not read team: ${await r.text()}`);
  return r.json();
}

async function createInvitation({companyId,email,role='worker',invitedBy}) {
  const normalizedEmail=String(email||'').trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw Object.assign(new Error('A valid worker email is required.'),{status:400});
  if(!INVITE_ROLES.has(role)) throw Object.assign(new Error('Invalid worker role.'),{status:400});
  const inviterMembership=await requireMembership(invitedBy,companyId);
  if(!canManageTeam(inviterMembership)) throw Object.assign(new Error('Only an owner or admin can invite workers.'),{status:403});

  const token=crypto.randomBytes(32).toString('base64url');
  const expires=new Date(Date.now()+7*24*60*60*1000).toISOString();
  const row={company_id:companyId,email:normalizedEmail,role,token_hash:sha256(token),status:'pending',invited_by:invitedBy,expires_at:expires};
  const r=await fetch(`${supabaseUrl()}/rest/v1/company_invitations`,{method:'POST',headers:{...serviceHeaders(),Prefer:'return=representation'},body:JSON.stringify(row)});
  if(!r.ok) throw new Error(`Could not create invitation: ${await r.text()}`);
  const invite=(await r.json())[0];
  return {invite,token};
}

async function acceptInvitation({token,userId,userEmail}) {
  const hash=sha256(token||'');
  const r=await fetch(`${supabaseUrl()}/rest/v1/company_invitations?token_hash=eq.${encodeURIComponent(hash)}&status=eq.pending&select=*&limit=1`,{headers:serviceHeaders()});
  if(!r.ok) throw new Error(`Could not read invitation: ${await r.text()}`);
  const invite=(await r.json())[0];
  if(!invite) throw Object.assign(new Error('Invitation is invalid or has already been used.'),{status:404});
  if(new Date(invite.expires_at)<=new Date()) throw Object.assign(new Error('Invitation has expired.'),{status:410});
  if(String(userEmail||'').trim().toLowerCase()!==String(invite.email).toLowerCase()) throw Object.assign(new Error('Sign in with the email address that was invited.'),{status:403});

  const membership={company_id:invite.company_id,user_id:userId,role:invite.role,status:'active',invited_by:invite.invited_by};
  const mr=await fetch(`${supabaseUrl()}/rest/v1/company_memberships?on_conflict=company_id,user_id`,{method:'POST',headers:{...serviceHeaders(),Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify(membership)});
  if(!mr.ok) throw new Error(`Could not join company: ${await mr.text()}`);
  const joined=(await mr.json())[0];

  const ur=await fetch(`${supabaseUrl()}/rest/v1/company_invitations?id=eq.${encodeURIComponent(invite.id)}`,{method:'PATCH',headers:{...serviceHeaders(),Prefer:'return=minimal'},body:JSON.stringify({status:'accepted',accepted_by:userId,accepted_at:new Date().toISOString()})});
  if(!ur.ok) throw new Error(`Could not finalize invitation: ${await ur.text()}`);
  return joined;
}

async function changeRole({companyId,targetUserId,role,actorUserId}) {
  if(!INVITE_ROLES.has(role)) throw Object.assign(new Error('Invalid worker role.'),{status:400});
  const actor=await requireMembership(actorUserId,companyId);
  if(!canManageTeam(actor)) throw Object.assign(new Error('Only an owner or admin can manage workers.'),{status:403});
  const r=await fetch(`${supabaseUrl()}/rest/v1/company_memberships?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(targetUserId)}&role=neq.owner`,{method:'PATCH',headers:{...serviceHeaders(),Prefer:'return=representation'},body:JSON.stringify({role,updated_at:new Date().toISOString()})});
  if(!r.ok) throw new Error(`Could not change worker role: ${await r.text()}`);
  return (await r.json())[0]||null;
}

async function disableWorker({companyId,targetUserId,actorUserId}) {
  const actor=await requireMembership(actorUserId,companyId);
  if(!canManageTeam(actor)) throw Object.assign(new Error('Only an owner or admin can manage workers.'),{status:403});
  const r=await fetch(`${supabaseUrl()}/rest/v1/company_memberships?company_id=eq.${encodeURIComponent(companyId)}&user_id=eq.${encodeURIComponent(targetUserId)}&role=neq.owner`,{method:'PATCH',headers:{...serviceHeaders(),Prefer:'return=representation'},body:JSON.stringify({status:'disabled',updated_at:new Date().toISOString()})});
  if(!r.ok) throw new Error(`Could not disable worker: ${await r.text()}`);
  return (await r.json())[0]||null;
}

module.exports={listTeam,createInvitation,acceptInvitation,changeRole,disableWorker};
