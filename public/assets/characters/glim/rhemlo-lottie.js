/* rhemlo-lottie.js (v1.1) - tiny player for Rhemlo's rigged Lottie files (image layers, parenting, hold-keyframed opacity).
 * Production: use lottie-web or dotLottie. This exists so the pack is verifiable offline.
 *   playLottie(element, urlOrObject) */
(function(){
const val = (p, t) => { if (!p || p.a === 0) return Array.isArray(p.k) ? p.k : [p.k];
  const ks = p.k; if (t <= ks[0].t) return ks[0].s.slice(); if (t >= ks[ks.length-1].t) return ks[ks.length-1].s.slice();
  for (let i = 0; i < ks.length - 1; i++) { const a = ks[i], b = ks[i+1];
    if (t >= a.t && t < b.t) { if (a.h) return a.s.slice(); const u = (t - a.t) / Math.max(1e-9, b.t - a.t); return a.s.map((v, j) => v + (b.s[j] - v) * u); } }
  return ks[ks.length-1].s.slice(); };
const mat = (ks, t) => { const p = val(ks.p, t), a = val(ks.a, t), s = val(ks.s, t), r = val(ks.r, t)[0];
  const th = r * Math.PI / 180, c = Math.cos(th), si = Math.sin(th), sx = s[0]/100, sy = s[1]/100;
  return new DOMMatrix([c*sx, si*sx, -si*sy, c*sy, p[0], p[1]]).translate(-a[0], -a[1]); };
async function playLottie(el, src) {
  const doc = typeof src === 'string' ? await (await fetch(src)).json() : src;
  const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1;
  cv.width = doc.w * dpr; cv.height = doc.h * dpr; cv.style.width = '100%'; cv.style.height = '100%';
  el.replaceChildren(cv); const ctx = cv.getContext('2d'), assets = {};
  await Promise.all(doc.assets.map(a => new Promise(res => { const i = new Image(); i.onload = () => { assets[a.id] = i; res(); }; i.onerror = res; i.src = a.p; })));
  const by = Object.fromEntries(doc.layers.map(l => [l.ind, l])), t0 = performance.now();
  const draw = (now) => { const t = ((Math.max(0, now - t0)) / 1000 * doc.fr) % doc.op;
    ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height);
    [...doc.layers].sort((a, b) => b.ind - a.ind).forEach(l => { if (l.ty !== 2 || !assets[l.refId]) return;
      const op = val(l.ks.o, t)[0] / 100; if (op <= 0) return;
      let m = mat(l.ks, t), par = l.parent; while (par) { m = mat(by[par].ks, t).multiply(m); par = by[par].parent; }
      ctx.globalAlpha = op; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f); ctx.drawImage(assets[l.refId], 0, 0); });
    ctx.globalAlpha = 1; el._raf = requestAnimationFrame(draw); };
  el._raf = requestAnimationFrame(draw); return cv;
}
window.playLottie = playLottie;
})();
