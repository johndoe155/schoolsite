import {
  Body, Controller, Get, Inject, Injectable, NotFoundException, Param, Post, Req,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Request } from "express";
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor } from "../db/actor";
import {
  courseSections, timetablePeriods, timetableSlots, users, courses,
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
    return withActor(this.db, SERVICE_CTX(sectionId), async (tx) => {
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
}

/** The DB actor context for a read scoped to one section. */
function SERVICE_CTX(sectionId: string) {
  return { userId: null, role: "service" as const, sectionId };
}

/** Fold flat rows into { Monday: [{ index, start, end, value }] }. */
function groupByDay<T>(periods: any[], valueOf: (p: any) => T) {
  const week: Record<string, any[]> = {};
  for (const name of DAY_NAMES) week[name] = [];
  for (const p of [...periods].sort((a, b) =>
      (a.weekday - b.weekday) || (a.periodIndex - b.periodIndex))) {
    week[DAY_NAMES[p.weekday]].push({
      // The period id is in the payload because the admin editor has to post it
      // back to assign a slot. Leaving it out forced callers to re-query.
      id: p.id, index: p.periodIndex, label: p.label, startsAt: p.startsAt, endsAt: p.endsAt,
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
}
