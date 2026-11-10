import { CompanySettings, OvertimeRecord } from '../types';

export interface OvertimeValidationResult {
  allowed: boolean;
  reason?: string;
  errorCode?: 'DURING_OFFICIAL_WORK_HOURS' | 'NO_ACTIVE_SESSION' | 'INVALID_TIME';
}

export interface OvertimeSummary {
  totalCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalMinutes: number;
  totalHours: number;
  totalAmount: number;
}

/**
 * Converts "HH:mm" string to minutes from midnight.
 */
function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Converts Date or ISO string to minutes from midnight.
 */
function dateToMinutes(dateInput: Date | string): number {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Checks if overtime can be started.
 * Overtime cannot be started during official work hours.
 */
export function canStartOvertime(
  currentTime: Date | string,
  settings: CompanySettings
): OvertimeValidationResult {
  const currentMins = dateToMinutes(currentTime);
  const startMins = timeStringToMinutes(settings.workStartTime);
  const endMins = timeStringToMinutes(settings.workEndTime);

  // Check if current time falls within official shift hours
  const isDuringShift = currentMins >= startMins && currentMins < endMins;

  if (isDuringShift) {
    return {
      allowed: false,
      errorCode: 'DURING_OFFICIAL_WORK_HOURS',
      reason: 'لا يمكن بدء الوقت الإضافي أثناء ساعات الدوام الرسمية',
    };
  }

  return { allowed: true };
}

/**
 * Checks if active overtime session can be ended.
 */
export function canEndOvertime(
  startTime: string | null | undefined
): OvertimeValidationResult {
  if (!startTime) {
    return {
      allowed: false,
      errorCode: 'NO_ACTIVE_SESSION',
      reason: 'لم يتم تسجيل بداية وقت إضافي لإنهائه',
    };
  }

  return { allowed: true };
}

/**
 * Calculates overtime duration in minutes between start and end time.
 */
export function calculateOvertimeMinutes(
  startTime: Date | string,
  endTime: Date | string
): number {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return 0;

  return Math.round(diffMs / 60000);
}

/**
 * Converts minutes to decimal hours rounded to 2 decimal places.
 * e.g., 90 minutes = 1.5 hours
 */
export function calculateOvertimeHours(durationMinutes: number): number {
  if (durationMinutes <= 0) return 0;
  return Number((durationMinutes / 60).toFixed(2));
}

/**
 * Calculates total overtime monetary amount based on hours and hourly rate.
 */
export function calculateOvertimeAmount(
  hours: number,
  overtimeHourlyRate: number
): number {
  if (hours <= 0 || overtimeHourlyRate <= 0) return 0;
  return Number((hours * overtimeHourlyRate).toFixed(2));
}

/**
 * Creates a pending OvertimeRecord object (Pure Object creation, no DB write).
 */
export function createPendingOvertime(
  employeeId: string,
  employeeName: string,
  date: string,
  startTime: string,
  endTime?: string,
  durationMinutes: number = 0,
  notes?: string
): OvertimeRecord {
  return {
    id: `ot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    employeeId,
    employeeName,
    date,
    startTime,
    endTime,
    durationMinutes,
    status: 'pending',
    notes,
  };
}

/**
 * Pure function to approve an overtime record.
 */
export function approveOvertime(
  record: OvertimeRecord,
  approvedBy: string
): OvertimeRecord {
  return {
    ...record,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
}

/**
 * Pure function to reject an overtime record with reason.
 */
export function rejectOvertime(
  record: OvertimeRecord,
  rejectedBy: string,
  rejectionReason?: string
): OvertimeRecord {
  return {
    ...record,
    status: 'rejected',
    approvedBy: rejectedBy,
    approvedAt: new Date().toISOString(),
    rejectionReason,
  };
}

/**
 * Calculates overtime summary (counts, duration, monetary value for approved items).
 */
export function getOvertimeSummary(
  records: OvertimeRecord[],
  overtimeHourlyRate: number = 0
): OvertimeSummary {
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let totalApprovedMinutes = 0;

  for (const record of records) {
    if (record.status === 'pending') {
      pendingCount++;
    } else if (record.status === 'approved') {
      approvedCount++;
      totalApprovedMinutes += record.durationMinutes || 0;
    } else if (record.status === 'rejected') {
      rejectedCount++;
    }
  }

  const totalHours = calculateOvertimeHours(totalApprovedMinutes);
  const totalAmount = calculateOvertimeAmount(totalHours, overtimeHourlyRate);

  return {
    totalCount: records.length,
    pendingCount,
    approvedCount,
    rejectedCount,
    totalMinutes: totalApprovedMinutes,
    totalHours,
    totalAmount,
  };
}
