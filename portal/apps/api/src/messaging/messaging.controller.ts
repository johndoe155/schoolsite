import {
  Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

/* A family-started thread: the guardian picks the teacher, so the roster of
   who may be picked has to be resolved without the guardian being able to read
   the staff directory (users_sel does not let a parent read a teacher's row —
   that row holds their email, MFA state and preferences). The list is built
   under the SERVICE actor inside an endpoint that has already proven the
   caller is that child's guardian, and it returns names and subjects only. */
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor, SERVICE } from "../db/actor";
import {
  messageThreads, messages, users, sectionStaff, enrollments, files, guardians,
  courseSections, courses, userRoles,
} from "../db/schema";
import { Perm, ParentWrite } from "../common/guards";
import { insertAudit } from "../common/audit";
import { enqueueMessagePosted, enqueueFamilyMessage } from "../notify/notify.service";
import { ThreadCreateBody, MessageBody, FamilyThreadCreateBody } from "@portal/contracts";
import type { Request } from "express";

/**
 * Teacher↔family messaging.
 *
 * Phase 1 made this channel read-only for parents — a teacher could write to a
 * family and never hear back inside the portal. Migration 0020 gives guardians
 * replies. What the two gates now mean:
 *
 *   gate 1 (here)  @Perm("messaging:reply") + a participant check: the
 *                  thread's authoring teacher, or a verified guardian of the
 *                  pupil the thread is about.
 *   gate 2 (RLS)   msgs_ins (0020) requires sender = actor AND the actor is
 *                  either the thread's author or a guardian of its pupil.
 *
 * Opening and closing a thread stay with staff: a thread is a channel the
 * school opens about a pupil, and closing it ends the exchange.
 */
@Controller()
export class MessagingController {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** threads visible to the caller: authoring teacher / guardian / admin (RLS filters) */
  @Get("threads")
  async list(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select({
        id: messageThreads.id, subject: messageThreads.subject, status: messageThreads.status,
        createdAt: messageThreads.createdAt,
        studentUserId: messageThreads.studentUserId, studentName: users.displayName,
      }).from(messageThreads)
        .innerJoin(users, eq(users.id, messageThreads.studentUserId));
      return { data: rows };
    });
  }

  @Post("threads")
  @Perm("messaging:write")
  async create(@Req() req: Request, @Body() body: unknown) {
    const parsed = ThreadCreateBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertTeaches(tx, p.userId, parsed.data.student_user_id);
      const [thread] = await tx.insert(messageThreads).values({
        studentUserId: parsed.data.student_user_id,
        createdBy: p.userId,
        subject: parsed.data.subject,
      }).returning();
      await insertAudit(tx, { actorUserId: p.userId, action: "thread.created",
        entityType: "message_thread", entityId: thread.id, ip: req.ip });
      return thread;
    });
  }

  @Get("threads/:id")
  async thread(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [thread] = await tx.select().from(messageThreads).where(eq(messageThreads.id, id)).limit(1);
      if (!thread) throw new NotFoundException({ code: "not_found" }); // also covers RLS-invisible
      // sender_name is snapshotted on the row: guardians cannot read staff rows
      // in users, so a join here would hide every teacher message from parents.
      /* The attachment's display name travels with the message; the bytes are
         fetched separately from /files/:id, which re-checks scope. A guardian
         who can read this thread can therefore read its attachments and
         nothing else. */
      const msgs = await tx.select({
        id: messages.id, threadId: messages.threadId, senderUserId: messages.senderUserId,
        senderName: messages.senderName, bodyText: messages.bodyText,
        createdAt: messages.createdAt, attachmentFileId: messages.attachmentFileId,
        attachmentName: files.filename, attachmentBytes: files.bytes,
      }).from(messages)
        .leftJoin(files, eq(files.id, messages.attachmentFileId))
        .where(eq(messages.threadId, id));
      const [student] = await tx.select({ displayName: users.displayName })
        .from(users).where(eq(users.id, thread.studentUserId)).limit(1);
      return { thread: { ...thread, studentName: student?.displayName ?? null }, messages: msgs };
    });
  }

  /**
   * Post to a thread: the authoring teacher, or a guardian of the pupil.
   *
   * One handler rather than two routes, because the write is identical and
   * only the permission check differs — two routes on the same path would
   * leave Nest registering both and Express serving whichever came first.
   *
   * The participant check runs inside the actor transaction, so it is the same
   * session the RLS policy evaluates: a guardian who has since been
   * unverified, or whose link ended, is refused here and again by the policy.
   */
  @Post("threads/:id/messages")
  @Perm("messaging:reply")
  @ParentWrite()
  async post(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    const parsed = MessageBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      /* No created_by filter: the filter IS the permission check below, and
         adding it here would hide a thread the guardian is allowed to answer
         behind a 404 that says "no such thread". */
      const [thread] = await tx.select().from(messageThreads)
        .where(eq(messageThreads.id, id)).limit(1);
      if (!thread) throw new NotFoundException({ code: "not_found" }); // also RLS-invisible
      if (thread.status === "closed") {
        throw new UnprocessableEntityException({ code: "thread_closed",
          detail: "this thread has been closed; ask your child's teacher to reopen it" });
      }

      const isTeacherSide = thread.createdBy === p.userId;
      if (!isTeacherSide) {
        const [link] = await tx.select({ id: guardians.id }).from(guardians)
          .where(and(
            eq(guardians.userId, p.userId),
            eq(guardians.studentUserId, thread.studentUserId),
            eq(guardians.canView, true),
            sql`${guardians.verifiedAt} IS NOT NULL`,
            isNull(guardians.endedAt),
          )).limit(1);
        /* Told "not found" rather than "forbidden" on purpose: whether a
           thread exists about somebody else's child is not a parent's
           business, and the RLS SELECT policy already hides it. */
        if (!link) throw new NotFoundException({ code: "not_found" });
      }

      const [msg] = await tx.insert(messages).values({
        threadId: id, senderUserId: p.userId, senderName: p.displayName,
        bodyText: (parsed.data.body_text ?? "").trim(),
        attachmentFileId: parsed.data.attachment_file_id ?? null,
      }).returning();

      /* Notify the side that did not write. A teacher's message goes to the
         guardians; a guardian's reply goes to the teacher who opened the
         thread — which is exactly the notification that was missing, because
         before 0020 no reply could exist. */
      if (isTeacherSide) {
        await enqueueMessagePosted(tx, thread.studentUserId, id, thread.subject);
      } else {
        await enqueueFamilyMessage(tx, thread.createdBy, id, thread.subject, p.displayName);
      }

      await insertAudit(tx, { actorUserId: p.userId,
        action: isTeacherSide ? "message.posted" : "message.posted_by_family",
        entityType: "message_thread", entityId: id, ip: req.ip });
      return msg;
    });
  }

  @Post("threads/:id/close")
  @Perm("messaging:write")
  async close(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [thread] = await tx.select().from(messageThreads)
        .where(and(eq(messageThreads.id, id), eq(messageThreads.createdBy, p.userId))).limit(1);
      if (!thread) throw new NotFoundException({ code: "not_found" });
      const [updated] = await tx.update(messageThreads)
        .set({ status: "closed", closedAt: new Date() })
        .where(eq(messageThreads.id, id)).returning();
      await insertAudit(tx, { actorUserId: p.userId, action: "thread.closed",
        entityType: "message_thread", entityId: id });
      return updated;
    });
  }

  /**
   * Who a guardian may write to about one child.
   *
   * Returns the staff who actually teach that pupil, with the class they teach
   * them in, so the family can pick a person and know why. Read under SERVICE
   * after the guardian link is proved, and it exposes nothing but a name and a
   * class label — never the staff directory, never an email address.
   */
  @Get("family/children/:id/teachers")
  @Perm("family:read")
  async childTeachers(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    /* Prove the link as the caller first: this read is RLS-checked, so it
       cannot succeed for somebody else's child. */
    const linked = await withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [link] = await tx.select({ id: guardians.id }).from(guardians)
        .where(and(
          eq(guardians.userId, p.userId), eq(guardians.studentUserId, id),
          eq(guardians.canView, true),
          sql`${guardians.verifiedAt} IS NOT NULL`, isNull(guardians.endedAt),
        )).limit(1);
      return Boolean(link);
    });
    if (!linked) throw new NotFoundException({ code: "not_found" });

    return withActor(this.db, SERVICE, async (tx) => {
      const rows = await tx.selectDistinct({
        id: users.id, name: users.displayName,
        sectionName: courseSections.name, courseTitle: courses.title,
      }).from(sectionStaff)
        .innerJoin(users, eq(users.id, sectionStaff.userId))
        .innerJoin(enrollments, and(
          eq(enrollments.sectionId, sectionStaff.sectionId),
          eq(enrollments.studentUserId, id),
          eq(enrollments.status, "enrolled")))
        .innerJoin(userRoles, and(
          eq(userRoles.userId, users.id),
          isNull(userRoles.revokedAt)))
        .leftJoin(courseSections, eq(courseSections.id, sectionStaff.sectionId))
        .leftJoin(courses, eq(courses.id, courseSections.courseId))
        /* A staff member who was taken off the job or had the teaching role
           revoked is not somebody a family should be told to write to. */
        .where(and(
          inArray(userRoles.roleCode, ["teacher", "teacher_assistant"]),
          isNull(userRoles.revokedAt)));
      return { data: rows.sort((a, b) => a.name.localeCompare(b.name)) };
    });
  }

  /**
   * A guardian opens a thread with a teacher of their child.
   *
   * The row is stamped with the TEACHER as author, which is what keeps thread
   * visibility unchanged: it lands in that one teacher's inbox, the family can
   * read it because they are the child's guardians, and no other member of
   * staff sees it. The audit trail records that the family opened it.
   */
  @Post("threads/family")
  @Perm("messaging:reply")
  @ParentWrite()
  async createFromFamily(@Req() req: Request, @Body() body: unknown) {
    const parsed = FamilyThreadCreateBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const p = req.principal!;
    const b = parsed.data;

    /* Two actors, two jobs.
       1. The guardian link is proved AS THE CALLER, so RLS is the thing that
          decides whether this parent may act for this child.
       2. Whether the chosen teacher actually teaches that child is read under
          SERVICE: section_staff is staff-only (a guardian cannot read it), and
          asking AS the parent would have made every legitimate request look
          like a 403 — the check would have failed for the right answer too.
       3. The write itself goes back to the caller's own actor so the insert
          policies (threads_ins, msgs_ins) evaluate against the real user. */
    const linked = await withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [link] = await tx.select({ id: guardians.id }).from(guardians)
        .where(and(
          eq(guardians.userId, p.userId), eq(guardians.studentUserId, b.child_user_id),
          eq(guardians.canView, true),
          sql`${guardians.verifiedAt} IS NOT NULL`, isNull(guardians.endedAt),
        )).limit(1);
      return Boolean(link);
    });
    /* "Not found" rather than "forbidden" — a stranger learns nothing about
       whether that pupil exists. */
    if (!linked) throw new NotFoundException({ code: "not_found" });

    await withActor(this.db, SERVICE, (tx) =>
      this.assertTeaches(tx, b.teacher_user_id, b.child_user_id));

    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [thread] = await tx.insert(messageThreads).values({
        studentUserId: b.child_user_id,
        createdBy: b.teacher_user_id,
        subject: b.subject,
      }).returning();

      const [msg] = await tx.insert(messages).values({
        threadId: thread.id, senderUserId: p.userId, senderName: p.displayName,
        bodyText: b.body_text.trim(),
      }).returning();

      await enqueueFamilyMessage(tx, b.teacher_user_id, thread.id, thread.subject, p.displayName);
      await insertAudit(tx, { actorUserId: p.userId, action: "thread.opened_by_family",
        entityType: "message_thread", entityId: thread.id,
        after: { student: b.child_user_id, teacher: b.teacher_user_id }, ip: req.ip });
      return { ...thread, first_message: msg };
    });
  }

  /** teacher must staff ≥1 section the student is enrolled in (mirrors is_teacher_of in RLS) */
  private async assertTeaches(tx: Db, userId: string, studentUserId: string) {
    const [row] = await tx.select({ id: sectionStaff.id }).from(sectionStaff)
      .innerJoin(enrollments, eq(enrollments.sectionId, sectionStaff.sectionId))
      .where(and(
        eq(sectionStaff.userId, userId),
        eq(enrollments.studentUserId, studentUserId), eq(enrollments.status, "enrolled"),
      )).limit(1);
    if (!row) {
      throw new ForbiddenException({ code: "outside_section_scope",
        detail: "you do not teach this student" });
    }
  }
}
