import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject,
  NotFoundException, Param, Post, Query, Req, UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Request } from "express";
import { z } from "zod";
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor, SERVICE } from "../db/actor";
import {
  assignments, assignmentSubmissions, courseSections, courses, enrollments,
  guardians, sectionMaterials, sectionStaff, users, files,
} from "../db/schema";
import { Perm } from "../common/guards";
import { insertAudit } from "../common/audit";
import { enqueueAssignmentPosted } from "../notify/notify.service";

/**
 * Classwork — homework, class materials and the submissions that come back.
 *
 * The scope rule is the same one attendance and the gradebook use: a teacher
 * may only act inside a section they staff. That check is made explicitly here
 * rather than being inferred from the caller's role, because "teacher" is not
 * a scope — a teacher of JSS1A has no business posting homework to JSS3B. RLS
 * (gate 2, migration 0019) enforces the same thing again at the database.
 */

const AssignmentBody = z.object({
  section_id: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  instructions: z.string().trim().max(4000).nullish(),
  /** ISO 8601. Optional: not every piece of homework has a hard deadline. */
  due_at: z.string().datetime({ offset: true }).nullish(),
  attachment_file_id: z.string().uuid().nullish(),
});

const SubmissionBody = z.object({
  body_text: z.string().trim().max(4000).nullish(),
  file_id: z.string().uuid().nullish(),
});

const MaterialBody = z.object({
  section_id: z.string().uuid(),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).nullish(),
  url: z.string().url().max(500).nullish(),
  file_id: z.string().uuid().nullish(),
});

@Controller()
export class ClassworkController {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** Section staff only — the same predicate every write path below uses. */
  private async assertTeaches(tx: Db, userId: string, sectionId: string) {
    const [row] = await tx.select({ id: sectionStaff.id }).from(sectionStaff)
      .where(and(eq(sectionStaff.sectionId, sectionId), eq(sectionStaff.userId, userId)))
      .limit(1);
    if (!row) throw new ForbiddenException({ code: "outside_section_scope",
      detail: "You do not teach this section." });
  }

  /**
   * May this actor read this pupil's classwork?
   *
   * The row-level policies already stop another family's rows from coming
   * back, but "no rows" is not an answer a parent can act on: asking for the
   * wrong child returned an empty homework list that looked exactly like a
   * child with no homework. Worse, it made the defence invisible — a broken
   * policy would have leaked silently. So the link is checked explicitly and
   * the answer is 403, the same as the timetable does.
   */
  private async assertMayReadStudent(tx: Db, actorUserId: string, actorRole: string, studentId: string) {
    if (actorUserId === studentId) return;
    const [link] = await tx.select({ id: guardians.id }).from(guardians)
      .where(and(eq(guardians.studentUserId, studentId),
        eq(guardians.userId, actorUserId),
        eq(guardians.canView, true),
        isNotNull(guardians.verifiedAt), isNull(guardians.endedAt))).limit(1);
    if (!link) throw new ForbiddenException({ code: "not_your_record" });
  }

  private async assertEnrolled(tx: Db, studentId: string, sectionId: string) {
    const [row] = await tx.select({ id: enrollments.id }).from(enrollments)
      .where(and(eq(enrollments.sectionId, sectionId),
        eq(enrollments.studentUserId, studentId), eq(enrollments.status, "enrolled")))
      .limit(1);
    if (!row) throw new ForbiddenException({ code: "not_enrolled" });
  }

  /* ── Materials ──────────────────────────────────────────────────────────── */

  @Get("sections/:id/materials")
  @Perm("gradebook:read")
  async listMaterials(@Req() req: Request, @Param("id") sectionId: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select({
        id: sectionMaterials.id, title: sectionMaterials.title,
        description: sectionMaterials.description, url: sectionMaterials.url,
        fileId: sectionMaterials.fileId, createdAt: sectionMaterials.createdAt,
        filename: files.filename, bytes: files.bytes, mimeType: files.mimeType,
        createdByName: users.displayName,
      }).from(sectionMaterials)
        .leftJoin(files, eq(files.id, sectionMaterials.fileId))
        .leftJoin(users, eq(users.id, sectionMaterials.createdBy))
        .where(eq(sectionMaterials.sectionId, sectionId))
        .orderBy(desc(sectionMaterials.createdAt));
      return { data: rows };
    });
  }

  @Post("materials")
  @Perm("gradebook:write")
  async createMaterial(@Req() req: Request, @Body() body: unknown) {
    const parsed = MaterialBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    if (!parsed.data.file_id && !parsed.data.url) {
      throw new UnprocessableEntityException({ code: "material_needs_content",
        detail: "Attach a file or give a link." });
    }
    const p = req.principal!;
    const out = await withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertTeaches(tx, p.userId, parsed.data.section_id);
      const [row] = await tx.insert(sectionMaterials).values({
        sectionId: parsed.data.section_id, title: parsed.data.title,
        description: parsed.data.description ?? null, url: parsed.data.url ?? null,
        fileId: parsed.data.file_id ?? null, createdBy: p.userId,
      }).returning();
      await insertAudit(tx, { actorUserId: p.userId, action: "material.created",
        entityType: "section", entityId: parsed.data.section_id,
        after: { title: row.title, hasFile: Boolean(row.fileId) }, ip: req.ip });
      return row;
    });
    // Fire-and-forget notification: a new resource is worth telling the class
    // about, but a mail failure must never fail the upload the teacher just did.
    void this.notifyMaterial(out, p.userId).catch(() => {});
    return out;
  }

  private async notifyMaterial(row: { id: string; sectionId: string; title: string }, actorId: string) {
    await this.notifySection(actorId, row.sectionId, (studentUserId) =>
      enqueueAssignmentPosted(this.db, {
        studentUserId, sectionId: row.sectionId, title: row.title, kind: "material",
      }));
  }

  /**
   * Fan a notification out over a section's enrolled pupils.
   *
   * Read as SERVICE, not as the acting teacher: `enrollments` RLS lets a
   * teacher see the pupils of sections they staff, but `enqueue` also writes a
   * notification row for each guardian, and a teacher cannot read a guardian's
   * inbox row. Doing this as SERVICE keeps the write legal while the scope check
   * above (assertTeaches) has already established the teacher's authority.
   */
  private async notifySection(
    _actorId: string, sectionId: string,
    fn: (studentUserId: string) => Promise<void>,
  ) {
    const pupils = await withActor(this.db, SERVICE, (tx) =>
      tx.select({ id: enrollments.studentUserId }).from(enrollments)
        .where(and(eq(enrollments.sectionId, sectionId), eq(enrollments.status, "enrolled"))));
    for (const p of pupils) await fn(p.id);
  }

  @Delete("materials/:id")
  @Perm("gradebook:write")
  async deleteMaterial(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [row] = await tx.select().from(sectionMaterials).where(eq(sectionMaterials.id, id)).limit(1);
      if (!row) throw new NotFoundException({ code: "not_found" });
      await this.assertTeaches(tx, p.userId, row.sectionId);
      await tx.delete(sectionMaterials).where(eq(sectionMaterials.id, id));
      await insertAudit(tx, { actorUserId: p.userId, action: "material.deleted",
        entityType: "material", entityId: id, before: { title: row.title }, ip: req.ip });
      return { ok: true as const };
    });
  }

  /* ── Assignments (homework) ─────────────────────────────────────────────── */

  @Get("sections/:id/assignments")
  @Perm("gradebook:read")
  async listForSection(@Req() req: Request, @Param("id") sectionId: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select({
        id: assignments.id, title: assignments.title, instructions: assignments.instructions,
        dueAt: assignments.dueAt, attachmentFileId: assignments.attachmentFileId,
        createdAt: assignments.createdAt, createdBy: assignments.createdBy,
        filename: files.filename,
        submissionCount: sql<number>`(
          SELECT count(*)::int FROM assignment_submissions s WHERE s.assignment_id = ${assignments.id})`,
      }).from(assignments)
        .leftJoin(files, eq(files.id, assignments.attachmentFileId))
        .where(eq(assignments.sectionId, sectionId))
        .orderBy(desc(assignments.createdAt));
      return { data: rows };
    });
  }

  @Post("assignments")
  @Perm("gradebook:write")
  async createAssignment(@Req() req: Request, @Body() body: unknown) {
    const parsed = AssignmentBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const p = req.principal!;
    const out = await withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertTeaches(tx, p.userId, parsed.data.section_id);
      const [row] = await tx.insert(assignments).values({
        sectionId: parsed.data.section_id, title: parsed.data.title,
        instructions: parsed.data.instructions ?? null,
        dueAt: parsed.data.due_at ? new Date(parsed.data.due_at) : null,
        attachmentFileId: parsed.data.attachment_file_id ?? null,
        createdBy: p.userId,
      }).returning();
      await insertAudit(tx, { actorUserId: p.userId, action: "assignment.created",
        entityType: "assignment", entityId: row.id,
        after: { title: row.title, sectionId: row.sectionId }, ip: req.ip });
      return row;
    });
    void this.notifyAssignment(out, p.userId).catch(() => {});
    return out;
  }

  private async notifyAssignment(
    row: { id: string; sectionId: string; title: string; dueAt: Date | null },
    actorId: string,
  ) {
    await this.notifySection(actorId, row.sectionId, (studentUserId) =>
      enqueueAssignmentPosted(this.db, {
        studentUserId, sectionId: row.sectionId, title: row.title, kind: "homework",
        dueAt: row.dueAt ? row.dueAt.toISOString() : null,
      }));
  }

  @Delete("assignments/:id")
  @Perm("gradebook:write")
  async deleteAssignment(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [row] = await tx.select().from(assignments).where(eq(assignments.id, id)).limit(1);
      if (!row) throw new NotFoundException({ code: "not_found" });
      await this.assertTeaches(tx, p.userId, row.sectionId);
      // Submissions cascade (FK ON DELETE CASCADE) — a deleted assignment takes
      // its hand-ins with it, which is what "delete" means to a teacher.
      await tx.delete(assignments).where(eq(assignments.id, id));
      await insertAudit(tx, { actorUserId: p.userId, action: "assignment.deleted",
        entityType: "assignment", entityId: id, before: { title: row.title }, ip: req.ip });
      return { ok: true as const };
    });
  }

  /** The teacher's view: every hand-in for one assignment. */
  @Get("assignments/:id/submissions")
  @Perm("gradebook:read")
  async submissions(@Req() req: Request, @Param("id") assignmentId: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found" });
      const submitted = await tx.select({
        id: assignmentSubmissions.id, studentUserId: assignmentSubmissions.studentUserId,
        bodyText: assignmentSubmissions.bodyText, fileId: assignmentSubmissions.fileId,
        submittedAt: assignmentSubmissions.submittedAt, status: assignmentSubmissions.status,
        studentName: users.displayName, filename: files.filename,
      }).from(assignmentSubmissions)
        .leftJoin(users, eq(users.id, assignmentSubmissions.studentUserId))
        .leftJoin(files, eq(files.id, assignmentSubmissions.fileId))
        .where(eq(assignmentSubmissions.assignmentId, assignmentId))
        .orderBy(asc(assignmentSubmissions.submittedAt));
      const roster = await tx.select({
        studentUserId: enrollments.studentUserId, displayName: users.displayName,
        admissionNo: sql<string>`coalesce((SELECT admission_no FROM students st WHERE st.user_id = ${enrollments.studentUserId}), '')`,
      }).from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentUserId))
        .where(and(eq(enrollments.sectionId, a.sectionId), eq(enrollments.status, "enrolled")))
        .orderBy(asc(users.displayName));
      const byStudent = new Map(submitted.map((s) => [s.studentUserId, s]));
      return {
        assignment: { id: a.id, title: a.title, dueAt: a.dueAt, sectionId: a.sectionId },
        data: roster.map((r) => ({
          ...r,
          submission: byStudent.get(r.studentUserId) ?? null,
        })),
      };
    });
  }

  /**
   * The pupil's/parent's view: every assignment across the sections they are
   * enrolled in / their child is enrolled in, with their own submission state.
   */
  /* No @Perm: this route serves BOTH a pupil (self:read) and a guardian
     (family:read), and the capability names differ. Authority is decided
     instead by the ownership check below plus RLS on enrollments, which only
     exposes a child to a verified guardian. */
  @Get("student/assignments")
  async mineForStudent(@Req() req: Request, @Query("student") studentQuery?: string) {
    const p = req.principal!;
    // A parent reads their child's list; the guardian link is verified by RLS
    // (enrollments policy) as well as here.
    const studentId = studentQuery && p.activeRole === "parent" ? studentQuery : p.userId;
    if (studentId !== p.userId && p.activeRole !== "parent") {
      throw new ForbiddenException({ code: "not_your_record" });
    }
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertMayReadStudent(tx, p.userId, p.activeRole, studentId);
      const rows = await tx.select({
        id: assignments.id, title: assignments.title, instructions: assignments.instructions,
        dueAt: assignments.dueAt, createdAt: assignments.createdAt,
        sectionId: assignments.sectionId, sectionName: courseSections.name,
        courseTitle: courses.title, attachmentFileId: assignments.attachmentFileId,
        filename: files.filename,
        submissionId: assignmentSubmissions.id,
        submissionText: assignmentSubmissions.bodyText,
        submissionFileId: assignmentSubmissions.fileId,
        submittedAt: assignmentSubmissions.submittedAt,
        submissionStatus: assignmentSubmissions.status,
      }).from(assignments)
        .innerJoin(enrollments, and(
          eq(enrollments.sectionId, assignments.sectionId),
          eq(enrollments.studentUserId, studentId),
          eq(enrollments.status, "enrolled")))
        .innerJoin(courseSections, eq(courseSections.id, assignments.sectionId))
        .leftJoin(courses, eq(courses.id, courseSections.courseId))
        .leftJoin(files, eq(files.id, assignments.attachmentFileId))
        .leftJoin(assignmentSubmissions, and(
          eq(assignmentSubmissions.assignmentId, assignments.id),
          eq(assignmentSubmissions.studentUserId, studentId)))
        .orderBy(asc(assignments.dueAt));
      return { data: rows };
    });
  }

  /** Materials across every section the pupil is in. */
  /* Both roles again — see the note on student/assignments. */
  @Get("student/materials")
  async materialsForStudent(@Req() req: Request, @Query("student") studentQuery?: string) {
    const p = req.principal!;
    const studentId = studentQuery && p.activeRole === "parent" ? studentQuery : p.userId;
    if (studentId !== p.userId && p.activeRole !== "parent") {
      throw new ForbiddenException({ code: "not_your_record" });
    }
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertMayReadStudent(tx, p.userId, p.activeRole, studentId);
      const rows = await tx.select({
        id: sectionMaterials.id, title: sectionMaterials.title,
        description: sectionMaterials.description, url: sectionMaterials.url,
        fileId: sectionMaterials.fileId, filename: files.filename, bytes: files.bytes,
        createdAt: sectionMaterials.createdAt, sectionId: sectionMaterials.sectionId,
        sectionName: courseSections.name,
      }).from(sectionMaterials)
        .innerJoin(enrollments, and(
          eq(enrollments.sectionId, sectionMaterials.sectionId),
          eq(enrollments.studentUserId, studentId),
          eq(enrollments.status, "enrolled")))
        .innerJoin(courseSections, eq(courseSections.id, sectionMaterials.sectionId))
        .leftJoin(files, eq(files.id, sectionMaterials.fileId))
        .orderBy(desc(sectionMaterials.createdAt));
      return { data: rows };
    });
  }

  /**
   * POST /assignments/:id/submissions — hand homework in.
   *
   * Idempotent by construction: the UNIQUE (assignment, student) index means a
   * pupil re-submitting replaces their previous attempt instead of creating a
   * second one. That also makes an offline replay (the PWA queue) safe.
   */
  /* Students only, enforced in the handler (a parent is read-only anyway). */
  @Post("assignments/:id/submissions")
  async submit(@Req() req: Request, @Param("id") assignmentId: string, @Body() body: unknown) {
    const parsed = SubmissionBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const p = req.principal!;
    if (p.activeRole !== "student") {
      throw new ForbiddenException({ code: "students_only",
        detail: "Only the pupil can hand work in." });
    }
    if (!parsed.data.body_text && !parsed.data.file_id) {
      throw new BadRequestException({ code: "empty_submission",
        detail: "Write something or attach a file." });
    }
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [a] = await tx.select().from(assignments).where(eq(assignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found" });
      await this.assertEnrolled(tx, p.userId, a.sectionId);

      const [existing] = await tx.select().from(assignmentSubmissions)
        .where(and(eq(assignmentSubmissions.assignmentId, assignmentId),
          eq(assignmentSubmissions.studentUserId, p.userId))).limit(1);
      if (existing) {
        const [row] = await tx.update(assignmentSubmissions)
          .set({
            bodyText: parsed.data.body_text ?? null,
            fileId: parsed.data.file_id ?? null,
            submittedAt: new Date(), status: "submitted",
          })
          .where(eq(assignmentSubmissions.id, existing.id)).returning();
        await insertAudit(tx, { actorUserId: p.userId, action: "submission.resubmitted",
          entityType: "assignment", entityId: assignmentId, ip: req.ip });
        return row;
      }
      const [row] = await tx.insert(assignmentSubmissions).values({
        assignmentId, studentUserId: p.userId,
        bodyText: parsed.data.body_text ?? null, fileId: parsed.data.file_id ?? null,
      }).returning();
      await insertAudit(tx, { actorUserId: p.userId, action: "submission.created",
        entityType: "assignment", entityId: assignmentId, ip: req.ip });
      return row;
    });
  }

  /** Which sections can this caller post homework/materials to? */
  @Get("classwork/my-sections")
  @Perm("academics:read")
  async mySections(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select({
        id: courseSections.id, name: courseSections.name,
        courseCode: courses.code, courseTitle: courses.title,
      }).from(courseSections)
        .innerJoin(courses, eq(courses.id, courseSections.courseId))
        .innerJoin(sectionStaff, and(
          eq(sectionStaff.sectionId, courseSections.id), eq(sectionStaff.userId, p.userId)))
        .orderBy(asc(courseSections.name));
      return { data: rows };
    });
  }
}
