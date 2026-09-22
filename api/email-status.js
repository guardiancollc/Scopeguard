const {userFromBearer,getConnection}=require('../lib/google-email');
module.exports=async(req,res)=>{try{const user=await userFromBearer(req);const c=await getConnection(user.id);res.json({connected:!!c,email:c?.email||null,provider:c?.provider||null});}catch(e){res.status(e.status||500).json({error:e.message});}};
