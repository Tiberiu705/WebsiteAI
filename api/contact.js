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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!REST_URL || !REST_TOKEN) return res.status(503).json({ error: 'Storage neconfigurat' });

  // ── GET: retrieve notification email for a site ──
  if (req.method === 'GET') {
    const { action, siteId } = req.query || {};
    if (action === 'get-email' && siteId) {
      try {
        const email = await redis(['GET', `contact-email:${siteId}`]);
        return res.status(200).json({ email: email || '' });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }
    return res.status(400).json({ error: 'Parametri lipsă' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};

  // ── POST action: set notification email ──
  if (body.action === 'set-email') {
    const { siteId, notificationEmail, token } = body;
    if (!siteId || !notificationEmail) return res.status(400).json({ error: 'siteId și email obligatorii' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(notificationEmail))) {
      return res.status(400).json({ error: 'Email invalid' });
    }
    // Verify session
    if (!token) return res.status(401).json({ error: 'Neautentificat' });
    try {
      const sessionData = await redis(['GET', `session:${token}`]);
      if (!sessionData) return res.status(401).json({ error: 'Sesiune expirată' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
    // Save notification email
    try {
      await redis(['SET', `contact-email:${siteId}`, String(notificationEmail).slice(0, 200)]);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── POST: contact form submission ──
  const { name, email, phone, message, brand, siteId, hp } = body;

  // Honeypot — silently discard bots
  if (hp) return res.status(200).json({ ok: true });

  // Basic validation
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Câmpurile obligatorii lipsesc (name, email, message)' });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
    return res.status(400).json({ error: 'Email invalid' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket?.remoteAddress
    || 'unknown';

  // Rate limiting: max 10 submissions per IP per hour
  try {
    const rateKey = `contact:rate:${ip}`;
    const count = await redis(['INCR', rateKey]);
    if (Number(count) === 1) await redis(['EXPIRE', rateKey, 3600]);
    if (Number(count) > 10) {
      return res.status(429).json({ error: 'Prea multe mesaje. Reveniți mai târziu.' });
    }
  } catch (_) { /* proceed if Redis fails */ }

  // Save lead to Redis
  try {
    const lead = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name:    String(name).slice(0, 100),
      email:   String(email).slice(0, 200),
      phone:   phone  ? String(phone).slice(0, 30)    : null,
      message: String(message).slice(0, 2000),
      brand:   brand  ? String(brand).slice(0, 100)   : null,
      siteId:  siteId ? String(siteId).slice(0, 100)  : null,
      ip,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([
      redis(['LPUSH', 'leads:all', JSON.stringify(lead)]),
      redis(['LTRIM', 'leads:all', 0, 999]),
    ]);
  } catch (_) { /* proceed if Redis fails */ }

  // Look up owner's notification email
  let ownerEmail = null;
  if (siteId) {
    try {
      ownerEmail = await redis(['GET', `contact-email:${siteId}`]);
    } catch (_) {}
  }

  // Send email notification via Resend
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const safeName    = String(name).replace(/</g, '&lt;');
    const safeEmail   = String(email).replace(/</g, '&lt;');
    const safePhone   = phone   ? String(phone).replace(/</g, '&lt;')   : null;
    const safeMessage = String(message).replace(/</g, '&lt;');
    const safeBrand   = brand   ? String(brand).replace(/</g, '&lt;')   : null;

    const emailHtml = `
      <h2 style="margin:0 0 24px;font-family:sans-serif;">
        Mesaj nou din formularul de contact${safeBrand ? ` — <em>${safeBrand}</em>` : ''}
      </h2>
      <table style="font-family:sans-serif;font-size:15px;border-collapse:collapse;">
        <tr><td style="padding:6px 16px 6px 0;color:#555;font-weight:600;">Nume:</td><td>${safeName}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#555;font-weight:600;">Email:</td><td><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
        ${safePhone ? `<tr><td style="padding:6px 16px 6px 0;color:#555;font-weight:600;">Telefon:</td><td>${safePhone}</td></tr>` : ''}
      </table>
      <div style="margin-top:20px;">
        <p style="font-family:sans-serif;font-weight:600;color:#555;margin:0 0 8px;">Mesaj:</p>
        <p style="font-family:sans-serif;white-space:pre-wrap;background:#f5f5f5;padding:16px;border-radius:8px;font-size:15px;margin:0;">${safeMessage}</p>
      </div>
    `;

    // Build recipient list: owner email + default admins
    const recipients = ['IT@websiteai.ro', 'adelinp88@gmail.com', 'mtiberiu84@gmail.com'];
    if (ownerEmail && !recipients.includes(ownerEmail)) {
      recipients.unshift(ownerEmail);
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:     'WebsiteAI <onboarding@resend.dev>',
        to:       recipients,
        reply_to: String(email),
        subject:  `Contact nou${safeBrand ? ` — ${safeBrand}` : ''}: ${safeName}`,
        html:     emailHtml,
      }),
    }).catch(() => {});
  }

  return res.status(200).json({ ok: true });
};
