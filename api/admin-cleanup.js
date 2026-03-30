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
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Admin only
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token' });
  const sessionData = await redis(['GET', `session:${token}`]);
  if (!sessionData) return res.status(401).json({ error: 'Invalid session' });
  const user = JSON.parse(sessionData);
  const ADMIN_EMAILS = ['adelinp88@gmail.com', 'mtiberiu84@gmail.com'];
  if (!ADMIN_EMAILS.includes(user.email)) return res.status(403).json({ error: 'Not admin' });

  const action = req.query.action || 'list';

  // List all user:sites keys and their sizes
  if (action === 'list') {
    const keys = await redis(['KEYS', 'user:sites:*']);
    const result = [];
    for (const key of (keys || [])) {
      const members = await redis(['ZRANGE', key, 0, -1]);
      const sites = [];
      for (const m of (members || [])) {
        try {
          const s = JSON.parse(m);
          // Check HTML size
          let htmlSize = 0;
          try {
            const html = await redis(['STRLEN', `site:html:${s.id}`]);
            htmlSize = html || 0;
          } catch {}
          sites.push({ id: s.id, sku: s.sku, brandName: s.brandName, paid: s.paid, htmlSize, generatedAt: s.generatedAt });
        } catch {}
      }
      result.push({ key, count: sites.length, sites });
    }
    // Get DB info
    const dbinfo = await redis(['DBSIZE']);
    return res.status(200).json({ dbsize: dbinfo, users: result });
  }

  // Delete specific site HTML
  if (action === 'delete-html') {
    const siteId = req.query.siteId;
    if (!siteId) return res.status(400).json({ error: 'siteId required' });
    const deleted = await redis(['DEL', `site:html:${siteId}`]);
    return res.status(200).json({ ok: true, deleted });
  }

  // Delete site from user's list + HTML
  if (action === 'delete-site') {
    const siteId = req.query.siteId;
    const userKey = req.query.userKey;
    if (!siteId || !userKey) return res.status(400).json({ error: 'siteId and userKey required' });
    const members = await redis(['ZRANGE', userKey, 0, -1]);
    let removed = 0;
    for (const m of (members || [])) {
      try {
        const s = JSON.parse(m);
        if (s.id === siteId) {
          await redis(['ZREM', userKey, m]);
          removed++;
        }
      } catch {}
    }
    await redis(['DEL', `site:html:${siteId}`]);
    return res.status(200).json({ ok: true, removed });
  }

  // Cleanup: delete all orphan site:html keys (no matching site in any user list)
  if (action === 'cleanup-orphans') {
    const htmlKeys = await redis(['KEYS', 'site:html:*']);
    const userKeys = await redis(['KEYS', 'user:sites:*']);
    const allSiteIds = new Set();
    for (const uk of (userKeys || [])) {
      const members = await redis(['ZRANGE', uk, 0, -1]);
      for (const m of (members || [])) {
        try { const s = JSON.parse(m); allSiteIds.add(s.id); } catch {}
      }
    }
    let deleted = 0;
    let freedBytes = 0;
    for (const hk of (htmlKeys || [])) {
      const id = hk.replace('site:html:', '');
      if (!allSiteIds.has(id)) {
        const size = await redis(['STRLEN', hk]);
        await redis(['DEL', hk]);
        deleted++;
        freedBytes += (size || 0);
      }
    }
    return res.status(200).json({ ok: true, orphansDeleted: deleted, freedBytes });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
