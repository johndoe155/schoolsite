import { Controller, Get, Inject, NotFoundException, Param, Req } from "@nestjs/common";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { DB_TOKEN } from "../db/token";
import { withActor } from "../db/actor";
import {
  grades, attendanceRecords, attendanceSessions, guardians, students, users,
} from "../db/schema";
import { Perm } from "../common/guards";
import type { Request } from "express";

@Controller()
export class StudentController {
  constructor(@Inject(DB_TOKEN) private db: Db) {}

  /**
   * The pupil's own record: name, admission number, year group.
   *
   * Students hold only self:read, and there was no endpoint they could reach
   * for their own details — which is why the printable report card had no
   * admission number to put on it. Scoped to the caller with no id parameter at
   * all, so there is nothing to tamper with.
   */
  @Get("student/profile")
  @Perm("self:read")
  async myProfile(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const [row] = await tx.select({
        userId: students.userId, admissionNo: students.admissionNo,
        gradeLevel: students.gradeLevel, displayName: users.displayName,
      }).from(students).innerJoin(users, eq(users.id, students.userId))
        .where(eq(students.userId, p.userId)).limit(1);
      /* A parent or a staff account calling this has no students row; that is
         not an error worth a 500 — it is simply "no profile of your own". */
      if (!row) return { userId: p.userId, displayName: p.displayName, admissionNo: null, gradeLevel: null };
      return row;
    });
  }

  @Get("student/grades")
  @Perm("self:read")
  async myGrades(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select().from(grades)
        .where(and(eq(grades.studentUserId, p.userId), isNotNull(grades.releasedAt)));
      return { data: rows };
    });
  }

  @Get("student/attendance")
  @Perm("self:read")
  async myAttendance(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      const rows = await tx.select({
        date: attendanceSessions.date, status: attendanceRecords.status,
        sectionId: attendanceSessions.sectionId, note: attendanceRecords.note,
      }).from(attendanceRecords)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
        .where(eq(attendanceRecords.studentUserId, p.userId));
      return { data: rows };
    });
  }

  @Get("parent/children")
  @Perm("family:read")
  async children(@Req() req: Request) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      // LEFT joins on purpose: until the link is VERIFIED the student's own
      // row is RLS-invisible to this parent — the link shows as pending
      // instead of the child silently not existing.
      const rows = await tx.select({
        studentUserId: guardians.studentUserId, admissionNo: students.admissionNo,
        gradeLevel: students.gradeLevel, displayName: users.displayName,
        relationship: guardians.relationship, verified: guardians.verifiedAt,
      }).from(guardians)
        .leftJoin(students, eq(students.userId, guardians.studentUserId))
        .leftJoin(users, eq(users.id, guardians.studentUserId))
        .where(and(eq(guardians.userId, p.userId), isNull(guardians.endedAt)));
      return { data: rows };
    });
  }

  @Get("parent/children/:id/grades")
  @Perm("family:read")
  async childGrades(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertGuardian(tx, p.userId, id);
      const rows = await tx.select().from(grades)
        .where(and(eq(grades.studentUserId, id), isNotNull(grades.releasedAt)));
      return { data: rows };
    });
  }

  @Get("parent/children/:id/attendance")
  @Perm("family:read")
  async childAttendance(@Req() req: Request, @Param("id") id: string) {
    const p = req.principal!;
    return withActor(this.db, { userId: p.userId, role: p.activeRole }, async (tx) => {
      await this.assertGuardian(tx, p.userId, id);
      const rows = await tx.select({
        date: attendanceSessions.date, status: attendanceRecords.status,
      }).from(attendanceRecords)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
        .where(eq(attendanceRecords.studentUserId, id));
      return { data: rows };
    });
  }

  private async assertGuardian(tx: Db, userId: string, studentId: string) {
    const [g] = await tx.select().from(guardians).where(and(
      eq(guardians.userId, userId), eq(guardians.studentUserId, studentId),
      isNull(guardians.endedAt))).limit(1);
    if (!g) throw new NotFoundException({ code: "not_found" });
  }
}
