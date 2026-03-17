import { createServer } from 'http';
import { readFile, readdir, stat } from 'fs/promises';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { exec } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

/* ── Gemini config (same provider SiteAI uses for "scratch" mode) ── */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL   = 'gemini-2.5-flash';

/* ── MIME types ── */
const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
};

/* ─────────────────────────────────────────────────────────────────
   SYSTEM PROMPT  (reconstructed from SiteAI JS source + CLAUDE.md)
───────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Generează un fișier HTML complet, de înaltă calitate, pentru o afacere românească.

═══ OUTPUT ═══
- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)
- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO explicații
- Toate stilurile: în <style> în <head> SAU clase Tailwind pe elemente
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Google Fonts: 2 fonturi (1 display/serif pentru titluri, 1 sans-serif pentru body)

═══ STRUCTURA PAGINII (obligatorie, în această ordine) ═══

1. NAVBAR sticky (position: fixed, top:0, z-index:50, backdrop-blur)
   - Container max-w-7xl mx-auto px-6, height 64px, flex items-center justify-between
   - Stânga: logo (text mare, font-weight 700, culoarea brand)
   - Dreapta: linkuri nav (gap-8, text-sm, font-medium) + 1 buton CTA distinct
   - Hamburger menu pe mobile (block md:hidden)
   - Background: semi-transparent cu backdrop-blur la scroll via JS scroll listener

2. HERO (min-height: 100vh, position: relative, overflow: hidden)
   - Background image: <img> cu position absolute inset-0, w-full h-full object-cover, style="filter:brightness(0.45) blur(2px) scale(1.08)"
   - Overlay gradient: <div> position absolute inset-0, background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 100%)
   - Content: position relative z-10, flex flex-col items-center justify-center, text-center, px-6, pt-24
   - H1: font-size clamp(2.8rem, 6vw, 5rem), font-weight 800, color #ffffff, letter-spacing -0.03em, text-shadow: 0 2px 20px rgba(0,0,0,0.5), max-w-4xl mx-auto, line-height 1.1
   - Subtitle: font-size 1.1rem, color rgba(255,255,255,0.88), max-w-2xl mx-auto, mt-6, line-height 1.7
   - Butoane CTA: flex gap-4 mt-10, buton primar (bg brand, text alb, px-8 py-4, rounded-lg, font-weight 600) + buton secundar (border 2px solid white, text alb, px-8 py-4, rounded-lg)

3. STATS BAR (secțiune separată după hero)
   - Background: culoarea brand (închisă) sau gri închis
   - Grid 4 coloane (md:grid-cols-4, grid-cols-2), py-16
   - Fiecare stat: număr mare (font-size 2.5rem, font-weight 800, color alb), label mic (text-sm, opacity 0.75, color alb)
   - Text centered, padding px-8 py-6

4. SERVICII (background alb sau gri foarte deschis #f8f8f8)
   - Section header: text-center, mb-16 — supertitlu mic (uppercase, culoarea brand, letter-spacing 0.12em) + H2 mare (color #111, font-weight 800) + subtitlu (color #555)
   - Grid: grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-8, max-w-7xl mx-auto px-6
   - Fiecare card serviciu (STRUCTURA EXACTĂ — nu devia de la ea):
     <div style="border-radius:16px; overflow:hidden; background:#fff; box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04); display:flex; flex-direction:column;">
       <div style="position:relative; overflow:hidden; height:220px;">
         <img src="https://placehold.co/WIDTHxHEIGHT" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.8);" />
         <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%);"></div>
       </div>
       <div style="padding:24px 28px 28px; flex:1; display:flex; flex-direction:column;">
         <h3 style="font-size:1.2rem;font-weight:700;color:#111;margin-bottom:10px;">Titlu serviciu</h3>
         <p style="font-size:13px;color:#555;line-height:1.7;flex:1;">Descriere reală.</p>
         <a href="#contact" style="display:inline-block;margin-top:20px;padding:10px 24px;background:var(--brand);color:#fff;border-radius:8px;font-weight:600;font-size:14px;text-align:center;">Acțiune</a>
       </div>
     </div>
   - Dimensiuni imagini în ordine: 400x220, 380x220, 420x220, 360x220, 410x220, 390x220

5. DESPRE (background alb sau ușor colorat)
   - Layout 2 coloane (lg:grid-cols-2), gap-16, items-center, max-w-7xl mx-auto px-6 py-24
   - Coloana imagine: rounded-2xl overflow-hidden, shadow, position relative — imagine 600x500, filter brightness(0.85)
   - Coloana text: supertitlu + H2 (font-size 2.5rem, font-weight 800, color #111) + paragraf + listă avantaje cu SVG checkmark + buton CTA

6. TESTIMONIALE (background #f4f4f4 sau culoare brand foarte deschisă)
   - Grid 3 coloane (lg:grid-cols-3, md:grid-cols-2), gap-6, max-w-7xl mx-auto px-6
   - Fiecare card: background alb, border-radius 16px, padding 28px, shadow subtil
   - Structură: stele SVG → text citat italic → separator → avatar 40px + nume + funcție

7. CTA BANNER sau FAQ
   - CTA Banner: background culoarea brand, text alb centrat, H2 + subtitlu + buton alb
   - SAU FAQ: accordion, max-w-3xl mx-auto, 5-6 întrebări relevante

8. FOOTER (background #1a1a1a, color #e5e5e5)
   - Grid 4 coloane (lg:grid-cols-4, md:grid-cols-2), max-w-7xl mx-auto px-6 py-16
   - Col 1: Logo + tagline + iconițe social SVG (Facebook, Instagram, LinkedIn)
   - Col 2: Linkuri rapide (liste de pagini)
   - Col 3: Contact cu iconițe SVG (adresă, telefon, email)
   - Col 4: Program / Certificări / Info relevantă
   - Sub-footer: border-top #333, copyright centrat, py-6, text-xs, color #666

═══ DESIGN ═══
- Culori: paletă unică din domeniu — NU blue-600, indigo-500, purple-600 Tailwind
- Definește: :root { --brand: #HEX; --brand-dark: #HEX; --brand-light: #HEX; }
- CONTRAST SECȚIUNI: fundal deschis → text #111. Fundal închis → text #fff
- CONTRAST BUTOANE (OBLIGATORIU): buton alb/galben/bej/deschis → text #111. Buton negru/închis/colorat → text #fff. CTA Banner buton alb pe fundal colorat → text = culoarea brand sau #111, NU alb
- Shadows layered cu opacitate mică. Animații DOAR transform și opacity
- Hover pe carduri: transform translateY(-4px), shadow mai mare
- Secțiunile alternează background: alb → gri deschis → alb → gri deschis

═══ CONȚINUT ═══
- Texte reale în română — ZERO Lorem Ipsum
- Titluri impactante, orientate pe beneficiu
- Date contact: inventate veridic dacă lipsesc
- Imagini: EXCLUSIV https://placehold.co/WIDTHxHEIGHT

═══ RESPONSIVE ═══
- Mobile-first, 375px și 1440px
- Navbar: hamburger menu pe mobile cu toggle JS simplu
- Hero H1: clamp() fluid

═══ INTERZIS ═══
- transition-all
- Culorile default Tailwind ca brand (blue, indigo, purple)
- Lorem ipsum
- Butoane CTA fără stilizare
- Imagini fără filter brightness(0.8) sau mai mic
- Secțiuni fără container (max-w + mx-auto + px)
- Carduri de servicii fără imagine
`;

/* ── Build user prompt from brief (same structure as SiteAI frontend) ── */
function buildUserPrompt(brief) {
  return `Generează un site web complet pentru următoarea afacere:

- Nume brand / companie: ${brief.brandName   || 'nu a specificat'}
- Activitate: ${brief.activity    || 'nu a specificat clar, dedu tu un context rezonabil'}
- Public țintă: ${brief.audience    || 'nu a specificat'}
- Acțiunea principală dorită a vizitatorilor: ${brief.mainAction   || 'nu a specificat'}
- Preferințe culori / fonturi: ${brief.colorsFonts  || 'nu a specificat'}
- Stil design dorit: ${brief.designStyle  || 'modern'}
${brief.extraNote ? `\nDetalii suplimentare de la client:\n${brief.extraNote}` : ''}

Generează ACUM fișierul HTML complet, începând cu <!DOCTYPE html>`;
}

/* ── Call Gemini API (same provider SiteAI uses for scratch mode) ── */
async function generateWithGemini(brief) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY lipsește. Setează variabila de mediu GEMINI_API_KEY.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role:  'user',
        parts: [{ text: buildUserPrompt(brief) }],
      }],
      generationConfig: {
        maxOutputTokens: 65536,
        temperature:     0.75,
        topP:            0.95,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${err.slice(0, 400)}`);
  }

  const data = await res.json();
  let html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  if (!html) {
    const reason = data?.candidates?.[0]?.finishReason || 'unknown';
    throw new Error(`Gemini nu a returnat HTML. Motiv: ${reason}`);
  }

  /* Strip markdown fences if model added them */
  html = html
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return html;
}

/* ── Generate image via nano-banana CLI ── */
async function generateImageWithNanoBanana(prompt) {
  const outputDir = join(__dirname, 'nanobanana-output');
  const geminiPath = `${process.env.HOME}/.npm-global/bin/gemini`;
  const safePrompt = prompt.replace(/'/g, "\\'");

  return new Promise((resolve, reject) => {
    const cmd = `${geminiPath} --yolo "/generate '${safePrompt}'"`;
    exec(cmd, {
      env: {
        ...process.env,
        NANOBANANA_API_KEY: GEMINI_API_KEY,
        GEMINI_API_KEY,
        PATH: `${process.env.HOME}/.npm-global/bin:${process.env.PATH}`,
      },
      timeout: 60000,
    }, async (err, stdout, stderr) => {
      try {
        const files = await readdir(outputDir).catch(() => []);
        const images = files
          .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
          .map(f => ({ name: f, path: join(outputDir, f) }));

        if (!images.length) return resolve(null);

        // Pick the most recently modified file
        const stats = await Promise.all(
          images.map(async img => {
            const { mtimeMs } = await stat(img.path);
            return { ...img, mtimeMs };
          })
        );
        stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const newest = stats[0];
        const buf = await readFile(newest.path);
        const ext = extname(newest.name).slice(1).replace('jpg', 'jpeg');
        resolve(`data:image/${ext};base64,${buf.toString('base64')}`);
      } catch (e) {
        resolve(null);
      }
    });
  });
}

/* ── Collect full body from IncomingMessage ── */
function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end',  () => resolve(body));
    req.on('error', reject);
  });
}

/* ─────────────────────────────────────────────────────────────────
   HTTP SERVER
───────────────────────────────────────────────────────────────── */
createServer(async (req, res) => {

  /* CORS */
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  /* ── POST /api/generate ── */
  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      const raw   = await collectBody(req);
      const brief = JSON.parse(raw);

      console.log(`\n[generate] Brief received for: "${brief.brandName || '?'}" — ${brief.activity || '?'}`);

      const html = await generateWithGemini(brief);

      console.log(`[generate] HTML generated: ${html.length} chars`);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ html }));

    } catch (err) {
      console.error('[generate] Error:', err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message || 'Eroare internă' }));
    }
    return;
  }

  /* ── POST /api/generate-image ── */
  if (req.method === 'POST' && req.url === '/api/generate-image') {
    try {
      const raw = await collectBody(req);
      const { prompt } = JSON.parse(raw);
      if (!prompt) throw new Error('prompt lipsește');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`;
      const gemRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        }),
      });

      if (!gemRes.ok) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ dataUrl: null }));
        return;
      }

      const data = await gemRes.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith('image/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ dataUrl: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }));
          return;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dataUrl: null }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ dataUrl: null, error: err.message }));
    }
    return;
  }

  /* ── POST /api/images ── */
  if (req.method === 'POST' && req.url === '/api/images') {
    try {
      const raw    = await collectBody(req);
      const { prompt } = JSON.parse(raw);
      if (!prompt) throw new Error('prompt lipsește');

      console.log(`[images] Generating: "${prompt.slice(0, 80)}…"`);
      const dataUrl = await generateImageWithNanoBanana(prompt);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ dataUrl: dataUrl || null }));
    } catch (err) {
      console.error('[images] Error:', err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message, dataUrl: null }));
    }
    return;
  }

  /* ── Static files ── */
  let path = req.url === '/' ? '/index.html' : req.url;
  path = path.split('?')[0];
  const filePath = join(__dirname, path);
  try {
    const data = await readFile(filePath);
    const ext  = extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }

}).listen(PORT, () => {
  console.log(`\n🚀 WebsiteAI server → http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) {
    console.warn('\n⚠️  GEMINI_API_KEY nu este setat!\n');
  } else {
    console.log(`✅ Gemini: ${GEMINI_MODEL} — gata de generare\n`);
  }
});
