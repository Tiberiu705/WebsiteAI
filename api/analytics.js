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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Admin auth
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

  // Get last N days (default 30)
  const days = Math.min(parseInt(req.query.days) || 30, 90);
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Fetch all day hashes in parallel
  const dayData = await Promise.all(dates.map(d => redis(['HGETALL', `analytics:daily:${d}`])));

  const result = {
    period: { from: dates[0], to: dates[dates.length - 1], days },
    daily: [],
    totals: { views: 0 },
    sources: {},
    mediums: {},
    campaigns: {},
    referrers: {},
    pages: {},
  };

  for (let i = 0; i < dates.length; i++) {
    const raw = dayData[i]; // array of [field, value, field, value, ...] or null
    const map = {};
    if (raw && Array.isArray(raw)) {
      for (let j = 0; j < raw.length; j += 2) map[raw[j]] = parseInt(raw[j + 1]) || 0;
    }

    const views = map['views'] || 0;
    result.daily.push({ date: dates[i], views });
    result.totals.views += views;

    for (const [field, val] of Object.entries(map)) {
      if (field === 'views') continue;
      if (field.startsWith('source:')) {
        const k = field.slice(7);
        result.sources[k] = (result.sources[k] || 0) + val;
      } else if (field.startsWith('medium:')) {
        const k = field.slice(7);
        result.mediums[k] = (result.mediums[k] || 0) + val;
      } else if (field.startsWith('campaign:')) {
        const k = field.slice(9);
        result.campaigns[k] = (result.campaigns[k] || 0) + val;
      } else if (field.startsWith('ref:')) {
        const k = field.slice(4);
        result.referrers[k] = (result.referrers[k] || 0) + val;
      } else if (field.startsWith('page:')) {
        const k = field.slice(5);
        result.pages[k] = (result.pages[k] || 0) + val;
      }
    }
  }

  // Sort top entries
  const sortTop = (obj, n = 10) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, views: v }));

  result.topSources = sortTop(result.sources);
  result.topMediums = sortTop(result.mediums);
  result.topCampaigns = sortTop(result.campaigns);
  result.topReferrers = sortTop(result.referrers);
  result.topPages = sortTop(result.pages);

  // Also pull generation counter
  try {
    result.totals.generations = parseInt(await redis(['GET', 'stats:generations']) || '0', 10);
  } catch {}

  res.setHeader('Cache-Control', 'private, no-cache');
  return res.status(200).json(result);
};
