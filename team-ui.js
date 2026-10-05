'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db=null,session=null,companyId='',membershipRole='',access=null;
const cfg={supabaseUrl:'https://yqgovlrxyizobsnqycko.supabase.co',supabasePublishableKey:'sb_publishable_w3NPUZg6sWB4u64imbKxpg_f7UM_JTz'};

function message(text,type='info'){
  const el=$('teamMessage'); el.textContent=text; el.classList.remove('hidden');
  el.dataset.type=type;
}
function clearMessage(){$('teamMessage').classList.add('hidden');}
async function authHeaders(){
  const {data}=await db.auth.getSession(); session=data.session;
  if(!session) throw new Error('Please sign in to ScopeGuard first.');
  return {'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json','x-scopeguard-company-id':companyId};
}
async function api(path,options={}){
  const headers=await authHeaders();
  const r=await fetch(path,{...options,headers:{...headers,...options.headers}});
  const body=await r.json().catch(()=>({}));
  if(!r.ok) throw Object.assign(new Error(body.error||'Request failed.'),{status:r.status});
  return body;
}
async function findCompany(){
  const {data,error}=await db.from('company_members').select('company_id,role').eq('user_id',session.user.id).limit(1);
  if(error) throw error;
  if(!data?.length) throw new Error('No ScopeGuard company was found for this account.');
  companyId=data[0].company_id; membershipRole=data[0].role||'';
}
function roleOptions(member){
  if(member.role==='owner') return '<span class="pill">Owner</span>';
  return `<select class="team-role" data-user="${esc(member.user_id)}"><option value="worker" ${member.role==='worker'?'selected':''}>Worker</option><option value="foreman" ${member.role==='foreman'?'selected':''}>Foreman</option><option value="admin" ${member.role==='admin'?'selected':''}>Admin</option></select>`;
}
function render(data){
  const team=data.team||[], pending=data.pendingInvitations||[];
  $('teamCount').textContent=String(team.filter(x=>x.status==='active').length);
  $('inviteCount').textContent=String(pending.length);
  $('teamList').innerHTML=team.length?team.map(m=>`<div class="invoice-row"><div><strong>${m.role==='owner'?'Company owner':'Team member'}</strong><p class="muted">${esc(m.user_id)}</p></div><div>${roleOptions(m)} ${m.role!=='owner'?`<button class="ghost small disable-worker" data-user="${esc(m.user_id)}">Disable</button>`:''}</div></div>`).join(''):'<p class="muted">No team members yet.</p>';
  $('pendingList').innerHTML=pending.length?pending.map(i=>`<div class="invoice-row"><div><strong>${esc(i.email)}</strong><p class="muted">${esc(i.role)} · expires ${new Date(i.expires_at).toLocaleDateString()}</p></div><button class="ghost small revoke-invite" data-id="${esc(i.id)}">Revoke</button></div>`).join(''):'<p class="muted">No pending invitations.</p>';
  document.querySelectorAll('.team-role').forEach(el=>el.onchange=()=>changeRole(el.dataset.user,el.value));
  document.querySelectorAll('.disable-worker').forEach(el=>el.onclick=()=>disableWorker(el.dataset.user));
  document.querySelectorAll('.revoke-invite').forEach(el=>el.onclick=()=>revokeInvite(el.dataset.id));
}
async function load(){
  clearMessage();
  const sub=await api(`/api/subscription-status?companyId=${encodeURIComponent(companyId)}`);
  access=sub.access; membershipRole=sub.membership?.role||membershipRole;
  $('teamPlanBadge').textContent=sub.plan?.name||'ScopeGuard';
  if(!access?.entitlements?.team){
    $('inviteCard').classList.add('hidden');
    message('Team access is available with ScopeGuard Business.','upgrade');
    $('teamList').innerHTML='<p class="muted">Upgrade to Business to manage workers.</p>';
    $('pendingList').innerHTML='<p class="muted">No invitations available on this plan.</p>';
    return;
  }
  if(!['owner','admin'].includes(membershipRole)){
    $('inviteCard').classList.add('hidden');
    message('Only the company owner or an admin can manage workers.','permission');
    return;
  }
  const data=await api(`/api/team?companyId=${encodeURIComponent(companyId)}`); render(data);
}
async function invite(){
  const email=$('inviteEmail').value.trim(),role=$('inviteRole').value;
  if(!email)return message('Enter the worker email address.','error');
  $('inviteBtn').disabled=true;
  try{
    const result=await api('/api/team',{method:'POST',body:JSON.stringify({companyId,action:'invite',email,role})});
    $('inviteEmail').value='';
    message(`Invitation created for ${result.invitation.email}.`,'success');
    await load();
  }catch(e){message(e.message,'error');}finally{$('inviteBtn').disabled=false;}
}
async function changeRole(userId,role){try{await api('/api/team',{method:'POST',body:JSON.stringify({companyId,action:'role',userId,role})});message('Worker role updated.','success');await load();}catch(e){message(e.message,'error');await load();}}
async function disableWorker(userId){if(!confirm('Disable this worker’s ScopeGuard access?'))return;try{await api('/api/team',{method:'POST',body:JSON.stringify({companyId,action:'disable',userId})});message('Worker access disabled.','success');await load();}catch(e){message(e.message,'error');}}
async function revokeInvite(invitationId){if(!confirm('Revoke this invitation?'))return;try{await api('/api/team',{method:'POST',body:JSON.stringify({companyId,action:'revoke-invite',invitationId})});message('Invitation revoked.','success');await load();}catch(e){message(e.message,'error');}}
$('inviteBtn').onclick=invite;
$('backBtn').onclick=()=>location.href='/';
(async()=>{try{db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);const {data}=await db.auth.getSession();session=data.session;if(!session){location.href='/';return;}await findCompany();await load();}catch(e){message(e.message,'error');$('inviteCard').classList.add('hidden');}})();
