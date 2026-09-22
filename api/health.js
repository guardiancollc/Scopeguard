module.exports=function handler(req,res){res.status(200).json({ok:true,service:'scopeguard-alpha',aiConfigured:Boolean(process.env.OPENAI_API_KEY)});}
