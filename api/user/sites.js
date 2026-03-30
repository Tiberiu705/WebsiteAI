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

// Extract all img keys referenced in HTML (e.g. /api/img?k=abc123)
function extractImgKeys(html) {
  if (!html) return new Set();
  const matches = html.match(/\/api\/img\?k=([a-z0-9]+)/gi) || [];
  return new Set(matches.map(m => m.replace(/.*\/api\/img\?k=/i, '')));
}

// Delete orphan images: keys in oldHtml but not in newHtml
async function cleanupOrphanImages(oldHtml, newHtml) {
  const oldKeys = extractImgKeys(oldHtml);
  const newKeys = extractImgKeys(newHtml);
  const orphans = [...oldKeys].filter(k => !newKeys.has(k));
  if (orphans.length > 0) {
    await Promise.all(orphans.map(k => redis(['DEL', `img:${k}`]).catch(() => {})));
  }
  return orphans.length;
}

// Delete all images referenced in HTML
async function deleteAllImages(html) {
  const keys = extractImgKeys(html);
  if (keys.size > 0) {
    await Promise.all([...keys].map(k => redis(['DEL', `img:${k}`]).catch(() => {})));
  }
  return keys.size;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
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

    // ── POST: save site (or update existing if editId provided) ──
    if (req.method === 'POST') {
      const { html, brandName, activity, editId, adminEdit, adminSku } = req.body || {};
      if (!brandName) return res.status(400).json({ error: 'brandName required' });

      console.log('[sites POST] editId:', editId, 'adminEdit:', adminEdit, 'adminSku:', adminSku);

      // If editing an existing site, update it in place (preserve paid, sku, domain)
      if (editId) {
        // Determine which user's site list to search
        let ownerKey = key; // default: current user's sites
        const ADMIN_EMAILS = ['adelinp88@gmail.com', 'mtiberiu84@gmail.com'];
        const isAdmin = ADMIN_EMAILS.includes(user.email);

        if (adminEdit && isAdmin && adminSku) {
          // Admin editing client's site — find the owner via SKU mapping
          try {
            const skuData = await redis(['GET', `sku:${adminSku.toUpperCase()}`]);
            if (skuData) {
              const { ownerId } = JSON.parse(skuData);
              ownerKey = `user:sites:${ownerId}`;
            }
          } catch {}
        }

        const members = await redis(['ZRANGE', ownerKey, 0, -1]);
        console.log('[sites POST] searching', members ? members.length : 0, 'members for editId:', editId);
        let found = false;
        for (const m of (members || [])) {
          try {
            const s = JSON.parse(m);
            if (s.id !== editId) continue;
            found = true;
            console.log('[sites POST] FOUND site, updating in place');
            const score = await redis(['ZSCORE', ownerKey, m]);
            const updated = {
              ...s,
              brandName: String(brandName).slice(0, 80),
              activity: String(activity || '').slice(0, 120),
              generatedAt: new Date().toISOString(),
            };
            // Cleanup orphan images from previous version
            if (html && html.length > 100) {
              try {
                const oldHtml = await redis(['GET', `site:html:${editId}`]);
                if (oldHtml) await cleanupOrphanImages(oldHtml, html);
              } catch {}
            }
            const ops = [
              redis(['ZREM', ownerKey, m]),
              redis(['ZADD', ownerKey, Number(score) || Date.now(), JSON.stringify(updated)]),
            ];
            if (html && html.length > 100) {
              ops.push(redis(['SET', `site:html:${editId}`, String(html), 'EX', 7776000]));
            }
            await Promise.all(ops);
            return res.status(200).json({ ok: true, site: updated });
          } catch (editErr) {
            console.error('[sites POST] error updating site:', editErr.message);
          }
        }
        console.log('[sites POST] editId NOT found in members, creating new. found=', found);
        // If editId not found, fall through to create new
      }

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

      // Before adding, clean up oldest UNPAID sites that will be evicted
      const currentCount = await redis(['ZCARD', key]) || 0;
      if (currentCount >= USER_SITES_MAX) {
        // Get all members to find oldest unpaid ones to evict
        const allMembers = await redis(['ZRANGE', key, 0, -1]);
        for (const em of (allMembers || [])) {
          try {
            const es = JSON.parse(em);
            if (es.paid) continue; // Nu șterge site-urile plătite
            // Clean HTML + images + sku + meta
            const oldHtml = await redis(['GET', `site:html:${es.id}`]);
            if (oldHtml) await deleteAllImages(oldHtml);
            const delOps = [
              redis(['ZREM', key, em]),
              redis(['DEL', `site:html:${es.id}`]),
              redis(['DEL', `site:meta:${es.id}`]),
            ];
            if (es.sku) delOps.push(redis(['DEL', `sku:${es.sku}`]));
            await Promise.all(delOps);
            break; // Șterge doar cel mai vechi nepătit, nu toate
          } catch {}
        }
      }

      const ops = [
        redis(['ZADD', key, Date.now(), JSON.stringify(site)]),
        redis(['ZREMRANGEBYRANK', key, 0, -(USER_SITES_MAX + 1)]),
        redis(['SET', `sku:${sku}`, JSON.stringify({ siteId: id, ownerId: user.sub }), 'EX', 7776000]),
      ];
      if (html && html.length > 100) {
        ops.push(redis(['SET', `site:html:${id}`, String(html), 'EX', 7776000]));
      }
      await Promise.all(ops);

      return res.status(201).json({ ok: true, site });
    }

    // ── PUT: connect custom domain (replaces api/add-domain.js) ──
    if (req.method === 'PUT') {
      const { domain, siteId } = req.body || {};
      if (!domain || !siteId) return res.status(400).json({ error: 'domain și siteId sunt obligatorii' });

      const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, '');

      await redis(['SET', `domain:${cleanDomain}`, JSON.stringify({ siteId, userId: user.sub }), 'EX', 7776000]);
      await redis(['SET', `domain:www.${cleanDomain}`, JSON.stringify({ siteId, userId: user.sub }), 'EX', 7776000]);

      // Add domain to Vercel project
      const vercelToken = process.env.VERCEL_TOKEN;
      const projectId = process.env.VERCEL_PROJECT_ID;
      if (vercelToken && projectId) {
        for (const d of [cleanDomain, `www.${cleanDomain}`]) {
          await fetch(`https://api.vercel.com/v10/projects/${projectId}/domains`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: d }),
          }).catch(() => {});
        }
      }

      return res.status(200).json({ ok: true });
    }

    // ── PATCH: mark site as paid ──
    if (req.method === 'PATCH') {
      const { id, sessionId } = req.body || {};
      if (!id || !sessionId) return res.status(400).json({ error: 'id and sessionId required' });

      // Verify payment with Stripe — REQUIRED, do not proceed without valid payment
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        console.error('[PATCH] STRIPE_SECRET_KEY not configured');
        return res.status(500).json({ error: 'Configurare Stripe lipsă' });
      }
      try {
        const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (!stripeRes.ok) {
          console.error('[PATCH] Stripe verification failed:', stripeRes.status);
          return res.status(400).json({ error: 'Sesiune Stripe invalidă' });
        }
        const session = await stripeRes.json();
        const validStatuses = ['paid', 'no_payment_required'];
        if (!validStatuses.includes(session.payment_status)) {
          console.warn('[PATCH] payment_status:', session.payment_status, 'for session:', sessionId);
          return res.status(400).json({ error: `Plată neverificată (status: ${session.payment_status})` });
        }
        console.log('[PATCH] Stripe verified OK — payment_status:', session.payment_status, 'siteId:', id);
      } catch (err) {
        console.error('[PATCH] Stripe API error:', err.message);
        return res.status(500).json({ error: 'Eroare la verificarea plății' });
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
          console.log('[PATCH] site', id, 'marked paid=true in Redis');
          return res.status(200).json({ ok: true, site: s });
        } catch (err) {
          console.error('[PATCH] error updating site', id, ':', err.message);
        }
      }
      console.error('[PATCH] site', id, 'not found in user sites');
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
            // Nu permite ștergerea site-urilor plătite
            if (s.paid) {
              return res.status(403).json({ error: 'Site-ul plătit nu poate fi șters' });
            }
            // Delete ALL associated data: images, HTML, sku mapping, site:meta, domain
            try {
              const siteHtml = await redis(['GET', `site:html:${id}`]);
              if (siteHtml) await deleteAllImages(siteHtml);
            } catch {}
            const delOps = [
              redis(['ZREM', key, m]),
              redis(['DEL', `site:html:${id}`]),
              redis(['DEL', `site:meta:${id}`]),
            ];
            if (s.sku) delOps.push(redis(['DEL', `sku:${s.sku}`]));
            await Promise.all(delOps);
            // If site had a domain, clean that too
            if (s.domain) {
              redis(['DEL', `domain:${s.domain}`]).catch(() => {});
              redis(['DEL', `domain:www.${s.domain}`]).catch(() => {});
            }
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
