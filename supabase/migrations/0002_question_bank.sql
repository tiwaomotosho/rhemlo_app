-- =====================================================================
-- Rhemlo · 0002_question_bank.sql
-- Layer 3: questions generated from Layer 2. Written only by the item
-- generator (service role). Read by every signed-in user.
-- =====================================================================

create table items (
  uid               text primary key,               -- 'I-' + first 16 hex of sha1(type|target|variant|generator)
  id                bigint generated always as identity unique,  -- compact key used by progress tables
  edition_code      text generated always as (split_part(lesson_uid, ':', 1)) stored,
  lesson_uid        text not null references lessons(uid) on delete cascade,
  type              text not null check (type ~ '^Q[0-9]{2}$'),   -- Q01 .. Q24 (PRD §9.3)
  direction         text check (direction ~ '^D[1-9]$' or direction = 'ALL'),
  formats           text[] not null,                -- {'typed'} | {'mcq'} | {'typed','mcq'}
  target_kind       text not null check (target_kind in (
                      'sentence', 'token', 'list', 'list_item', 'outline', 'element',
                      'ref_occurrence', 'question', 'lesson')),
  target_uid        text not null,                  -- uid of the thing being tested
  variant           text not null default '',       -- e.g. token position for a cloze
  prompt            jsonb not null,                 -- what the screen shows (see PRD §12.10)
  answer            jsonb not null,                 -- canonical answer + accepted forms
  sibling_key       text not null,                  -- items sharing it are not shown the same day
  tags              text[] not null default '{}',   -- 'name', 'high_risk_spelling', 'trap:role_swap' ...
  generator_version text not null,                  -- 'gen-1.0'
  content_version   integer not null,               -- lesson content_version it was built from
  active            boolean not null default true,  -- false when retired by a content change
  created_at        timestamptz not null default now(),
  unique (type, target_uid, variant, generator_version)
);

create table item_distractors (                     -- wrong options for multiple choice
  item_uid          text not null references items(uid) on delete cascade,
  edition_code      text not null,                  -- the item's manual (filled by the loader)
  position          smallint not null,
  text              text not null,
  pattern           text not null check (pattern in (
                      'same_ref_other_lesson', 'adjacent_verse', 'look_alike_spelling',
                      'sibling_outline_point', 'sibling_list_item', 'manual_synonym',
                      'confusion_cluster', 'own_past_error', 'role_swap', 'absent_item', 'same_lesson_word',
                      'order_swap', 'same_lesson_sentence')),
  source_uid        text,                           -- where the distractor came from
  primary key (item_uid, position)
);

create index items_lesson_idx  on items (lesson_uid) where active;
create index items_edition_idx on items (edition_code) where active;
create index items_type_idx    on items (type) where active;
create index items_sibling_idx on items (sibling_key);
