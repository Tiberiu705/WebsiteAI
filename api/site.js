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

// Strip inline editing artifacts from HTML so published sites are not editable
function stripInlineEditor(html) {
  if (!html || typeof html !== 'string') return html;
  // Remove ALL editor style blocks (id="we-css", id="we-s", id="we-edit-css")
  html = html.replace(/<style\s+id="we-[^"]*"[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove ALL editor script blocks (id="we-js", id="we-e", id="we-edit", etc.)
  html = html.replace(/<script\s+id="we-[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '');
  // Also catch split tag trick: <scr + ipt id="we-...">
  html = html.replace(/<scr[^>]*id="we-[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove contenteditable attributes
  html = html.replace(/\s+contenteditable="[^"]*"/gi, '');
  html = html.replace(/\s+contenteditable='[^']*'/gi, '');
  html = html.replace(/\s+contenteditable(?=[>\s/])/gi, '');
  // Remove data-ek attributes
  html = html.replace(/\s+data-ek="[^"]*"/gi, '');
  html = html.replace(/\s+data-ek='[^']*'/gi, '');
  // Remove spellcheck="false" left by editor
  html = html.replace(/\s+spellcheck="false"/gi, '');
  return html;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!REST_URL || !REST_TOKEN) return res.status(503).json({ error: 'Storage neconfigurat' });

  // Domain serving branch (replaces api/serve-domain.js)
  if (req.query.domain) {
    const domain = req.query.domain.split(':')[0].toLowerCase();
    try {
      const mapping = await redis(['GET', `domain:${domain}`]);
      if (!mapping) return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff;">
          <h2>Domeniu neconectat</h2>
          <p style="color:#666;">Domeniul <strong>${domain}</strong> nu este conectat la niciun site.</p>
        </body></html>
      `);
      const { siteId } = JSON.parse(mapping);

      // Fetch meta and HTML in parallel for speed
      const [meta, htmlData] = await Promise.all([
        redis(['GET', `site:meta:${siteId}`]),
        redis(['GET', `site:html:${siteId}`]),
      ]);
      let siteActive = true;
      let siteSku = '';
      let cachedMembers = null;
      if (meta) {
        const { userId } = JSON.parse(meta);
        cachedMembers = await redis(['ZRANGE', `user:sites:${userId}`, 0, -1]);
        for (const m of (cachedMembers || [])) {
          try {
            const s = JSON.parse(m);
            if (s.id === siteId) {
              if (s.paid === false) siteActive = false;
              if (s.sku) siteSku = s.sku;
              break;
            }
          } catch {}
        }
      }

      if (!siteActive) {
        return res.status(402).send(`
          <!DOCTYPE html>
          <html lang="ro">
          <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
          <title>Site Suspendat</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet">
          </head>
          <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080808;font-family:'Inter',sans-serif;">
            <div style="text-align:center;max-width:480px;padding:40px 24px;">
              <div style="width:64px;height:64px;background:rgba(255,60,60,0.1);border:1.5px solid rgba(255,60,60,0.25);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ff4d4d" stroke-width="1.8"/><path d="M12 8v4M12 16h.01" stroke="#ff4d4d" stroke-width="2" stroke-linecap="round"/></svg>
              </div>
              <h1 style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.6rem;color:#fff;margin:0 0 12px;">Site suspendat</h1>
              <p style="color:#666;font-size:0.9rem;line-height:1.7;margin:0 0 28px;">Abonamentul pentru acest site a expirat sau plata nu a putut fi procesată. Contactează proprietarul site-ului sau echipa WebsiteAI pentru reactivare.</p>
              <a href="https://websiteai.ro" style="display:inline-block;background:#C8FF00;color:#080808;font-family:'Syne',sans-serif;font-weight:800;font-size:0.85rem;padding:12px 28px;border-radius:10px;text-decoration:none;">websiteai.ro</a>
            </div>
          </body>
          </html>
        `);
      }

      if (!htmlData) return res.status(404).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#000;color:#fff;">
          <h2>Site indisponibil</h2>
          <p style="color:#666;">Site-ul pentru <strong>${domain}</strong> nu mai este disponibil.</p>
        </body></html>
      `);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      let cleanHtml = stripInlineEditor(htmlData);
      const metaTag = `<meta name="wai-site-id" content="${siteId}">` + (siteSku ? `<meta name="wai-site-sku" content="${siteSku}">` : '');
      if (/<head[^>]*>/i.test(cleanHtml)) {
        cleanHtml = cleanHtml.replace(/<head[^>]*>/i, '$&\n' + metaTag);
      } else {
        cleanHtml = metaTag + '\n' + cleanHtml;
      }
      return res.status(200).send(cleanHtml);
    } catch (e) {
      return res.status(500).send('Eroare server');
    }
  }

  const sku = (req.query.sku || '').toUpperCase().trim();
  if (!sku || !/^WEB-[A-Z0-9]{6}$/.test(sku)) return res.status(400).json({ error: 'SKU invalid' });

  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Neautentificat' });

  try {
    // Verify session + get SKU mapping in parallel
    const [sessionData, skuData] = await Promise.all([
      redis(['GET', `session:${token}`]),
      redis(['GET', `sku:${sku}`]),
    ]);
    if (!sessionData) return res.status(401).json({ error: 'Sesiune expirată' });
    if (!skuData) return res.status(404).json({ error: 'Site negăsit' });
    const user = JSON.parse(sessionData);
    const { siteId, ownerId } = JSON.parse(skuData);

    // Verify ownership (admin emails bypass)
    const ADMIN_EMAILS = ['adelinp88@gmail.com', 'mtiberiu84@gmail.com'];
    const isAdmin = ADMIN_EMAILS.includes(user.email);
    if (!isAdmin && user.sub !== ownerId) return res.status(403).json({ error: 'Acces interzis' });

    // Return site HTML + siteId for admin editing
    const html = await redis(['GET', `site:html:${siteId}`]);
    if (!html) return res.status(404).json({ error: 'Site-ul nu mai este disponibil' });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex');
    // If admin requested JSON mode, return siteId + site metadata
    if (req.query.format === 'json') {
      let brandName = '', activity = '';
      try {
        const members = await redis(['ZRANGE', `user:sites:${ownerId}`, 0, -1]);
        for (const m of (members || [])) {
          try {
            const s = JSON.parse(m);
            if (s.id === siteId) { brandName = s.brandName || ''; activity = s.activity || ''; break; }
          } catch {}
        }
      } catch {}
      return res.status(200).json({ html, siteId, ownerId, sku, brandName, activity });
    }
    return res.status(200).send(stripInlineEditor(html));
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
