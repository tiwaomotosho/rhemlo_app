/** Rhemlo Tailwind preset */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  theme: { extend: {
    colors: { rh: { 'bg': 'var(--rh-bg)', 'surface': 'var(--rh-surface)', 'surface2': 'var(--rh-surface2)', 'raised': 'var(--rh-raised)', 'text': 'var(--rh-text)', 'text2': 'var(--rh-text2)', 'text3': 'var(--rh-text3)', 'action': 'var(--rh-action)', 'action-fg': 'var(--rh-action-fg)', 'action-shadow': 'var(--rh-action-shadow)', 'line': 'var(--rh-line)', 'line2': 'var(--rh-line2)', 'apricot': 'var(--rh-apricot)', 'apricot-bg': 'var(--rh-apricot-bg)', 'apricot-deep': 'var(--rh-apricot-deep)', 'pistachio': 'var(--rh-pistachio)', 'pistachio-bg': 'var(--rh-pistachio-bg)', 'pistachio-deep': 'var(--rh-pistachio-deep)', 'correct': 'var(--rh-correct)', 'correct-bg': 'var(--rh-correct-bg)', 'correct-line': 'var(--rh-correct-line)', 'incorrect': 'var(--rh-incorrect)', 'incorrect-bg': 'var(--rh-incorrect-bg)', 'incorrect-line': 'var(--rh-incorrect-line)', 'warning': 'var(--rh-warning)', 'warning-bg': 'var(--rh-warning-bg)', 'gold': 'var(--rh-gold)', 'glass': 'var(--rh-glass)' },
      brand: {"vanilla": "#FFF8EE", "apricot": "#FFAA72", "grape": "#7041D9", "pistachio": "#D7ED9B", "lavender": "#E8DCFF", "plum": "#30213E"},
      node: {"done": "#8DBF2F", "current": "#7041D9", "locked": "#EDE6F2", "review": "#FFAA72", "reward": "#F2C14E", "stage": "#30213E"} },
    fontFamily: { display: ['Nunito','ui-rounded','system-ui','sans-serif'], body: ['Figtree','system-ui','sans-serif'] },
    borderRadius: { 'rh-sm':'10px','rh-md':'16px','rh-lg':'22px','rh-xl':'28px' },
    boxShadow: { 'rh-card':'var(--rh-shadow-card)', 'rh-raised':'0 4px 0 var(--rh-action-shadow)' },
    maxWidth: { question:'640px', reader:'68ch' },
    screens: { tablet:'640px', desktop:'1024px' }
  } }
};
