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

async function getUser(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const data = await redis(['GET', `session:${token}`]);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

async function addDomainToVercel(domain) {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return;

  for (const d of [domain, `www.${domain}`]) {
    await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: d }),
    }).catch(() => {});
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Neautentificat' });

  const { domain, siteId } = req.body || {};
  if (!domain || !siteId) return res.status(400).json({ error: 'domain și siteId sunt obligatorii' });

  const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');

  try {
    // Store domain → site mapping in Redis (90 days)
    await redis(['SET', `domain:${cleanDomain}`, JSON.stringify({ siteId, userId: user.sub }), 'EX', 7776000]);
    await redis(['SET', `domain:www.${cleanDomain}`, JSON.stringify({ siteId, userId: user.sub }), 'EX', 7776000]);

    // Add domain to Vercel project so it accepts requests
    await addDomainToVercel(cleanDomain);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
