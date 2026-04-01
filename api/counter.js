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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = 'stats:generations';

  // POST — increment counter
  if (req.method === 'POST') {
    const count = await redis(['INCR', key]);
    return res.status(200).json({ count });
  }

  // GET — read counter
  const count = parseInt(await redis(['GET', key]) || '0', 10);
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({ count });
};
