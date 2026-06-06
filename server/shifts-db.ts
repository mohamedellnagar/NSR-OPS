/**
 * shifts-db.ts
 * Kitchen shift management: CRUD + weekly stats
 */

import mysql from "mysql2/promise";

async function getConn() {
  return mysql.createConnection(process.env.DATABASE_URL as string);
}

export interface ShiftWithAssignments {
  id: number;
  shiftDate: string;
  shiftType: "morning" | "afternoon" | "night";
  startTime: string;
  endTime: string;
  notes: string | null;
  createdBy: number | null;
  createdAt: string;
  assignments: Array<{
    id: number;
    employeeName: string;
    employeeNameAr: string | null;
    role: string | null;
  }>;
}

export interface ShiftStats {
  totalShifts: number;
  morningCount: number;
  afternoonCount: number;
  nightCount: number;
  avgStaffPerShift: number;
  coverageByDay: Array<{ date: string; shiftTypes: string[] }>;
}

export async function listShifts(fromDate: string, toDate: string): Promise<ShiftWithAssignments[]> {
  const conn = await getConn();
  try {
    const [shifts] = await conn.execute(
      `SELECT * FROM shifts WHERE shiftDate BETWEEN ? AND ? ORDER BY shiftDate ASC, shiftType ASC`,
      [fromDate, toDate]
    ) as [any[], any];

    if (!shifts.length) return [];

    const shiftIds = shifts.map((s: any) => s.id);
    const ph = shiftIds.map(() => "?").join(",");
    const [assignments] = await conn.execute(
      `SELECT * FROM shift_assignments WHERE shiftId IN (${ph})`,
      shiftIds
    ) as [any[], any];

    const assignMap = new Map<number, any[]>();
    for (const a of assignments) {
      if (!assignMap.has(a.shiftId)) assignMap.set(a.shiftId, []);
      assignMap.get(a.shiftId)!.push(a);
    }

    return shifts.map((s: any) => ({
      id: s.id,
      shiftDate: s.shiftDate instanceof Date ? s.shiftDate.toISOString().split("T")[0] : String(s.shiftDate),
      shiftType: s.shiftType,
      startTime: s.startTime,
      endTime: s.endTime,
      notes: s.notes,
      createdBy: s.createdBy,
      createdAt: s.createdAt,
      assignments: (assignMap.get(s.id) || []).map((a: any) => ({
        id: a.id,
        employeeName: a.employeeName,
        employeeNameAr: a.employeeNameAr,
        role: a.role,
      })),
    }));
  } finally {
    await conn.end();
  }
}

export async function createShift(data: {
  shiftDate: string;
  shiftType: "morning" | "afternoon" | "night";
  startTime: string;
  endTime: string;
  notes?: string;
  createdBy: number;
  assignments: Array<{ employeeName: string; employeeNameAr?: string; role?: string }>;
}): Promise<{ id: number }> {
  const conn = await getConn();
  try {
    const [res] = await conn.execute(
      `INSERT INTO shifts (shiftDate, shiftType, startTime, endTime, notes, createdBy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.shiftDate, data.shiftType, data.startTime, data.endTime, data.notes ?? null, data.createdBy]
    ) as [any, any];
    const shiftId = res.insertId;

    if (data.assignments?.length) {
      for (const a of data.assignments) {
        await conn.execute(
          `INSERT INTO shift_assignments (shiftId, employeeName, employeeNameAr, role)
           VALUES (?, ?, ?, ?)`,
          [shiftId, a.employeeName, a.employeeNameAr ?? null, a.role ?? null]
        );
      }
    }

    return { id: shiftId };
  } finally {
    await conn.end();
  }
}

export async function updateShift(
  id: number,
  data: {
    shiftDate?: string;
    shiftType?: "morning" | "afternoon" | "night";
    startTime?: string;
    endTime?: string;
    notes?: string;
    assignments?: Array<{ employeeName: string; employeeNameAr?: string; role?: string }>;
  }
): Promise<void> {
  const conn = await getConn();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    if (data.shiftDate) { fields.push("shiftDate = ?"); values.push(data.shiftDate); }
    if (data.shiftType) { fields.push("shiftType = ?"); values.push(data.shiftType); }
    if (data.startTime) { fields.push("startTime = ?"); values.push(data.startTime); }
    if (data.endTime)   { fields.push("endTime = ?");   values.push(data.endTime); }
    if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes); }

    if (fields.length) {
      await conn.execute(`UPDATE shifts SET ${fields.join(", ")} WHERE id = ?`, [...values, id]);
    }

    if (data.assignments !== undefined) {
      await conn.execute(`DELETE FROM shift_assignments WHERE shiftId = ?`, [id]);
      for (const a of data.assignments) {
        await conn.execute(
          `INSERT INTO shift_assignments (shiftId, employeeName, employeeNameAr, role) VALUES (?, ?, ?, ?)`,
          [id, a.employeeName, a.employeeNameAr ?? null, a.role ?? null]
        );
      }
    }
  } finally {
    await conn.end();
  }
}

export async function deleteShift(id: number): Promise<void> {
  const conn = await getConn();
  try {
    await conn.execute(`DELETE FROM shifts WHERE id = ?`, [id]);
  } finally {
    await conn.end();
  }
}

export async function getShiftStats(fromDate: string, toDate: string): Promise<ShiftStats> {
  const conn = await getConn();
  try {
    const [shifts] = await conn.execute(
      `SELECT s.id, s.shiftDate, s.shiftType,
              COUNT(sa.id) AS staffCount
       FROM shifts s
       LEFT JOIN shift_assignments sa ON sa.shiftId = s.id
       WHERE s.shiftDate BETWEEN ? AND ?
       GROUP BY s.id, s.shiftDate, s.shiftType
       ORDER BY s.shiftDate ASC`,
      [fromDate, toDate]
    ) as [any[], any];

    const totalShifts = shifts.length;
    const morningCount = shifts.filter((s: any) => s.shiftType === "morning").length;
    const afternoonCount = shifts.filter((s: any) => s.shiftType === "afternoon").length;
    const nightCount = shifts.filter((s: any) => s.shiftType === "night").length;
    const totalStaff = shifts.reduce((s: number, r: any) => s + Number(r.staffCount), 0);
    const avgStaff = totalShifts > 0 ? parseFloat((totalStaff / totalShifts).toFixed(1)) : 0;

    // Coverage by day
    const dayMap = new Map<string, string[]>();
    for (const s of shifts) {
      const day = s.shiftDate instanceof Date ? s.shiftDate.toISOString().split("T")[0] : String(s.shiftDate);
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(s.shiftType);
    }

    return {
      totalShifts,
      morningCount,
      afternoonCount,
      nightCount,
      avgStaffPerShift: avgStaff,
      coverageByDay: Array.from(dayMap.entries()).map(([date, shiftTypes]) => ({ date, shiftTypes })),
    };
  } finally {
    await conn.end();
  }
}
