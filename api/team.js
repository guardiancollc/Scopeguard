'use strict';

const { userFromBearer } = require('../lib/google-email');
const { requireMembership, canManageTeam } = require('../lib/company-membership');
const { getOrCreateSubscription } = require('../lib/subscription-store');
const { canUseTeam } = require('../lib/entitlements');
const { listTeam,listInvitations,createInvitation,revokeInvitation,changeRole,disableWorker } = require('../lib/team-store');

const companyIdFrom=req=>String(req.query?.companyId||req.body?.companyId||req.headers['x-scopeguard-company-id']||'').trim();

module.exports=async(req,res)=>{
  try{
    const user=await userFromBearer(req);
    const companyId=companyIdFrom(req);
    if(!companyId)return res.status(400).json({error:'Company ID is required.'});
    const membership=await requireMembership(user.id,companyId);
    const subscription=await getOrCreateSubscription(companyId);
    if(!canUseTeam(subscription))return res.status(402).json({error:'Team access requires ScopeGuard Business.'});

    if(req.method==='GET'){
      if(!canManageTeam(membership))return res.status(403).json({error:'Only an owner or admin can view the team.'});
      const [team,invitations]=await Promise.all([listTeam(companyId),listInvitations(companyId)]);
      return res.json({team,invitations});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

    const action=String(req.body?.action||'');
    if(action==='invite'){
      const result=await createInvitation({companyId,email:req.body?.email,role:req.body?.role||'worker',invitedBy:user.id});
      // Raw token is returned once so the client can construct the invite URL; only its hash is stored.
      return res.json({ok:true,invitation:{id:result.invite.id,email:result.invite.email,role:result.invite.role,expiresAt:result.invite.expires_at},inviteToken:result.token});
    }
    if(action==='revoke-invite'){
      const updated=await revokeInvitation({companyId,invitationId:req.body?.invitationId,actorUserId:user.id});
      if(!updated)return res.status(404).json({error:'Pending invitation not found.'});
      return res.json({ok:true,invitation:{id:updated.id,status:updated.status}});
    }
    if(action==='role'){
      const updated=await changeRole({companyId,targetUserId:req.body?.userId,role:req.body?.role,actorUserId:user.id});
      if(!updated)return res.status(404).json({error:'Worker not found.'});
      return res.json({ok:true,membership:updated});
    }
    if(action==='disable'){
      const updated=await disableWorker({companyId,targetUserId:req.body?.userId,actorUserId:user.id});
      if(!updated)return res.status(404).json({error:'Worker not found.'});
      return res.json({ok:true,membership:updated});
    }
    return res.status(400).json({error:'Unknown team action.'});
  }catch(e){console.error(e);return res.status(e.status||500).json({error:e.message||'Team request failed.'});}
};
