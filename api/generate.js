const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

// ── Shared inline editor block (injected into every generated site) ───────────
// Pattern: elements are ALWAYS contenteditable from load (like the reference HTML),
// with localStorage persistence + Escape to cancel + parent postMessage sync.
function _weInlineEditorBlockStr() {
  // CSS: subtle hover + active outlines; no heavy toolbar
  var css = [
    '<style id="we-css">',
    '[data-ek][contenteditable]:hover:not(:focus){outline:1px dashed rgba(99,102,241,.5)!important;outline-offset:2px;border-radius:3px;cursor:text!important;}',
    '[data-ek][contenteditable]:focus{outline:2px solid rgba(99,102,241,.8)!important;outline-offset:3px;border-radius:3px;}',
    '[data-schedule]:hover{outline:1px dashed rgba(251,146,60,.5)!important;outline-offset:2px;border-radius:3px;cursor:pointer!important;}',
    '</style>',
  ].join('');

  // JS: always-on contenteditable, Escape to cancel, blur to save, localStorage + postMessage
  var js = [
    '<scr'+'ipt id="we-js">(function(){"use strict";',
    'var STORE="we2_edits";',
    'var edits={};try{edits=JSON.parse(localStorage.getItem(STORE)||"{}");}catch(e){}',
    'function saveStore(){try{localStorage.setItem(STORE,JSON.stringify(edits));}catch(e){}}',
    'function getKey(el){var p=[],c=el;',
    'while(c&&c!==document.body){var par=c.parentElement;',
    'var idx=par?Array.from(par.children).indexOf(c):0;',
    'p.unshift(c.tagName[0]+idx);c=par;}return p.join(".");}',
    'function skipEl(el){',
    'if(el.closest("script,style,noscript,iframe,svg,#we-bar"))return true;',
    // skip tel/mailto anchors — handled by sidebar
    'if(el.tagName==="A"){var h=el.getAttribute("href")||"";',
    'if(h.startsWith("tel:")||h.startsWith("mailto:"))return true;}',
    // skip schedule detection — schedule modal already handles these
    'var txt=el.textContent.trim();',
    'if(txt.length<2||txt.length>500)return true;',
    'if(el.children.length>4)return true;',
    'return false;}',
    // Schedule detection (same regex as modal)
    'function isScheduleEl(el){',
    'var txt=el.textContent.trim();',
    'if(!txt||txt.length<4||txt.length>400)return false;',
    'var dRx=/Lun|Mar|Mier|Joi|Vin|Sam|S\u00e2m|Dum/i;',
    'var tRx=/\\d{1,2}[:.\\u2013\\-]\\d{2}/;',
    'var cRx=/nchi/i;',
    'return dRx.test(txt)&&(tRx.test(txt)||cRx.test(txt));}',
    // Schedule modal
    'function showScheduleModal(el){',
    'var cur=el.textContent.trim();',
    'var ov=document.createElement("div");',
    'ov.style.cssText="position:fixed;inset:0;z-index:2147483648;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;";',
    'var mo=document.createElement("div");',
    'mo.style.cssText="background:#18181b;border-radius:16px;padding:28px;width:min(420px,92vw);box-shadow:0 20px 60px rgba(0,0,0,.6);font-family:-apple-system,sans-serif;";',
    'var ttl=document.createElement("div");ttl.textContent="\u270f Editeaz\u0103 Programul";',
    'ttl.style.cssText="color:#fff;font-size:15px;font-weight:700;margin-bottom:6px;";',
    'var hint=document.createElement("div");',
    'hint.textContent="ex: Lun\u2013Vin: 09:00\u201318:00 / S\u00e2m: 09\u201314 / Dum: \u00cenchis";',
    'hint.style.cssText="color:#888;font-size:11px;margin-bottom:14px;";',
    'var ta=document.createElement("textarea");ta.value=cur;',
    'ta.style.cssText="width:100%;box-sizing:border-box;background:#0f0f10;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:12px;color:#d4d4d8;font-size:13px;line-height:1.6;resize:vertical;min-height:90px;outline:none;font-family:inherit;";',
    'var row=document.createElement("div");row.style.cssText="display:flex;gap:10px;margin-top:16px;";',
    'var bSv=document.createElement("button");bSv.textContent="Salveaz\u0103";',
    'bSv.style.cssText="flex:1;background:#6366f1;color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-size:13px;font-weight:600;";',
    'var bCn=document.createElement("button");bCn.textContent="Anuleaz\u0103";',
    'bCn.style.cssText="flex:1;background:rgba(255,255,255,.08);color:#d4d4d8;border:none;border-radius:8px;padding:10px;cursor:pointer;font-size:13px;";',
    'row.appendChild(bSv);row.appendChild(bCn);',
    'mo.appendChild(ttl);mo.appendChild(hint);mo.appendChild(ta);mo.appendChild(row);',
    'ov.appendChild(mo);document.body.appendChild(ov);',
    'setTimeout(function(){ta.focus();ta.selectionStart=ta.selectionEnd=ta.value.length;},50);',
    'function doSave(){var nv=ta.value.trim();',
    'if(nv&&nv!==cur){',
    'var replaced=false;',
    'el.childNodes.forEach(function(n){if(n.nodeType===3&&n.textContent.trim()){n.textContent=nv;replaced=true;}});',
    'if(!replaced)el.textContent=nv;',
    'var k=el.getAttribute("data-ek");',
    'if(k){edits[k]={html:el.innerHTML};saveStore();',
    'try{window.parent.postMessage({type:"we_edit",key:k,edit:edits[k]},"*");}catch(ex){}}}',
    'ov.remove();}',
    'bSv.onclick=doSave;bCn.onclick=function(){ov.remove();};',
    'ov.onclick=function(e){if(e.target===ov)ov.remove();};',
    'ta.addEventListener("keydown",function(e){',
    'if(e.key==="Escape")ov.remove();',
    'if(e.key==="Enter"&&(e.ctrlKey||e.metaKey))doSave();});}',
    // attachListeners: adds blur/focus/keydown to a single [data-ek] element
    'function attachListeners(el){',
    'var k=el.getAttribute("data-ek");if(!k)return;',
    'if(el.hasAttribute("data-schedule")){el.addEventListener("click",function(e){e.stopPropagation();showScheduleModal(el);},{once:false});return;}',
    'if(el.getAttribute("contenteditable")!=="true")return;',
    'var orig=el.innerHTML;',
    'el.addEventListener("focus",function(){orig=el.innerHTML;});',
    'el.addEventListener("keydown",function(e){',
    'if(e.key==="Escape"){e.preventDefault();el.innerHTML=orig;el.blur();}',
    'if(e.key==="Enter"&&!e.shiftKey&&(el.tagName==="BUTTON"||/^H\\d$/.test(el.tagName))){e.preventDefault();el.blur();}});',
    'el.addEventListener("blur",function(){',
    'var nv=el.innerHTML.trim();',
    'if(!nv){el.innerHTML=orig;return;}',
    'if(nv!==orig){edits[k]={html:nv};saveStore();',
    'try{window.parent.postMessage({type:"we_edit",key:k,edit:{html:nv}},"*");}catch(e){}}});',
    'if(edits[k]&&edits[k].html!=null)el.innerHTML=edits[k].html;}',
    // init: primary path = [data-ek] already in HTML; fallback = add contenteditable via JS
    'function init(){',
    'var prepared=document.querySelectorAll("[data-ek]");',
    'if(prepared.length>0){prepared.forEach(attachListeners);applyEdits();return;}',
    // Fallback for standalone/downloaded HTML without prepareHtmlForEditing
    'document.querySelectorAll("h1,h2,h3,h4,p,button,li,span").forEach(function(el){',
    'if(skipEl(el))return;',
    'var k=el.getAttribute("data-ek")||getKey(el);el.setAttribute("data-ek",k);',
    'if(isScheduleEl(el)){el.style.cursor="pointer";el.addEventListener("click",function(e){e.stopPropagation();showScheduleModal(el);},{once:false});return;}',
    'el.contentEditable="true";el.setAttribute("spellcheck","false");attachListeners(el);});',
    'applyEdits();}',
    'function applyEdits(){Object.keys(edits).forEach(function(k){',
    'var el=document.querySelector(\'[data-ek="\'+k+\'"]\');',
    'if(el&&edits[k].html!=null)el.innerHTML=edits[k].html;});}',
    'window.addEventListener("message",function(e){',
    'if(e.data&&e.data.type==="we_restore"){edits=e.data.edits||{};applyEdits();}});',
    // Only run standalone (not inside iframe where parent handles editing)
    'if(window.self===window.top){',
    'if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init);}else{init();}',
    '}',
    '})();<\/scr'+'ipt>',
  ].join('');

  return css + js;
}
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Ești un generator expert de site-uri web profesionale. Generează un fișier HTML complet, de înaltă calitate, pentru o afacere românească.\n\n═══ OUTPUT ═══\n- Răspunde EXCLUSIV cu HTML complet valid (de la <!DOCTYPE html> până la </html>)\n- OBLIGATORIU: <html lang="ro"> — atribut obligatoriu pentru accesibilitate\n- ZERO text în afara HTML-ului, ZERO markdown (fără \`\`\`html), ZERO explicații\n- Toate stilurile: în <style> în <head> SAU clase Tailwind pe elemente\n- Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"><\\/script>\n- Google Fonts: 2 fonturi (1 display/serif pentru titluri, 1 sans-serif pentru body)\n\n═══ STRUCTURA PAGINII (obligatorie, în această ordine) ═══\n\n1. NAVBAR sticky (position: fixed, top:0, z-index:50, backdrop-blur)\n   - Container max-w-7xl mx-auto px-6, height 64px, flex items-center justify-between\n   - Stânga: logo (a href="#", font-weight:700, font-size:1.3rem, color:#ffffff, text-decoration:none, flex-shrink:0)\n   - Dreapta: OBLIGATORIU structura EXACTĂ în această ordine:\n     1) <div class="nav-links-desktop" style="display:flex;align-items:center;gap:28px;"> — conține toate linkurile nav (color:#ffffff;text-decoration:none;font-size:0.9rem;font-weight:500) + butonul CTA </div>\n     2) <button id="mob-btn" onclick="var m=document.getElementById(\\'mob-menu\\');var open=m.classList.toggle(\\'mob-open\\');this.innerHTML=open?\\'<svg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" fill=\\"none\\"><path d=\\"M4 4l12 12M16 4L4 16\\" stroke=\\"#fff\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\"/></svg>\\':\\'<svg width=\\"20\\" height=\\"20\\" viewBox=\\"0 0 20 20\\" fill=\\"none\\"><line x1=\\"3\\" y1=\\"5\\" x2=\\"17\\" y2=\\"5\\" stroke=\\"#fff\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\"/><line x1=\\"3\\" y1=\\"10\\" x2=\\"17\\" y2=\\"10\\" stroke=\\"#fff\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\"/><line x1=\\"3\\" y1=\\"15\\" x2=\\"17\\" y2=\\"15\\" stroke=\\"#fff\\" stroke-width=\\"2\\" stroke-linecap=\\"round\\"/></svg>\\'" style="display:none;background:none;border:none;padding:8px;cursor:pointer;line-height:0;flex-shrink:0;"><svg width="20" height="20" viewBox="0 0 20 20" fill="none"><line x1="3" y1="5" x2="17" y2="5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="10" x2="17" y2="10" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="15" x2="17" y2="15" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg></button>\n     3) <div id="mob-menu" style="display:none;position:fixed;top:64px;left:0;right:0;background:rgba(8,8,8,0.98);padding:20px 24px;flex-direction:column;gap:0;border-bottom:1px solid rgba(255,255,255,0.08);z-index:999;">[aceleași linkuri repetate vertical, fiecare: display:block;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#fff;font-size:1rem;text-decoration:none;]</div>\n   - CSS MOBILE OBLIGATORIU în <style>:\n     .nav-links-desktop{display:flex;}\n     @media(max-width:768px){\n       .nav-links-desktop{display:none!important;}\n       #mob-btn{display:flex!important;}\n       #mob-menu.mob-open{display:flex!important;}\n     }\n\n2. HERO (style="min-height:100vh;position:relative;overflow:hidden;" — overflow:hidden OBLIGATORIU pe container)\n   - Background image (REGULĂ STRICTĂ — nu devia): <img src="URL" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:center;filter:brightness(0.32);" /> — FĂRĂ wrapper extra, FĂRĂ blur, FĂRĂ transform, FĂRĂ scale. Doar aceste stiluri exact.\n   - Overlay OBLIGATORIU: <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(to bottom,rgba(0,0,0,0.55) 0%,rgba(0,0,0,0.72) 50%,rgba(0,0,0,0.88) 100%);z-index:1;"></div>\n   - Content (DEASUPRA overlay-ului): style="position:relative;z-index:2;" flex flex-col items-center justify-center text-center px-6 pt-24\n   - Supertitlu: style="font-size:0.78rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;text-shadow:0 1px 8px rgba(0,0,0,1),0 2px 24px rgba(0,0,0,1);margin-bottom:20px;background:rgba(0,0,0,0.3);padding:4px 14px;border-radius:20px;display:inline-block;"\n   - H1: style="font-size:45px;font-weight:800;color:#ffffff;text-shadow:0 2px 24px rgba(0,0,0,1),0 4px 64px rgba(0,0,0,1);max-width:56rem;margin:0 auto;line-height:1.08;"\n   - Subtitle: style="font-size:1.05rem;color:#ffffff;max-width:38rem;margin:24px auto 0;line-height:1.7;text-shadow:0 1px 12px rgba(0,0,0,1),0 2px 32px rgba(0,0,0,0.9);"\n   - Butoane CTA: flex gap-4 mt-10 — primar (bg brand, text alb, px-8 py-4, rounded-lg) + secundar (border 2px solid white, text alb)\n\n3. STATS BAR — background culoarea brand sau gri închis, grid 4 coloane, număr mare alb + label alb\n\n4. SERVICII (background alb sau #f8f8f8)\n   - Section header centrat: supertitlu uppercase + H2 color #111 + subtitlu color #555\n   - Grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3, gap-8, max-w-7xl mx-auto px-6\n   - FIECARE CARD (structura exactă, nu devia):\n     <div style="border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,0.08),0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column;">\n       <div style="position:relative;overflow:hidden;height:220px;">\n         <img src="https://images.unsplash.com/photo-RELEVANT_ID?w=WIDTH&h=HEIGHT&fit=crop" style="width:100%;height:100%;object-fit:cover;filter:brightness(0.8);" />\n         <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.5) 0%,transparent 60%);"></div>\n       </div>\n       <div style="padding:24px 28px 28px;flex:1;display:flex;flex-direction:column;">\n         <h3 style="font-size:1.2rem;font-weight:700;color:#111;margin-bottom:10px;">Titlu</h3>\n         <p style="font-size:13px;color:#555;line-height:1.7;flex:1;">Descriere.</p>\n         <a href="#contact" style="display:inline-block;margin-top:20px;padding:10px 24px;background:var(--brand);color:#fff;border-radius:8px;font-weight:600;font-size:14px;text-align:center;">Acțiune</a>\n       </div>\n     </div>\n   - Dimensiuni imagini: 800x500 (toate aceeași dimensiune pentru consistență). Folosește URL-uri Unsplash REALE cu poze relevante pentru fiecare serviciu. INTERZIS poze cartoon/ilustrații — doar fotografii reale.\n\n5. DESPRE — 2 coloane (imagine stânga + text dreapta), max-w-7xl mx-auto, imagine cu filter brightness(0.85), text cu H2 + paragraf + liste + CTA\n\n6. TESTIMONIALE — background #f4f4f4, grid 3 coloane, fiecare card structură EXACTĂ:
     <div style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,0.08);display:flex;flex-direction:column;">
       <div style="display:flex;gap:3px;margin-bottom:14px;">[5 stele SVG 16px]</div>
       <p style="font-style:italic;color:#333;font-size:14px;line-height:1.75;flex:1;margin:0 0 20px;">"Text real."</p>
       <div style="border-top:1px solid #f0f0f0;padding-top:16px;display:flex;align-items:center;gap:12px;">
         <img src="https://placehold.co/40x40" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;" />
         <div><div style="font-weight:700;color:#111;font-size:14px;">Nume</div><div style="color:#888;font-size:12px;">Rol</div></div>
       </div>
     </div>
     INTERZIS în testimoniale: imagini mari, avatar > 40px, position:absolute\n\n7. CTA BANNER — background culoarea brand, text alb centrat, H2 + buton alb\n\n8. FOOTER — STRUCTURA EXACTĂ, NU DEVIA\n\n   CONTAINER FOOTER:\n   <footer style="background:#1a1a1a;">\n     <div style="max-width:1280px;margin:0 auto;padding:64px 24px 0;">\n       <div class="footer-grid" style="display:grid;grid-template-columns:1.3fr 0.7fr 1fr 1fr;gap:40px;">\n         ... cele 4 coloane ...\n       </div>\n     </div>\n     <div style="max-width:1280px;margin:0 auto;padding:0 24px;">\n       <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:48px;padding:24px 0;text-align:center;">\n         <p style="color:#555;font-size:12px;margin:0;">© 2026 [Nume Brand]. Toate drepturile rezervate.</p>\n       </div>\n     </div>\n   </footer>\n\n   COL 1 — BRAND:\n   <div>\n     <div style="font-weight:800;color:var(--brand);font-size:1.3rem;margin-bottom:12px;">[Nume Brand]</div>\n     <p style="color:#777;font-size:14px;line-height:1.6;margin:0 0 20px;max-width:280px;">Tagline scurtă pe 1-2 rânduri.</p>\n     <div style="display:flex;gap:12px;align-items:center;">\n       [SVG social icons — Facebook, Instagram, LinkedIn — fiecare 20px, color:#555, hover:var(--brand), aria-label]\n     </div>\n   </div>\n\n   COL 2 — NAVIGARE:\n   <div>\n     <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:20px;">Navigare</div>\n     <nav style="display:flex;flex-direction:column;gap:10px;">\n       <a href="#" class="footer-nav-link" style="color:#777;font-size:14px;text-decoration:none;">Acasă</a>\n       <a href="#servicii" class="footer-nav-link" style="color:#777;font-size:14px;text-decoration:none;">Servicii</a>\n       <a href="#despre" class="footer-nav-link" style="color:#777;font-size:14px;text-decoration:none;">Despre Noi</a>\n       <a href="#testimoniale" class="footer-nav-link" style="color:#777;font-size:14px;text-decoration:none;">Testimoniale</a>\n       <a href="#contact" class="footer-nav-link" style="color:#777;font-size:14px;text-decoration:none;">Contact</a>\n     </nav>\n   </div>\n   CSS OBLIGATORIU: .footer-nav-link:hover,.footer-nav-link:focus-visible{color:var(--brand);}\n\n   COL 3 — CONTACT:\n   REGULA CRITICĂ: Fiecare element de contact (telefon, email, adresă, program) TREBUIE să aibă ICON și TEXT PE ACEEAȘI LINIE, orizontal. INTERZIS să pui icon-ul pe un rând și textul pe alt rând. Folosește display:flex;align-items:center pentru a le pune pe aceeași linie.\n   ORDINEA: Telefon → Email → Adresă → Program (cu icon ceas)\n   COPIAZĂ ACEST HTML EXACT, NU MODIFICA STRUCTURA:\n   <div>\n     <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:20px;">Contact</div>\n     <div style="display:flex;flex-direction:column;gap:14px;">\n       <div style="display:flex;align-items:center;gap:10px;color:#777;font-size:14px;line-height:1.5;"><svg style="flex-shrink:0;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>Str. Exemplu nr. 5, București</span></div>\n       <a href="tel:+40XXXXXXXXX" style="display:flex;align-items:center;gap:10px;color:#777;font-size:14px;text-decoration:none;"><svg style="flex-shrink:0;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>0722 123 456</span></a>\n       <a href="mailto:contact@brand.ro" style="display:flex;align-items:center;gap:10px;color:#777;font-size:14px;text-decoration:none;"><svg style="flex-shrink:0;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg><span>contact@brand.ro</span></a>\n       <div style="display:flex;align-items:center;gap:10px;color:#777;font-size:14px;line-height:1.5;"><svg style="flex-shrink:0;width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Luni-Vineri: 09:00-17:00</span></div>\n     </div>\n   </div>\n   INTERZIS ÎN FOOTER CONTACT:\n   - INTERZIS icon pe un rând și text pe rândul următor\n   - INTERZIS <p> cu icon și alt <p> cu text separat\n   - INTERZIS flex-direction:column pe elementele individuale de contact\n   - Icon-ul SVG și textul span TREBUIE să fie COPII DIRECȚI ai aceluiași div/a cu display:flex\n   - Fiecare rând = UN element (div sau a) cu display:flex;align-items:center;gap:10px conținând SVG + span LÂNGĂ ICON, pe aceeași linie\n\n   COL 4 — DE CE NOI?:\n   <div>\n     <div style="font-weight:700;color:#fff;font-size:14px;margin-bottom:20px;">De ce noi?</div>\n     <div style="display:flex;flex-direction:column;gap:12px;">\n       <p style="color:#777;font-size:14px;line-height:1.6;margin:0;">Punct forte 1 al afacerii — o propoziție scurtă și convingătoare.</p>\n       <p style="color:#777;font-size:14px;line-height:1.6;margin:0;">Punct forte 2 al afacerii — o propoziție scurtă și convingătoare.</p>\n       <p style="color:#777;font-size:14px;line-height:1.6;margin:0;">Punct forte 3 al afacerii — o propoziție scurtă și convingătoare.</p>\n     </div>\n   </div>\n   Generează 3 puncte forte reale și relevante pentru domeniul afacerii. NU copia textul exemplu — inventează conținut specific și convingător.\n\n   CSS RESPONSIVE OBLIGATORIU în <style>:\n   .footer-grid{grid-template-columns:1.3fr 0.7fr 1fr 1fr;}\n   @media(max-width:768px){.footer-grid{grid-template-columns:1fr!important;gap:32px!important;}}\n\n   REGULI FOOTER:\n   - ANUL ÎN COPYRIGHT ESTE MEREU 2026, NU dinamic, NU new Date().getFullYear()\n   - TOATE elementele contact (tel, email, adresă) TREBUIE să aibă ACEEAȘI structură: flex + align-items + gap:10px + SVG 16px cu flex-shrink:0 + span text\n   - SVG-urile folosesc stroke="currentColor" ca să moștenească culoarea textului\n   - Gap-ul între elementele de contact este 14px (consistent)\n   - Footer are EXACT 4 coloane: Brand, Navigare, Contact, De ce noi?\n   - Footer folosește ACELAȘI max-width ca restul paginii (1280px)\n   - NU pune border-top pe footer — border-top e doar pe sub-footer (copyright)\n\n═══ STILURI DESIGN — OBLIGATORIU aplică stilul cerut, fiecare stil are layout DIFERIT ═══\n\n▸ Dacă stilul este "modern":\n  - Hero: text CENTRAT, supertitlu într-un badge rotunjit, 2 butoane CTA unul lângă altul (primar colorat + secundar border alb)\n  - Servicii: grid 3 coloane, carduri cu imagine sus + text jos, border-radius:16px, shadow-md, hover translateY(-4px)\n  - Despre: 2 coloane — imagine STÂNGA (border-radius:20px) + text DREAPTA cu H2, paragraf, bullet-uri, CTA\n  - Testimoniale: grid 3 coloane, carduri albe cu shadow\n  - Stats: bar cu background var(--brand), grid 4 coloane, numere mari albe\n  - Secțiuni alternează fundal: alb → #f8f8f8 → alb\n  - Border-radius general: 16px pe carduri, 12px pe butoane\n  - Fonturi: un sans-serif bold geometric pentru headings (Syne, Poppins, Outfit) + Inter/DM Sans pentru body\n\n▸ Dacă stilul este "minimalist":\n  - Hero: text aliniat STÂNGA (text-align:left, items-start), fără supertitlu badge, doar un H1 curat + subtitlu + UN SINGUR buton CTA simplu (fără border, font-weight:500), mult spațiu alb (padding vertical 160px)\n  - Servicii: grid 2 coloane (lg:grid-cols-2), carduri FĂRĂ imagine — doar border-bottom:2px solid var(--brand) pe top + titlu + text, background transparent, padding mare (40px), border-radius:0 (colțuri drepte)\n  - Despre: 2 coloane — text STÂNGA + imagine DREAPTA (inversul lui modern), imagine fără border-radius (border-radius:0)\n  - Testimoniale: layout vertical — 1 singur testimonial mare centrat cu quotes mari decorative (font-size:4rem, opacity:0.15) + text italic mare (font-size:1.2rem) + autor centrat dedesubt. Sub el, un rând de 3 citate mici\n  - Stats: NU bar colorat — ci 4 numere simple inline pe o linie, separate cu | (border-left:1px solid #ddd), fără background, padding:60px\n  - Secțiuni: TOATE pe fundal alb (#fff), separate doar prin spațiu generos (padding:120px)\n  - Border-radius general: 0px pe carduri (colțuri drepte), 4px pe butoane\n  - Shadows: ZERO shadows (box-shadow:none), doar border-uri subtile\n  - Fonturi: un serif elegant pentru headings (Playfair Display, Cormorant Garamond, DM Serif Display) + sans-serif light pentru body (Inter weight:300)\n  - Culori: paletă restrânsă — max 2 culori (brand + negru), mult #111 și #666\n\n▸ Dacă stilul este "dark premium" (TEMĂ LIQUID GLASS):\n  - CONCEPT: Liquid Glass — toate elementele au aspect de sticlă translucidă, cu blur intens, reflexii subtile și transparențe stratificate pe fundal întunecat\n  - FUNDAL GLOBAL: body background #000000 cu un gradient radial subtil de accent (radial-gradient(ellipse at 50% 0%, rgba(brand,0.08) 0%, transparent 60%)). Adaugă un SVG noise filter pentru textură grain pe body:\n    <svg style=\"position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;opacity:0.03;\"><filter id=\"grain\"><feTurbulence baseFrequency=\"0.9\" numOctaves=\"4\" type=\"fractalNoise\"/></filter><rect width=\"100%\" height=\"100%\" filter=\"url(#grain)\"/></svg>\n  - GLASS MIXIN (aplică pe TOATE cardurile, navbar, stats, testimoniale, CTA):\n    background: rgba(255,255,255,0.04);\n    backdrop-filter: blur(20px) saturate(1.4);\n    -webkit-backdrop-filter: blur(20px) saturate(1.4);\n    border: 1px solid rgba(255,255,255,0.08);\n    border-top: 1px solid rgba(255,255,255,0.15);\n    box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);\n  - TOATE secțiunile pe fundal TRANSPARENT (background:transparent), nu #111 sau #0a0a0a — lăsați fundalul body negru + gradient să fie vizibil prin glass\n  - TOATE textele body: color rgba(255,255,255,0.7), headings: #ffffff\n  - NAVBAR: glass effect (background:rgba(255,255,255,0.03), backdrop-filter:blur(24px), border-bottom:1px solid rgba(255,255,255,0.06)), position:fixed\n  - Hero: text CENTRAT, supertitlu într-un pill glass (background:rgba(255,255,255,0.06), backdrop-filter:blur(12px), border:1px solid rgba(255,255,255,0.1), border-radius:999px, padding:6px 20px), H1 cu glow puternic (text-shadow: 0 0 60px rgba(brand,0.4), 0 0 120px rgba(brand,0.15))\n  - Servicii: grid 3 coloane, carduri GLASS (glass mixin de mai sus), border-radius:20px, FĂRĂ imagini pe carduri — în schimb un ICON SVG mare (48px) în culoarea brand cu glow (filter:drop-shadow(0 0 12px rgba(brand,0.4))) + titlu alb + text rgba(255,255,255,0.6). Hover: border-color rgba(255,255,255,0.2), background rgba(255,255,255,0.07), transform translateY(-4px)\n  - Despre: layout ASIMETRIC — imagine mare (60% width, border-radius:24px, border:1px solid rgba(255,255,255,0.08)) cu un card text GLASS suprapus parțial (position:relative, margin-top:-80px, glass mixin, padding:40px, border-radius:20px, z-index:2)\n  - Testimoniale: background transparent, carduri GLASS cu border-radius:20px, text rgba(255,255,255,0.7), stele cu culoarea brand + glow\n  - Stats: carduri individuale GLASS (glass mixin), border-radius:16px, grid 4 coloane cu gap:16px (NU lipite — separate cu spațiu), numere mari cu text-shadow glow\n  - CTA Banner: GLASS card mare (background:rgba(brand,0.08), backdrop-filter:blur(24px), border:1px solid rgba(brand,0.2), border-radius:24px), text alb centrat, buton glass (background:rgba(255,255,255,0.1), border:1px solid rgba(255,255,255,0.2), backdrop-filter:blur(12px), hover:background rgba(255,255,255,0.18))\n  - Butoane CTA: glass effect (background:rgba(brand,0.15), backdrop-filter:blur(12px), border:1px solid rgba(brand,0.3), border-radius:12px), hover: background rgba(brand,0.25), box-shadow: 0 0 24px rgba(brand,0.2)\n  - Border-radius general: 20px pe carduri, 12px pe butoane, 999px pe pills/badges\n  - Footer: glass bar (background:rgba(255,255,255,0.02), backdrop-filter:blur(16px), border-top:1px solid rgba(255,255,255,0.06))\n  - Fonturi: un sans-serif modern (Space Grotesk, Outfit, Syne) + Inter light (font-weight:300 pe body)\n  - OBLIGATORIU: adaugă în <style> regula ::selection { background: rgba(brand,0.3); color: #fff; }\n\n▸ Dacă stilul este "premium elegant":\n  - Hero: layout SPLIT — 2 coloane (flex), text STÂNGA (50%, aliniat stânga) + imagine DREAPTA (50%) care iese din container (overflow vizibil la dreapta, height:100vh, object-fit:cover, border-radius:20px doar pe colțurile stânga). Fără overlay pe imaginea din dreapta.\n  - Servicii: grid 2 coloane (lg:grid-cols-2), carduri MARI cu imagine mare (height:280px) + text, spacing generos (gap:32px), border-radius:20px, shadow subtil\n  - Despre: imagine cu border-radius:24px și un card text care SE SUPRAPUNE parțial pe imagine (margin-left:-60px pe desktop, background:#fff, padding:48px, shadow pronunțat, border-radius:20px)\n  - Testimoniale: 2 testimoniale mari (grid 2 coloane) cu text lung, borders elegante (border-left:3px solid var(--brand)), fără shadow, padding stânga 28px\n  - Stats: integrate la BAZA hero-ului — un bar semi-transparent (background:rgba(255,255,255,0.95), color:#111, position:relative, margin-top:-50px, z-index:3, border-radius:16px, box-shadow), 4 coloane\n  - Secțiuni: fundal predominant alb cu accente de cremă (#faf9f6) pe secțiuni alternate\n  - Border-radius general: 20-24px (rotunjiri mari, generoase)\n  - Shadows: pronunțate dar elegante (0 20px 60px rgba(0,0,0,0.1))\n  - Fonturi: OBLIGATORIU serif clasic pentru headings (Playfair Display, Cormorant) + sans-serif rafinat pentru body (Lato, Source Sans 3)\n  - Butoane: padding mai mare (px-10 py-5), font-size:0.95rem, letter-spacing:0.03em\n\n═══ DESIGN ═══\n- TITLURI SECȚIUNI (H2): OBLIGATORIU font-size:clamp(1.8rem,4vw,2.5rem) pe TOATE h2 din secțiuni (servicii, despre, testimoniale, CTA). Titlurile trebuie să fie VIZIBIL mai mari decât textul body. NICIODATĂ un h2 mai mic de 1.8rem!\n- :root { --brand: #HEX; --brand-dark: #HEX; } — culori unice din domeniu, NU blue/indigo/purple Tailwind\n- CONTRAST SECȚIUNI: fundal deschis → text #111. Fundal închis → text #fff\n- CONTRAST BUTOANE (OBLIGATORIU): buton alb/galben/bej/deschis → text #111. Buton negru/închis/colorat → text #fff. CTA Banner buton alb pe fundal colorat → text = culoarea brand sau #111, NU alb\n- Shadows layered, animații DOAR transform și opacity, hover carduri translateY(-4px)\n- Secțiuni alternează: alb → gri deschis → alb (EXCEPȚIE: dark premium = tot fundal închis)\n\n═══ CONȚINUT ═══\n- Texte reale în română — ZERO Lorem Ipsum\n- Date contact: inventate veridic dacă lipsesc\n- Imagini: EXCLUSIV https://images.unsplash.com/photo-ID?w=WIDTH&h=HEIGHT&fit=crop — folosește ID-uri REALE de poze Unsplash relevante pentru domeniul afacerii (restaurant=mancare, salon=beauty, auto=masini etc). INTERZIS placehold.co pentru imagini de conținut (servicii, hero, despre). Pozele trebuie să fie FOTOGRAFII REALE, nu cartoon/ilustrații. Placeholder-e (placehold.co) se folosesc DOAR pentru avatare testimoniale (40x40).\n\n═══ INTERZIS ═══\n- transition-all\n- Blue/indigo/purple Tailwind ca brand\n- Lorem ipsum\n- Butoane fără stilizare\n- Imagini fără filter brightness(0.8)\n- Secțiuni fără max-w + mx-auto + px\n- Carduri servicii fără imagine\n- Footer contact: INTERZIS icon pe un rând și text pe alt rând — icon + text MEREU pe aceeași linie cu display:flex;align-items:center\n`;

function buildUserPrompt(brief) {
  return `Generează un site web complet pentru următoarea afacere:\n\n- Nume brand / companie: ${brief.brandName || 'nu a specificat'}\n- Activitate: ${brief.activity || 'nu a specificat clar, dedu tu un context rezonabil'}\n- Public țintă: ${brief.audience || 'nu a specificat'}\n- Acțiunea principală dorită a vizitatorilor: ${brief.mainAction || 'nu a specificat'}\n- Preferințe culori / fonturi: ${brief.colorsFonts || 'nu a specificat'}\n- Stil design dorit: ${brief.designStyle || 'modern'} — IMPORTANT: aplică OBLIGATORIU layout-ul specific acestui stil din secțiunea STILURI DESIGN. Fiecare stil are aranjamente diferite (hero centrat vs stânga vs split, servicii grid 3 vs 2 vs rânduri, carduri cu imagine vs fără, etc). NU genera același layout pentru toate stilurile!\n- Program / Orar: ${brief.schedule || 'nu a specificat, inventează veridic în funcție de domeniu (include zilele închise, ex: Sâm–Dum: Închis)'}\n${brief.extraNote ? `\nDetalii suplimentare de la client:\n${brief.extraNote}` : ''}\n\nGenerează ACUM fișierul HTML complet, începând cu <!DOCTYPE html>`;
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
    let html = '';

    for (let mi = 0; mi < GEMINI_MODELS.length; mi++) {
      const model = GEMINI_MODELS[mi];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const gemRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildUserPrompt(brief) }] }],
          generationConfig: { maxOutputTokens: 16384, temperature: 0.75, topP: 0.95 },
        }),
      });

      if (gemRes.status === 503 || gemRes.status === 429 || gemRes.status === 404) {
        if (mi === GEMINI_MODELS.length - 1) {
          return res.status(503).json({ error: 'Toate modelele sunt suprasolicitate. Încearcă în 1-2 minute.' });
        }
        continue;
      }

      if (!gemRes.ok) {
        const err = await gemRes.text().catch(() => '');
        return res.status(gemRes.status).json({ error: `Gemini API error ${gemRes.status}: ${err.slice(0, 400)}` });
      }

      const data = await gemRes.json();
      html = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!html) {
        const reason = data?.candidates?.[0]?.finishReason || 'unknown';
        return res.status(500).json({ error: `Gemini nu a returnat HTML. Motiv: ${reason}` });
      }

      // Check if output was truncated
      const finishReason = data?.candidates?.[0]?.finishReason || '';

      html = html
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      // If truncated (MAX_TOKENS), close open tags so page still renders
      if (finishReason === 'MAX_TOKENS' || (!html.includes('</html>') && !html.includes('</body>'))) {
        // Close any unclosed tags
        if (!html.includes('</footer>') && /<footer[\s>]/i.test(html)) {
          html += '\n</footer>';
        }
        if (!html.includes('</body>')) html += '\n</body>';
        if (!html.includes('</html>')) html += '\n</html>';
      }

      // Force copyright year to 2026
      html = html.replace(/©\s*\d{4}/g, '© 2026');
      html = html.replace(/new Date\(\)\.getFullYear\(\)/g, '2026');

      // Inject universal mobile-fix CSS + JS before </body>
      const mobileFix = `
<style id="websiteai-mobile-fix">
/* ── Focus-visible accesibilitate ── */
a:focus-visible, button:focus-visible {
  outline: 2px solid var(--brand, #2563eb);
  outline-offset: 3px;
  border-radius: 3px;
}

/* ── Nav: linkuri și logo mereu albe ── */
nav a, nav span, nav li, header a, header span,
nav button, header button {
  color: #ffffff !important;
}
/* ── Excepție: butoane cu fundal alb explicit → text închis ── */
nav a[style*="background:#fff"], nav a[style*="background: #fff"],
nav a[style*="background:white"], nav a[style*="background: white"],
nav a[style*="background-color:#fff"], nav a[style*="background-color: #fff"],
nav a[style*="background-color:white"], nav a[style*="background-color: white"],
nav button[style*="background:#fff"], nav button[style*="background:white"],
header a[style*="background:#fff"], header a[style*="background:white"],
header button[style*="background:#fff"], header button[style*="background:white"] {
  color: #111111 !important;
}
/* ── Hamburger icon mereu alb ── */
#mob-btn svg line, #mob-btn svg path {
  stroke: #ffffff !important;
}

/* ── Hero: tot textul mereu alb cu contrast puternic ── */
/* Targetăm conținutul DEASUPRA overlay-ului (z-index:2) */
[style*="z-index:2"] h1,
[style*="z-index: 2"] h1,
[class*="hero"] h1, [id*="hero"] h1,
section:first-of-type h1 {
  text-shadow: 0 2px 24px rgba(0,0,0,1), 0 4px 64px rgba(0,0,0,1) !important;
  color: #ffffff !important;
}
[style*="z-index:2"] h2,
[style*="z-index: 2"] h2,
[class*="hero"] h2, [id*="hero"] h2 {
  text-shadow: 0 2px 16px rgba(0,0,0,1) !important;
  color: #ffffff !important;
}
[style*="z-index:2"] p,
[style*="z-index: 2"] p,
[class*="hero"] p, [id*="hero"] p,
section:first-of-type p {
  text-shadow: 0 1px 12px rgba(0,0,0,1) !important;
  color: #ffffff !important;
}
[style*="z-index:2"] span,
[style*="z-index: 2"] span,
[class*="hero"] span, [id*="hero"] span {
  color: #ffffff !important;
  text-shadow: 0 1px 8px rgba(0,0,0,1) !important;
}

@media(max-width:768px){
  /* Navbar — ascunde linkurile desktop, arată hamburgerul */
  .nav-links-desktop{display:none!important;}
  /* Fallback: ascunde orice div/ul direct în nav care nu e mob-btn/mob-menu */
  nav > div > div:not(#mob-menu),
  nav > div > ul,
  nav > div > nav {display:none!important;}
  #mob-btn{display:flex!important;}
  #mob-menu{display:none;}
  #mob-menu.mob-open{display:flex!important;}

  /* Hero text */
  h1{font-size:clamp(1.7rem,7vw,2.8rem)!important;line-height:1.12!important;}
  h2{font-size:clamp(1.4rem,5vw,2.2rem)!important;}

  /* Padding sectiuni */
  section,footer{padding-left:16px!important;padding-right:16px!important;}
  .px-6{padding-left:16px!important;padding-right:16px!important;}
  .px-8{padding-left:20px!important;padding-right:20px!important;}

  /* Grid-uri -> 1 coloana */
  .grid,.grid-cols-2,.grid-cols-3,.grid-cols-4{grid-template-columns:1fr!important;}
  .md\\:grid-cols-2,.md\\:grid-cols-3,.lg\\:grid-cols-3{grid-template-columns:1fr!important;}

  /* Stats 2 coloane */
  .grid-cols-4{grid-template-columns:1fr 1fr!important;}

  /* Butoane CTA stacked */
  .flex.gap-4{flex-direction:column!important;align-items:stretch!important;}
  .flex.gap-4 a,.flex.gap-4 button{text-align:center!important;}

  /* Sectiunea despre: 1 coloana */
  .md\\:flex-row{flex-direction:column!important;}
  .md\\:w-1\\/2{width:100%!important;}

  /* Carduri mai mici */
  [style*="height:220px"]{height:180px!important;}

  /* Footer 1 coloana */
  footer .grid,footer .footer-grid{grid-template-columns:1fr!important;gap:32px!important;}

  /* Imagini full width */
  img{max-width:100%!important;}
}
/* FOOTER CONTACT FIX: icon + text pe aceeasi linie MEREU */
a[href^="tel:"],a[href^="mailto:"]{display:flex!important;flex-direction:row!important;align-items:center!important;gap:10px!important;flex-wrap:nowrap!important;}
a[href^="tel:"] svg,a[href^="mailto:"] svg{flex-shrink:0!important;width:16px!important;height:16px!important;min-width:16px!important;display:inline-block!important;}
footer div:has(> svg:only-of-type),footer a:has(> svg:only-of-type),footer span:has(> svg:only-of-type),footer p:has(> svg:only-of-type){display:flex!important;flex-direction:row!important;align-items:center!important;gap:10px!important;flex-wrap:nowrap!important;}
footer div:has(> svg:only-of-type) > svg,footer a:has(> svg:only-of-type) > svg{flex-shrink:0!important;width:16px!important;height:16px!important;min-width:16px!important;}
</style>
<script id="websiteai-mob-js">
(function(){
  var W='#ffffff';
  function hSvg(){return'<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><line x1="3" y1="5" x2="19" y2="5" stroke="'+W+'" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="11" x2="19" y2="11" stroke="'+W+'" stroke-width="2" stroke-linecap="round"/><line x1="3" y1="17" x2="19" y2="17" stroke="'+W+'" stroke-width="2" stroke-linecap="round"/></svg>';}
  function xSvg(){return'<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 4l14 14M18 4L4 18" stroke="'+W+'" stroke-width="2" stroke-linecap="round"/></svg>';}

  var nav=document.querySelector('nav');
  if(!nav)return;
  var mobBtn=document.getElementById('mob-btn');
  var mobMenu=document.getElementById('mob-menu');

  if(!mobBtn||!mobMenu){
    var links=Array.from(nav.querySelectorAll('a')).filter(function(a,i){return i>0;});
    if(!links.length)return;
    var btn=document.createElement('button');
    btn.id='mob-btn';
    btn.style.cssText='display:none;background:none;border:none;padding:8px;cursor:pointer;flex-shrink:0;line-height:0;';
    btn.innerHTML=hSvg();
    var menu=document.createElement('div');
    menu.id='mob-menu';
    menu.style.cssText='display:none;position:fixed;top:64px;left:0;right:0;background:rgba(8,8,8,0.97);padding:20px 24px;flex-direction:column;gap:0;border-bottom:1px solid rgba(255,255,255,0.08);z-index:9999;';
    links.forEach(function(el){
      var a=document.createElement('a');
      a.href=el.href||'#';a.textContent=el.textContent.trim();
      a.style.cssText='color:#fff!important;text-decoration:none;font-size:1rem;font-weight:500;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.07);display:block;';
      a.onclick=function(){menu.classList.remove('mob-open');btn.innerHTML=hSvg();isOpen=false;};
      menu.appendChild(a);
    });
    var isOpen=false;
    btn.addEventListener('click',function(){isOpen=!isOpen;menu.classList.toggle('mob-open',isOpen);btn.innerHTML=isOpen?xSvg():hSvg();});
    var st=document.createElement('style');
    st.textContent='@media(max-width:768px){#mob-btn{display:flex!important;}#mob-menu.mob-open{display:flex!important;}}';
    document.head.appendChild(st);
    nav.style.position='relative';
    nav.appendChild(btn);
    document.body.appendChild(menu);
  } else {
    var isOpen=false;
    mobBtn.innerHTML=hSvg();
    mobBtn.onclick=function(){isOpen=!isOpen;mobMenu.classList.toggle('mob-open',isOpen);mobBtn.innerHTML=isOpen?xSvg():hSvg();};
  }

  // Returnează true dacă culoarea de fundal e deschisă (text alb ar fi invizibil)
  function isLightBg(el){
    var bg=window.getComputedStyle(el).backgroundColor;
    var m=bg.match(/\d+/g);
    if(!m||m.length<3)return false;
    var a=m.length>=4?+m[3]:1;
    if(a<0.15)return false; // transparent — nu contează
    var lum=(+m[0]*299+ +m[1]*587+ +m[2]*114)/1000;
    return lum>160;
  }

  // Forțează nav alb + hero text alb la intervale multiple (bate Tailwind CDN async)
  function forceStyles(){
    var brand=(getComputedStyle(document.documentElement).getPropertyValue('--brand')||'').trim()||'#1a1a1a';
    // Nav: toate elementele text → alb; butoanele cu fundal deschis → bg=brand
    var navEl=document.querySelector('nav,header');
    if(navEl){
      var all=navEl.getElementsByTagName('*');
      for(var i=0;i<all.length;i++){
        var t=all[i].tagName;
        if(t==='A'||t==='BUTTON'){
          if(isLightBg(all[i])){
            all[i].style.setProperty('background',brand,'important');
            all[i].style.setProperty('background-color',brand,'important');
            all[i].style.setProperty('color','#ffffff','important');
          } else {
            all[i].style.setProperty('color','#ffffff','important');
          }
        } else if(t==='SPAN'||t==='LI'||t==='P'||t==='H1'||t==='H2'||t==='H3'||t==='DIV'){
          all[i].style.setProperty('color','#ffffff','important');
        }
      }
    }
    // Hamburger SVG → alb
    var mb=document.getElementById('mob-btn');
    if(mb)mb.querySelectorAll('line,path').forEach(function(s){s.setAttribute('stroke','#ffffff');});
    // Hero: găsește secțiunea cu img absolut (fundalul hero)
    var hero=null;
    var divs=document.querySelectorAll('section,div');
    for(var d=0;d<divs.length;d++){
      var el=divs[d];
      if(el.style&&el.style.minHeight==='100vh'){hero=el;break;}
      var ai=el.querySelector('img[style*="position:absolute"],img[style*="position: absolute"]');
      if(ai&&el.offsetHeight>200){hero=el;break;}
    }
    if(!hero&&navEl)hero=navEl.nextElementSibling;
    if(hero){
      var cnt=hero.querySelector('[style*="z-index:2"],[style*="z-index: 2"],[style*="z-index:10"]')||hero;
      cnt.querySelectorAll('h1,h2,h3,p,span').forEach(function(e){
        e.style.setProperty('color','#ffffff','important');
        if(e.tagName==='H1'||e.tagName==='H2')
          e.style.setProperty('text-shadow','0 2px 24px rgba(0,0,0,1),0 4px 64px rgba(0,0,0,1)','important');
        else
          e.style.setProperty('text-shadow','0 1px 12px rgba(0,0,0,1)','important');
      });
    }
  }
  [0,100,300,700,1500,3000].forEach(function(t){setTimeout(forceStyles,t);});

  // Fix footer contact: force icon + text pe ACEEASI LINIE
  function fixFooterContact(){
    // 1) Fix ALL tel/mailto links anywhere — icon langa text
    document.querySelectorAll('a[href^="tel:"],a[href^="mailto:"]').forEach(function(el){
      el.style.setProperty('display','flex','important');
      el.style.setProperty('flex-direction','row','important');
      el.style.setProperty('align-items','center','important');
      el.style.setProperty('gap','10px','important');
      el.querySelectorAll('svg').forEach(function(svg){
        svg.style.setProperty('flex-shrink','0','important');
        svg.style.setProperty('width','16px','important');
        svg.style.setProperty('height','16px','important');
      });
    });
    // 2) Gaseste footer-ul (tag <footer> sau ultimul section/div mare de pe pagina)
    var footerArea=document.querySelector('footer');
    if(!footerArea){
      var all=document.querySelectorAll('body > section, body > div');
      if(all.length)footerArea=all[all.length-1];
    }
    if(!footerArea)return;
    // 3) Gaseste coloana "Contact" din footer si reconstruieste elementele
    footerArea.querySelectorAll('div,h3,h4,span,p').forEach(function(heading){
      var t=(heading.textContent||'').trim();
      if(t!=='Contact')return;
      var col=heading.parentElement;
      if(!col)return;
      // Gaseste toate elementele care contin SVG in aceasta coloana
      col.querySelectorAll('a,div,p,span,li').forEach(function(el){
        // Daca elementul contine un SVG (direct sau in copii)
        var svg=el.querySelector('svg');
        if(!svg)return;
        // Daca are mai mult de 1 SVG (ex: social icons), skip
        if(el.querySelectorAll('svg').length>1)return;
        // Daca e heading-ul Contact, skip
        if(el===heading)return;
        // Forteaza flex row — icon + text pe aceeasi linie
        el.style.setProperty('display','flex','important');
        el.style.setProperty('flex-direction','row','important');
        el.style.setProperty('align-items','center','important');
        el.style.setProperty('gap','10px','important');
        el.style.setProperty('flex-wrap','nowrap','important');
        svg.style.setProperty('flex-shrink','0','important');
        svg.style.setProperty('width','16px','important');
        svg.style.setProperty('height','16px','important');
        svg.style.setProperty('min-width','16px','important');
        svg.style.setProperty('display','inline-block','important');
      });
    });
    // 4) Fix generic: ORICE element cu SVG direct child in footer
    footerArea.querySelectorAll('a,div,p,span,li').forEach(function(el){
      var svg=el.querySelector(':scope > svg');
      if(!svg)return;
      if(el.querySelectorAll('svg').length>1)return;
      if(el.closest('nav'))return;
      el.style.setProperty('display','flex','important');
      el.style.setProperty('flex-direction','row','important');
      el.style.setProperty('align-items','center','important');
      el.style.setProperty('gap','10px','important');
      svg.style.setProperty('flex-shrink','0','important');
      svg.style.setProperty('width','16px','important');
      svg.style.setProperty('height','16px','important');
    });
  }
  [0,200,500,1000,2000].forEach(function(t){setTimeout(fixFooterContact,t);});
})();
</script>`;

      // ── Inline editor block ────────────────────────────────────────────────
      const inlineEditorBlock = _weInlineEditorBlockStr();
      // ── End inline editor block ──────────────────────────────────────────

      // Inject inline editor + mobile fix before </body>, with fallback if </body> is missing
      const injection = inlineEditorBlock + mobileFix;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, injection + '\n</body>');
      } else if (/<\/html>/i.test(html)) {
        html = html.replace(/<\/html>/i, injection + '\n</body></html>');
      } else {
        html += '\n' + injection;
      }

      // Inject global contact section before </footer>
      const contactSection = `
<section id="wai-contact-section" style="padding:80px 0;background:#111;">
  <div style="max-width:1080px;margin:0 auto;padding:0 24px;">
    <div id="wai-contact-wrap" style="background:#181818;border-radius:20px;overflow:hidden;box-shadow:0 20px 80px rgba(0,0,0,0.3);">
      <div style="padding:40px 48px;">
        <h3 id="wai-contact-title" style="font-size:1.5rem;font-weight:700;color:#fff;margin:0 0 8px;">Contact</h3>
        <p style="color:rgba(255,255,255,0.5);font-size:0.875rem;margin:0 0 32px;">Lasă-ne un mesaj și te contactăm noi.</p>
        <form id="wai-contact-form" novalidate style="display:flex;flex-direction:column;gap:20px;">
          <input type="text" name="wai_hp" style="display:none;" tabindex="-1" autocomplete="off" />
          <div>
            <label style="display:block;font-size:0.875rem;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:8px;">Nume complet</label>
            <input id="wai-f-name" type="text" required placeholder="ex. Ion Popescu" style="width:100%;background:#222;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 16px;color:#fff;font-size:15px;outline:none;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.875rem;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:8px;">Telefon</label>
            <input id="wai-f-phone" type="tel" required placeholder="07XX XXX XXX" style="width:100%;background:#222;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 16px;color:#fff;font-size:15px;outline:none;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.875rem;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:8px;">Email (opțional)</label>
            <input id="wai-f-email" type="email" placeholder="adresa@email.com" style="width:100%;background:#222;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 16px;color:#fff;font-size:15px;outline:none;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.875rem;font-weight:500;color:rgba(255,255,255,0.5);margin-bottom:8px;">Mesaj</label>
            <textarea id="wai-f-msg" rows="3" required placeholder="Cum te putem ajuta..." style="width:100%;background:#222;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:12px 16px;color:#fff;font-size:15px;outline:none;box-sizing:border-box;resize:vertical;min-height:90px;"></textarea>
          </div>
          <button id="wai-f-btn" type="submit" style="width:100%;background:#fff;color:#000;border:none;font-weight:700;padding:16px;border-radius:12px;font-size:15px;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:8px;">
            Trimite Mesaj
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </button>
          <p id="wai-f-status" style="display:none;font-size:14px;text-align:center;margin:0;padding:10px;border-radius:8px;"></p>
        </form>
      </div>
    </div>
  </div>
</section>
<style>
@media(max-width:768px){
  #wai-contact-wrap>div{padding:28px 24px!important;}
}
#wai-contact-form input:focus,#wai-contact-form textarea:focus{border-color:var(--brand,#fff)!important;box-shadow:0 0 0 1px var(--brand,#fff)!important;}
#wai-f-btn:hover{background:#e5e5e5!important;}
</style>
<script>
(function(){
  var brand=(getComputedStyle(document.documentElement).getPropertyValue('--brand')||'').trim()||'#2563eb';

  // Brand name for notification
  var bName=document.title||(document.querySelector('h1')?document.querySelector('h1').textContent.trim().slice(0,60):'');

  // Extract siteId from URL path (/site/WEB-XXXXXX)
  var siteId=(function(){var m=window.location.pathname.match(/\\/site\\/(WEB-[A-Z0-9]+)/i);return m?m[1]:null;})();

  // Form submit
  var form=document.getElementById('wai-contact-form');
  var statusEl=document.getElementById('wai-f-status');
  if(!form)return;
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var hp=form.querySelector('input[name="wai_hp"]');
    var name=document.getElementById('wai-f-name').value.trim();
    var phone=document.getElementById('wai-f-phone').value.trim();
    var email=document.getElementById('wai-f-email').value.trim();
    var msg=document.getElementById('wai-f-msg').value.trim();
    if(!name||!phone){
      statusEl.style.display='block';statusEl.style.color='#fca5a5';statusEl.style.background='rgba(220,38,38,0.15)';
      statusEl.textContent='Te rugăm să completezi numele și telefonul.';return;
    }
    var submitBtn=document.getElementById('wai-f-btn');
    submitBtn.disabled=true;submitBtn.textContent='Se trimite...';
    statusEl.style.display='none';
    fetch('https://websiteai.ro/api/contact',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:name,email:email||null,phone:phone,message:msg||null,brand:bName||null,siteId:siteId||null,hp:hp?hp.value:''})
    }).then(function(r){return r.json();}).then(function(d){
      if(d.ok){
        statusEl.style.display='block';statusEl.style.color='#86efac';statusEl.style.background='rgba(34,197,94,0.12)';
        statusEl.textContent='✓ Mesajul a fost trimis! Vă vom contacta în curând.';
        form.reset();submitBtn.textContent='✓ Trimis!';
        setTimeout(function(){submitBtn.disabled=false;submitBtn.textContent='Trimite Mesaj';},4000);
      } else { throw new Error(d.error||'Eroare'); }
    }).catch(function(){
      statusEl.style.display='block';statusEl.style.color='#fca5a5';statusEl.style.background='rgba(220,38,38,0.15)';
      statusEl.textContent='A apărut o eroare. Vă rugăm să ne contactați direct.';
      submitBtn.disabled=false;submitBtn.textContent='Trimite Mesaj';
    });
  });
})();
</script>`;

      // Inject contact section: before <footer> if it exists, otherwise before </body>
      if (/<footer[\s>]/i.test(html)) {
        html = html.replace(/<footer[\s>]/i, function(m){ return contactSection + '\n' + m; });
      } else if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, contactSection + '\n</body>');
      } else {
        html += '\n' + contactSection;
      }

      break;
    }

    return res.status(200).json({ html });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Eroare internă' });
  }
};
