const crypto = require('crypto');

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

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifyWebhook(rawBody, sigHeader, secret) {
  try {
    const parts = sigHeader.split(',');
    const timestamp = parts.find(p => p.startsWith('t=')).slice(2);
    const sig = parts.find(p => p.startsWith('v1=')).slice(3);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

async function updateSitePaid(siteId, paidValue) {
  // Look up which user owns this site via site:meta:{siteId}
  const meta = await redis(['GET', `site:meta:${siteId}`]);
  if (!meta) return false;
  const { userId } = JSON.parse(meta);
  const key = `user:sites:${userId}`;
  const members = await redis(['ZRANGE', key, 0, -1]);
  for (const m of (members || [])) {
    try {
      const s = JSON.parse(m);
      if (s.id !== siteId) continue;
      const score = await redis(['ZSCORE', key, m]);
      s.paid = paidValue;
      await Promise.all([
        redis(['ZREM', key, m]),
        redis(['ZADD', key, Number(score) || Date.now(), JSON.stringify(s)]),
      ]);
      return true;
    } catch {}
  }
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const sigHeader = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  // Verify signature if secret is configured
  if (secret && sigHeader) {
    if (!verifyWebhook(rawBody, sigHeader, secret)) {
      return res.status(400).json({ error: 'Semnătură invalidă' });
    }
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'JSON invalid' }); }

  // Get the dashboard site ID from metadata (set at checkout creation)
  const obj = event.data?.object || {};
  const siteId = obj.metadata?.origin_site_id || obj.metadata?.site_id;

  if (siteId && REST_URL && REST_TOKEN) {
    switch (event.type) {
      // Subscription cancelled or payment failed → revoke access
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed':
        await updateSitePaid(siteId, false).catch(() => {});
        break;

      // Subscription renewed → re-activate
      case 'invoice.payment_succeeded':
      case 'customer.subscription.updated':
        await updateSitePaid(siteId, true).catch(() => {});
        break;
    }
  }

  return res.status(200).json({ received: true });
};

// Disable body parsing — Stripe needs raw body for signature verification
module.exports.config = { api: { bodyParser: false } };
