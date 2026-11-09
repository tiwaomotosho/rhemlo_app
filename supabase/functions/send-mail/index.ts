// Supabase Edge Function (Deno): sends the emails the database queued in email_outbox
// (guardian consent requests, weekly reports). Sign-in and confirmation emails are sent by
// Supabase Auth through the SMTP settings, not by this function.
//
// Deploy:   npx supabase functions deploy send-mail --no-verify-jwt
// Secrets:  npx supabase secrets set RESEND_API_KEY=... MAIL_FROM="Rhemlo <no-reply@mail.rhemlo.app>" CRON_SECRET=...
// Schedule: every 5 minutes from pg_cron + pg_net (see supabase/README.md), with header x-cron-secret.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions automatically.

const URL_ = Deno.env.get('SUPABASE_URL')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('MAIL_FROM') ?? 'Rhemlo <no-reply@rhemlo.app>'
const SECRET = Deno.env.get('CRON_SECRET')

const db = (path: string, init: RequestInit = {}) => fetch(`${URL_}/rest/v1/${path}`, {
  ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers ?? {}) } })

Deno.serve(async req => {
  if (SECRET && req.headers.get('x-cron-secret') !== SECRET) return new Response('forbidden', { status: 403 })
  const r = await db('email_outbox?sent_at=is.null&error=is.null&order=created_at.asc&limit=50&select=id,to_address,subject,body')
  if (!r.ok) return new Response(`outbox read failed: ${r.status}`, { status: 500 })
  const rows = await r.json() as { id: number; to_address: string; subject: string; body: string }[]
  let sent = 0, failed = 0
  for (const m of rows) {
    const res = await fetch('https://api.resend.com/emails', { method: 'POST',
      headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [m.to_address], subject: m.subject, text: m.body }) })
    const patch = res.ok ? { sent_at: new Date().toISOString() } : { error: `${res.status} ${(await res.text()).slice(0, 300)}` }
    await db(`email_outbox?id=eq.${m.id}`, { method: 'PATCH', body: JSON.stringify(patch) })
    if (res.ok) sent++; else failed++
  }
  return Response.json({ sent, failed })
})
