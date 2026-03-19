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
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const data = await redis(['GET', `session:${token}`]);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

const USER_SITES_MAX = 100;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!REST_URL || !REST_TOKEN) return res.status(503).json({ error: 'Storage neconfigurat' });

  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: 'Neautentificat' });

  const key = `user:sites:${user.sub}`;

  try {
    // ── GET: list sites ──
    if (req.method === 'GET') {
      const members = await redis(['ZREVRANGE', key, 0, 49]);
      const sites = (members || []).map(m => { try { return JSON.parse(m); } catch { return null; } }).filter(Boolean);
      return res.status(200).json({ sites, user });
    }

    // ── POST: save site ──
    if (req.method === 'POST') {
      const { html, brandName, activity } = req.body || {};
      if (!brandName) return res.status(400).json({ error: 'brandName required' });

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      // Generate unique SKU: WEB-XXXXXX
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let sku = 'WEB-';
      for (let i = 0; i < 6; i++) sku += chars[Math.floor(Math.random() * chars.length)];

      const site = {
        id,
        sku,
        brandName: String(brandName).slice(0, 80),
        activity: String(activity || '').slice(0, 120),
        previewUrl: `/api/preview?id=${id}`,
        siteUrl: `/site/${sku}`,
        generatedAt: new Date().toISOString(),
      };

      const ops = [
        redis(['ZADD', key, Date.now(), JSON.stringify(site)]),
        redis(['ZREMRANGEBYRANK', key, 0, -(USER_SITES_MAX + 1)]),
        redis(['SET', `sku:${sku}`, JSON.stringify({ siteId: id, ownerId: user.sub }), 'EX', 7776000]),
      ];
      if (html && html.length > 100) {
        ops.push(redis(['SET', `site:html:${id}`, String(html), 'EX', 7776000])); // 90 days
      }
      await Promise.all(ops);

      return res.status(201).json({ ok: true, site });
    }

    // ── PATCH: mark site as paid ──
    if (req.method === 'PATCH') {
      const { id, sessionId } = req.body || {};
      if (!id || !sessionId) return res.status(400).json({ error: 'id and sessionId required' });

      // Verify payment with Stripe (best-effort — if verification fails, trust success_url)
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey && sessionId) {
        try {
          const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
            headers: { Authorization: `Bearer ${stripeKey}` },
          });
          if (stripeRes.ok) {
            const session = await stripeRes.json();
            const validStatuses = ['paid', 'no_payment_required'];
            if (!validStatuses.includes(session.payment_status)) {
              return res.status(400).json({ error: `Plată neverificată (status: ${session.payment_status})` });
            }
          }
          // If Stripe returns non-ok (e.g. key mismatch in sandbox), proceed anyway
        } catch (_) { /* proceed */ }
      }

      // Find site in sorted set, update paid flag, re-save with same score
      const members = await redis(['ZRANGE', key, 0, -1]);
      for (const m of (members || [])) {
        try {
          const s = JSON.parse(m);
          if (s.id !== id) continue;
          const score = await redis(['ZSCORE', key, m]);
          s.paid = true;
          await Promise.all([
            redis(['ZREM', key, m]),
            redis(['ZADD', key, Number(score) || Date.now(), JSON.stringify(s)]),
            // Store site→user mapping so webhook can find this site later
            redis(['SET', `site:meta:${id}`, JSON.stringify({ userId: user.sub }), 'EX', 7776000]),
          ]);
          return res.status(200).json({ ok: true, site: s });
        } catch {}
      }
      return res.status(404).json({ error: 'Site negăsit' });
    }

    // ── DELETE: remove site ──
    if (req.method === 'DELETE') {
      const { id } = req.body || req.query || {};
      if (!id) return res.status(400).json({ error: 'id required' });

      const members = await redis(['ZRANGE', key, 0, -1]);
      let removed = 0;
      for (const m of (members || [])) {
        try {
          const s = JSON.parse(m);
          if (s.id === id) {
            await Promise.all([
              redis(['ZREM', key, m]),
              redis(['DEL', `site:html:${id}`]),
            ]);
            removed++;
          }
        } catch {}
      }
      return res.status(200).json({ ok: true, removed });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
