import { useStore } from '@/lib/store'
import { Glim, asset, Loading, useManualData } from '@/ui/bits'
import { useStart } from './Journey'

const Lock = ({ img, title, body }: { img: string; title: string; body: string }) =>
  <div className="card lockcard"><img src={asset(`emblems/arena/${img}-128.webp`)} alt="" /><div className="grow"><h3>{title}</h3><p className="small muted">{body}</p><span className="pill" style={{ marginTop: 8 }}>Opens with accounts</span></div></div>

export function Arena() {
  const m = useManualData(); const { done, sessionSize } = useStore(); const start = useStart()
  if (!m) return <Loading />
  const lessons = m.lessons.filter(l => done[`${m.code}|${l.id}`]).map(l => l.id)
  return <div className="col" style={{ gap: 18 }}>
    <div className="hero"><div><p className="eyebrow">Arena</p><h1>Friendly competition</h1></div><Glim pose="trophy" size={256} style={{ width: 80, height: 80 }} /></div>
    <div className="card tint col"><h3>Daily challenge</h3><p className="small muted">Ten questions mixed from lessons you've cleared. Practice only for now. Marked exactly like a real quiz: spelling counts, capitals and punctuation don't.</p>
      <button className="btn block" disabled={!lessons.length} onClick={() => start({ kind: 'daily', manual: m.code, lessons: lessons.slice(-12), count: 10, title: 'Daily challenge' })}>{lessons.length ? 'Play today' : 'Clear a first lesson to play'}</button></div>
    <div className="desk2"><div className="col">
      <Lock img="arena-podium" title="Weekly leagues" body="Small leagues of similar level, with promotion and rest weeks, so nobody is shut out." />
      <Lock img="arena-buzzer" title="Quiz Night" body="Live buzzer rounds hosted by a quizmaster, with a fair, shared clock." /></div>
    <div className="col"><Lock img="arena-versus" title="Head to head" body="Challenge a friend to the same ten questions." />
      <div className="card"><p className="small muted">Rankings need accounts so scores can be checked and compared fairly. Until then nothing here changes your marking, and your sittings of {sessionSize} stay private on this device.</p></div></div></div>
  </div>
}

export function Circle() {
  return <div className="col" style={{ gap: 18 }}>
    <div className="hero"><div><p className="eyebrow">Circle</p><h1>Study together</h1></div><Glim pose="hug" size={256} style={{ width: 80, height: 80 }} /></div>
    <div className="card col" style={{ alignItems: 'center', textAlign: 'center', padding: 28 }}>
      <img src={asset('illustrations/states/state-notify-256.webp')} alt="" width={160} height={160} />
      <h2>Circles are on the way</h2>
      <p className="muted" style={{ maxWidth: 420 }}>Friends, co-op quests, group chat and coach views need accounts. They'll arrive with sign-in; your local progress can be exported from You and kept safe in the meantime.</p>
    </div>
  </div>
}
