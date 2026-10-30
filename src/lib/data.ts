import type { Item, Lesson, Manual, ManualCode } from './types'

const manuals = new Map<string, Promise<Manual>>()
const lessons = new Map<string, Promise<Lesson>>()
const items = new Map<string, Promise<Item[]>>()

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`)
  return r.json() as Promise<T>
}
export const loadManual = (c: ManualCode) => { if (!manuals.has(c)) manuals.set(c, getJSON<Manual>(`/data/${c}/manual.json`)); return manuals.get(c)! }
export const loadLesson = (c: ManualCode, id: string) => { const k = c + id; if (!lessons.has(k)) lessons.set(k, getJSON<Lesson>(`/data/${c}/lessons/${id}.json`)); return lessons.get(k)! }
export const loadItems = (c: ManualCode, id: string) => { const k = c + id; if (!items.has(k)) items.set(k, getJSON<Item[]>(`/data/${c}/items/${id}.json`)); return items.get(k)! }

// ---- KJV text for "read in context" ------------------------------------------------------------
let kjv: Promise<Map<string, string>> | null = null
async function loadKJV() {
  const res = await fetch('/data/bible/KJV.tsv.gz'); const ds = new DecompressionStream('gzip')
  const text = await new Response(res.body!.pipeThrough(ds)).text(); const m = new Map<string, string>()
  for (const line of text.split('\n')) { if (!line || line[0] === '#') continue; const [b, c, v, t] = line.split('\t'); m.set(`${b} ${c}:${v}`, t) }
  return m
}
const OSIS: Record<string, string> = { Genesis: 'Gen', Exodus: 'Exod', Leviticus: 'Lev', Numbers: 'Num', Deuteronomy: 'Deut', Joshua: 'Josh', Judges: 'Judg', Ruth: 'Ruth', '1 Samuel': '1Sam', '2 Samuel': '2Sam', '1 Kings': '1Kgs', '2 Kings': '2Kgs', '1 Chronicles': '1Chr', '2 Chronicles': '2Chr', Ezra: 'Ezra', Nehemiah: 'Neh', Esther: 'Esth', Job: 'Job', Psalm: 'Ps', Proverbs: 'Prov', Ecclesiastes: 'Eccl', 'Song of Solomon': 'Song', Isaiah: 'Isa', Jeremiah: 'Jer', Lamentations: 'Lam', Ezekiel: 'Ezek', Daniel: 'Dan', Hosea: 'Hos', Joel: 'Joel', Amos: 'Amos', Obadiah: 'Obad', Jonah: 'Jonah', Micah: 'Mic', Nahum: 'Nah', Habakkuk: 'Hab', Zephaniah: 'Zeph', Haggai: 'Hag', Zechariah: 'Zech', Malachi: 'Mal', Matthew: 'Matt', Mark: 'Mark', Luke: 'Luke', John: 'John', Acts: 'Acts', Romans: 'Rom', '1 Corinthians': '1Cor', '2 Corinthians': '2Cor', Galatians: 'Gal', Ephesians: 'Eph', Philippians: 'Phil', Colossians: 'Col', '1 Thessalonians': '1Thess', '2 Thessalonians': '2Thess', '1 Timothy': '1Tim', '2 Timothy': '2Tim', Titus: 'Titus', Philemon: 'Phlm', Hebrews: 'Heb', James: 'Jas', '1 Peter': '1Pet', '2 Peter': '2Pet', '1 John': '1John', '2 John': '2John', '3 John': '3John', Jude: 'Jude', Revelation: 'Rev' }
/** Verses around a single reference such as "1 Timothy 4:8" (the verse, plus one before and after). */
export async function readInContext(ref: string): Promise<{ ref: string; verses: { n: number; t: string; hit: boolean }[] } | null> {
  const m = ref.match(/^(.*?)\s+(\d+):(\d+)(?:-(\d+))?/); if (!m) return null
  const osis = OSIS[m[1]]; if (!osis) return null
  kjv ??= loadKJV(); const bible = await kjv
  const c = +m[2], v1 = +m[3], v2 = m[4] ? +m[4] : v1; const verses = []
  for (let v = Math.max(1, v1 - 1); v <= v2 + 1; v++) { const t = bible.get(`${osis} ${c}:${v}`); if (t) verses.push({ n: v, t, hit: v >= v1 && v <= v2 }) }
  return verses.length ? { ref, verses } : null
}
