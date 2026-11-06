// Every item must be answerable: build the correct response from its own answer and mark it with the
// app's grader. Covers the generated bank and the styles the app derives from the manual (extra.ts).
import { gradeItem } from '../src/lib/grade'
import { extraItems } from '../src/lib/extra'
import type { Item, Lesson, Manual, Response } from '../src/lib/types'
import { readdirSync, readFileSync } from 'node:fs'
const bad: Record<string, number> = {}, ex: Record<string, string> = {}, count: Record<string, number> = {}; let n = 0
const read = <T,>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T
for (const m of ['AD2627', 'EN2627']) {
  const man = read<Manual>(`public/data/${m}/manual.json`)
  for (const f of readdirSync(`public/data/${m}/items`)) {
    const base = read<Item[]>(`public/data/${m}/items/${f}`), les = read<Lesson>(`public/data/${m}/lessons/${f}`)
    for (const it of [...base, ...extraItems(man, les, base)]) {
      const k = it.p.input.kind, a = it.a; let r: Response
      if (k === 'choice') r = { kind: 'choice', value: a.text ?? '' }
      else if (k === 'fields') r = { kind: 'fields', values: a.items ?? [] }
      else if (k === 'order') r = { kind: 'order', values: a.items ?? [] }
      else if (k === 'word_bank') r = { kind: 'bank', values: a.words ?? [] }
      else if (k === 'multi') r = { kind: 'multi', values: [...(a.items ?? [])].reverse() }
      else r = { kind: 'text', value: a.text ?? '' }
      n++; count[it.t] = (count[it.t] ?? 0) + 1; const g = gradeItem(it, r)
      // multiple choice must offer at least two wrong options that are not also right
      const mcqOk = !it.f.includes('mcq') || k === 'multi' || (it.d.length >= 2 && !it.d.some(d => gradeItem(it, { kind: 'choice', value: d }).correct))
      if (!g.correct || !mcqOk) { const key = `${it.t}/${k}${mcqOk ? '' : ' (options)'}`; bad[key] = (bad[key] ?? 0) + 1; ex[key] ??= `${it.u} a=${JSON.stringify(a).slice(0, 160)} d=${JSON.stringify(it.d).slice(0, 120)}` }
    }
  }
}
console.log('items', n, 'failures by type', bad); for (const k in ex) console.log(k, ex[k])
console.log('generated in app:', Object.fromEntries(Object.entries(count).filter(([t]) => +t.slice(1) >= 29)))
