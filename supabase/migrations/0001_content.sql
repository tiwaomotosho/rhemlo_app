-- =====================================================================
-- Rhemlo · 0001_content.sql
-- Layer 2: the manual's content, loaded from data/lessons/Lxx.json.
-- Written only by the loader (service role). Read by every signed-in user.
-- Every row id ("uid") = edition code + ':' + the id used in the JSON,
-- e.g. 'EN2627:L01.S1.P1.s2'  (Lesson 1, Section 1, Paragraph 1, sentence 2).
-- =====================================================================

create table editions (
  code            text primary key,                 -- 'EN2627'
  title           text not null,
  language        text not null default 'en',
  source_file     text not null,                    -- name of the .docx it came from
  source_sha256   text not null,                    -- fingerprint of that .docx
  imported_at     timestamptz not null default now()
);

create table lessons (
  uid             text primary key,                 -- 'EN2627:L01'
  edition_code    text not null references editions(code),
  number          smallint not null check (number between 1 and 52),
  quarter         smallint not null check (quarter between 1 and 4),
  title           text not null,                    -- exactly as printed
  date_printed    text,                             -- stored, never tested
  status          text not null default 'draft'
                  check (status in ('draft', 'approved', 'superseded')),
  content_version integer not null default 1,       -- +1 every time the approved text changes
  checksum        text not null,                    -- fingerprint of the lesson's elements
  source_json     jsonb not null,                   -- the whole Lxx.json, for audit and rebuilds
  approved_at     timestamptz,
  approved_by     text,
  unique (edition_code, number)
);

create table elements (
  uid             text primary key,                 -- 'EN2627:L01.MV', 'EN2627:L01.S1'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  position        smallint not null,                -- order inside the lesson, from 1
  type            text not null check (type in (
                    'memory_verse', 'bible_passage', 'introduction', 'outline', 'section',
                    'conclusion', 'questions', 'further_readings', 'assignment')),
  label_printed   text,                             -- 'MEMORY VERSE', 'BIBLE READING' ...
  heading_printed text,                             -- section headings only
  in_scope        boolean not null,                 -- false for further_readings, assignment
  text            text,                             -- memory verse text (no quote marks)
  printed         text,                             -- raw printed line (memory verse, passage, readings)
  version         text,                             -- 'NKJV' for memory verses
  unique (lesson_uid, position)
);

create table outline_points (
  uid             text primary key,                 -- 'EN2627:L01.OUT.1'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  position        smallint not null,
  text            text not null,                    -- exactly as printed
  number_printed  text,                             -- '1' when the manual prints '1.'
  section_uid     text references elements(uid),    -- the section this point heads
  unique (lesson_uid, position)
);

create table blocks (
  uid             text primary key,                 -- 'EN2627:L01.S1.P1', '...S2.L1', '...H1'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  element_uid     text not null references elements(uid) on delete cascade,
  position        smallint not null,
  type            text not null check (type in ('paragraph', 'list', 'subheading', 'table')),
  numbered        boolean,                          -- lists: true when the manual prints 1. 2. 3.
  text            text,                             -- subheadings only
  unique (element_uid, position)
);

create table list_items (
  uid             text primary key,                 -- 'EN2627:L01.S2.L1.i1'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  block_uid       text not null references blocks(uid) on delete cascade,
  position        smallint not null,
  number_printed  text,
  label           text,                             -- 'God is accessible'
  separator       text,                             -- ' - ' or ':'
  text            text not null,                    -- the full item as printed
  unique (block_uid, position)
);

create table table_cells (
  uid             text primary key,                 -- 'EN2627:L50.S1.T1.r2c3'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  block_uid       text not null references blocks(uid) on delete cascade,
  row_no          smallint not null,
  col_no          smallint not null,
  text            text not null,
  unique (block_uid, row_no, col_no)
);

create table questions (                            -- the two printed lesson questions
  uid             text primary key,                 -- 'EN2627:L01.Q.1'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  position        smallint not null,
  number_printed  text,
  text            text not null,
  unique (lesson_uid, position)
);

create table sentences (
  uid             text primary key,                 -- 'EN2627:L01.S1.P1.s2'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  element_uid     text not null references elements(uid) on delete cascade,
  container_uid   text not null,                    -- the paragraph, list item, question or cell it sits in
  position        smallint not null,                -- order inside its container
  seq             integer not null,                 -- order inside the whole lesson (1..n)
  text            text not null,                    -- canonical, exactly as printed
  text_norm       text not null,                    -- grading form (see normalize.py)
  word_count      smallint not null,
  marks           jsonb not null default '[]',      -- [{type:'bold'|'italic', start, end}]
  in_scope        boolean not null default true,
  unique (lesson_uid, seq)
);

create table tokens (
  sentence_uid    text not null references sentences(uid) on delete cascade,
  position        smallint not null,                -- 1-based word position in the sentence
  surface         text not null,                    -- as printed, punctuation attached: '“from'
  norm            text not null,                    -- grading form: 'from'
  kind            text not null check (kind in ('word', 'number', 'ref', 'punct')),
  capitalised     boolean not null,
  is_content      boolean not null,                 -- eligible as a single-word cloze target
  char_start      smallint not null,
  char_end        smallint not null,
  primary key (sentence_uid, position)
);

create table bible_refs (                           -- one row per distinct reference
  key             text primary key,                 -- normalised form: 'Proverbs 21:5'
  book            text not null,                    -- 'Proverbs'
  osis            text not null,                    -- 'Prov'
  segments        jsonb not null                    -- [{c1, v1, p1, c2, v2, p2}]
);

create table ref_occurrences (                      -- one row per place a reference is printed
  uid             text primary key,                 -- 'EN2627:L01.R005'
  lesson_uid      text not null references lessons(uid) on delete cascade,
  ref_key         text not null references bible_refs(key),
  role            text not null check (role in (
                    'memory_verse', 'bible_passage', 'supporting', 'further_reading')),
  in_scope        boolean not null,                 -- false for further_reading
  style           text not null check (style in ('inline', 'parenthetical')),
  printed         text not null,                    -- '1Kings 19:12' exactly as printed
  owner_uid       text not null,                    -- sentence uid, or element uid for MV/BP/FR
  char_start      smallint not null,                -- position inside the owner's text
  char_end        smallint not null
);

create table anomalies (
  id              bigint generated always as identity primary key,
  lesson_uid      text not null references lessons(uid) on delete cascade,
  type            text not null,                    -- 'unbolded_reference', 'book_number_no_space' ...
  location_uid    text not null,
  detail          text not null,
  decision        text,                             -- what you decided when reviewing
  decided_at      timestamptz
);

create table content_history (                      -- every approved version of every lesson
  lesson_uid      text not null references lessons(uid) on delete cascade,
  content_version integer not null,
  checksum        text not null,
  source_json     jsonb not null,
  note            text,
  created_at      timestamptz not null default now(),
  primary key (lesson_uid, content_version)
);

-- Every content row knows its manual, computed from its uid ('EN2627:...'). Used by the access
-- rules in 0005 (which manuals a user may read) and by any per-manual filter. Never typed by hand.
alter table elements        add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table outline_points  add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table blocks          add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table list_items      add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table table_cells     add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table questions       add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table sentences       add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table tokens          add column edition_code text generated always as (split_part(sentence_uid, ':', 1)) stored;
alter table ref_occurrences add column edition_code text generated always as (split_part(uid, ':', 1)) stored;
alter table anomalies       add column edition_code text generated always as (split_part(lesson_uid, ':', 1)) stored;
alter table content_history add column edition_code text generated always as (split_part(lesson_uid, ':', 1)) stored;

create index sentences_lesson_idx       on sentences (lesson_uid, seq);
create index tokens_content_idx         on tokens (sentence_uid) where is_content;
create index ref_occ_lesson_idx         on ref_occurrences (lesson_uid);
create index ref_occ_key_idx            on ref_occurrences (ref_key) where in_scope;
create index elements_lesson_idx        on elements (lesson_uid, position);
