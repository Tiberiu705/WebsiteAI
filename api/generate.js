const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Sarcina ta este să generezi un fișier HTML complet, de înaltă calitate, pentru o afacere românească, pe baza datelor furnizate.\n\n═══ REGULI OBLIGATORII ═══\n\nOUTPUT:\n- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)\n- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO comentarii în afara codului\n- Toate stilurile: inline în <style> în <head> SAU clase Tailwind direct pe elemente\n- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"><\/script>\n- Google Fonts: include 2 fonturi diferite (1 display/serif pentru titluri, 1 sans-serif pentru body)\n\nDESIGN:\n- Design 100% personalizat pentru brandul specificat — NU template-uri generice\n- Paletă de culori unică derivată din domeniul afacerii (NU culorile implicite Tailwind: indigo, blue, purple)\n- Tipografie: font display pentru heading-uri (tracking -0.03em pe titluri mari), font sans pentru body (line-height 1.7)\n- Shadows: layered, cu culori ușor tintate, low opacity — NU flat shadow-md\n- Gradiente: minim 2 gradiente radiale layered pentru fundal\n- Animații: DOAR transform și opacity — NICIODATĂ transition-all\n- Fiecare element clickabil (buton, link, card): stări hover, focus-visible ȘI active distincte\n- Imagini: overlay gradient (bg-gradient-to-t from-black/60) pe imaginile de fundal\n- Spacing: token-uri consistente (nu valori Tailwind aleatorii)\n- Depth: suprafețe cu z-plane distinct (base → elevated → floating)\n\nCONȚINUT:\n- Texte reale în română — NU Lorem Ipsum, NU placeholder text\n- Texte optimizate pentru conversie (titluri impactante, CTA clare)\n- Structură completă: Nav sticky → Hero → Servicii/Produse → Despre → Testimoniale → FAQ sau CTA banner → Footer\n- Număr de telefon, adresă, email: inventate veridic dacă nu sunt furnizate\n- Butoane CTA în hero și în fiecare secțiune relevantă\n- Imagini: folosește EXCLUSIV https://placehold.co/WIDTHxHEIGHT — de exemplu https://placehold.co/1280x720 sau https://placehold.co/600x400. NU adăuga parametri de culoare sau text, NU folosi alte servicii de imagini.\n\nRESPONSIVE:\n- Mobile-first, funcțional la 375px și 1440px\n- Grid responsive cu grid-cols adaptiv\n- Font sizes fluide cu clamp() sau clase Tailwind responsive\n\nINTERZIS:\n- transition-all (folosește: transition-transform, transition-opacity, transition-colors etc.)\n- Culorile implicite Tailwind ca brand primar (blue-600, indigo-500, purple-600)\n- Lorem ipsum sau text placeholder\n- JavaScript complex sau librării externe în afara Tailwind CDN și Google Fonts\n`;

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
        generationConfig: { maxOutputTokens: 65536, temperature: 0.75, topP: 0.95 },
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
