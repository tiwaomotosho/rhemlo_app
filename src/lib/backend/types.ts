// The contract every backend implements. Method names follow the RPCs in the bundle's
// db/migrations (0003–0006), so the live adapter maps one-to-one onto Supabase.
export type Role = 'learner' | 'coach' | 'steward'
export type Tier = 'bronze' | 'silver' | 'gold' | 'jade' | 'amethyst' | 'lantern'
export const TIERS: Tier[] = ['bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern']

export interface PublicUser { id: string; handle: string; name: string; cw: string; tier: Tier; role: Role; demo?: boolean }
export interface Session { userId: string; email: string; user: PublicUser; token: string }
export interface Snapshot { at: number; data: Record<string, unknown> }

export interface StandingRow { rank: number; user: PublicUser; points: number; you: boolean }
export interface League { id: string; week: string; tier: Tier; endsAt: number; rows: StandingRow[]; promoteTo: number; demoteFrom: number; firstWeek: boolean }
export interface WeekResult { week: string; tier: Tier; newTier: Tier; rank: number; points: number; moved: 'up' | 'down' | 'stay' }

export interface ChallengeAnswer { u: string; value: string; ms: number }
export interface ChallengeAttempt { id: string; day: string; manual: string; items: string[]; state: 'open' | 'pending' | 'final'; accepted: number; correct?: number; points?: number; startedAt: number }

export interface FeedItem { id: string; user: PublicUser; text: string; badge: string; at: number; cheers: number; mine?: string }
export interface Coop { id: string; partner: PublicUser; endsAt: number; you: number; them: number; goal: number; reward: string; pendingOffline: number }
export interface Circle { id: string; name: string; members: PublicUser[]; coaches: PublicUser[]; goal: { target: number; done: number }; assignments: Assignment[]; quizNight: { at: number; room: string; signedUp: number }; muted: boolean; joined: boolean }
export interface Assignment { id: string; title: string; lessons: string[]; count: number; due: number; by: string; focus?: string[] }
export interface Message { id: string; user: PublicUser; text: string; at: number; mine: boolean }
export interface Report { id: string; ref: string; kind: 'message' | 'user' | 'content'; target: string; reason: string; note: string; at: number; state: 'open' | 'resolved' }
export interface MatchState { id: string; opponent: PublicUser; state: 'invited' | 'joining' | 'ready' | 'live' | 'final' | 'declined'; items: string[]; you: number; them: number; expiresAt: number }
export interface Outbox { id: string; at: number; subject: string; body: string }

export interface Backend {
  readonly mode: 'demo' | 'live'
  // auth
  session(): Session | null
  signUp(email: string, password: string, handle: string, name: string): Promise<Session>
  signIn(email: string, password: string): Promise<Session>
  signOut(): Promise<void>
  demoAccounts(): { email: string; password: string; who: string }[]
  // sync (cards, sittings, settings)
  pushSnapshot(data: Record<string, unknown>): Promise<number>
  pullSnapshot(): Promise<Snapshot | null>
  // arena
  join_league(): Promise<void>
  leave_league(): Promise<void>
  league_standings(): Promise<League | null>
  last_week_result(): Promise<WeekResult | null>
  daily_challenge(manual: string, eligible: string[]): Promise<ChallengeAttempt>
  submit_challenge(id: string, answers: ChallengeAnswer[], grade: (u: string, v: string) => boolean): Promise<ChallengeAttempt>
  challenge_state(id: string): Promise<ChallengeAttempt>
  // matches
  create_match(opponentId: string, items: string[]): Promise<MatchState>
  match_state(id: string): Promise<MatchState>
  opponent_answer(id: string, q: number, correct: string, options: string[]): Promise<{ value: string; ms: number }>
  finish_match(id: string, you: number, them: number): Promise<MatchState>
  // community
  friends(): Promise<PublicUser[]>
  search_users(q: string): Promise<PublicUser[]>
  request_connection(userId: string): Promise<void>
  friends_feed(): Promise<FeedItem[]>
  cheer(feedId: string, kind: string): Promise<void>
  coop(): Promise<Coop | null>
  my_groups(): Promise<Circle[]>
  join_group(code: string): Promise<Circle>
  leave_group(id: string): Promise<void>
  mute_group(id: string, muted: boolean): Promise<void>
  messages(groupId: string): Promise<Message[]>
  send_message(groupId: string, text: string): Promise<Message>
  block_user(userId: string): Promise<void>
  blocked(): Promise<string[]>
  report(kind: Report['kind'], target: string, reason: string, note: string): Promise<Report>
  // roles
  group_progress(groupId: string): Promise<{ user: PublicUser; sittings: number; accuracy: number; secure: number; lastActive: number }[]>
  create_assignment(groupId: string, a: Omit<Assignment, 'id' | 'by'>): Promise<Assignment>
  moderation_queue(): Promise<Report[]>
  resolve_report(id: string): Promise<void>
  // notifications
  email(subject: string, body: string): Promise<void>
  outbox(): Promise<Outbox[]>
}
