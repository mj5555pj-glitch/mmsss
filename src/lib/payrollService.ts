import {
  AttendanceRecord,
  LeaveRequest,
  OvertimeRecord,
  PayrollPeriod,
  PayrollRecord,
} from '../types';
import { resolveDailyAttendanceStatus, isEmployeeOnDuty, checkIsMissingCheckOut, getEffectiveEarlyCheckoutMinutes, getEffectiveLateMinutes } from './attendanceService';
import { getEffectiveWorkDateStr, normalizeDateString } from '../utils';

export const CALCULATION_VERSION = 'v1.0';

export interface CalculationDetails {
  calculationVersion: string;
  employeeId: string;
  employeeName: string;
  periodId: string;
  startDate: string;
  endDate: string;
  cycleDays: number;
  baseSalary: number;
  dailyRate: number;
  hourlyRate: number;
  perMinuteRate: number;

  // Deductions
  lateMinutes: number;
  lateDeduction: number;
  earlyCheckoutMinutes: number;
  earlyCheckoutDeduction: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  absenceDays: number;
  absenceDeduction: number;
  notEmployedDays?: number;
  notEmployedDeduction?: number;
  missingCheckOutCount?: number;
  missingCheckOutDeduction?: number;
  advances: number;
  manualDeductions: number;

  // Additions
  paidLeaveDays: number;
  overtimeMinutes: number;
  overtimeAddition: number;
  bonuses: number;
  allowances: number;

  // Totals
  totalAdditions: number;
  totalDeductions: number;
  netSalary: number;
}

/**
 * Calculates actual days in a payroll period inclusive of start and end dates.
 * Handles 28, 29, 30, 31 days cycles.
 */
export function calculateActualDaysInPeriod(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 30; // fallback if invalid
  }

  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive of end date
  return diffDays;
}

/**
 * Calculates daily rate based strictly on base salary divided by actual cycle days.
 * Never uses fixed 30 days.
 */
export function calculateDayValue(baseSalary: number, actualDaysInPeriod: number): number {
  if (baseSalary <= 0 || actualDaysInPeriod <= 0) return 0;
  return Number((baseSalary / actualDaysInPeriod).toFixed(4));
}

/**
 * Calculates deduction for lateness in minutes.
 * Uses 8 working hours per day default (480 minutes).
 */
export function calculateLateDeduction(
  lateMinutes: number,
  dailyRate: number,
  workHoursPerDay: number = 8
): number {
  if (lateMinutes <= 0 || dailyRate <= 0) return 0;
  const perMinuteRate = dailyRate / (workHoursPerDay * 60);
  return Number((lateMinutes * perMinuteRate).toFixed(2));
}

/**
 * Calculates deduction for early checkout in minutes.
 */
export function calculateEarlyCheckoutDeduction(
  earlyCheckoutMinutes: number,
  dailyRate: number,
  workHoursPerDay: number = 8
): number {
  if (earlyCheckoutMinutes <= 0 || dailyRate <= 0) return 0;
  const perMinuteRate = dailyRate / (workHoursPerDay * 60);
  return Number((earlyCheckoutMinutes * perMinuteRate).toFixed(2));
}

/**
 * Calculates deduction for unexcused absence days.
 * Absence penalty = absenceDays * (dailyRate * 2) [Double daily rate deduction]
 */
export function calculateAbsenceDeduction(absenceDays: number, dailyRate: number): number {
  if (absenceDays <= 0 || dailyRate <= 0) return 0;
  return Number((absenceDays * (dailyRate * 2)).toFixed(2));
}

/**
 * Calculates deduction for days when employee was not on active duty.
 * Deduction = notEmployedDays * dailyRate (1x daily rate deduction)
 */
export function calculateNotEmployedDeduction(notEmployedDays: number, dailyRate: number): number {
  if (notEmployedDays <= 0 || dailyRate <= 0) return 0;
  return Number((notEmployedDays * dailyRate).toFixed(2));
}

/**
 * Calculates deduction for unpaid leave days.
 * Deduction = unpaidLeaveDays * dailyRate
 */
export function calculateUnpaidLeaveDeduction(unpaidLeaveDays: number, dailyRate: number): number {
  if (unpaidLeaveDays <= 0 || dailyRate <= 0) return 0;
  return Number((unpaidLeaveDays * dailyRate).toFixed(2));
}

/**
 * Report helper for paid leave (no financial deduction).
 */
export function calculatePaidLeave(paidLeaveDays: number): { paidLeaveDays: number; deduction: number } {
  return {
    paidLeaveDays: Math.max(0, paidLeaveDays),
    deduction: 0,
  };
}

/**
 * Calculates monetary addition from approved overtime records.
 */
export function calculateOvertimeAddition(
  approvedOvertimeRecords: OvertimeRecord[],
  overtimeHourlyRate: number
): { overtimeMinutes: number; overtimeAddition: number } {
  let overtimeMinutes = 0;

  for (const record of approvedOvertimeRecords) {
    if (record.status === 'approved' && !(record as any).isDeleted) {
      overtimeMinutes += record.durationMinutes || 0;
    }
  }

  const overtimeHours = overtimeMinutes / 60;
  const overtimeAddition = Number((overtimeHours * overtimeHourlyRate).toFixed(2));

  return {
    overtimeMinutes,
    overtimeAddition,
  };
}

/**
 * Calculates net salary after all additions and deductions.
 */
export function calculateNetSalary(params: {
  baseSalary: number;
  bonuses: number;
  overtimeAddition: number;
  allowances?: number;
  lateDeduction: number;
  earlyCheckoutDeduction: number;
  missingCheckOutDeduction?: number;
  unpaidLeaveDeduction: number;
  absenceDeduction: number;
  notEmployedDeduction?: number;
  advances: number;
  manualDeductions: number;
}): { totalAdditions: number; totalDeductions: number; netSalary: number } {
  const allowances = params.allowances || 0;
  const notEmployedDeduction = params.notEmployedDeduction || 0;
  const missingCheckOutDeduction = params.missingCheckOutDeduction || 0;

  const totalAdditions = Number(
    (params.bonuses + params.overtimeAddition + allowances).toFixed(2)
  );

  const totalDeductions = Number(
    (
      params.lateDeduction +
      params.earlyCheckoutDeduction +
      missingCheckOutDeduction +
      params.unpaidLeaveDeduction +
      params.absenceDeduction +
      notEmployedDeduction +
      params.advances +
      params.manualDeductions
    ).toFixed(2)
  );

  const netSalary = Number(
    Math.max(0, params.baseSalary + totalAdditions - totalDeductions).toFixed(2)
  );

  return {
    totalAdditions,
    totalDeductions,
    netSalary,
  };
}

/**
 * Generates full PayrollRecord object (Pure Object creation, no DB writes).
 */
export function generatePayrollRecord(params: {
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  period: PayrollPeriod;
  employee?: { status?: string; employmentDate?: string; joinDate?: string; joinedAt?: string; terminationDate?: string; resignationDate?: string } | null;
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  overtimeRecords?: OvertimeRecord[];
  advances?: number;
  bonuses?: number;
  manualDeductions?: number;
  rewardAmount?: number;
  rewardPoints?: number;
  rewardType?: 'reward' | 'deduction' | 'neutral';
  rewardCalculationVersion?: string;
  rewardCalculatedAt?: string;
  overtimeHourlyRate?: number;
  workHoursPerDay?: number;
  settings?: { workStartTime?: string; workEndTime?: string; lateToleranceMinutes?: number; maxLateMinutes?: number; missingCheckOutDeductionAmount?: number; missingCheckOutGraceMinutes?: number; earlyCheckoutToleranceMinutes?: number } | null;
  now?: Date;
}): PayrollRecord {
  const {
    employeeId,
    employeeName,
    baseSalary,
    period,
    employee,
    attendanceRecords = [],
    leaveRequests = [],
    overtimeRecords = [],
    advances = 0,
    bonuses = 0,
    manualDeductions = 0,
    rewardAmount = 0,
    rewardPoints = 0,
    rewardType,
    rewardCalculationVersion = '1.1',
    rewardCalculatedAt,
    overtimeHourlyRate = 0,
    workHoursPerDay = 8,
    settings,
    now = new Date(),
  } = params;

  const cycleDays = calculateActualDaysInPeriod(period.startDate, period.endDate);
  const dailyRate = calculateDayValue(baseSalary, cycleDays);

  // Map existing attendance records by date for fast lookup
  const attendanceMap = new Map<string, AttendanceRecord>();
  for (const record of attendanceRecords) {
    if (record.date && !(record as any).isDeleted) {
      attendanceMap.set(record.date, record);
    }
  }

  // Aggregate Attendance data by iterating through days in period up to today
  let lateMinutes = 0;
  let earlyCheckoutMinutes = 0;
  let absenceDays = 0;
  let notEmployedDays = 0;
  let missingCheckOutCount = 0;

  const todayStr = getEffectiveWorkDateStr(now);
  const endLimitStr = todayStr < period.endDate ? todayStr : period.endDate;

  const parseDateStr = (s: string) => {
    const norm = normalizeDateString(s);
    const [y, m, d] = norm.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };

  const formatDateStr = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  let unpaidLeaveDays = 0;
  let paidLeaveDays = 0;

  const startDate = parseDateStr(period.startDate);
  const periodEnd = parseDateStr(period.endDate);
  const endDateLimit = parseDateStr(endLimitStr);

  if (!isNaN(startDate.getTime()) && !isNaN(periodEnd.getTime()) && startDate <= periodEnd) {
    const cur = new Date(startDate);
    while (cur <= periodEnd) {
      const dateStr = formatDateStr(cur);
      const existingRecord = attendanceMap.get(dateStr);

      const resolvedStatus = resolveDailyAttendanceStatus(
        existingRecord,
        dateStr,
        settings,
        now,
        leaveRequests,
        employeeId,
        employee
      );

      // Unpaid & Paid Leaves apply directly across the entire cycle (both past and future days)
      if (resolvedStatus === 'leave_unpaid') {
        unpaidLeaveDays++;
      } else if (resolvedStatus === 'leave_paid') {
        paidLeaveDays++;
      } else if (resolvedStatus === 'not_employed') {
        notEmployedDays++;
      } else if (cur <= endDateLimit) {
        // Attendance evaluation up to effective today
        if (resolvedStatus === 'absent') {
          absenceDays++;
        } else if (existingRecord) {
          if (checkIsMissingCheckOut(existingRecord, dateStr, settings, now).isMissingCheckOut) {
            missingCheckOutCount++;
          }
          const effectiveLate = getEffectiveLateMinutes(
            existingRecord,
            settings?.workStartTime || '08:00',
            settings?.lateToleranceMinutes !== undefined ? Number(settings.lateToleranceMinutes) : 15
          );
          lateMinutes += effectiveLate;
          const effectiveEarlyOut = getEffectiveEarlyCheckoutMinutes(
            existingRecord,
            settings?.workEndTime || '16:00',
            settings?.earlyCheckoutToleranceMinutes !== undefined ? Number(settings.earlyCheckoutToleranceMinutes) : 15
          );
          earlyCheckoutMinutes += effectiveEarlyOut;
        }
      }

      cur.setDate(cur.getDate() + 1);
    }
  } else {
    // Fallback for edge cases
    for (const record of attendanceRecords) {
      const isOnDuty = isEmployeeOnDuty(employee, record.date);
      if (record.status === 'leave_unpaid') {
        unpaidLeaveDays++;
      } else if (record.status === 'leave_paid') {
        paidLeaveDays++;
      } else if (record.status === 'absent' && isOnDuty) {
        absenceDays++;
      } else if (!isOnDuty) {
        notEmployedDays++;
      } else {
        if (checkIsMissingCheckOut(record, record.date, settings, now).isMissingCheckOut) {
          missingCheckOutCount++;
        }
        const effectiveLate = getEffectiveLateMinutes(
          record,
          settings?.workStartTime || '08:00',
          settings?.lateToleranceMinutes !== undefined ? Number(settings.lateToleranceMinutes) : 15
        );
        lateMinutes += effectiveLate;
        earlyCheckoutMinutes += getEffectiveEarlyCheckoutMinutes(
          record,
          settings?.workEndTime || '16:00',
          settings?.earlyCheckoutToleranceMinutes !== undefined ? Number(settings.earlyCheckoutToleranceMinutes) : 15
        );
      }
    }
  }

  // Aggregate Overtime (Minute rate is identical to the salary cycle minute rate)
  const cycleHourlyRate = dailyRate > 0 && workHoursPerDay > 0 ? (dailyRate / workHoursPerDay) : 0;
  const effectiveOvertimeHourlyRate = (overtimeHourlyRate !== undefined && overtimeHourlyRate > 0)
    ? overtimeHourlyRate
    : cycleHourlyRate;

  const { overtimeMinutes, overtimeAddition } = calculateOvertimeAddition(
    overtimeRecords,
    effectiveOvertimeHourlyRate
  );

  // Deductions
  const lateDeduction = calculateLateDeduction(lateMinutes, dailyRate, workHoursPerDay);
  const earlyCheckoutDeduction = calculateEarlyCheckoutDeduction(
    earlyCheckoutMinutes,
    dailyRate,
    workHoursPerDay
  );
  const missingCheckOutDeduction = missingCheckOutCount * (settings?.missingCheckOutDeductionAmount ?? 5000);
  const absenceDeduction = calculateAbsenceDeduction(absenceDays, dailyRate);
  const notEmployedDeduction = calculateNotEmployedDeduction(notEmployedDays, dailyRate);
  const unpaidLeaveDeduction = calculateUnpaidLeaveDeduction(unpaidLeaveDays, dailyRate);

  // Totals
  const rewardAdditions = rewardAmount > 0 ? rewardAmount : 0;
  const rewardDeductions = rewardAmount < 0 ? Math.abs(rewardAmount) : 0;

  const { totalAdditions, totalDeductions, netSalary } = calculateNetSalary({
    baseSalary,
    bonuses: bonuses + rewardAdditions,
    overtimeAddition,
    lateDeduction,
    earlyCheckoutDeduction,
    missingCheckOutDeduction,
    unpaidLeaveDeduction,
    absenceDeduction,
    notEmployedDeduction,
    advances,
    manualDeductions: manualDeductions + rewardDeductions,
  });

  return {
    id: `pr_${period.id}_${employeeId}`,
    periodId: period.id,
    employeeId,
    employeeName,
    baseSalary,
    cycleDays,
    dailyRate: Number(dailyRate.toFixed(2)),

    lateMinutes,
    lateDeduction,
    earlyCheckoutMinutes,
    earlyCheckoutDeduction,
    missingCheckOutCount,
    missingCheckOutDeduction,
    absenceDays,
    absenceDeduction,
    notEmployedDays,
    notEmployedDeduction,
    unpaidLeaveDays,
    unpaidLeaveDeduction,
    paidLeaveDays,

    overtimeMinutes,
    overtimeAddition,
    bonuses,

    advances,
    manualDeductions,

    rewardAmount,
    rewardPoints,
    rewardType: rewardType || (rewardAmount > 0 ? 'reward' : rewardAmount < 0 ? 'deduction' : 'neutral'),
    rewardCalculationVersion,
    rewardCalculatedAt: rewardCalculatedAt || new Date().toISOString(),

    totalAdditions,
    totalDeductions,
    netSalary,

    calculationVersion: CALCULATION_VERSION,
    status: 'draft',
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates detailed breakdown calculation object for inspection/transparency.
 */
export function generateCalculationDetails(params: {
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  period: PayrollPeriod;
  employee?: { status?: string; employmentDate?: string; joinDate?: string; joinedAt?: string; terminationDate?: string; resignationDate?: string } | null;
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  overtimeRecords?: OvertimeRecord[];
  advances?: number;
  bonuses?: number;
  manualDeductions?: number;
  rewardAmount?: number;
  rewardPoints?: number;
  rewardType?: 'reward' | 'deduction' | 'neutral';
  rewardCalculationVersion?: string;
  rewardCalculatedAt?: string;
  overtimeHourlyRate?: number;
  workHoursPerDay?: number;
  settings?: { workStartTime?: string; workEndTime?: string; lateToleranceMinutes?: number; maxLateMinutes?: number; missingCheckOutDeductionAmount?: number; missingCheckOutGraceMinutes?: number; earlyCheckoutToleranceMinutes?: number } | null;
  now?: Date;
}): CalculationDetails {
  const record = generatePayrollRecord(params);
  const workHoursPerDay = params.workHoursPerDay || 8;
  const hourlyRate = Number((record.dailyRate / workHoursPerDay).toFixed(4));
  const perMinuteRate = Number((hourlyRate / 60).toFixed(6));

  return {
    calculationVersion: CALCULATION_VERSION,
    employeeId: record.employeeId,
    employeeName: record.employeeName,
    periodId: record.periodId,
    startDate: params.period.startDate,
    endDate: params.period.endDate,
    cycleDays: record.cycleDays,
    baseSalary: record.baseSalary,
    dailyRate: record.dailyRate,
    hourlyRate,
    perMinuteRate,

    lateMinutes: record.lateMinutes,
    lateDeduction: record.lateDeduction,
    earlyCheckoutMinutes: record.earlyCheckoutMinutes || 0,
    earlyCheckoutDeduction: record.earlyCheckoutDeduction || 0,
    unpaidLeaveDays: record.unpaidLeaveDays,
    unpaidLeaveDeduction: record.unpaidLeaveDeduction,
    absenceDays: record.absenceDays,
    absenceDeduction: record.absenceDeduction,
    notEmployedDays: record.notEmployedDays || 0,
    notEmployedDeduction: record.notEmployedDeduction || 0,
    missingCheckOutCount: record.missingCheckOutCount || 0,
    missingCheckOutDeduction: record.missingCheckOutDeduction || 0,
    advances: record.advances,
    manualDeductions: record.manualDeductions,

    paidLeaveDays: record.paidLeaveDays,
    overtimeMinutes: record.overtimeMinutes,
    overtimeAddition: record.overtimeAddition,
    bonuses: record.bonuses,
    allowances: 0,

    totalAdditions: record.totalAdditions,
    totalDeductions: record.totalDeductions,
    netSalary: record.netSalary,
  };
}
