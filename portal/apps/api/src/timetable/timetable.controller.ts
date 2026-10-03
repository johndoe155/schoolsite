import {
  Body, Controller, Delete, ForbiddenException, Get, Inject, Injectable,
  NotFoundException, Param, Post, Req, UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Request } from "express";
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor, SERVICE } from "../db/actor";
import {
  courseSections, timetablePeriods, timetableSlots, users, courses,
  enrollments, sectionStaff, guardians, userRoles,
} from "../db/schema";
import { Perm } from "../common/guards";
import { insertAudit } from "../common/audit";
import { z } from "zod";
import type { Principal } from "../common/principal";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PeriodBody = z.object({
  weekday: z.number().int().min(0).max(6),
  period_index: z.number().int().positive(),
  label: z.string().min(1).max(60).optional(),
  starts_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "starts_at must be HH:MM"),
  ends_at: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "ends_at must be HH:MM"),
  is_break: z.boolean().optional(),
});

const SlotBody = z.object({
  period_id: z.string().uuid(),
  section_id: z.string().uuid(),
  course_id: z.string().uuid().nullish(),
  teacher_user_id: z.string().uuid().nullish(),
  room: z.string().min(1).max(80).nullish(),
});

@Injectable()
export class TimetableService {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /** A section's week, with breaks kept and free periods left empty. */
  async forSection(sectionId: string) {
    return withActor(this.db, SERVICE, async (tx) => {
      const [section] = await tx.select().from(courseSections)
        .where(eq(courseSections.id, sectionId)).limit(1);
      if (!section) throw new NotFoundException({ code: "not_found", detail: "no such section" });

      const periods = await tx.select().from(timetablePeriods)
        .where(eq(timetablePeriods.termId, section.termId));
      const periodIds = periods.map((p) => p.id);
      const slots = periodIds.length
        ? await tx.select({
            slot: timetableSlots, course: courses.title, teacher: users.displayName,
          }).from(timetableSlots)
            .leftJoin(courses, eq(timetableSlots.courseId, courses.id))
            .leftJoin(users, eq(timetableSlots.teacherUserId, users.id))
            .where(and(
              inArray(timetableSlots.periodId, periodIds),
              eq(timetableSlots.sectionId, sectionId)))
        : [];

      const byPeriod = new Map(slots.map((s) => [s.slot.periodId, s]));
      return {
        section: { id: section.id, name: section.name, termId: section.termId },
        week: groupByDay(periods, (p) => {
          const s = byPeriod.get(p.id);
          return s ? {
            courseId: s.slot.courseId, course: s.course ?? null,
            teacher: s.teacher ?? null, room: s.slot.room,
          } : null;
        }),
      };
    });
  }

  /**
   * A teacher's week across every section they are assigned to. This is the
   * view that did not exist at all before: a teacher could see their sections
   * but not when they taught them.
   */
  async forTeacher(userId: string) {
    return withActor(this.db, { userId, role: "teacher" }, async (tx) => {
      const slots = await tx.select({
        slot: timetableSlots, period: timetablePeriods, section: courseSections.name,
      }).from(timetableSlots)
        .innerJoin(timetablePeriods, eq(timetableSlots.periodId, timetablePeriods.id))
        .leftJoin(courseSections, eq(timetableSlots.sectionId, courseSections.id))
        .where(eq(timetableSlots.teacherUserId, userId));
      return {
        userId,
        week: groupByDay(slots.map((s) => s.period), (p) => {
          const s = slots.find((x) => x.period.id === p.id)!;
          return { sectionId: s.slot.sectionId, section: s.section ?? null, room: s.slot.room };
        }),
      };
    });
  }

  /**
   * The whole week for one term: every section's slot laid over the bell
   * schedule. This is what the admin grid renders — building a timetable one
   * section at a time hides exactly the clashes (two classes in one room, a
   * teacher in two places) that the grid makes obvious.
   */
  async termWeek(actor: Principal, termId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const periods = await tx.select().from(timetablePeriods)
        .where(eq(timetablePeriods.termId, termId));
      const periodIds = periods.map((p) => p.id);
      const slots = periodIds.length ? await tx.select({
        slot: timetableSlots, sectionName: courseSections.name,
        courseTitle: courses.title, teacherName: users.displayName,
      }).from(timetableSlots)
        .leftJoin(courseSections, eq(timetableSlots.sectionId, courseSections.id))
        .leftJoin(courses, eq(timetableSlots.courseId, courses.id))
        .leftJoin(users, eq(timetableSlots.teacherUserId, users.id))
        .where(inArray(timetableSlots.periodId, periodIds)) : [];
      const sections = await tx.select({
        id: courseSections.id, name: courseSections.name, code: courses.code, title: courses.title,
      }).from(courseSections)
        .innerJoin(courses, eq(courses.id, courseSections.courseId))
        .where(eq(courseSections.termId, termId));
      return {
        termId,
        periods: [...periods].sort((a, b) =>
          (a.weekday - b.weekday) || (a.periodIndex - b.periodIndex)),
        sections,
        slots: slots.map((s) => ({
          id: s.slot.id, periodId: s.slot.periodId, sectionId: s.slot.sectionId,
          sectionName: s.sectionName, courseId: s.slot.courseId, courseTitle: s.courseTitle,
          teacherUserId: s.slot.teacherUserId, teacherName: s.teacherName, room: s.slot.room,
        })),
      };
    });
  }

  /** Does a teacher teach this pupil? Used to authorise the teacher's view. */
  private async teachesStudent(tx: any, teacherId: string, studentId: string) {
    const rows = await tx.select({ id: enrollments.id }).from(enrollments)
      .innerJoin(sectionStaff, and(
        eq(sectionStaff.sectionId, enrollments.sectionId),
        eq(sectionStaff.userId, teacherId)))
      .where(and(eq(enrollments.studentUserId, studentId),
        eq(enrollments.status, "enrolled"))).limit(1);
    return rows.length > 0;
  }

  /**
   * One pupil's week. This is the view the portal could not produce at all:
   * a student could not be told which room to walk into.
   *
   * Authorisation: the pupil themselves, an admin, a verified guardian of that
   * pupil, or a teacher who teaches them. Guardianship is read from the
   * guardians table (RLS-visible only to the linked account anyway) rather than
   * being taken from the request.
   *
   * The teacher's NAME is resolved in a second, service-scoped read because
   * `users` RLS deliberately hides other people's rows from a pupil — the name
   * on your own timetable is not "other people's data", but the policy cannot
   * know that, so the narrowing happens here instead of widening the policy.
   */
  async forStudent(actor: Principal, studentId: string) {
    const data = await withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const isSelf = actor.userId === studentId;
      const isAdmin = ["super_admin", "school_admin", "registrar"].includes(actor.activeRole);
      if (!isSelf && !isAdmin) {
        const [link] = await tx.select({ id: guardians.id }).from(guardians)
          .where(and(eq(guardians.studentUserId, studentId),
            eq(guardians.userId, actor.userId),
            isNotNull(guardians.verifiedAt), isNull(guardians.endedAt))).limit(1);
        const teaches = link ? false : await this.teachesStudent(tx, actor.userId, studentId);
        if (!link && !teaches) throw new ForbiddenException({ code: "not_your_record" });
      }

      const rows = await tx.select({
        slot: timetableSlots, period: timetablePeriods,
        sectionName: courseSections.name, courseTitle: courses.title,
        courseCode: courses.code,
      }).from(timetableSlots)
        .innerJoin(timetablePeriods, eq(timetableSlots.periodId, timetablePeriods.id))
        .innerJoin(enrollments, and(
          eq(enrollments.sectionId, timetableSlots.sectionId),
          eq(enrollments.studentUserId, studentId),
          eq(enrollments.status, "enrolled")))
        .leftJoin(courseSections, eq(courseSections.id, timetableSlots.sectionId))
        .leftJoin(courses, eq(courses.id, timetableSlots.courseId));

      /* The pupil's week is the WHOLE bell schedule for the terms they are in,
         not only the periods they have lessons in. Showing just the lessons
         loses the shape of the day — a break, a free period and "school ends
         at 10:00 on a Friday" are things a pupil and a parent need to see. */
      const sectionIds = [...new Set(rows.map((r) => r.slot.sectionId))];
      const termRows = sectionIds.length
        ? await tx.select({ termId: courseSections.termId }).from(courseSections)
          .where(inArray(courseSections.id, sectionIds))
        : [];
      const termIds = [...new Set(termRows.map((t) => t.termId))];
      const periods = termIds.length
        ? await tx.select().from(timetablePeriods)
          .where(inArray(timetablePeriods.termId, termIds))
        : [];
      return { rows, periods };
    });

    const teacherIds = [...new Set(data.rows.map((r) => r.slot.teacherUserId)
      .filter((x): x is string => Boolean(x)))];
    const names = teacherIds.length
      ? await withActor(this.db, SERVICE, (tx) => tx.select({ id: users.id, name: users.displayName })
        .from(users).where(inArray(users.id, teacherIds)))
      : [];
    const nameById = new Map(names.map((n) => [n.id, n.name]));
    const byPeriod = new Map(data.rows.map((r) => [r.slot.periodId, r]));

    return {
      studentId,
      week: groupByDay(data.periods, (p) => {
        const r = byPeriod.get(p.id);
        return r ? {
          sectionId: r.slot.sectionId, section: r.sectionName,
          course: r.courseTitle, courseCode: r.courseCode,
          teacher: r.slot.teacherUserId ? nameById.get(r.slot.teacherUserId) ?? null : null,
          room: r.slot.room,
        } : null;
      }),
    };
  }

  /** Every section's period list for the current pupil — for the classwork tabs. */
  async sectionsForStudent(actor: Principal, studentId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) =>
      tx.select({ id: courseSections.id, name: courseSections.name })
        .from(courseSections)
        .innerJoin(enrollments, and(
          eq(enrollments.sectionId, courseSections.id),
          eq(enrollments.studentUserId, studentId),
          eq(enrollments.status, "enrolled"))));
  }

  /** Upsert the bell schedule for a term. Replaces that term's periods. */
  async setPeriods(actor: Principal, termId: string, body: unknown) {
    const parsed = z.array(PeriodBody).min(1).max(200).safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    for (const p of parsed.data) {
      if (p.ends_at <= p.starts_at) {
        throw new UnprocessableEntityException({
          code: "validation", detail: `period ${p.period_index} on ${DAY_NAMES[p.weekday]} ends before it starts`,
        });
      }
    }
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      // Delete-and-reinsert is deliberate: the bell schedule is edited as a
      // whole, and a partial merge would silently leave orphaned periods.
      await tx.delete(timetablePeriods).where(eq(timetablePeriods.termId, termId));
      const created = [];
      for (const p of parsed.data) {
        const [row] = await tx.insert(timetablePeriods).values({
          termId, weekday: p.weekday, periodIndex: p.period_index, label: p.label ?? null,
          startsAt: p.starts_at, endsAt: p.ends_at, isBreak: p.is_break ?? false,
        }).returning();
        created.push(row);
      }
      await insertAudit(tx, { actorUserId: actor.userId, action: "timetable.periods_set",
        entityType: "term", entityId: termId, after: { count: created.length } });
      return { ok: true as const, count: created.length, periods: created };
    });
  }

  /** Assign (or clear) a slot, refusing clashes. */
  async setSlot(actor: Principal, body: unknown) {
    const parsed = SlotBody.safeParse(body);
    if (!parsed.success) throw new UnprocessableEntityException({ code: "validation", detail: parsed.error.message });
    const b = parsed.data;

    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [period] = await tx.select().from(timetablePeriods)
        .where(eq(timetablePeriods.id, b.period_id)).limit(1);
      if (!period) throw new NotFoundException({ code: "not_found", detail: "no such period" });
      if (period.isBreak) {
        throw new UnprocessableEntityException({
          code: "break_period", detail: "that period is a break; nothing can be timetabled into it",
        });
      }

      /* Two clashes matter and neither is expressible as a constraint, because
         both compare across rows. A timetable that lets a teacher be in two
         rooms at once is worse than no timetable: it looks authoritative. */
      const [sectionClash] = await tx.select({ id: timetableSlots.id, room: timetableSlots.room })
        .from(timetableSlots)
        .where(and(
          eq(timetableSlots.periodId, b.period_id),
          eq(timetableSlots.sectionId, b.section_id),
          ne(timetableSlots.sectionId, b.section_id)))
        .limit(1);
      if (sectionClash) {
        throw new UnprocessableEntityException({ code: "section_clash",
          detail: "that section is already scheduled in this period" });
      }
      if (b.teacher_user_id) {
        const [teacherClash] = await tx.select({ id: timetableSlots.id, sectionId: timetableSlots.sectionId })
          .from(timetableSlots)
          .where(and(
            eq(timetableSlots.periodId, b.period_id),
            eq(timetableSlots.teacherUserId, b.teacher_user_id),
            ne(timetableSlots.sectionId, b.section_id)))
          .limit(1);
        if (teacherClash) {
          throw new UnprocessableEntityException({ code: "teacher_clash",
            detail: "that teacher is already timetabled in this period" });
        }
      }

      await tx.delete(timetableSlots).where(and(
        eq(timetableSlots.periodId, b.period_id),
        eq(timetableSlots.sectionId, b.section_id)));
      const [row] = await tx.insert(timetableSlots).values({
        periodId: b.period_id, sectionId: b.section_id,
        courseId: b.course_id ?? null, teacherUserId: b.teacher_user_id ?? null,
        room: b.room ?? null,
      }).returning();
      await insertAudit(tx, { actorUserId: actor.userId, action: "timetable.slot_set",
        entityType: "section", entityId: b.section_id, after: { periodId: b.period_id, room: b.room ?? null } });
      return { ok: true as const, slot: row };
    });
  }

  /** Un-schedule one period for one section (leaves a free period). */
  async removeSlot(actor: Principal, slotId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [row] = await tx.select().from(timetableSlots)
        .where(eq(timetableSlots.id, slotId)).limit(1);
      if (!row) throw new NotFoundException({ code: "not_found" });
      await tx.delete(timetableSlots).where(eq(timetableSlots.id, slotId));
      await insertAudit(tx, { actorUserId: actor.userId, action: "timetable.slot_removed",
        entityType: "section", entityId: row.sectionId,
        before: { periodId: row.periodId, room: row.room } });
      return { ok: true as const };
    });
  }

  /**
   * Remove one period from the bell schedule.
   *
   * Its slots go with it (timetable_slots.period_id is ON DELETE CASCADE) —
   * a period that no longer exists cannot have a lesson in it, and leaving the
   * slot behind would make "which lesson is this?" unanswerable.
   */
  /** Everyone who can be timetabled in front of a class. */
  async teachers(actor: Principal) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, (tx) =>
      tx.selectDistinct({ id: users.id, name: users.displayName })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(inArray(userRoles.roleCode, ["teacher", "teacher_assistant"]))
        .orderBy(users.displayName));
  }

  async removePeriod(actor: Principal, periodId: string) {
    return withActor(this.db, { userId: actor.userId, role: actor.activeRole }, async (tx) => {
      const [row] = await tx.select().from(timetablePeriods)
        .where(eq(timetablePeriods.id, periodId)).limit(1);
      if (!row) throw new NotFoundException({ code: "not_found" });
      await tx.delete(timetablePeriods).where(eq(timetablePeriods.id, periodId));
      await insertAudit(tx, { actorUserId: actor.userId, action: "timetable.period_removed",
        entityType: "term", entityId: row.termId,
        before: { weekday: row.weekday, periodIndex: row.periodIndex } });
      return { ok: true as const };
    });
  }
}

/** Fold flat rows into { Monday: [{ index, start, end, value }] }. */
function groupByDay<T>(periods: any[], valueOf: (p: any) => T) {
  const week: Record<string, any[]> = {};
  for (const name of DAY_NAMES) week[name] = [];
  for (const p of [...periods].sort((a, b) =>
      (a.weekday - b.weekday) || (a.periodIndex - b.periodIndex))) {
    week[DAY_NAMES[p.weekday]].push({
      index: p.periodIndex, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt,
      isBreak: p.isBreak, ...((valueOf(p) as object) ?? {}),
    });
  }
  return week;
}

@Controller()
export class TimetableController {
  constructor(private svc: TimetableService) {}

  @Get("timetable/sections/:id")
  @Perm("schedule:read")
  section(@Param("id") id: string) { return this.svc.forSection(id); }

  /**
   * Who can be put in front of a class. Small and specific: a timetable builder
   * needs names, and the directory endpoint returns everyone (pupils included)
   * with no role filter, which is the wrong list for this job.
   */
  @Get("timetable/teachers")
  @Perm("schedule:read")
  teachers(@Req() req: Request) {
    return this.svc.teachers(req.principal!);
  }

  @Get("timetable/me")
  @Perm("schedule:read")
  mine(@Req() req: Request) { return this.svc.forTeacher(req.principal!.userId); }

  @Post("timetable/terms/:id/periods")
  @Perm("schedule:write")
  periods(@Param("id") id: string, @Body() body: unknown, @Req() req: Request) {
    return this.svc.setPeriods(req.principal!, id, body);
  }

  @Post("timetable/slots")
  @Perm("schedule:write")
  slot(@Body() body: unknown, @Req() req: Request) {
    return this.svc.setSlot(req.principal!, body);
  }

  /** Clear a period: the section is free then. Deleting is how you un-schedule. */
  @Delete("timetable/slots/:id")
  @Perm("schedule:write")
  removeSlot(@Param("id") id: string, @Req() req: Request) {
    return this.svc.removeSlot(req.principal!, id);
  }

  @Delete("timetable/periods/:id")
  @Perm("schedule:write")
  removePeriod(@Param("id") id: string, @Req() req: Request) {
    return this.svc.removePeriod(req.principal!, id);
  }

  /** The admin builder: the whole term's week in one payload. */
  @Get("timetable/terms/:id")
  @Perm("schedule:read")
  termWeek(@Param("id") id: string, @Req() req: Request) {
    return this.svc.termWeek(req.principal!, id);
  }

  /**
   * A pupil's week. The pupil reads their own, a verified guardian reads their
   * child's, and a teacher may read a pupil they teach.
   *
   * No @Perm: the roles that need this hold different capabilities (a pupil has
   * self:read, a guardian has family:read), so a single capability name cannot
   * express it. The handler decides, from the guardians table and the section
   * roster — not from anything the caller claims.
   */
  @Get("timetable/students/:studentId")
  student(@Param("studentId") studentId: string, @Req() req: Request) {
    return this.svc.forStudent(req.principal!, studentId);
  }
}
