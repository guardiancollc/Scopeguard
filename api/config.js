const allowedNativeOrigins = new Set(['capacitor://localhost', 'http://localhost']);

module.exports = (req, res) => {
  const origin = req.headers?.origin;
  if (allowedNativeOrigins.has(origin) && process.env.VERCEL_ENV === 'preview') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://yqgovlrxyizobsnqycko.supabase.co',
    supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_w3NPUZg6sWB4u64imbKxpg_f7UM_JTz'
  });
};
