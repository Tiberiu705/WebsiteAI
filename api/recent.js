// Suportă Vercel KV (KV_REST_API_URL / KV_REST_API_TOKEN)
// și Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
const REST_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

const KEY = 'sites:public';
const MAX_ITEMS = 200;
const PAGE_SIZE = 20;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!REST_URL || !REST_TOKEN) return res.status(200).json({ sites: [], total: 0, hasMore: false, _unconfigured: true });

  try {
    if (req.method === 'GET') {
      const page = Math.max(0, parseInt(req.query.page || '0'));
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;

      const [members, total] = await Promise.all([
        redis(['ZREVRANGE', KEY, start, end]),
        redis(['ZCARD', KEY]),
      ]);

      const sites = (members || []).map(m => {
        try { return JSON.parse(m); } catch { return null; }
      }).filter(Boolean);

      return res.status(200).json({ sites, total: total || 0, hasMore: (start + PAGE_SIZE) < (total || 0) });
    }

    if (req.method === 'POST') {
      const { brandName, activity, publishedUrl } = req.body || {};

      if (!brandName || !activity) {
        return res.status(400).json({ error: 'brandName și activity sunt obligatorii' });
      }

      const site = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        brandName: String(brandName).slice(0, 80),
        activity: String(activity).slice(0, 120),
        publishedUrl: publishedUrl ? String(publishedUrl).slice(0, 300) : null,
        generatedAt: new Date().toISOString(),
      };

      await redis(['ZADD', KEY, Date.now(), JSON.stringify(site)]);
      await redis(['ZREMRANGEBYRANK', KEY, 0, -(MAX_ITEMS + 1)]);

      return res.status(201).json({ ok: true, site });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
