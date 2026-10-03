-- ─────────────────────────────────────────────────────────────────────────────
-- 0021 — families can open a thread.
--
-- 0020 gave guardians a reply. This one lets them start the conversation: a
-- parent who needs to raise something about their child ("she is being picked
-- on at the gate", "we will be away next week") had no way to open a thread in
-- the portal at all. The only route into the system was for a teacher to
-- happen to write first.
--
-- The rules, deliberately narrow:
--
--   * only a VERIFIED, active, can_view guardian of that pupil may open a
--     thread about them — the same condition that lets them read one;
--   * the thread is created against a teacher who actually teaches the pupil;
--     the API checks that, and the row is stamped with that teacher as its
--     author so it appears in exactly the one teacher's inbox it belongs to;
--   * no other teacher gains visibility. A parent-started thread is not
--     broadcast to the whole staffroom.
--
-- Note what this does NOT change: message_threads is still invisible to pupils
-- (threads_sel), and closing a thread is still the teaching side's move.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

DROP POLICY threads_ins ON message_threads;
CREATE POLICY threads_ins ON message_threads FOR INSERT WITH CHECK (
  is_teacher_of(student_user_id)
  OR is_guardian_of(student_user_id)
  OR current_setting('app.role', true) = 'service'
);

COMMIT;
