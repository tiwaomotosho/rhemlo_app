/* <rhemlo-glim> - zero-dependency Glim element (v1.1).
 *   <rhemlo-glim pose="wave" colorway="classic" motion="auto" size="160"></rhemlo-glim>        static art + CSS motion
 *   <rhemlo-glim rig pose="idle" motion="walk" size="200"></rhemlo-glim>                      TRUE rig (per-part animation + blink)
 *   <rhemlo-glim rig pose="profile" motion="walk" size="200"></rhemlo-glim>                   side-view walk cycle
 *   <rhemlo-glim turnaround size="200"></rhemlo-glim>                                         stand > 3/4 > profile > back > 3/4 > stand
 * Rig draw order (back to front): leg*, flame (BEHIND the body, so the cap covers its base), body, lid* (blink), arm*, prop*.
 * Needs motion/rhemlo-motion.css. Set window.RHEMLO_ASSETS if not served at /rhemlo-assets.
 * Optional: window.RHEMLO_CATALOG / RHEMLO_MOTIONS preloaded objects (lets it run from file://). */
(function(){
const BASE = () => (window.RHEMLO_ASSETS || '/rhemlo-assets').replace(/\/$/, '');
let CAT = null, MOT = null;
const get = async (k, u) => window[k] || (await fetch(u)).json();
const catalog = () => CAT ||= get('RHEMLO_CATALOG', `${BASE()}/characters/glim/glim-catalog.json`);
const motions = () => MOT ||= get('RHEMLO_MOTIONS', `${BASE()}/motion/motions.json`);
const ORDER = n => n.startsWith('leg') ? 0 : n === 'flame' ? 1 : n === 'body' ? 2 : n.startsWith('lid') ? 3 : n.startsWith('arm') ? 4 : 5;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/* eyelid closure for a loop: visible for 4 frames (0.6,1,1,0.6) once per loop at ~60%, only on loops >= 1.3 s */
const BLINK = [0.6, 1, 1, 0.6];
function blinkAt(dur, phase) {
  if (dur < 1.3) return 0;
  const n = Math.round(dur * 25), c = Math.round(0.6 * n), k = Math.floor(phase * n) - (c - 1);
  return k >= 0 && k < 4 ? BLINK[k] : 0;
}
class RhemloGlim extends HTMLElement {
  static get observedAttributes() { return ['pose','colorway','motion','size','label','rig','turnaround']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { if (this.isConnected) this.render(); }
  disconnectedCallback() { cancelAnimationFrame(this._raf); }
  async render() {
    cancelAnimationFrame(this._raf);
    const cat = await catalog();
    const pose = cat.poses[this.getAttribute('pose')] ? this.getAttribute('pose') : 'idle';
    const cw = cat.colorways.includes(this.getAttribute('colorway')) ? this.getAttribute('colorway') : 'classic';
    const size = parseInt(this.getAttribute('size') || '160', 10);
    let motion = this.getAttribute('motion') || 'auto'; if (motion === 'auto') motion = cat.poses[pose].motion;
    const label = this.getAttribute('label');
    this.style.display = 'inline-block'; this.style.lineHeight = '0';
    if (this.hasAttribute('turnaround')) return this.renderTurnaround(cat, cw, size, label);
    if (this.hasAttribute('rig')) return this.renderRig(cat, pose, cw, motion, size, label);
    const dir = `${BASE()}/characters/glim/colorways/${cw}`, img = document.createElement('img');
    img.src = `${dir}/glim-${pose}-${size > 256 ? 512 : 256}.webp`;
    img.srcset = `${dir}/glim-${pose}-256.webp 256w, ${dir}/glim-${pose}-512.webp 512w`; img.sizes = `${size}px`;
    img.width = size; img.height = size; img.decoding = 'async'; img.loading = 'lazy';
    img.className = 'glim' + (motion !== 'none' ? ` glim--${motion}` : '');
    if (label) img.alt = label; else { img.alt = ''; img.setAttribute('aria-hidden', 'true'); }
    this.replaceChildren(img);
  }
  async renderRig(cat, pose, cw, motion, size, label) {
    const p = cat.poses[pose], rig = p.rig, [W, H] = rig.size;
    const dir = cw === 'classic' ? `${BASE()}/characters/glim/rig/${pose}` : `${BASE()}/characters/glim/rig-colorways/${cw}/${pose}`;
    const k = size / Math.max(W, H), box = document.createElement('div');
    box.className = 'glim-rig'; box.style.position = 'relative'; box.style.width = `${W * k}px`; box.style.height = `${H * k}px`;
    if (label) { box.setAttribute('role', 'img'); box.setAttribute('aria-label', label); } else box.setAttribute('aria-hidden', 'true');
    const imgs = {};
    for (const part of [...rig.layers].sort((a, b) => ORDER(a) - ORDER(b))) {
      const im = document.createElement('img'); im.src = `${dir}/${part}.webp`; im.alt = ''; im.dataset.part = part;
      im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
      const pv = rig.pivots[part] || rig.pivots.body;
      im.style.transformOrigin = `${(pv[0] / W) * 100}% ${(pv[1] / H) * 100}%`;
      if (part.startsWith('lid')) im.style.visibility = 'hidden';
      box.appendChild(im); imgs[part] = im;
    }
    box.style.transformOrigin = `${(rig.pivots.body[0] / W) * 100}% ${(rig.pivots.body[1] / H) * 100}%`;
    this.replaceChildren(box);
    if (motion === 'none' || reduced()) return;
    const M = (await motions()).motions[motion]; if (!M) return;
    const amp = p.rig_amplitude, arms = rig.layers.filter(l => l.startsWith('arm')), legs = rig.layers.filter(l => l.startsWith('leg')), lids = rig.layers.filter(l => l.startsWith('lid'));
    const t0 = performance.now();
    const tick = (now) => {
      const el = Math.max(0, now - t0), phase = (el / 1000 / M.duration_s) % 1;
      let i = Math.floor(phase * M.frames.length); if (!(i >= 0)) i = 0;
      const f = M.frames[i % M.frames.length], r = f.root;
      box.style.transform = `translate(${r.dx * k}px, ${r.dy * k}px) rotate(${r.rot}deg) scale(${r.sx}, ${r.sy})`;
      arms.forEach((a, j) => imgs[a].style.transform = `rotate(${(j ? f.armR : f.armL) * amp.arm[j ? 1 : 0]}deg)`);
      legs.forEach((l, j) => imgs[l].style.transform = `rotate(${(j ? f.legR : f.legL) * amp.leg}deg)`);
      if (imgs.flame) { const fl = f.flame, a = amp.flame;
        imgs.flame.style.transform = `translate(${fl.dx * a * k}px, ${fl.dy * a * k}px) rotate(${fl.rot * a}deg) scale(${1 + (fl.sx - 1) * a}, ${1 + (fl.sy - 1) * a})`; }
      const b = lids.length ? blinkAt(M.duration_s, phase) : 0;
      lids.forEach(l => { imgs[l].style.visibility = b > 0.02 ? 'visible' : 'hidden'; if (b > 0.02) imgs[l].style.transform = `scaleY(${b})`; });
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
  /* stand > turn34right > profile > back > turn34left > stand, 0.25 s per view, 2-frame crossfade, shared feet baseline */
  async renderTurnaround(cat, cw, size, label) {
    const views = cat.sequences.turnaround.views, uniq = [...new Set(views)];
    const box = document.createElement('div'); box.className = 'glim-rig'; box.style.cssText = `position:relative;width:${size}px;height:${size}px`;
    if (label) { box.setAttribute('role', 'img'); box.setAttribute('aria-label', label); } else box.setAttribute('aria-hidden', 'true');
    let kk = Infinity; for (const v of uniq) { const r = cat.poses[v].rig, [x0, y0, x1, y1] = r.bbox; kk = Math.min(kk, Math.min(size * 0.8 / (y1 - y0 + 1), size * 0.9 / (x1 - x0 + 1))); }
    const base = size * 0.97, wraps = {};
    for (const v of uniq) {
      const r = cat.poses[v].rig, [W, H] = r.size, [bx, by] = r.pivots.body, w = document.createElement('div');
      w.style.cssText = `position:absolute;left:${size / 2 - bx * kk}px;top:${base - by * kk}px;width:${W * kk}px;height:${H * kk}px;opacity:0`;
      const dir = cw === 'classic' ? `${BASE()}/characters/glim/rig/${v}` : `${BASE()}/characters/glim/rig-colorways/${cw}/${v}`;
      for (const part of [...r.layers].sort((a, b) => ORDER(a) - ORDER(b))) {
        if (part.startsWith('lid')) continue;
        const im = document.createElement('img'); im.src = `${dir}/${part}.webp`; im.alt = ''; im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%'; w.appendChild(im);
      }
      box.appendChild(w); wraps[v] = w;
    }
    box.style.transformOrigin = `50% ${base}px`; this.replaceChildren(box);
    if (reduced()) { wraps.stand.style.opacity = 1; return; }
    const per = 6, n = per * views.length, t0 = performance.now();
    const tick = (now) => {
      const f = Math.floor((Math.max(0, now - t0) / 1000 * 24) % n), vi = Math.floor(f / per), sw = f % per;
      uniq.forEach(v => wraps[v].style.opacity = 0);
      const cur = views[vi], prev = views[(vi + n / per - 1) % (n / per)], next = views[(vi + 1) % (n / per)];
      wraps[cur].style.opacity = 1;
      let squash = 1;
      if (sw === 0 && prev !== cur) { wraps[prev].style.opacity = 0.5; squash = 0.97; }
      if (sw === per - 1 && next !== cur) { wraps[next].style.opacity = Math.max(+wraps[next].style.opacity, 0.5); squash = 0.97; }
      box.style.transform = `scaleY(${squash})`;
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
}
if (!customElements.get('rhemlo-glim')) customElements.define('rhemlo-glim', RhemloGlim);
window.RhemloGlim = RhemloGlim;
})();
