#!/usr/bin/env node
// W90 (Claude): lists visible editor texts the live translator left in Spanish (Chromium, every sheet in the DOM).
// Usage: node tools/browser-i18n-audit.cjs <lang> — reliable for en/de/ja/zh; Romance languages give false positives.
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + require('node:path').resolve(__dirname, '..', 'app/dist/agentcut.html'));
  await p.waitForFunction(() => typeof i18nApply === 'function');
  const r = await p.evaluate(async (process_lang) => {
    i18nApply(process_lang);
    // render dynamic parts that exist without media
    try { tpSel = 'burst'; tpPreview(); shootPlan = shootPlanFromTemplate('burst', aiT); renderShootPlan(); } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
    const es = /[áéíóúñ¿¡]|\b(el|la|los|las|del|que|para|con|una?|tus|sin|más|aquí|toma|tomas|grabar|graba|elige|agrega|y|en|es|o)\b/i;
    const out = new Map();
    const zoneOf = (el) => { const z = el.closest('[id^="s"].sheet, #home, #sOnb, #sLang, .htabs, header, #bar, #tools'); return z ? (z.id || z.className.split(' ')[0]) : (el.closest('[id]') || {}).id || '?'; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement; if (!el || el.closest('script,style,textarea,[data-notr]')) continue;
      const t = n.nodeValue.replace(/\s+/g, ' ').trim(); if (t.length < 3 || !es.test(t)) continue; const rec = i18nTexts.get(n); if (rec && rec.o !== rec.t) continue;
      const z = zoneOf(el); if (!out.has(z)) out.set(z, new Set()); out.get(z).add(t.slice(0, 90));
    }
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) for (const a of ['placeholder', 'title', 'aria-label']) {
      const t = (el.getAttribute(a) || '').trim(); if (!t || el.closest('[data-notr]') || !es.test(t)) continue; const m = i18nAttrs.get(el); if (m && m[a] && m[a].o !== m[a].t) continue;
      const z = zoneOf(el) + '@' + a; if (!out.has(z)) out.set(z, new Set()); out.get(z).add(t.slice(0, 90));
    }
    return [...out].map(([z, s]) => [z, [...s]]);
  }, process.argv[2] || 'en');
  let total = 0; for (const [z, s] of r) { total += s.length; console.log(`== ${z} (${s.length})`); for (const x of s) console.log('   ' + x); }
  console.log('TOTAL', total); await b.close(); process.exit(total ? 1 : 0);
})();
