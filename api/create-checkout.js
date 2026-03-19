const REST_URL   = process.env.UPSTASH_REDIS_KV_REST_API_URL   || process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisSave(id, html) {
  if (!REST_URL || !REST_TOKEN || !html) return;
  await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', `site:html:${id}`, String(html), 'EX', 86400]),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe not configured' });

  const { html, brandName, origin, originSiteId } = req.body || {};
  if (!origin) return res.status(400).json({ error: 'origin required' });

  const siteId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (html && html.length > 100) await redisSave(siteId, html);

  const productName = brandName
    ? `Website AI — ${String(brandName).slice(0, 60)}`
    : 'Website generat cu AI — WebsiteAI.ro';

  // If coming from dashboard, redirect back to dashboard with the original site ID
  const successUrl = originSiteId
    ? `${origin}/dashboard?payment=success&session_id={CHECKOUT_SESSION_ID}&site_id=${encodeURIComponent(originSiteId)}`
    : `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}&site_id=${siteId}`;

  const params = new URLSearchParams({
    'payment_method_types[]': 'card',
    'line_items[0][price_data][currency]': 'ron',
    'line_items[0][price_data][product_data][name]': productName,
    'line_items[0][price_data][product_data][description]': 'Site web profesional generat cu WebsiteAI.ro — abonament lunar',
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][unit_amount]': '100',
    'line_items[0][quantity]': '1',
    'mode': 'subscription',
    'success_url': successUrl,
    'cancel_url': `${origin}/dashboard`,
    'subscription_data[metadata][site_id]': siteId,
    'metadata[site_id]': siteId,
    'locale': 'ro',
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await stripeRes.json();
  if (!stripeRes.ok) return res.status(400).json({ error: data.error?.message || 'Eroare Stripe' });

  return res.status(200).json({ url: data.url, siteId });
};
