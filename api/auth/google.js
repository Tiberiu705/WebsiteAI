const crypto = require('crypto');

const REST_URL   = process.env.UPSTASH_REDIS_KV_REST_API_URL   || process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'credential required' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'Google not configured' });

  try {
    const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    const tokenInfo = await tokenInfoRes.json();

    if (!tokenInfoRes.ok || tokenInfo.aud !== clientId) {
      return res.status(401).json({ error: 'Token invalid' });
    }

    const user = {
      sub: tokenInfo.sub,
      email: tokenInfo.email,
      name: tokenInfo.name || tokenInfo.email,
      picture: tokenInfo.picture || null,
    };

    const token = crypto.randomBytes(32).toString('hex');

    // Delete old sessions for this user (prevent session accumulation)
    try {
      const oldSessions = await redis(['SMEMBERS', `user:sessions:${user.sub}`]);
      if (oldSessions && oldSessions.length > 0) {
        // Keep max 3 recent sessions, delete the rest
        if (oldSessions.length >= 3) {
          for (const oldToken of oldSessions) {
            await redis(['DEL', `session:${oldToken}`]);
            await redis(['SREM', `user:sessions:${user.sub}`, oldToken]);
          }
        }
      }
    } catch {}

    await redis(['SET', `session:${token}`, JSON.stringify(user), 'EX', 2592000]);
    await redis(['SADD', `user:sessions:${user.sub}`, token]);
    await redis(['EXPIRE', `user:sessions:${user.sub}`, 2592000]);

    return res.status(200).json({ token, user });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
