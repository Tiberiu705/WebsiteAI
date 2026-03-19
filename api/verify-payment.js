module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe not configured' });

  const stripeRes = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(session_id)}`,
    { headers: { Authorization: `Bearer ${key}` } }
  );

  const session = await stripeRes.json();
  if (!stripeRes.ok) return res.status(400).json({ error: session.error?.message || 'Eroare Stripe' });

  return res.status(200).json({
    paid: session.payment_status === 'paid',
    siteId: session.metadata?.site_id || null,
  });
};
