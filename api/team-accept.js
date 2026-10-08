'use strict';

const { userFromBearer } = require('../lib/google-email');
const { acceptInvitation } = require('../lib/team-store');

module.exports=async(req,res)=>{
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const user=await userFromBearer(req);
    const token=String(req.body?.token||'').trim();
    if(!token)return res.status(400).json({error:'Invitation token is required.'});
    const membership=await acceptInvitation({token,userId:user.id,userEmail:user.email});
    return res.json({ok:true,membership:{companyId:membership.company_id,role:membership.role,status:membership.status}});
  }catch(e){console.error(e);return res.status(e.status||500).json({error:e.message||'Could not accept invitation.'});}
};
