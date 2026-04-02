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
  res.setHeader('Access-Control-Allow-Origin', 'https://websiteai.ro');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}

  const {
    path = '/',
    referrer = '',
    utm_source = '',
    utm_medium = '',
    utm_campaign = '',
    utm_content = '',
    utm_term = '',
  } = body;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dayKey = `analytics:daily:${today}`;

  const pipeline = [
    ['HINCRBY', dayKey, 'views', 1],
    ['EXPIRE', dayKey, 60 * 60 * 24 * 90], // keep 90 days
    ['ZADD', 'analytics:dates', Date.now(), today],
  ];

  if (utm_source) pipeline.push(['HINCRBY', dayKey, `source:${utm_source.toLowerCase().slice(0, 50)}`, 1]);
  if (utm_medium) pipeline.push(['HINCRBY', dayKey, `medium:${utm_medium.toLowerCase().slice(0, 50)}`, 1]);
  if (utm_campaign) pipeline.push(['HINCRBY', dayKey, `campaign:${utm_campaign.toLowerCase().slice(0, 100)}`, 1]);

  // Infer source from referrer if no UTM
  if (!utm_source && referrer) {
    try {
      const ref = new URL(referrer);
      const host = ref.hostname.replace('www.', '');
      pipeline.push(['HINCRBY', dayKey, `ref:${host.slice(0, 60)}`, 1]);
    } catch {}
  }

  // Path tracking (sanitize — keep only first segment)
  const cleanPath = '/' + (path.split('/')[1] || '').slice(0, 40);
  pipeline.push(['HINCRBY', dayKey, `page:${cleanPath}`, 1]);

  await Promise.all(pipeline.map(cmd => redis(cmd)));

  res.status(200).json({ ok: true });
};
