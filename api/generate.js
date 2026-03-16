const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Sarcina ta este să generezi un fișier HTML complet, de înaltă calitate, pentru o afacere românească, pe baza datelor furnizate.\n\n═══ REGULI OBLIGATORII ═══\n\nOUTPUT:\n- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)\n- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO comentarii în afara codului\n- Toate stilurile: inline în <style> în <head> SAU clase Tailwind direct pe elemente\n- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"><\/script>\n- Google Fonts: include 2 fonturi diferite (1 display/serif pentru titluri, 1 sans-serif pentru body)\n\nDESIGN:\n- Design 100% personalizat pentru brandul specificat — NU template-uri generice\n- Paletă de culori unică derivată din domeniul afacerii (NU culorile implicite Tailwind: indigo, blue, purple)\n- Tipografie: font display pentru heading-uri (tracking -0.03em pe titluri mari), font sans pentru body (line-height 1.7)\n- Font size body: 13px pentru tot textul de paragraf, descrieri, liste\n- O singură culoare de text pentru tot conținutul (nu amesteca culori de text în același bloc)\n- Shadows: layered, cu culori ușor tintate, low opacity — NU flat shadow-md\n- Gradiente: minim 2 gradiente radiale layered pentru fundal\n- Animații: DOAR transform și opacity — NICIODATĂ transition-all\n- Fiecare element clickabil (buton, link, card): stări hover, focus-visible ȘI active distincte\n- Imagini: overlay gradient (bg-gradient-to-t from-black/60) + filter brightness(0.8) pe toate imaginile\n- Imaginea hero (landing page): filter brightness(0.8) blur(3px) scale(1.05) — ușor blurată pentru profunzime\n- Text peste imagini (hero, banner): ÎNTOTDEAUNA alb pur (#ffffff) cu text-shadow pentru contrast maxim, NICIODATĂ gri\n- Spacing: token-uri consistente (nu valori Tailwind aleatorii)\n- Depth: suprafețe cu z-plane distinct (base → elevated → floating)\n\nNAVBAR:\n- Meniu minimalist și modern: logo stânga, linkuri dreapta, max 5 iteme\n- Navbar transparent sau cu blur backdrop la scroll, fără border gros\n- Linkurile de navigare: text simplu cu hover subtil, fără butoane cu background în nav\n- Un singur CTA button în navbar (ex: „Contactează-ne"), stilizat distinct\n- Spațiere perfectă, aliniament vertical centrat, padding consistent\n\nBUTOANE CTA:\n- ORICE text de acțiune (\"Vezi serviciile\", \"Programează acum\", \"Află mai mult\", etc.) trebuie să fie un buton stilizat — NU text simplu sau link\n- Butoane cu padding px-6 py-3, border-radius consistent, font-weight 600\n- Toate butoanele primare: același stil și culoare brand pe tot site-ul\n- Butoane secundare: outline sau ghost, același border-radius ca cele primare\n\nSERVICII:\n- Fiecare card de serviciu TREBUIE să aibă o imagine cu dimensiuni unice — NICIO dimensiune nu se repetă\n- Folosește aceste dimensiuni exacte în ordine: 400x300, 380x260, 420x280, 360x240, 410x290, 390x270 (una per card)\n- Fiecare imagine de serviciu are filter brightness(0.8)\n- Cardurile de servicii: grid uniform, spațiere consistentă\n\nTESTIMONIALE:\n- Secțiunea de testimoniale: grid de 2-3 coloane, carduri egale ca înălțime\n- Fiecare testimonial: avatar rotund, nume, funcție/ocupație, text citat în ghilimele, rating cu stele\n- Carduri cu shadow subtil, background ușor diferit față de secțiune\n- Spațiere uniformă între carduri\n\nFOOTER:\n- Footer profesional cu 3-4 coloane: Logo+descriere scurtă | Linkuri rapide | Contact | Social media\n- Background închis (nu negru pur), text alb/gri deschis\n- Logo și tagline în prima coloană\n- Linkuri rapide: lista paginilor principale\n- Contact: adresă, telefon, email cu iconițe SVG inline\n- Social media: iconițe SVG pentru Facebook, Instagram, LinkedIn\n- Linie separator deasupra copyright-ului\n- Copyright centrat în sub-footer\n\nCONȚINUT:\n- Texte reale în română — NU Lorem Ipsum, NU placeholder text\n- Texte optimizate pentru conversie (titluri impactante, CTA clare)\n- Structură completă: Nav sticky → Hero → Servicii/Produse → Despre → Testimoniale → FAQ sau CTA banner → Footer\n- Număr de telefon, adresă, email: inventate veridic dacă nu sunt furnizate\n- Imagini: folosește EXCLUSIV https://placehold.co/WIDTHxHEIGHT — NU adăuga parametri de culoare sau text, NU folosi alte servicii de imagini.\n\nRESPONSIVE:\n- Mobile-first, funcțional la 375px și 1440px\n- Grid responsive cu grid-cols adaptiv\n- Navbar: hamburger menu pe mobile\n\nINTERZIS:\n- transition-all (folosește: transition-transform, transition-opacity, transition-colors etc.)\n- Culorile implicite Tailwind ca brand primar (blue-600, indigo-500, purple-600)\n- Lorem ipsum sau text placeholder\n- JavaScript complex sau librării externe în afara Tailwind CDN și Google Fonts\n- Text de acțiune fără stilizare de buton\n- Imagini fără filter brightness(0.8)\n`;

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
        generationConfig: { maxOutputTokens: 16384, temperature: 0.75, topP: 0.95 },
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
