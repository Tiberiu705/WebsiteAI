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
const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Sarcina ta este să generezi un fișier HTML complet, de înaltă calitate, pentru o afacere românească, pe baza datelor furnizate.

═══ REGULI OBLIGATORII ═══

OUTPUT:
- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)
- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO comentarii în afara codului
- Toate stilurile: inline în <style> în <head> SAU clase Tailwind direct pe elemente
- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
- Google Fonts: include 2 fonturi diferite (1 display/serif pentru titluri, 1 sans-serif pentru body)

DESIGN:
- Design 100% personalizat pentru brandul specificat — NU template-uri generice
- Paletă de culori unică derivată din domeniul afacerii (NU culorile implicite Tailwind: indigo, blue, purple)
- Tipografie: font display pentru heading-uri (tracking -0.03em pe titluri mari), font sans pentru body (line-height 1.7)
- Shadows: layered, cu culori ușor tintate, low opacity — NU flat shadow-md
- Gradiente: minim 2 gradiente radiale layered pentru fundal
- Animații: DOAR transform și opacity — NICIODATĂ transition-all
- Fiecare element clickabil (buton, link, card): stări hover, focus-visible ȘI active distincte
- Imagini: overlay gradient (bg-gradient-to-t from-black/60) pe imaginile de fundal
- Spacing: token-uri consistente (nu valori Tailwind aleatorii)
- Depth: suprafețe cu z-plane distinct (base → elevated → floating)

CONȚINUT:
- Texte reale în română — NU Lorem Ipsum, NU placeholder text
- Texte optimizate pentru conversie (titluri impactante, CTA clare)
- Structură completă: Nav sticky → Hero → Servicii/Produse → Despre → Testimoniale → FAQ sau CTA banner → Footer
- Număr de telefon, adresă, email: inventate veridic dacă nu sunt furnizate
- Butoane CTA în hero și în fiecare secțiune relevantă
- Placeholder imagini: https://placehold.co/WIDTHxHEIGHT/BGCOLOR/TEXTCOLOR

RESPONSIVE:
- Mobile-first, funcțional la 375px și 1440px
- Grid responsive cu grid-cols adaptiv
- Font sizes fluide cu clamp() sau clase Tailwind responsive

INTERZIS:
- transition-all (folosește: transition-transform, transition-opacity, transition-colors etc.)
- Culorile implicite Tailwind ca brand primar (blue-600, indigo-500, purple-600)
- Lorem ipsum sau text placeholder
- JavaScript complex sau librării externe în afara Tailwind CDN și Google Fonts
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
