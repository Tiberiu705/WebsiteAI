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

  if (!REST_URL || !REST_TOKEN) return res.status(503).json({ error: 'Storage neconfigurat' });

  // ── GET: serve image ──
  if (req.method === 'GET') {
    const k = req.query.k;
    if (!k || !/^[a-z0-9]+$/i.test(k)) return res.status(400).send('ID invalid');
    try {
      const data = await redis(['GET', `img:${k}`]);
      if (!data) return res.status(404).send('Imaginea nu a fost găsită');
      const parsed = JSON.parse(data);
      res.setHeader('Content-Type', parsed.mime || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=7776000, s-maxage=7776000, immutable');
      return res.status(200).send(Buffer.from(parsed.data, 'base64'));
    } catch (e) {
      return res.status(500).send('Eroare internă');
    }
  }

  // ── POST: store image ──
  if (req.method === 'POST') {
    const { data, mime } = req.body || {};
    if (!data || !mime) return res.status(400).json({ error: 'data și mime sunt obligatorii' });
    if (data.length > 3500000) return res.status(413).json({ error: 'Imaginea este prea mare (max ~2MB)' });

    // Check DB capacity before storing — refuse if over 200MB (limit is 256MB)
    try {
      const info = await redis(['INFO', 'memory']);
      if (info) {
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          const usedBytes = parseInt(match[1]);
          const MAX_SAFE_BYTES = 200 * 1024 * 1024; // 200MB safety threshold
          if (usedBytes > MAX_SAFE_BYTES) {
            return res.status(507).json({ error: 'Spațiu de stocare insuficient. Ștergeți site-uri vechi.' });
          }
        }
      }
    } catch {}

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await redis(['SET', `img:${id}`, JSON.stringify({ data, mime }), 'EX', 2592000]); // 30 zile (redus de la 90)
      return res.status(201).json({ key: id });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
