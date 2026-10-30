// Every item must be answerable: build the correct response from its own answer and mark it with the app's grader.
import { gradeItem } from '../src/lib/grade'
import type { Item, Response } from '../src/lib/types'
import { readdirSync, readFileSync } from 'node:fs'
const bad: Record<string, number> = {}, ex: Record<string, string> = {}; let n = 0
for (const m of ['AD2627', 'EN2627']) for (const f of readdirSync(`public/data/${m}/items`)) {
  for (const it of JSON.parse(readFileSync(`public/data/${m}/items/${f}`, 'utf8')) as Item[]) {
    const k = it.p.input.kind, a = it.a; let r: Response
    if (k === 'choice') r = { kind: 'choice', value: a.text ?? '' }
    else if (k === 'fields') r = { kind: 'fields', values: a.items ?? [] }
    else if (k === 'order') r = { kind: 'order', values: a.items ?? [] }
    else if (k === 'word_bank') r = { kind: 'bank', values: a.words ?? [] }
    else r = { kind: 'text', value: a.text ?? '' }
    n++; const g = gradeItem(it, r)
    if (!g.correct) { const key = `${it.t}/${k}`; bad[key] = (bad[key] ?? 0) + 1; ex[key] ??= `${it.u} a=${JSON.stringify(a).slice(0, 160)} exp=${g.expected}` }
  }
}
console.log('items', n, 'failures by type', bad); for (const k in ex) console.log(k, ex[k])
