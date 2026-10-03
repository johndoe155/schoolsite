-- ─────────────────────────────────────────────────────────────────────────────
-- 0020 — families can answer.
--
-- Phase 1 decided that parents were read-only in a message thread: a teacher
-- could write about a pupil, the guardian could read it, and that was the end
-- of the conversation. The portal therefore had a "Messages" section that a
-- parent could not use to answer a question — the school's own teachers were
-- asking things like "can you confirm Sola's pickup?" into a channel with no
-- reply path. It also meant that a guardian who could not reach the school by
-- phone, or who preferred to have the exchange in writing, had to give up.
--
-- Replies are what this migration adds, and only replies:
--
--   * guardians of the pupil the thread is about may post to it;
--   * the thread's authoring teacher still posts as before;
--   * the guardian link must be verified, active and can_view — the same
--     condition the SELECT policy already uses, so a guardian who can read a
--     thread can answer in it and nobody else can;
--   * nothing else about thread visibility changes. A parent-reply does not
--     become visible to teachers other than the one who opened the thread, and
--     pupils still cannot see threads (that stays a staff↔family channel).
--
-- Closing a thread is still the teaching side's move: a reply to a closed
-- thread is refused, which is why "close" remains teacher-only.
--
-- Capability: 'messaging:reply' instead of the teacher-only 'messaging:write',
-- so the permission itself records who may do this. The parent read-only
-- invariant in PermGuard still blocks every other mutating endpoint; the
-- handler opts out explicitly with @ParentWrite(), the same narrow exception
-- pattern used for paying a fee or confirming one's own guardian link.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

/* Roles are seeded after migrations on a fresh database (seedBase), so on a
   new DB this insert matches nothing and the permissions arrive from seed.ts.
   On an existing DB the roles are already there and the grants land here.
   Same conditional pattern as 0005/0007. */
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
INSERT INTO role_permissions (role_code, permission)
  SELECT r.code, 'messaging:reply'
  FROM roles r
  WHERE r.code IN ('teacher', 'parent')
  ON CONFLICT DO NOTHING;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;

/* Replace the insert policy: the guard is "the actor is part of this
   conversation", not "the actor wrote the thread".
   DROP + CREATE because PostgreSQL has no CREATE OR REPLACE POLICY; the
   migration is append-only, and re-running it (it runs once, tracked by
   schema_migrations) would be idempotent anyway. */
DROP POLICY msgs_ins ON messages;
CREATE POLICY msgs_ins ON messages FOR INSERT WITH CHECK (
  sender_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  AND EXISTS (SELECT 1 FROM message_threads t
              WHERE t.id = messages.thread_id
                AND (t.created_by = nullif(current_setting('app.user_id', true),'')::uuid
                     OR is_guardian_of(t.student_user_id)))
);

COMMIT;
