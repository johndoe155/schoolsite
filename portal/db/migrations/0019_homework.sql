-- ─────────────────────────────────────────────────────────────────────────────
-- 0019 — homework
--
-- Teachers could take attendance and record grades, but the thing that happens
-- between those two — work set, work done, work marked — had no home. A parent
-- asking "what is my child supposed to be doing this week?" got no answer from
-- the portal, and a teacher tracking who had handed what in kept it on paper.
--
-- Two tables:
--
--   homework_assignments — what was set, to which section, by whom, due when.
--     The due time is a timestamptz rather than a date on purpose: "due Friday"
--     and "due Friday 4pm" are different rules, and a school needs both.
--
--   homework_submissions — one per student per assignment. Created when the
--     student hands work in, not when the work is set, so that "has not
--     submitted" is the absence of a row rather than a row with a null in it.
--     That distinction is what makes the overdue report a simple query.
--
-- Graded feedback lives on the submission. It is deliberately nullable and
-- separate from the returned mark so that "marked, not yet returned" and
-- "returned" are distinguishable states rather than one blurry one.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS homework_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id     uuid NOT NULL,
  course_id      uuid,
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  instructions   text,
  assigned_by    uuid NOT NULL,
  assigned_on    date NOT NULL,
  due_at         timestamptz NOT NULL,
  max_score      smallint CHECK (max_score IS NULL OR max_score > 0),
  -- withdrawn: set in error or cancelled. Kept rather than deleted so the audit
  -- trail of what a class was ever asked to do stays intact.
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'withdrawn', 'closed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at >= assigned_on)
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES homework_assignments(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  body            text,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  -- 'late' is recorded at write time rather than derived at read time: the
  -- due date can be changed afterwards, and a mark awarded against a deadline
  -- that no longer exists is not defensible to a parent.
  late            boolean NOT NULL DEFAULT false,
  score           smallint CHECK (score IS NULL OR score >= 0),
  feedback        text,
  marked_by       uuid,
  marked_at       timestamptz,
  UNIQUE (assignment_id, student_user_id)
);

CREATE INDEX IF NOT EXISTS idx_hw_assign_section ON homework_assignments (section_id, due_at);
CREATE INDEX IF NOT EXISTS idx_hw_assign_due     ON homework_assignments (due_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_hw_sub_student    ON homework_submissions (student_user_id);
CREATE INDEX IF NOT EXISTS idx_hw_sub_assignment ON homework_submissions (assignment_id);
