// axe-core in the page: serious and critical problems only, as "rule: target" lines (empty = none).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const raw = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

// axe puts two kinds of <style> element in a document while it runs: elementsFromPoint's polyfill (in <head> of the
// page), and a copy of each style sheet it reads (getStyleSheetFactory, in a scratch document that shares the page's
// policy). The page's CSP reports each as `style-src-elem inline`, hundreds in a run, as tasks of their own, and on a
// loaded runner one came after byTool's wait, so the look axe tests failed once in a while (full-checks run
// 40916397295, passed on re-run). Give axe the same sheets as constructed ones, which the policy does not govern, and
// no report is made at all. Each piece must match once, so a new axe-core that words this differently fails here,
// loudly. (An @import sheet keeps its element: nothing in the app uses one.)
const PATCHES = [
  ['(s=document.createElement("style")).innerHTML=e?"* { pointer-events: all }":"* { visibility: visible }"',
    '(s=new CSSStyleSheet).replaceSync(e?"* { pointer-events: all }":"* { visibility: visible }")'],
  ['document.head.appendChild(s)', 'document.adoptedStyleSheets=[...document.adoptedStyleSheets,s]'],
  ['document.head.removeChild(s)', 'document.adoptedStyleSheets=document.adoptedStyleSheets.filter(x=>x!==s)'],
  ['i=u.createElement("style");return e?(', 'i=e?u.createElement("style"):new CSSStyleSheet;return e?('],
  ['i.appendChild(u.createTextNode(t)),u.head.appendChild(i),{sheet:i.sheet,', 'i.replaceSync(t),e&&u.head.appendChild(i),{sheet:e?i.sheet:i,'],
];
const src = PATCHES.reduce((code, [from, to]) => {
  if (code.split(from).length !== 2) throw new Error(`axe-core: expected one "${from.slice(0, 40)}..." to patch (see e2e/axe.mjs)`);
  return code.replace(from, () => to);
}, raw);

// Run a tool that works inside the page (axe, a screenshot: Playwright's WebKit screenshot adds an inline <style>), and
// drop the CSP reports it caused: they are the tool's, not the page's. The events arrive asynchronously, in WebKit well
// after the call (on a slow runner a second or more), so wait at least a second and until none come for half a second.
export async function byTool(page, fn) {
  const before = await page.evaluate(() => (window.__csp || []).length);
  const out = await fn();
  await page.evaluate(() => new Promise(res => {
    let last = (window.__csp || []).length, quiet = 0, ticks = 0;
    const t = setInterval(() => {
      const n = (window.__csp || []).length; quiet = n === last ? quiet + 1 : 0; last = n;
      if (++ticks >= 20 && quiet >= 10) { clearInterval(t); res(); }
    }, 50);
  }));
  await page.evaluate(n => { if (window.__csp) window.__csp.length = n; }, before);
  return out;
}

export default async function axe(page) {
  // a sheet, dialog or toast fades in: axe reads the colours as they are blended mid-animation, so wait for the running
  // (finite) animations to end rather than measure a half-faded page. An element added a moment ago has no animation yet,
  // so let two frames pass first (timers back them up, as a hidden page paints none) and look again, at most 5 times.
  await page.evaluate(async () => {
    const frame = () => new Promise(res => { requestAnimationFrame(() => res()); setTimeout(res, 100); });
    for (let i = 0; i < 5; i++) {
      await frame(); await frame();
      const running = document.getAnimations().filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime) && (a.playState === 'running' || a.pending));
      if (!running.length) return;
      await Promise.all(running.map(a => a.finished.catch(() => {})));
    }
  });
  // (evaluated, not a script tag)
  const r = await byTool(page, async () => {
    await page.evaluate(src);
    return page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
  });
  return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).flatMap(v => v.nodes.map(n => `${v.id}: ${n.target.join(' ')}`));
}
