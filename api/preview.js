const REST_URL   = process.env.UPSTASH_REDIS_KV_REST_API_URL   || process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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

module.exports = async function handler(req, res) {
  const id = req.query.id;

  if (!id || !/^[a-z0-9]+$/i.test(id)) {
    return res.status(400).send('<h1>ID invalid</h1>');
  }

  if (!REST_URL || !REST_TOKEN) {
    return res.status(503).send('<h1>Storage neconfigurat</h1>');
  }

  try {
    const html = await redis(['GET', `site:html:${id}`]);

    if (!html) {
      return res.status(404).send('<!DOCTYPE html><html><head><title>Site negăsit</title><style>body{background:#080808;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:16px;}</style></head><body><div style="font-size:3rem;opacity:0.3;">✦</div><p>Acest site nu mai este disponibil sau a expirat.</p><a href="/" style="color:#C8FF00;text-decoration:none;">← Generează un site nou</a></body></html>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send('<h1>Eroare internă</h1>');
  }
};
