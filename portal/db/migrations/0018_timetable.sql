-- ─────────────────────────────────────────────────────────────────────────────
-- 0018 — the school timetable
--
-- The portal could record attendance, grades and fees, but nothing said WHEN
-- anything happened. A teacher had no way to see their own week, an admin had
-- no way to publish one, and "which room is JSS2 Maths in on Tuesday period 3"
-- was a question only the office could answer.
--
-- Two tables, deliberately:
--
--   timetable_periods — the skeleton of the week for one term: weekday, period
--                       number, start and end clock times. Periods are a
--                       property of the TERM, not the section, because a school
--                       runs one bell schedule; sections slot into it.
--
--   timetable_slots   — what occupies a given period: a section, optionally a
--                       course, a teacher and a room. A period with no slot row
--                       is a free period, which is a real state and must be
--                       representable rather than encoded as a placeholder.
--
-- Clash detection is enforced in the application, not by a constraint, because
-- "the same teacher in two places" spans two rows. The unique index below only
-- stops the outright duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS timetable_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id       uuid NOT NULL,
  weekday       smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period_index  smallint NOT NULL CHECK (period_index > 0),
  label         text,
  starts_at     time NOT NULL,
  ends_at       time NOT NULL,
  -- 0 = a normal taught period; 1 = break/lunch/assembly, which no section can
  -- be scheduled into. Modelling it rather than leaving a gap means the week
  -- renders honestly and the bell schedule is data, not folklore.
  is_break      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  UNIQUE (term_id, weekday, period_index)
);

CREATE TABLE IF NOT EXISTS timetable_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id        uuid NOT NULL REFERENCES timetable_periods(id) ON DELETE CASCADE,
  section_id       uuid NOT NULL,
  course_id        uuid,
  teacher_user_id  uuid,
  room             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- One section cannot be in two places at once.
  UNIQUE (period_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_tt_periods_term    ON timetable_periods (term_id, weekday, period_index);
CREATE INDEX IF NOT EXISTS idx_tt_slots_section   ON timetable_slots (section_id);
CREATE INDEX IF NOT EXISTS idx_tt_slots_teacher   ON timetable_slots (teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_tt_slots_period    ON timetable_slots (period_id);

-- The API reads through the RLS role, so the tables need the same grants the
-- rest of the schema has; without them every query fails at the permission
-- layer rather than returning an empty timetable.
GRANT SELECT, INSERT, UPDATE, DELETE ON timetable_periods TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON timetable_slots   TO portal_app;
