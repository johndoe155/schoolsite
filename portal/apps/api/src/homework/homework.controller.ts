import {
  Body, Controller, Get, Inject, Injectable, NotFoundException, Param, Post,
  Req, UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Request } from "express";
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor, SERVICE } from "../db/actor";
import {
  courseSections, enrollments, homeworkAssignments, homeworkSubmissions, users,
} from "../db/schema";
import { Perm } from "../common/guards";
import { insertAudit } from "../common/audit";
import type { Principal } from "../common/principal";
import { z } from "zod";

// Optional seconds and fractional seconds: Date.toISOString() always carries
// milliseconds, and rejecting them would fail every value a browser produces.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const AssignmentBody = z.object({
  section_id: z.string().uuid(),
  course_id: z.string().uuid().nullish(),
  title: z.string().min(1).max(200),
  instructions: z.string().max(20000).nullish(),
  /**
   * A timestamptz, not a date. "Due Friday" and "due Friday 4pm" are different
   * rules and a school needs both; accepting only a date would force every
   * deadline to midnight and make late submissions ambiguous.
   */
  due_at: z.string().regex(ISO_DATETIME, "due_at must be an ISO datetime"),
  max_score: z.number().int().positive().max(1000).nullish(),
});

const SubmitBody = z.object({ body: z.string().max(50000).nullish() });

const MarkBody = z.object({
  student_user_id: z.string().uuid(),
  score: z.number().int().min(0).max(1000).nullish(),
  feedback: z.string().max(20000).nullish(),
});

@Injectable()
export class HomeworkService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** Set work for a whole section. */
  async create(actor: Principal, body: unknown) {
    const parsed = AssignmentBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const b = parsed.data;

    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [section] = await tx.select().from(courseSections)
        .where(eq(courseSections.id, b.section_id)).limit(1);
      if (!section) throw new NotFoundException({ code: "not_found", detail: "no such section" });

      const today = new Date().toISOString().slice(0, 10);
      const due = new Date(b.due_at);
      if (Number.isNaN(due.getTime())) {
        throw new UnprocessableEntityException({ code: "validation", detail: "due_at is not a real datetime" });
      }
      if (due.getTime() < Date.parse(today + "T00:00:00Z")) {
        throw new UnprocessableEntityException({
          code: "validation", detail: "due_at cannot be before the day the work is set",
        });
      }

      const [row] = await tx.insert(homeworkAssignments).values({
        sectionId: b.section_id, courseId: b.course_id ?? section.courseId,
        title: b.title, instructions: b.instructions ?? null,
        assignedBy: actor.userId, assignedOn: today, dueAt: due,
        maxScore: b.max_score ?? null, status: "active",
      }).returning();
      await insertAudit(tx, { actorUserId: actor.userId, action: "homework.assigned",
        entityType: "homework", entityId: row.id, after: { sectionId: b.section_id, title: b.title, dueAt: row.dueAt } });
      return { ok: true as const, assignment: row };
    });
  }

  /** Withdraw rather than delete, so the record of what was set survives. */
  async withdraw(actor: Principal, id: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [row] = await tx.update(homeworkAssignments).set({ status: "withdrawn" })
        .where(and(eq(homeworkAssignments.id, id), eq(homeworkAssignments.status, "active")))
        .returning();
      if (!row) throw new NotFoundException({ code: "not_found", detail: "no such active assignment" });
      await insertAudit(tx, { actorUserId: actor.userId, action: "homework.withdrawn",
        entityType: "homework", entityId: id });
      return { ok: true as const, assignment: row };
    });
  }

  /** Work set for one section, with how many have handed it in. */
  async forSection(actor: Principal, sectionId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const assignments = await tx.select().from(homeworkAssignments)
        .where(eq(homeworkAssignments.sectionId, sectionId))
        .orderBy(homeworkAssignments.dueAt);

      /* Counts come from a separate grouped query rather than a correlated
         subquery. The subquery form compiled and ran but always returned 0 —
         the outer table reference did not correlate — and a list that quietly
         claims nobody has handed anything in is worse than a crash. */
      const ids = assignments.map((a) => a.id);
      const counts = ids.length
        ? await tx.select({
            assignmentId: homeworkSubmissions.assignmentId,
            n: sql<number>`count(*)::int`,
          }).from(homeworkSubmissions)
            .where(inArray(homeworkSubmissions.assignmentId, ids))
            .groupBy(homeworkSubmissions.assignmentId)
        : [];
      const byAssignment = new Map(counts.map((c) => [c.assignmentId, c.n]));

      return {
        sectionId,
        assignments: assignments.map((a) => ({
          id: a.id, title: a.title, instructions: a.instructions, dueAt: a.dueAt,
          assignedOn: a.assignedOn, maxScore: a.maxScore, status: a.status,
          submissionCount: byAssignment.get(a.id) ?? 0,
        })),
      };
    });
  }

  /** One student's own work: what is set, what they have handed in, what is marked. */
  async forStudent(userId: string) {
    return withActor(this.db, { userId, role: "student" }, async (tx) => {
      const rows = await tx.select({
        a: homeworkAssignments,
        s: homeworkSubmissions,
        section: courseSections.name,
      }).from(homeworkAssignments)
        .leftJoin(homeworkSubmissions, and(
          eq(homeworkSubmissions.assignmentId, homeworkAssignments.id),
          eq(homeworkSubmissions.studentUserId, userId)))
        .leftJoin(courseSections, eq(homeworkAssignments.sectionId, courseSections.id))
        .where(eq(homeworkAssignments.status, "active"))
        .orderBy(homeworkAssignments.dueAt);
      const now = Date.now();
      return {
        userId,
        assignments: rows.map(({ a, s, section }) => ({
          id: a.id, title: a.title, instructions: a.instructions, section,
          dueAt: a.dueAt, maxScore: a.maxScore,
          submitted: s ? s.submittedAt : null,
          late: s?.late ?? false,
          body: s?.body ?? null,
          score: s?.score ?? null,
          feedback: s?.feedback ?? null,
          // Derived per read, because unlike the recorded `late` flag this one
          // describes the present rather than a decision already made.
          overdue: !s && now > a.dueAt.getTime(),
        })),
      };
    });
  }

  /** Hand work in. Idempotent per student: re-submitting replaces the text. */
  async submit(actor: Principal, assignmentId: string, body: unknown) {
    const parsed = SubmitBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    return withActor(this.db, { userId: actor.userId, role: "student" }, async (tx) => {
      const [a] = await tx.select().from(homeworkAssignments)
        .where(eq(homeworkAssignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found", detail: "no such assignment" });
      if (a.status !== "active") {
        throw new UnprocessableEntityException({
          code: "assignment_closed", detail: `that assignment is ${a.status}; work cannot be handed in`,
        });
      }

      const submittedAt = new Date();
      const isLate = submittedAt.getTime() > a.dueAt.getTime();
      const values = {
        assignmentId, studentUserId: actor.userId, body: parsed.data.body ?? null,
        submittedAt, late: isLate,
      };
      const [row] = await tx.insert(homeworkSubmissions).values(values)
        .onConflictDoUpdate({
          target: [homeworkSubmissions.assignmentId, homeworkSubmissions.studentUserId],
          set: { body: values.body, submittedAt: values.submittedAt, late: values.late },
        }).returning();
      await insertAudit(tx, { actorUserId: actor.userId, action: "homework.submitted",
        entityType: "homework", entityId: assignmentId, after: { late: isLate } });
      return { ok: true as const, late: isLate, submission: row };
    });
  }

  /** Mark one student's submission. */
  async mark(actor: Principal, assignmentId: string, body: unknown) {
    const parsed = MarkBody.safeParse(body);
    if (!parsed.success) {
      throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    }
    const b = parsed.data;
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [a] = await tx.select().from(homeworkAssignments)
        .where(eq(homeworkAssignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found", detail: "no such assignment" });
      if (a.maxScore !== null && b.score !== null && b.score !== undefined && b.score > a.maxScore) {
        throw new UnprocessableEntityException({
          code: "score_exceeds_max", detail: `score ${b.score} is above this assignment's maximum of ${a.maxScore}`,
        });
      }
      const [sub] = await tx.select().from(homeworkSubmissions).where(and(
        eq(homeworkSubmissions.assignmentId, assignmentId),
        eq(homeworkSubmissions.studentUserId, b.student_user_id))).limit(1);
      if (!sub) {
        throw new NotFoundException({ code: "not_submitted", detail: "that student has not handed this in" });
      }
      const [row] = await tx.update(homeworkSubmissions).set({
        score: b.score ?? null, feedback: b.feedback ?? null,
        markedBy: actor.userId, markedAt: new Date(),
      }).where(eq(homeworkSubmissions.id, sub.id)).returning();
      await insertAudit(tx, { actorUserId: actor.userId, action: "homework.marked",
        entityType: "homework", entityId: assignmentId, after: { studentUserId: b.student_user_id, score: b.score ?? null } });
      return { ok: true as const, submission: row };
    });
  }

  /** Everything handed in for one assignment, ready to mark. */
  async submissions(actor: Principal, assignmentId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [a] = await tx.select().from(homeworkAssignments)
        .where(eq(homeworkAssignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found", detail: "no such assignment" });

      const rows = await tx.select({
        s: homeworkSubmissions, name: users.displayName, email: users.email,
      }).from(homeworkSubmissions)
        .innerJoin(users, eq(homeworkSubmissions.studentUserId, users.id))
        .where(eq(homeworkSubmissions.assignmentId, assignmentId))
        .orderBy(users.displayName);

      return {
        assignmentId, title: a.title, maxScore: a.maxScore, status: a.status,
        submissions: rows.map(({ s, name, email }) => ({
          studentUserId: s.studentUserId, name, email, body: s.body,
          submittedAt: s.submittedAt, late: s.late,
          score: s.score, feedback: s.feedback, markedAt: s.markedAt,
        })),
      };
    });
  }

  /**
   * Who has not handed a given assignment in. This is the report teachers kept
   * on paper: without a submissions row per student at set-time, "missing" is
   * simply the enrolled students with no row.
   */
  async outstanding(actor: Principal, assignmentId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [a] = await tx.select().from(homeworkAssignments)
        .where(eq(homeworkAssignments.id, assignmentId)).limit(1);
      if (!a) throw new NotFoundException({ code: "not_found", detail: "no such assignment" });

      const missing = await tx.select({
        studentUserId: enrollments.studentUserId, name: users.displayName, email: users.email,
      }).from(enrollments)
        .innerJoin(users, eq(enrollments.studentUserId, users.id))
        .leftJoin(homeworkSubmissions, and(
          eq(homeworkSubmissions.assignmentId, assignmentId),
          eq(homeworkSubmissions.studentUserId, enrollments.studentUserId)))
        .where(and(
          eq(enrollments.sectionId, a.sectionId),
          isNull(homeworkSubmissions.id)))
        .orderBy(users.displayName);

      return {
        assignmentId, title: a.title, dueAt: a.dueAt,
        overdue: Date.now() > a.dueAt.getTime(),
        missing: missing.map((m) => ({
          studentUserId: m.studentUserId, name: m.name, email: m.email,
        })),
      };
    });
  }
}

@Controller()
export class HomeworkController {
  constructor(private svc: HomeworkService) {}

  @Post("homework/assignments")
  @Perm("homework:write")
  create(@Body() body: unknown, @Req() req: Request) { return this.svc.create(req.principal!, body); }

  @Post("homework/assignments/:id/withdraw")
  @Perm("homework:write")
  withdraw(@Param("id") id: string, @Req() req: Request) { return this.svc.withdraw(req.principal!, id); }

  @Get("homework/sections/:id")
  @Perm("homework:read")
  forSection(@Param("id") id: string, @Req() req: Request) { return this.svc.forSection(req.principal!, id); }

  @Get("homework/me")
  @Perm("homework:read")
  mine(@Req() req: Request) { return this.svc.forStudent(req.principal!.userId); }

  @Post("homework/assignments/:id/submit")
  @Perm("homework:submit")
  submit(@Param("id") id: string, @Body() body: unknown, @Req() req: Request) {
    return this.svc.submit(req.principal!, id, body);
  }

  @Post("homework/assignments/:id/mark")
  @Perm("homework:write")
  mark(@Param("id") id: string, @Body() body: unknown, @Req() req: Request) {
    return this.svc.mark(req.principal!, id, body);
  }

  @Get("homework/assignments/:id/submissions")
  @Perm("homework:write")
  submissions(@Param("id") id: string, @Req() req: Request) {
    return this.svc.submissions(req.principal!, id);
  }

  @Get("homework/assignments/:id/outstanding")
  @Perm("homework:write")
  outstanding(@Param("id") id: string, @Req() req: Request) {
    return this.svc.outstanding(req.principal!, id);
  }
}
