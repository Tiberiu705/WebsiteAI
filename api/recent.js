// Suportă Vercel KV (KV_REST_API_URL / KV_REST_API_TOKEN)
// și Upstash Redis (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
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

const KEY = 'sites:public';
const MAX_ITEMS = 200;
const PAGE_SIZE = 20;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
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
      const { brandName, activity, publishedUrl, html } = req.body || {};

      if (!brandName || !activity) {
        return res.status(400).json({ error: 'brandName și activity sunt obligatorii' });
      }

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

      const site = {
        id,
        brandName: String(brandName).slice(0, 80),
        activity: String(activity).slice(0, 120),
        publishedUrl: publishedUrl ? String(publishedUrl).slice(0, 300) : null,
        previewUrl: html ? `/api/preview?id=${id}` : null,
        generatedAt: new Date().toISOString(),
      };

      // Before adding, get items that will be evicted so we can clean them up
      const currentCount = await redis(['ZCARD', KEY]) || 0;
      if (currentCount >= MAX_ITEMS) {
        // Get oldest items that will be evicted
        const evicted = await redis(['ZRANGE', KEY, 0, 0]);
        for (const em of (evicted || [])) {
          try {
            const es = JSON.parse(em);
            // Clean up evicted site's HTML and images
            const oldHtml = await redis(['GET', `site:html:${es.id}`]);
            if (oldHtml) {
              const imgMatches = oldHtml.match(/\/api\/img\?k=([a-z0-9]+)/gi) || [];
              await Promise.all(imgMatches.map(match => {
                const imgId = match.replace(/.*\/api\/img\?k=/i, '');
                return redis(['DEL', `img:${imgId}`]).catch(() => {});
              }));
            }
            await redis(['DEL', `site:html:${es.id}`]);
          } catch {}
        }
      }

      const ops = [
        redis(['ZADD', KEY, Date.now(), JSON.stringify(site)]),
        redis(['ZREMRANGEBYRANK', KEY, 0, -(MAX_ITEMS + 1)]),
      ];

      // Store HTML with 30-day expiry (2592000 seconds)
      if (html && html.length > 100) {
        ops.push(redis(['SET', `site:html:${id}`, String(html), 'EX', 2592000]));
      }

      await Promise.all(ops);

      return res.status(201).json({ ok: true, site });
    }

    if (req.method === 'DELETE') {
      const adminSecret = process.env.ADMIN_SECRET;
      if (!adminSecret || req.headers['x-admin-secret'] !== adminSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const members = await redis(['ZRANGE', KEY, 0, -1]);
      let removed = 0;
      for (const m of (members || [])) {
        try {
          const s = JSON.parse(m);
          if (s.id === id) {
            // Delete associated images before removing HTML
            try {
              const siteHtml = await redis(['GET', `site:html:${id}`]);
              if (siteHtml) {
                const imgMatches = siteHtml.match(/\/api\/img\?k=([a-z0-9]+)/gi) || [];
                await Promise.all(imgMatches.map(match => {
                  const imgId = match.replace(/.*\/api\/img\?k=/i, '');
                  return redis(['DEL', `img:${imgId}`]).catch(() => {});
                }));
              }
            } catch {}
            await redis(['ZREM', KEY, m]);
            await redis(['DEL', `site:html:${id}`]);
            removed++;
          }
        } catch {}
      }
      return res.status(200).json({ ok: true, removed });
    }

    // ── PUT: contact form submission ──
    if (req.method === 'PUT') {
      const { nume, prenume, telefon, email } = req.body || {};
      if (!nume || !prenume || !telefon || !email) {
        return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
      }

      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return res.status(500).json({ error: 'Email neconfigurat' });

      const emailBody = `
        <h2>Mesaj nou din formularul de contact — WebsiteAI.ro</h2>
        <p><strong>Nume:</strong> ${nume} ${prenume}</p>
        <p><strong>Telefon:</strong> ${telefon}</p>
        <p><strong>Email:</strong> ${email}</p>
      `;

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'WebsiteAI Contact <contact@websiteai.ro>',
          to: ['adelinp88@gmail.com', 'mtiberiu84@gmail.com'],
          subject: `Contact nou: ${nume} ${prenume}`,
          html: emailBody,
        }),
      });

      if (!emailRes.ok) {
        const err = await emailRes.json().catch(() => ({}));
        return res.status(500).json({ error: err.message || 'Eroare trimitere email' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
