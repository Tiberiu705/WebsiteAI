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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!REST_URL || !REST_TOKEN) return res.status(503).json({ error: 'Storage neconfigurat' });

  const sku = (req.query.sku || '').toUpperCase().trim();
  if (!sku || !/^WEB-[A-Z0-9]{6}$/.test(sku)) return res.status(400).json({ error: 'SKU invalid' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Neautentificat' });

  try {
    // Verify session
    const sessionData = await redis(['GET', `session:${token}`]);
    if (!sessionData) return res.status(401).json({ error: 'Sesiune expirată' });
    const user = JSON.parse(sessionData);

    // Get SKU mapping
    const skuData = await redis(['GET', `sku:${sku}`]);
    if (!skuData) return res.status(404).json({ error: 'Site negăsit' });
    const { siteId, ownerId } = JSON.parse(skuData);

    // Verify ownership
    if (user.sub !== ownerId) return res.status(403).json({ error: 'Acces interzis' });

    // Return site HTML
    const html = await redis(['GET', `site:html:${siteId}`]);
    if (!html) return res.status(404).json({ error: 'Site-ul nu mai este disponibil' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
