export type ManualCode = 'AD2627' | 'EN2627'
export interface Stage { name: string; date: string; lessons: [number, number] }
export interface LessonMeta {
  id: string; n: number; q: number; title: string; date: string; mv: string; mvp: string; bp: string
  outline: string[]; readings: { d: string; r: string }[]; ic: number; cc: number
}
export interface Manual {
  code: ManualCode; title: string; short: string; bible: string; groups: Record<string, [number, number]>
  stages: Stage[]; lessons: LessonMeta[]; items: number
}
export interface Block { t: 'p' | 'l'; x?: string; i?: string[] }
export interface Section { k: string; h: string; b: Block[] }
export interface Lesson extends Omit<LessonMeta, 'ic' | 'cc'> { assignment: string; sections: Section[] }

export interface PromptInput { kind: string; count?: number; labels?: string[]; note?: string }
export interface Prompt {
  instruction: string; text?: string; context?: string; ref?: string; input: PromptInput
  letters?: string; opens?: string; previous?: string; outline?: string[]; speak?: string; shuffled?: string[]
  bank?: string[]; first_letter?: string; title?: string; lesson?: number; lessons?: number[]; role?: string; count?: number
}
export interface Answer {
  text?: string; norm?: string; items?: string[]; ordered?: boolean; refs?: { key: string }[]
  lesson?: number; accept?: string[]; words?: string[]; position?: number; wrong?: string; trap?: string
}
export interface Item { u: string; t: string; f: ('typed' | 'mcq')[]; p: Prompt; a: Answer; d: string[]; g: string[]; s: string; tg: string }

export type Response =
  | { kind: 'text'; value: string }
  | { kind: 'fields'; values: string[] }
  | { kind: 'choice'; value: string }
  | { kind: 'order'; values: string[] }
  | { kind: 'bank'; values: string[] }

export interface Card { box: number; due: number; seen: number; right: number; last: number }
export interface SittingRecord {
  id: string; at: number; manual: ManualCode; kind: 'quest' | 'review' | 'target' | 'ladder' | 'daily' | 'check' | 'restart'; lesson?: string; title?: string
  total: number; right: number; misses: { u: string; wrote: string; expected: string; t?: string }[]; minutes: number
}
