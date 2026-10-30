import { expect, test } from 'bun:test'
import { normText, typedRefs, gradeItem } from './grade'
import type { Item } from './types'

test('norm: case, punctuation, whitespace', () => {
  expect(normText('  And he is  BEFORE all things, and by him all things consist.')).toBe('and he is before all things and by him all things consist')
})
test('norm: hyphens joining letters kept, colons between digits kept', () => {
  expect(normText('God-breathed')).toBe('god-breathed')
  expect(normText('well - known')).toBe('well known')
  expect(normText('John 3:16: yes')).toBe('john 3:16 yes')
})
test('apostrophes vanish (spelling still counts)', () => {
  expect(normText('God’s')).toBe('gods')
  expect(normText('Gods')).toBe('gods')
  expect(normText('imanence')).not.toBe(normText('immanence'))
})
test('typed references', () => {
  expect(typedRefs('col 1:17')).toEqual(['Colossians 1:17'])
  expect(typedRefs('Jer 23:23; Isa 55:9').length).toBeGreaterThan(0)
  expect(typedRefs('Jer 23:23; Isa 55:9').join('|')).toContain('Isaiah 55:9')
  expect(typedRefs('Hebrews 9:22; 1 John 1:7-9')).toEqual(['Hebrews 9:22', '1 John 1:7-9'])
  expect(typedRefs('1 Tim 4:8')).toEqual(['1 Timothy 4:8'])
  expect(typedRefs('Psalm 139:1-5')).toEqual(['Psalm 139:1-5'])
})
const it = (a: Item['a'], kind: string, extra: Partial<Item['p']> = {}): Item => ({ u: 'x', t: 'Q01', f: ['typed'], p: { instruction: '', input: { kind }, ...extra }, a, d: [], g: [], s: 's', tg: '' })
test('grade text / fields / reference', () => {
  expect(gradeItem(it({ text: 'immanence', norm: 'immanence' }, 'text'), { kind: 'text', value: ' Immanence. ' }).correct).toBe(true)
  expect(gradeItem(it({ text: 'immanence', norm: 'immanence' }, 'text'), { kind: 'text', value: 'imminence' }).correct).toBe(false)
  expect(gradeItem(it({ items: ['a', 'b'], ordered: true }, 'fields'), { kind: 'fields', values: ['A', 'b!'] }).correct).toBe(true)
  expect(gradeItem(it({ items: ['a', 'b'], ordered: true }, 'fields'), { kind: 'fields', values: ['b', 'a'] }).correct).toBe(false)
  expect(gradeItem(it({ refs: [{ key: 'Colossians 1:17' }] }, 'reference'), { kind: 'text', value: 'COL 1:17' }).correct).toBe(true)
  expect(gradeItem(it({ refs: [{ key: 'Colossians 1:17' }] }, 'reference'), { kind: 'text', value: 'Col 1:18' }).correct).toBe(false)
})
