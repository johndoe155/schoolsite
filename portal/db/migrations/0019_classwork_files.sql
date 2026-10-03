-- ─────────────────────────────────────────────────────────────────────────────
-- 0019 — classwork: homework, materials, and the files behind both.
--
-- Four gaps this closes, all of which the school hits in week one:
--
--   files                — the portal could send an email but could not store
--                          an attachment. Nothing in the schema held bytes, so
--                          "share the revision sheet" was impossible.
--   section_materials    — a teacher's resources for a class (notes, past
--                          papers, reading) attached to a section, visible to
--                          the pupils enrolled in it and their guardians.
--   assignments          — homework with a title, instructions, a due date and
--                          an optional attachment.
--   assignment_submissions — what a pupil hands in: a note, a file, or both.
--                          One row per pupil per assignment (UNIQUE), so
--                          re-submitting updates rather than duplicates.
--
-- Files are never public. They live on a private volume outside the web root
-- and are only served through GET /api/v1/files/:id, which re-checks scope on
-- every request. RLS is the second gate, as everywhere else in this schema.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  /* The name the school sees. Stored names on disk are random and unrelated,
     so a school's "JSS2 maths homework.pdf" can never be overwritten and a
     traversal attempt never reaches the filesystem. */
  filename      text NOT NULL,
  stored_name   text NOT NULL UNIQUE,
  mime_type     text NOT NULL,
  bytes         bigint NOT NULL CHECK (bytes > 0),
  sha256        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS section_materials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  uuid NOT NULL,
  title       text NOT NULL,
  description text,
  /* A material is a file, a link, or both. A link-only material (a YouTube
     revision video, an external reading) is a real thing and does not need an
     uploaded file to exist. */
  url         text,
  file_id     uuid REFERENCES files(id) ON DELETE SET NULL,
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (file_id IS NOT NULL OR url IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id         uuid NOT NULL,
  title              text NOT NULL,
  instructions       text,
  due_at             timestamptz,
  attachment_file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  body_text       text,
  file_id         uuid REFERENCES files(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'submitted'
                    CHECK (status IN ('submitted','returned')),
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (body_text IS NOT NULL OR file_id IS NOT NULL),
  UNIQUE (assignment_id, student_user_id)
);

-- Messaging could carry text only. A teacher sending a notice with the term
-- timetable attached is the single most-requested thing about messages.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_file_id uuid
  REFERENCES files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_files_owner        ON files (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_materials_section  ON section_materials (section_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_section     ON assignments (section_id, due_at);
CREATE INDEX IF NOT EXISTS idx_sub_assignment     ON assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_sub_student        ON assignment_submissions (student_user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Helper: may the current actor read this file? A file is readable by its
-- uploader, by any admin, by section staff / enrolled pupils / their guardians
-- when it is attached to a class material, an assignment or a submission, and
-- by the participants of a thread it was attached to.
--
-- Defined here (not in 0001) because it reads the four tables above. It reads
-- no table it protects, so there is no policy recursion.
CREATE FUNCTION can_read_file(fid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM section_materials m
     WHERE m.file_id = fid
       AND (is_section_staff(m.section_id) OR is_admin_role()
            OR EXISTS (SELECT 1 FROM enrollments e
                        WHERE e.section_id = m.section_id AND e.status = 'enrolled'
                          AND (e.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
                               OR is_guardian_of(e.student_user_id))))
  ) OR EXISTS (
    SELECT 1 FROM assignments a
     WHERE a.attachment_file_id = fid
       AND (is_section_staff(a.section_id) OR is_admin_role()
            OR EXISTS (SELECT 1 FROM enrollments e
                        WHERE e.section_id = a.section_id AND e.status = 'enrolled'
                          AND (e.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
                               OR is_guardian_of(e.student_user_id))))
  ) OR EXISTS (
    SELECT 1 FROM assignment_submissions s
      JOIN assignments a2 ON a2.id = s.assignment_id
     WHERE s.file_id = fid
       AND (s.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
            OR is_section_staff(a2.section_id) OR is_admin_role()
            OR is_guardian_of(s.student_user_id))
  ) OR EXISTS (
    SELECT 1 FROM messages msg
      JOIN message_threads t ON t.id = msg.thread_id
     WHERE msg.attachment_file_id = fid
       AND (t.created_by = nullif(current_setting('app.user_id', true),'')::uuid
            OR is_guardian_of(t.student_user_id) OR is_admin_role())
  )
$$;

ALTER TABLE files                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE files                  FORCE  ROW LEVEL SECURITY;
ALTER TABLE section_materials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_materials      FORCE  ROW LEVEL SECURITY;
ALTER TABLE assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments            FORCE  ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_submissions FORCE  ROW LEVEL SECURITY;

-- files: the uploader and any admin can see the row; everyone else only if it
-- is attached to something they are entitled to. Writes belong to the uploader.
CREATE POLICY files_sel ON files FOR SELECT USING (
  owner_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR is_admin_role() OR can_read_file(id)
  OR current_setting('app.role', true) = 'service');
CREATE POLICY files_ins ON files FOR INSERT WITH CHECK (
  owner_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR current_setting('app.role', true) = 'service');
-- Deleting a file row is for the software that stored it (retention/erasure);
-- a teacher removing a material detaches it instead of destroying history.
CREATE POLICY files_del ON files FOR DELETE USING (
  current_setting('app.role', true) IN ('super_admin','school_admin','service'));

-- materials: section members read; section staff and admins write.
CREATE POLICY mat_sel ON section_materials FOR SELECT USING (
  is_section_staff(section_id) OR is_admin_role()
  OR EXISTS (SELECT 1 FROM enrollments e
              WHERE e.section_id = section_materials.section_id AND e.status = 'enrolled'
                AND (e.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
                     OR is_guardian_of(e.student_user_id)))
  OR current_setting('app.role', true) = 'service');
CREATE POLICY mat_wr ON section_materials FOR ALL USING (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'))
  WITH CHECK (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'));

-- assignments: same shape as materials.
CREATE POLICY assign_sel ON assignments FOR SELECT USING (
  is_section_staff(section_id) OR is_admin_role()
  OR EXISTS (SELECT 1 FROM enrollments e
              WHERE e.section_id = assignments.section_id AND e.status = 'enrolled'
                AND (e.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
                     OR is_guardian_of(e.student_user_id)))
  OR current_setting('app.role', true) = 'service');
CREATE POLICY assign_wr ON assignments FOR ALL USING (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'))
  WITH CHECK (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'));

-- submissions: a pupil sees and writes their own; staff see their section's;
-- guardians see their child's; admins see all.
CREATE POLICY sub_sel ON assignment_submissions FOR SELECT USING (
  student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR is_guardian_of(student_user_id) OR is_admin_role()
  OR EXISTS (SELECT 1 FROM assignments a
              WHERE a.id = assignment_submissions.assignment_id AND is_section_staff(a.section_id))
  OR current_setting('app.role', true) = 'service');
CREATE POLICY sub_ins ON assignment_submissions FOR INSERT WITH CHECK (
  student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR current_setting('app.role', true) = 'service');
CREATE POLICY sub_upd ON assignment_submissions FOR UPDATE USING (
  student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR EXISTS (SELECT 1 FROM assignments a
              WHERE a.id = assignment_submissions.assignment_id AND is_section_staff(a.section_id))
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'));
CREATE POLICY sub_del ON assignment_submissions FOR DELETE USING (
  EXISTS (SELECT 1 FROM assignments a
           WHERE a.id = assignment_submissions.assignment_id AND is_section_staff(a.section_id))
  OR current_setting('app.role', true) IN ('super_admin','school_admin','service'));

GRANT SELECT, INSERT, UPDATE, DELETE ON files                  TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON section_materials      TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignments            TO portal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON assignment_submissions TO portal_app;

-- ── The timetable finally gets gate 2 ────────────────────────────────────────
-- 0018 shipped the timetable without RLS: the app layer checked capabilities,
-- but the schema's second authorization gate (ADR-003) was simply absent, so a
-- bug in a future query would have exposed every section's week to every
-- signed-in user. Same rules as the app: the bell schedule is school-wide
-- reference data; a slot belongs to its section, its teacher and its pupils.
ALTER TABLE timetable_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_periods FORCE  ROW LEVEL SECURITY;
ALTER TABLE timetable_slots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots   FORCE  ROW LEVEL SECURITY;

CREATE POLICY tt_periods_sel ON timetable_periods FOR SELECT USING (
  current_setting('app.role', true) <> '');
CREATE POLICY tt_periods_wr ON timetable_periods FOR ALL USING (
  current_setting('app.role', true) IN ('super_admin','school_admin','registrar','service'))
  WITH CHECK (
  current_setting('app.role', true) IN ('super_admin','school_admin','registrar','service'));

CREATE POLICY tt_slots_sel ON timetable_slots FOR SELECT USING (
  is_admin_role() OR is_section_staff(section_id)
  OR teacher_user_id = nullif(current_setting('app.user_id', true),'')::uuid
  OR EXISTS (SELECT 1 FROM enrollments e
              WHERE e.section_id = timetable_slots.section_id AND e.status = 'enrolled'
                AND (e.student_user_id = nullif(current_setting('app.user_id', true),'')::uuid
                     OR is_guardian_of(e.student_user_id)))
  OR current_setting('app.role', true) = 'service');
CREATE POLICY tt_slots_wr ON timetable_slots FOR ALL USING (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','registrar','service'))
  WITH CHECK (
  is_section_staff(section_id)
  OR current_setting('app.role', true) IN ('super_admin','school_admin','registrar','service'));


-- ── An existing deployment needs the permission too ─────────────────────────
-- seedBase() only runs on an empty database, so a live school would not pick
-- this up from the seed: an assistant would still 403 on "My timetable".
-- Temporarily drop RLS so the migration runner (table owner) can INSERT.
ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
INSERT INTO role_permissions (role_code, permission)
  SELECT 'teacher_assistant', 'schedule:read'
  WHERE EXISTS (SELECT 1 FROM roles WHERE code = 'teacher_assistant')
  ON CONFLICT DO NOTHING;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;

COMMIT;
