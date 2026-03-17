const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Generează un fișier HTML complet, de înaltă calitate, pentru o afacere românească.\n\n═══ OUTPUT ═══\n- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)\n- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO explicații\n- Toate stilurile: în <style> în <head> SAU clase Tailwind pe elemente\n- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"><\\/script>\n- Google Fonts: 2 fonturi (1 display/serif pentru titluri, 1 sans-serif pentru body)\n\n═══ STRUCTURA PAGINII (obligatorie, în această ordine) ═══\n\n1. NAVBAR sticky (position: fixed, top:0, z-index:50, backdrop-blur)\n   - Container max-w-7xl mx-auto px-6, height 64px, flex items-center justify-between\n   - Stânga: logo (text mare, font-weight 700, culoarea brand)\n   - Dreapta: linkuri nav (gap-8, text-sm, font-medium) + 1 buton CTA distinct\n   - Hamburger menu pe mobile (block md:hidden)\n\n2. HERO (min-height: 100vh, position: relative, overflow: hidden)\n   - Background image: <img> cu position absolute inset-0, w-full h-full object-cover, style="filter:brightness(0.45) blur(2px) scale(1.08)"\n   - Overlay: <div> position absolute inset-0, background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 100%)\n   - Content: position relative z-10, flex flex-col items-center justify-center, text-center, px-6, pt-24\n   - H1: font-size clamp(2.8rem, 6vw, 5rem), font-weight 800, color #ffffff, text-shadow: 0 2px 20px rgba(0,0,0,0.5), max-w-4xl mx-auto\n   - Subtitle: font-size 1.1rem, color rgba(255,255,255,0.88), max-w-2xl mx-auto, mt-6\n   - Butoane CTA: flex gap-4 mt-10 — primar (bg brand, text alb, px-8 py-4, rounded-lg) + secundar (border 2px solid white, text alb)\n\n3. STATS BAR — background culoarea brand sau gri închis, grid 4 coloane, număr mare alb + label alb\n\n4. SERVICII (background alb sau #f8f8f8)\n   - Section header centrat: supertitlu uppercase + H2 color #111 + subtitlu color #555\n   - Grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-8, max-w-7xl mx-auto px-6\n   - FIECARE CARD (structura exactă, nu devia):\n     <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column;">\n       <div style="position:relative;overflow:hidden;height:220px;">\n         <img src="https://placehold.co/WIDTHxHEIGHT" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.8);" />\n         <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%);"></div>\n       </div>\n       <div style="padding:24px 28px 28px;flex:1;display:flex;flex-direction:column;">\n         <h3 style="font-size:1.2rem;font-weight:700;color:#111;margin-bottom:10px;">Titlu</h3>\n         <p style="font-size:13px;color:#555;line-height:1.7;flex:1;">Descriere.</p>\n         <a href="#contact" style="display:inline-block;margin-top:20px;padding:10px 24px;background:var(--brand);color:#fff;border-radius:8px;font-weight:600;font-size:14px;text-align:center;">Acțiune</a>\n       </div>\n     </div>\n   - Dimensiuni imagini: 400x220, 380x220, 420x220, 360x220, 410x220, 390x220\n\n5. DESPRE — 2 coloane (imagine stânga + text dreapta), max-w-7xl mx-auto, imagine cu filter brightness(0.85), text cu H2 + paragraf + liste + CTA\n\n6. TESTIMONIALE — background #f4f4f4, grid 3 coloane, carduri albe cu stele + citat italic + avatar + nume\n\n7. CTA BANNER — background culoarea brand, text alb centrat, H2 + buton alb\n\n8. FOOTER — background #1a1a1a, 4 coloane (logo+social | linkuri | contact | info), sub-footer copyright\n\n═══ DESIGN ═══\n- :root { --brand: #HEX; --brand-dark: #HEX; } — culori unice din domeniu, NU blue/indigo/purple Tailwind\n- CONTRAST SECȚIUNI: fundal deschis → text #111. Fundal închis → text #fff\n- CONTRAST BUTOANE (OBLIGATORIU): buton alb/galben/bej/deschis → text #111. Buton negru/închis/colorat → text #fff. CTA Banner buton alb pe fundal colorat → text = culoarea brand sau #111, NU alb\n- Shadows layered, animații DOAR transform și opacity, hover carduri translateY(-4px)\n- Secțiuni alternează: alb → gri deschis → alb\n\n═══ CONȚINUT ═══\n- Texte reale în română — ZERO Lorem Ipsum\n- Date contact: inventate veridic dacă lipsesc\n- Imagini: EXCLUSIV https://placehold.co/WIDTHxHEIGHT\n\n═══ INTERZIS ═══\n- transition-all\n- Blue/indigo/purple Tailwind ca brand\n- Lorem ipsum\n- Butoane fără stilizare\n- Imagini fără filter brightness(0.8)\n- Secțiuni fără max-w + mx-auto + px\n- Carduri servicii fără imagine\n`;

function buildUserPrompt(brief) {
  return `Generează un site web complet pentru următoarea afacere:\n\n- Nume brand / companie: ${brief.brandName || 'nu a specificat'}\n- Activitate: ${brief.activity || 'nu a specificat clar, dedu tu un context rezonabil'}\n- Public țintă: ${brief.audience || 'nu a specificat'}\n- Acțiunea principală dorită a vizitatorilor: ${brief.mainAction || 'nu a specificat'}\n- Preferințe culori / fonturi: ${brief.colorsFonts || 'nu a specificat'}\n- Stil design dorit: ${brief.designStyle || 'modern'}\n${brief.extraNote ? `\nDetalii suplimentare de la client:\n${brief.extraNote}` : ''}\n\nGenerează ACUM fișierul HTML complet, începând cu <!DOCTYPE html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  try {
    const brief = req.body;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

    const gemRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(brief) }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.75, topP: 0.95 },
      }),
    });

    if (!gemRes.ok) {
      const err = await gemRes.text().catch(() => '');
      return res.status(gemRes.status).json({ error: `Gemini API error ${gemRes.status}: ${err.slice(0, 400)}` });
    }

    const data = await gemRes.json();
    let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!html) {
      const reason = data?.candidates?.[0]?.finishReason || 'unknown';
      return res.status(500).json({ error: `Gemini nu a returnat HTML. Motiv: ${reason}` });
    }

    html = html
      .replace(/^```html\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    return res.status(200).json({ html });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
