import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, isDemo } from '@/lib/backend'
import { useStore } from '@/lib/store'
import { Glim, Icon, asset } from '@/ui/bits'

type Sec = { id: string; title: string; icon: string; body: ReactNode }
const Step = ({ n, children }: { n: number; children: ReactNode }) => <div className="numrow" style={{ alignItems: 'flex-start' }}><span className="n">{n}</span><div className="small grow" style={{ paddingTop: 5 }}>{children}</div></div>
const Node = ({ cls, icon, label }: { cls: string; icon: string; label: string }) => <div className="col center" style={{ alignItems: 'center', gap: 4, width: 70 }}>
  <span className={`node ${cls}`} style={{ position: 'static', transform: 'none', width: 44, height: 44, animation: 'none' }}><Icon n={icon} /></span><span className="tiny muted">{label}</span></div>
const P = ({ children }: { children: ReactNode }) => <p className="small" style={{ lineHeight: '22px' }}>{children}</p>

function sections(demo: boolean, accounts: { email: string; password: string; who: string }[]): Sec[] {
  return [
    { id: 'start', title: 'Getting started', icon: 'star', body: <>
      <P>Rhemlo helps you learn your Sunday School manual word for word, one short sitting at a time.</P>
      <Step n={1}>Open <b>Journey</b> and tap the glowing purple star: that is your current lesson.</Step>
      <Step n={2}>Choose <b>Learn</b> to read the lesson, then <b>Recall</b> to answer its questions.</Step>
      <Step n={3}>Come back when <b>points to revisit</b> appear. Short, spaced reviews are what make it stick.</Step>
      <p className="hint"><Icon n="info" />Everything works without an account. An account keeps your progress on every device.</p></> },
    { id: 'journey', title: 'Journey and the map', icon: 'journey', body: <>
      <P>Each stop on the painted map is a real lesson. A quarter has its lessons and a quarter check at the top.</P>
      <div className="row wrap" style={{ gap: 6 }}><Node cls="done" icon="check" label="Done" /><Node cls="review" icon="refresh" label="Review due" /><Node cls="current" icon="star" label="Current" /><Node cls="" icon="lock" label="Locked" /><Node cls="stage" icon="flag" label="Quarter check" /></div>
      <P>Tap any stop to open its chapter: <b>Learn → Recall → Review → Check</b>. A lesson opens when the one before it is cleared; reading is always open.</P>
      <P>The bar above the menu shows <b>points to revisit</b>. The list button on the map shows every lesson as a plain list.</P></> },
    { id: 'sitting', title: 'Answering questions', icon: 'feather', body: <>
      <P>A sitting is a set number of questions (10, 20 or 40) with a real finish line. The counter shows where you are, such as <b>7/20</b>.</P>
      <p className="hint"><Icon n="spell" />Spelling and hyphens count. Capitals and punctuation do not. Your keyboard will not autocorrect, on purpose.</p>
      <Step n={1}>Type, tap or choose, then press <b>Check answer</b>. Nothing is marked before you check.</Step>
      <Step n={2}>Feedback shows <b>You wrote</b> and <b>Expected</b>, with the exact letters that differ underlined.</Step>
      <Step n={3}>A missed question comes back later in the same sitting, marked <b>Again</b>, and returns sooner in your reviews.</Step>
      <P><b>Switch to choices</b> turns a typed question into multiple choice for that one item. It counts as assisted, so it counts less toward mastery.</P>
      <P><b>Save &amp; leave</b> (or Esc) keeps what you have answered. On a computer: Tab moves between boxes, Enter checks, keys 1–4 pick a choice.</P></> },
    { id: 'ladder', title: 'Memory verses', icon: 'ladder', body: <>
      <P>Each memory verse climbs a ladder:</P>
      <Step n={1}><b>Build</b>: tap the words in order. Extra words are not part of the verse.</Step>
      <Step n={2}><b>Fade</b> and <b>Fill</b>: type the missing words.</Step>
      <Step n={3}><b>Full recall</b>: type the whole verse. It opens only after Build and Fade are right.</Step>
      <P>Find it in <b>Practice → Memory ladder</b> or in each chapter.</P></> },
    { id: 'practice', title: 'Practice', icon: 'practice', body: <>
      <P><b>Due review</b> brings back what is ready to revisit. Do this first.</P>
      <P><b>Target practice</b> lets you pick lessons, a focus (memory verses, outlines, references, key sentences, spelling, listening) and 5–100 questions. If fewer questions match, it tells you the real number. Questions never repeat to pad a sitting.</P>
      <P><b>Weak spots</b> appear once you have answered a few questions in a lesson. They come only from your own answers.</P></> },
    { id: 'library', title: 'Reading the manual', icon: 'book', body: <>
      <P><b>Library</b> holds every lesson exactly as printed. Search by title, verse or reference.</P>
      <P>In a lesson, <b>Read</b> shows the text with labelled sections (Introduction, Outline 1, Outline 2, Conclusion, Lesson questions). <b>Outline</b> shows the structure and <b>References</b> lists every citation.</P>
      <P>Tap any purple reference to read the verse in context. On a computer it floats beside the verse; on a phone a drawer opens above the menu and you can keep reading. Further readings are for devotion and are never graded.</P></> },
    { id: 'progress', title: 'Progress and planner', icon: 'chart', body: <>
      <P>Every point you study is <b>Learning</b>, <b>Strengthening</b> or <b>Secure</b>. Secure means you got it right on spaced reviews until the gap reached 14 days. A Secure point can still come due again.</P>
      <P><b>Readiness</b> is the share of a test’s points that are Secure. The target is 95% before each test date (Quarter 1 test, then the Finale).</P>
      <P><b>Planner</b> lays out the week around Sunday class. Overdue work stays visible; it is never deleted to tidy the plan.</P>
      <P>Personal XP, verified league points and mastery are kept apart. One never buys another.</P></> },
    { id: 'arena', title: 'Arena', icon: 'arena', body: <>
      <P>Competition is optional. Join weekly leagues of about 30 learners on the same manual.</P>
      <P>The <b>daily challenge</b> is 10 questions with one ranked attempt a day. Answers are only accepted, not marked, until you finish. Your result then shows as pending while it is checked, then final. Only daily challenges add <b>verified points</b>.</P>
      <P>Ranks 1–10 move up a tier each week and ranks 26–30 move down. Equal points share a rank. There is no demotion in your first week.</P>
      <P><b>Friendly matches</b> and <b>Quiz Night</b> are for fun and never add league points.</P>
      <div className="tiers" style={{ justifyContent: 'flex-start' }}>{['bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern'].map(t => <img key={t} src={asset(`emblems/tiers/tier-${t}-128.webp`)} alt={`${t} tier`} style={{ width: 36, height: 42 }} />)}</div></> },
    { id: 'circle', title: 'Circle', icon: 'circle', body: <>
      <P><b>Friends</b> see milestones only, such as a cleared chapter, and can send preset cheers. Add friends by handle; Rhemlo never reads your contacts.</P>
      <P><b>Co-op</b>: two friends aim for ten sittings in a week. Each person can count at most five, one per day. A sitting counts once it has 10 or more answers.</P>
      <P><b>Circles</b> are moderated groups with a shared goal, coach assignments and Quiz Night. The shield button opens <b>mute, report, block and leave</b>. Your name is never shown to someone you report.</P></> },
    { id: 'you', title: 'Settings and your data', icon: 'you', body: <>
      <P><b>Appearance</b>: Light, Dark or System, text size, reduced motion, sounds, and day or night map.</P>
      <P><b>Notifications</b>: a daily reminder and due-review nudges, with quiet hours. Browser notifications are offered after a finished sitting.</P>
      <P><b>Downloads</b>: save a quarter of lessons for offline study on the published site.</P>
      <P><b>Your data</b>: export a backup file, restore it, or erase this device.</P></> },
    { id: 'demo', title: demo ? 'Demo mode and temporary use' : 'Accounts and sync', icon: 'info', body: demo ? <>
      <div className="card row" style={{ background: 'var(--rh-warning-bg)', borderColor: 'transparent' }}><span className="chip pend">Demo server</span><p className="small">Rhemlo is running in <b>demo mode</b> while its real servers are being set up.</p></div>
      <P><b>What is real:</b> the manual text, all 50,968 questions, the marking, your own answers, mastery, planner and offline downloads.</P>
      <P><b>What is simulated:</b> other people. League players, friends, circle members, coaches, match opponents and Quiz Night rooms are demo characters. Their activity is generated from the date, so standings move through the week. Nothing they “say” comes from a real person.</P>
      <P><b>Where it is stored:</b> demo accounts, sign-ins, chats and reports are kept only in this browser on this device. Another phone will not see your messages or scores. Clearing your browser data erases them.</P>
      <P><b>Try the demo accounts</b> (password <b>{accounts[0]?.password}</b>):</P>
      <div className="card list" style={{ padding: '2px 14px' }}>{accounts.map(a => <div key={a.email} className="li" style={{ alignItems: 'flex-start' }}><Icon n="you" className="s" /><span className="grow small"><b>{a.email}</b><span className="tiny muted" style={{ display: 'block' }}>{a.who}</span></span></div>)}</div>
      <P><b>When Rhemlo goes live:</b> real sign-in, sync and community features replace the demo. Demo accounts, demo people, chats and demo league points will not carry over. Your study progress can: export a backup from <b>You → Your data</b> before the switch, then restore it after you sign in to your real account.</P>
      <p className="hint"><Icon n="lock" />Never put real passwords you use elsewhere into a demo account. Use the demo accounts above or a throwaway password.</p></> : <>
      <P>Your account keeps your progress in sync across devices. Ranked results are checked on the server before they become final.</P></> },
  ]
}

export default function Guide() {
  const { hash } = useLocation(); const set = useStore(s => s.set)
  const secs = sections(isDemo, api.demoAccounts())
  const [open, setOpen] = useState<string>(hash.slice(1) || 'start')
  useEffect(() => { set({ guideSeen: true }) }, [set])
  useEffect(() => { if (hash) { setOpen(hash.slice(1)); setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 50) } }, [hash])
  return <div className="page">
    <div className="guide">
      <nav className="guide-toc" aria-label="Guide topics">{secs.map(s => <a key={s.id} href={`#${s.id}`} className={`gtoc ${open === s.id ? 'on' : ''}`} onClick={() => setOpen(s.id)}><Icon n={s.icon} className="s" />{s.title}</a>)}</nav>
      <div className="col gap16">
        <div className="row"><Glim pose="map" size={96} /><div><p className="eyebrow">Guide</p><h1>How Rhemlo works</h1><p className="small muted">Tap a topic. Everything here is also where you would expect it in the app.</p></div></div>
        {secs.map(s => <section key={s.id} id={s.id} className={`card gsec ${open === s.id ? 'open' : ''}`}>
          <button className="ghead" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? '' : s.id)}><span className={`tile ${s.id === 'demo' ? 'gold' : ''}`} style={{ width: 40, height: 40 }}><Icon n={s.icon} className="s" /></span><h2 className="grow" style={{ fontSize: 18 }}>{s.title}</h2><Icon n={open === s.id ? 'up' : 'down'} className="faint" /></button>
          {open === s.id && <div className="col gap8 gbody">{s.body}</div>}</section>)}
        <div className="row wrap gap8"><Link className="btn" to="/journey">Back to Journey</Link><Link className="btn sec" to="/practice">Try a practice</Link></div>
      </div>
    </div>
  </div>
}

/** A one-time nudge on the Journey for new learners. */
export function GuideTip() {
  const seen = useStore(s => s.guideSeen); const set = useStore(s => s.set)
  if (seen) return null
  return <div className="guidetip card row"><Glim pose="point" size={44} still /><div className="grow"><b className="small">New here?</b><div className="tiny muted">The Guide explains the map, marking and {isDemo ? 'demo mode' : 'your account'}.</div></div>
    <Link className="btn xs" to="/guide">Open</Link><button className="iconbtn" style={{ width: 36, height: 36 }} aria-label="Dismiss" onClick={() => set({ guideSeen: true })}><Icon n="x" className="s" /></button></div>
}
