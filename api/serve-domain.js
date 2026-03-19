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
  const domain = (req.query.domain || req.headers.host || '').split(':')[0].toLowerCase();
  if (!domain) return res.status(400).send('Domain required');

  try {
    // Look up domain → siteId mapping
    const mapping = await redis(['GET', `domain:${domain}`]);
    if (!mapping) return res.status(404).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff;">
        <h2>Domeniu neconectat</h2>
        <p style="color:#666;">Domeniul <strong>${domain}</strong> nu este conectat la niciun site.</p>
      </body></html>
    `);

    const { siteId } = JSON.parse(mapping);

    // Fetch HTML from Redis
    const html = await redis(['GET', `site:html:${siteId}`]);
    if (!html) return res.status(404).send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff;">
        <h2>Site indisponibil</h2>
        <p style="color:#666;">Site-ul pentru <strong>${domain}</strong> nu mai este disponibil.</p>
      </body></html>
    `);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(html);
  } catch (e) {
    return res.status(500).send('Eroare server');
  }
};
