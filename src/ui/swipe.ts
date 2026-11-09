// Touch swipes for phones: left/right to move between quarters, lessons, questions and tabs.
// A swipe counts only when it is quick and clearly sideways, so vertical scrolling is never hijacked.
// Ignored when it starts in a text field, inside something that scrolls sideways, near the screen
// edges (the phone's own back gesture lives there), or while text is selected.
import { useRef, useState, type TouchEvent } from 'react'

type Opts = { onLeft?: () => void; onRight?: () => void; min?: number }

function scrollsSideways(el: HTMLElement | null) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true
  }
  return false
}

/** Spread the returned handlers on the element that should listen: `<div {...swipe}>`. Swipe left = next. */
export function useSwipe({ onLeft, onRight, min = 56 }: Opts) {
  const s = useRef<{ x: number; y: number; t: number; skip: boolean } | null>(null)
  return {
    onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) { s.current = null; return }
      const t = e.touches[0], el = e.target as HTMLElement
      const skip = t.clientX < 22 || t.clientX > innerWidth - 22
        || !!el.closest('input, textarea, select, [contenteditable="true"], .noswipe') || scrollsSideways(el)
      s.current = { x: t.clientX, y: t.clientY, t: Date.now(), skip }
    },
    onTouchEnd(e: TouchEvent) {
      const st = s.current; s.current = null
      if (!st || st.skip || Date.now() - st.t > 650 || getSelection()?.toString()) return
      const t = e.changedTouches[0], dx = t.clientX - st.x, dy = t.clientY - st.y
      if (Math.abs(dx) >= min && Math.abs(dx) > 1.7 * Math.abs(dy)) {
        e.preventDefault()   // a swipe that starts on an option or a link must not also tap it
        ;(dx < 0 ? onLeft : onRight)?.()
      }
    },
  }
}

/** Remembers which way the content moved, for a short slide-in (`.slide-next` / `.slide-prev`). */
export function useSlide() {
  const [dir, setDir] = useState<'' | 'next' | 'prev'>('')
  const [n, setN] = useState(0)
  return { cls: dir ? `slide-${dir}` : '', key: n, mark: (d: 'next' | 'prev') => { setDir(d); setN(x => x + 1) } }
}

/** Tabbed pages: swipe to the next or previous tab, with the same slide. */
export function useTabSwipe<T extends string>(tabs: readonly T[], current: T, set: (t: T) => void) {
  const slide = useSlide(), i = tabs.indexOf(current)
  const to = (j: number) => { if (j < 0 || j >= tabs.length || j === i) return; slide.mark(j > i ? 'next' : 'prev'); set(tabs[j]) }
  const swipe = useSwipe({ onLeft: () => to(i + 1), onRight: () => to(i - 1) })
  return { swipe, cls: slide.cls, key: `${current}-${slide.key}`, pick: (t: T) => to(tabs.indexOf(t)) }
}
