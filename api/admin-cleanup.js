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

  // Admin only — session token OR temporary admin key
  const ADMIN_KEY = process.env.ADMIN_SECRET || process.env.ADMIN_CLEANUP_KEY;
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (ADMIN_KEY && token === ADMIN_KEY) {
    // OK — admin key auth
  } else {
    if (!token) return res.status(401).json({ error: 'No token' });
    const sessionData = await redis(['GET', `session:${token}`]);
    if (!sessionData) return res.status(401).json({ error: 'Invalid session' });
    const user = JSON.parse(sessionData);
    const ADMIN_EMAILS = ['adelinp88@gmail.com', 'mtiberiu84@gmail.com'];
    if (!ADMIN_EMAILS.includes(user.email)) return res.status(403).json({ error: 'Not admin' });
  }

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
          if (s.paid) return res.status(403).json({ error: 'Site-ul plătit nu poate fi șters' });
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

  // Scan ALL keys, group by prefix, measure sizes
  if (action === 'scan-all') {
    const allKeys = await redis(['KEYS', '*']);
    const prefixes = {};
    for (const k of (allKeys || [])) {
      const prefix = k.includes(':') ? k.split(':').slice(0, 2).join(':') : k;
      if (!prefixes[prefix]) prefixes[prefix] = { count: 0, totalSize: 0, keys: [] };
      prefixes[prefix].count++;
      let size = 0;
      try {
        const type = await redis(['TYPE', k]);
        if (type === 'string') {
          size = await redis(['STRLEN', k]) || 0;
        } else if (type === 'zset') {
          const members = await redis(['ZRANGE', k, 0, -1]);
          size = (members || []).reduce((s, m) => s + m.length, 0);
        } else if (type === 'set') {
          const members = await redis(['SMEMBERS', k]);
          size = (members || []).reduce((s, m) => s + m.length, 0);
        } else if (type === 'list') {
          const len = await redis(['LLEN', k]) || 0;
          size = len * 100; // estimate
        } else if (type === 'hash') {
          const vals = await redis(['HGETALL', k]);
          size = JSON.stringify(vals || {}).length;
        }
      } catch {}
      prefixes[prefix].totalSize += size;
      if (prefixes[prefix].keys.length < 5) prefixes[prefix].keys.push({ key: k, size });
    }
    // Sort by totalSize descending
    const sorted = Object.entries(prefixes)
      .map(([p, d]) => ({ prefix: p, ...d, totalSizeMB: (d.totalSize / 1024 / 1024).toFixed(2) }))
      .sort((a, b) => b.totalSize - a.totalSize);
    const dbinfo = await redis(['DBSIZE']);
    return res.status(200).json({ dbsize: dbinfo, totalKeys: (allKeys || []).length, prefixes: sorted });
  }

  // Delete all keys matching a prefix
  if (action === 'delete-prefix') {
    const prefix = req.query.prefix;
    if (!prefix) return res.status(400).json({ error: 'prefix required' });
    // Safety: don't delete user:sites or session keys
    if (prefix === 'user:sites' || prefix === 'session') {
      return res.status(400).json({ error: 'Cannot delete protected prefix' });
    }
    const keys = await redis(['KEYS', `${prefix}:*`]);
    let deleted = 0;
    for (const k of (keys || [])) {
      await redis(['DEL', k]);
      deleted++;
    }
    return res.status(200).json({ ok: true, prefix, deleted });
  }

  // Delete unpaid site HTML (keep metadata in user list, just remove heavy HTML)
  if (action === 'cleanup-unpaid-html') {
    const userKeys = await redis(['KEYS', 'user:sites:*']);
    let deleted = 0;
    let freedBytes = 0;
    for (const uk of (userKeys || [])) {
      const members = await redis(['ZRANGE', uk, 0, -1]);
      for (const m of (members || [])) {
        try {
          const s = JSON.parse(m);
          if (!s.paid) {
            const size = await redis(['STRLEN', `site:html:${s.id}`]) || 0;
            if (size > 0) {
              await redis(['DEL', `site:html:${s.id}`]);
              deleted++;
              freedBytes += size;
            }
          }
        } catch {}
      }
    }
    return res.status(200).json({ ok: true, unpaidHtmlDeleted: deleted, freedBytes, freedMB: (freedBytes / 1024 / 1024).toFixed(2) });
  }

  // Get top N largest keys
  if (action === 'top-keys') {
    const limit = parseInt(req.query.limit) || 20;
    const allKeys = await redis(['KEYS', '*']);
    const keySizes = [];
    for (const k of (allKeys || [])) {
      let size = 0;
      try {
        const type = await redis(['TYPE', k]);
        if (type === 'string') size = await redis(['STRLEN', k]) || 0;
        else if (type === 'zset') {
          const members = await redis(['ZRANGE', k, 0, -1]);
          size = (members || []).reduce((s, m) => s + m.length, 0);
        }
      } catch {}
      keySizes.push({ key: k, size, sizeMB: (size / 1024 / 1024).toFixed(3) });
    }
    keySizes.sort((a, b) => b.size - a.size);
    return res.status(200).json({ topKeys: keySizes.slice(0, limit) });
  }

  // Find orphan img keys not referenced by any site HTML
  if (action === 'cleanup-orphan-images') {
    const imgKeys = await redis(['KEYS', 'img:*']);
    const htmlKeys = await redis(['KEYS', 'site:html:*']);
    // Collect all img IDs referenced in site HTML
    const referencedImgs = new Set();
    for (const hk of (htmlKeys || [])) {
      try {
        const html = await redis(['GET', hk]);
        if (html) {
          const matches = html.match(/\/api\/img\?k=([a-z0-9]+)/gi) || [];
          for (const m of matches) {
            const id = m.replace('/api/img?k=', '');
            referencedImgs.add(id);
          }
        }
      } catch {}
    }
    // Delete orphan img keys
    let deleted = 0;
    let freedBytes = 0;
    let kept = 0;
    const dryRun = req.query.dryRun === 'true';
    for (const ik of (imgKeys || [])) {
      const id = ik.replace('img:', '');
      if (!referencedImgs.has(id)) {
        const size = await redis(['STRLEN', ik]) || 0;
        if (!dryRun) await redis(['DEL', ik]);
        deleted++;
        freedBytes += size;
      } else {
        kept++;
      }
    }
    return res.status(200).json({
      ok: true, dryRun,
      totalImgKeys: (imgKeys || []).length,
      orphanImagesDeleted: deleted,
      imagesKept: kept,
      freedBytes,
      freedMB: (freedBytes / 1024 / 1024).toFixed(2)
    });
  }

  // List all unique emails from sessions
  if (action === 'emails') {
    const sessionKeys = await redis(['KEYS', 'session:*']);
    const emails = new Set();
    const users = [];
    for (const sk of (sessionKeys || [])) {
      try {
        const data = await redis(['GET', sk]);
        if (data) {
          const u = JSON.parse(data);
          if (u.email && !emails.has(u.email)) {
            emails.add(u.email);
            users.push({ email: u.email, name: u.name || '', sub: u.sub || '' });
          }
        }
      } catch {}
    }
    return res.status(200).json({ totalSessions: (sessionKeys || []).length, uniqueEmails: emails.size, users });
  }

  // Set a Redis key value (admin only)
  if (action === 'set-key') {
    const k = req.query.key;
    const v = req.query.value;
    if (!k || v === undefined) return res.status(400).json({ error: 'key and value required' });
    await redis(['SET', k, v]);
    return res.status(200).json({ ok: true, key: k, value: v });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
