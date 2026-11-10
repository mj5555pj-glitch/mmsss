import { CompanySettings, CompanyLocation } from '../types';
import { getEffectiveWorkDateStr, normalizeDateString } from '../utils';

export interface MatchedLocationResult {
  isWithinRadius: boolean;
  distanceMeters: number;
  matchedLocationName?: string;
  matchedLocationId?: string;
  errorMessage?: string;
}

export interface AttendanceValidationResult {
  isValid: boolean;
  status: 'present' | 'late' | 'absent';
  errorCode?: 'OUTSIDE_ALLOWED_AREA' | 'EARLY_CHECKIN_NOT_ALLOWED' | 'OUTSIDE_WORK_HOURS';
  errorMessage?: string;
  distanceMeters: number;
  isWithinRadius: boolean;
  matchedLocationName?: string;
  lateMinutes: number;
  isLateExceeded: boolean;
}

/**
 * Calculates distance between two GPS coordinates in meters using the Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Checks if user coordinates fall within company allowed radius.
 */
export function isInsideAllowedRadius(
  userLat: number,
  userLon: number,
  companyLat: number,
  companyLon: number,
  allowedRadiusMeters: number
): { isInside: boolean; distanceMeters: number } {
  const distanceMeters = calculateDistance(userLat, userLon, companyLat, companyLon);
  return {
    isInside: distanceMeters <= allowedRadiusMeters,
    distanceMeters,
  };
}

/**
 * Validates user GPS location against ALL active company locations.
 * If employee is inside any active location's radius, returns isWithinRadius: true along with matched location details.
 * If outside all active locations, returns isWithinRadius: false with standard error message.
 */
export function checkUserLocationAgainstCompanyLocations(
  userLat: number,
  userLon: number,
  settings: CompanySettings
): MatchedLocationResult {
  const activeLocations = (settings.companyLocations || []).filter((loc) => loc.isActive !== false);

  if (activeLocations.length > 0) {
    let minDistance = Infinity;
    let matchedLoc: CompanyLocation | null = null;

    for (const loc of activeLocations) {
      const distance = calculateDistance(userLat, userLon, loc.latitude, loc.longitude);
      const isInside = distance <= loc.radiusMeters;

      if (isInside) {
        if (!matchedLoc || distance < minDistance) {
          minDistance = distance;
          matchedLoc = loc;
        }
      } else {
        if (distance < minDistance) {
          minDistance = distance;
        }
      }
    }

    if (matchedLoc) {
      return {
        isWithinRadius: true,
        distanceMeters: minDistance,
        matchedLocationName: matchedLoc.name,
        matchedLocationId: matchedLoc.id,
      };
    }

    return {
      isWithinRadius: false,
      distanceMeters: minDistance === Infinity ? 0 : minDistance,
      errorMessage: 'أنت خارج نطاق جميع مواقع الشركة المعتمدة.',
    };
  }

  // Fallback to legacy single location configuration if no companyLocations list configured
  const distanceMeters = calculateDistance(
    userLat,
    userLon,
    settings.companyLatitude || 0,
    settings.companyLongitude || 0
  );
  const radius = settings.allowedRadiusMeters || 100;
  const isInside = distanceMeters <= radius;

  if (isInside) {
    return {
      isWithinRadius: true,
      distanceMeters,
      matchedLocationName: settings.companyName || 'الموقع الرئيسي',
    };
  }

  return {
    isWithinRadius: false,
    distanceMeters,
    errorMessage: 'أنت خارج نطاق جميع مواقع الشركة المعتمدة.',
  };
}

/**
 * Converts "HH:mm" time string into total minutes from midnight.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

/**
 * Gets minutes from midnight for a given Date object or ISO string or HH:mm string.
 */
export function dateToMinutes(dateInput: Date | string): number {
  if (!dateInput) return 0;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    // 1. Check if string is "HH:mm" or "HH:mm:ss"
    const timeMatch = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      return h * 60 + m;
    }
    
    // 2. Check if valid Date object
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date.getHours() * 60 + date.getMinutes();
    }

    // 3. Fallback regex to extract T(HH:mm) if Date parse failed
    const isoTimeMatch = trimmed.match(/T(\d{1,2}):(\d{2})/);
    if (isoTimeMatch) {
      const h = parseInt(isoTimeMatch[1], 10);
      const m = parseInt(isoTimeMatch[2], 10);
      return h * 60 + m;
    }

    return 0;
  }
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
    return dateInput.getHours() * 60 + dateInput.getMinutes();
  }
  return 0;
}

/**
 * Validates whether current time falls within allowed check-in window.
 * Window starts (earlyCheckInMinutes) before workStartTime and ends at workEndTime.
 */
export function canCheckIn(
  checkInTime: Date | string,
  workStartTime: string,
  workEndTime: string,
  earlyCheckInMinutes: number = 60
): { canCheckIn: boolean; reason?: 'EARLY_CHECKIN_NOT_ALLOWED' | 'OUTSIDE_WORK_HOURS' } {
  const checkInMins = dateToMinutes(checkInTime);
  const startMins = timeStringToMinutes(workStartTime);
  const endMins = timeStringToMinutes(workEndTime);

  const allowedStartMins = startMins - earlyCheckInMinutes;

  if (checkInMins < allowedStartMins) {
    return {
      canCheckIn: false,
      reason: 'EARLY_CHECKIN_NOT_ALLOWED',
    };
  }

  if (checkInMins > endMins) {
    return {
      canCheckIn: false,
      reason: 'OUTSIDE_WORK_HOURS',
    };
  }

  return { canCheckIn: true };
}

/**
 * Calculates late minutes based on work start time and tolerance window.
 * If within tolerance, lateMinutes = 0.
 * If tolerance exceeded, lateMinutes is calculated from exact work start time.
 */
export function calculateLateMinutes(
  checkInTime: Date | string,
  workStartTime: string,
  lateToleranceMinutes: number = 0
): number {
  const checkInMins = dateToMinutes(checkInTime);
  const startMins = timeStringToMinutes(workStartTime);

  const differenceMinutes = checkInMins - startMins;

  if (differenceMinutes <= 0) {
    return 0; // On time or early
  }

  if (differenceMinutes <= lateToleranceMinutes) {
    return 0; // Within tolerance window
  }

  // Tolerance exceeded -> full late minutes from workStartTime
  return differenceMinutes;
}

/**
 * Checks if late minutes exceed maximum allowed late minutes.
 */
export function isLateExceeded(
  lateMinutes: number,
  maxLateMinutes: number
): boolean {
  return maxLateMinutes > 0 && lateMinutes > maxLateMinutes;
}

/**
 * Pure validation for employee check-in request.
 * Does NOT write or mutate any Firestore data.
 */
export function validateAttendance(
  userLat: number,
  userLon: number,
  checkInTime: Date | string,
  settings: CompanySettings
): AttendanceValidationResult {
  // 1. Check Location Radius against ALL active company locations
  const locationCheck = checkUserLocationAgainstCompanyLocations(userLat, userLon, settings);

  if (!locationCheck.isWithinRadius) {
    return {
      isValid: false,
      status: 'absent',
      errorCode: 'OUTSIDE_ALLOWED_AREA',
      errorMessage: locationCheck.errorMessage || 'أنت خارج نطاق جميع مواقع الشركة المعتمدة.',
      distanceMeters: locationCheck.distanceMeters,
      isWithinRadius: false,
      matchedLocationName: undefined,
      lateMinutes: 0,
      isLateExceeded: false,
    };
  }

  // 2. Check Check-In Time Window
  const timeCheck = canCheckIn(
    checkInTime,
    settings.workStartTime,
    settings.workEndTime,
    settings.earlyCheckInMinutes
  );

  if (!timeCheck.canCheckIn) {
    const isEarly = timeCheck.reason === 'EARLY_CHECKIN_NOT_ALLOWED';
    return {
      isValid: false,
      status: 'absent',
      errorCode: timeCheck.reason,
      errorMessage: isEarly
        ? 'لا يمكن تسجيل البصمة قبل نافذة الدوام المسموح بها'
        : 'لا يمكن تسجيل البصمة العادية خارج ساعات الدوام الرسمية',
      distanceMeters: locationCheck.distanceMeters,
      isWithinRadius: true,
      matchedLocationName: locationCheck.matchedLocationName,
      lateMinutes: 0,
      isLateExceeded: false,
    };
  }

  // 3. Calculate Late Minutes
  const lateMins = calculateLateMinutes(
    checkInTime,
    settings.workStartTime,
    settings.lateToleranceMinutes
  );

  // 4. Check Maximum Late Exceeded
  const lateExceeded = isLateExceeded(lateMins, settings.maxLateMinutes);

  let status: 'present' | 'late' | 'absent' = 'present';
  if (lateExceeded) {
    status = 'absent';
  } else if (lateMins > 0) {
    status = 'late';
  }

  return {
    isValid: true,
    status,
    distanceMeters: locationCheck.distanceMeters,
    isWithinRadius: true,
    matchedLocationName: locationCheck.matchedLocationName,
    lateMinutes: lateMins,
    isLateExceeded: lateExceeded,
  };
}

/**
 * Validates whether checkout time is permitted.
 */
export function canCheckOut(
  checkOutTime: Date | string,
  workStartTime: string,
  workEndTime: string,
  checkInTime?: Date | string
): { canCheckOut: boolean; reason?: string } {
  if (checkInTime) {
    const checkOutMs = new Date(checkOutTime).getTime();
    const checkInMs = new Date(checkInTime).getTime();
    if (checkOutMs < checkInMs) {
      return {
        canCheckOut: false,
        reason: 'CHECKOUT_BEFORE_CHECKIN_TIME',
      };
    }
    return { canCheckOut: true };
  }

  const checkOutDate = typeof checkOutTime === 'string' ? new Date(checkOutTime) : checkOutTime;
  const checkOutMins = dateToMinutes(checkOutDate);
  const startMins = timeStringToMinutes(workStartTime);

  // Late night checkouts between 00:00 and 03:00 AM belong to yesterday's shift, so allowed
  if (checkOutDate.getHours() < 3) {
    return { canCheckOut: true };
  }

  if (checkOutMins < startMins) {
    return {
      canCheckOut: false,
      reason: 'CHECKOUT_BEFORE_START_TIME',
    };
  }

  return { canCheckOut: true };
}

/**
 * Calculates early checkout minutes based on official work end time and tolerance.
 * Accounts for 03:00 AM administrative day rollover and late-night checkouts.
 */
export function calculateEarlyCheckoutMinutes(
  checkOutTime: Date | string,
  workEndTime: string,
  earlyCheckoutToleranceMinutes: number = 0,
  recordDateStr?: string
): number {
  if (!checkOutTime) return 0;
  const checkOutDate = typeof checkOutTime === 'string' ? new Date(checkOutTime) : checkOutTime;
  if (isNaN(checkOutDate.getTime())) return 0;

  // Determine effective shift date (rolls over at 03:00 AM)
  const effectiveDate = recordDateStr || getEffectiveWorkDateStr(checkOutDate);
  const [h, m] = (workEndTime || '16:00').split(':').map(Number);
  
  let expectedEndDate = new Date(`${effectiveDate}T${String(h || 16).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`);

  // Handle overnight shifts where workEndTime is early morning (e.g. 00:00, 01:00, 02:00 AM)
  if (h < 3) {
    const nextDay = new Date(`${effectiveDate}T12:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    const yr = nextDay.getFullYear();
    const mo = String(nextDay.getMonth() + 1).padStart(2, '0');
    const da = String(nextDay.getDate()).padStart(2, '0');
    expectedEndDate = new Date(`${yr}-${mo}-${da}T${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`);
  }

  // If checked out at or after official work end time (including after midnight / late night), early checkout is strictly 0!
  if (checkOutDate.getTime() >= expectedEndDate.getTime()) {
    return 0; // Left on time or after work end time
  }

  const diffMs = expectedEndDate.getTime() - checkOutDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes <= earlyCheckoutToleranceMinutes) {
    return 0; // Within tolerance
  }

  return diffMinutes;
}

/**
 * Resolves effective early checkout minutes for a record.
 * Recalculates dynamically if checkOutTime is present to ensure accuracy across past and future records.
 */
export function getEffectiveEarlyCheckoutMinutes(
  record: { checkOutTime?: string; earlyCheckoutMinutes?: number; date?: string; isAdjusted?: boolean; status?: string } | null | undefined,
  workEndTime: string = '16:00',
  toleranceMinutes: number = 15
): number {
  if (!record) return 0;

  // 1. If administrative adjustment or grace request approval cleared early checkout, return adjusted minutes
  if (record.isAdjusted && record.earlyCheckoutMinutes !== undefined) {
    return Math.max(0, record.earlyCheckoutMinutes);
  }

  const tolerance = typeof toleranceMinutes === 'number' && !isNaN(toleranceMinutes) && toleranceMinutes >= 0
    ? toleranceMinutes
    : 15;

  // 2. Otherwise calculate dynamically if checkOutTime is present
  if (record.checkOutTime) {
    return calculateEarlyCheckoutMinutes(
      record.checkOutTime,
      workEndTime,
      tolerance,
      record.date
    );
  }

  // 3. Fallback for stored earlyCheckoutMinutes: if within tolerance, evaluate to 0
  const storedEarly = Math.max(0, record.earlyCheckoutMinutes || 0);
  if (storedEarly <= tolerance) {
    return 0;
  }

  return storedEarly;
}

/**
 * Resolves effective late minutes for a record.
 * Recalculates dynamically if checkInTime is present and applies late tolerance window correctly.
 * If employee clocked in during the tolerance period (e.g. 15 minutes), lateMinutes evaluates to 0.
 */
export function getEffectiveLateMinutes(
  record: { checkInTime?: string; lateMinutes?: number; date?: string; isAdjusted?: boolean; status?: string } | null | undefined,
  workStartTime: string = '08:00',
  lateToleranceMinutes: number = 15
): number {
  if (!record) return 0;

  // 1. If administrative adjustment or grace request approval occurred, return adjusted minutes
  if (record.isAdjusted && record.lateMinutes !== undefined) {
    return Math.max(0, record.lateMinutes);
  }

  // 2. If status is marked as 'present' (حاضر), they are considered on time within allowed tolerance -> 0 late minutes
  if (record.status === 'present') {
    return 0;
  }

  const tolerance = typeof lateToleranceMinutes === 'number' && !isNaN(lateToleranceMinutes) && lateToleranceMinutes >= 0
    ? lateToleranceMinutes
    : 15;

  // 3. If checkInTime is present, calculate with tolerance window
  if (record.checkInTime) {
    return calculateLateMinutes(
      record.checkInTime,
      workStartTime,
      tolerance
    );
  }

  // 4. Fallback for stored lateMinutes without checkInTime:
  // If stored lateMinutes is within the tolerance window (e.g. 15 min), it must NOT be deducted (evaluates to 0).
  const storedLate = Math.max(0, record.lateMinutes || 0);
  if (storedLate <= tolerance) {
    return 0;
  }

  return storedLate;
}

/**
 * Determines overall daily attendance status based on parameters.
 */
export function getAttendanceStatus(
  lateMinutes: number,
  maxLateMinutes: number,
  isPresent: boolean,
  isLeave: boolean = false,
  leaveType?: 'paid' | 'unpaid'
): 'present' | 'late' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'holiday' {
  if (isLeave) {
    return leaveType === 'unpaid' ? 'leave_unpaid' : 'leave_paid';
  }

  if (!isPresent) {
    return 'absent';
  }

  if (isLateExceeded(lateMinutes, maxLateMinutes)) {
    return 'absent';
  }

  if (lateMinutes > 0) {
    return 'late';
  }

  return 'present';
}

/**
 * Helper to determine if an employee is currently or was on active duty on a specific date.
 * If status is suspended, terminated, long_leave, disabled, or if date is outside employment period, returns false.
 */
export function isEmployeeOnDuty(
  employee?: {
    status?: string;
    employmentDate?: string;
    joinDate?: string;
    joinedAt?: string;
    terminationDate?: string;
    resignationDate?: string;
  } | null,
  dateStr?: string
): boolean {
  if (!employee) return true;

  const st = (employee.status || '').toLowerCase();
  if (
    st === 'suspended' ||
    st === 'terminated' ||
    st === 'long_leave' ||
    st === 'disabled' ||
    st === 'resigned' ||
    st === 'not_employed' ||
    st === 'inactive'
  ) {
    return false;
  }

  if (dateStr) {
    const normDate = normalizeDateString(dateStr);
    const rawStart =
      employee.employmentDate ||
      employee.joinDate ||
      (employee.joinedAt ? employee.joinedAt.split('T')[0] : '');
    const startStr = normalizeDateString(rawStart);
    if (startStr && normDate < startStr) {
      return false;
    }

    const rawEnd = employee.terminationDate || employee.resignationDate;
    const endStr = normalizeDateString(rawEnd);
    if (endStr && normDate > endStr) {
      return false;
    }
  }

  return true;
}

/**
 * Dynamic timeline status resolver for attendance records based on current time and settings.
 */
export function resolveDailyAttendanceStatus(
  record: { checkInTime?: string; status?: string; isAdjusted?: boolean; employeeId?: string } | null | undefined,
  dateStr: string,
  settings?: { workStartTime?: string; workEndTime?: string; maxLateMinutes?: number; missingCheckOutDeductionAmount?: number; missingCheckOutGraceMinutes?: number } | null,
  now: Date = new Date(),
  leaveRequests?: Array<{ employeeId: string; startDate: string; endDate: string; status: string; type: 'paid' | 'unpaid' }> | null,
  employeeId?: string,
  employee?: { status?: string; employmentDate?: string; joinDate?: string; joinedAt?: string; terminationDate?: string; resignationDate?: string; isExemptFromFingerprint?: boolean; exemptFromFingerprint?: boolean } | null
): 'present' | 'late' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'holiday' | 'not_recorded' | 'waiting_for_check_in' | 'not_employed' | 'exempt_from_fingerprint' {
  // Check if employee was on active duty on this date
  const isOnDuty = isEmployeeOnDuty(employee, dateStr);

  // 1. Approved Leave (Highest priority - overrides previous absent or unadjusted/adjusted records)
  const targetEmpId = employeeId || record?.employeeId;
  if (targetEmpId && leaveRequests && leaveRequests.length > 0) {
    const matchLeave = leaveRequests.find(
      (l) =>
        l.employeeId === targetEmpId &&
        l.status === 'approved' &&
        l.startDate <= dateStr &&
        dateStr <= l.endDate
    );
    if (matchLeave) {
      return matchLeave.type === 'unpaid' ? 'leave_unpaid' : 'leave_paid';
    }
  }

  if (record?.status === 'leave_paid' || record?.status === 'leave_unpaid') {
    return record.status as any;
  }

  // 2. Administrative Adjustment (isAdjusted)
  if (record && record.isAdjusted && record.status && record.status !== 'not_recorded' && record.status !== 'waiting_for_check_in') {
    return record.status as any;
  }

  // 3. Official Holiday
  if (record?.status === 'holiday') {
    return 'holiday';
  }

  // 4. Attendance Check-In
  if (record?.checkInTime) {
    return (record.status as any) || 'present';
  }

  // If employee is NOT on active duty on this date (suspended, terminated, long leave, before employment date)
  // and has no explicit check-in or leave, status is strictly not_employed (NOT absent)
  if (!isOnDuty) {
    return 'not_employed';
  }

  if (record && record.status && record.status !== 'not_recorded' && record.status !== 'waiting_for_check_in') {
    return record.status as any;
  }

  // Effective today string according to 03:00 AM workday rollover rule
  const todayStr = getEffectiveWorkDateStr(now);

  // 5. Check if employee is exempt from fingerprinting (غير مشمول بالبصمة)
  const isExempt = employee?.isExemptFromFingerprint === true || employee?.exemptFromFingerprint === true;
  if (isExempt) {
    if (dateStr <= todayStr) {
      return 'exempt_from_fingerprint';
    } else {
      return 'waiting_for_check_in';
    }
  }

  if (record && record.status && record.status !== 'not_recorded' && record.status !== 'waiting_for_check_in') {
    return record.status as any;
  }

  // 6. Time Evaluation
  if (dateStr > todayStr) {
    return 'waiting_for_check_in';
  }

  if (dateStr < todayStr) {
    return 'absent';
  }

  const workStart = settings?.workStartTime || '08:00';
  const startMins = timeStringToMinutes(workStart);
  const cutoffMinutes = (settings?.maxLateMinutes && settings.maxLateMinutes > 0) ? settings.maxLateMinutes : 120;
  const deadlineMins = startMins + cutoffMinutes;

  const nowMins = now.getHours() * 60 + now.getMinutes();

  if (nowMins < startMins) {
    return 'not_recorded';
  }

  if (nowMins >= startMins && nowMins <= deadlineMins) {
    return 'waiting_for_check_in';
  }

  return 'absent';
}

export interface MissingCheckOutInfo {
  isMissingCheckOut: boolean;
  autoCheckOutTimeStr: string;
  autoCheckOutIso: string;
  deductionAmount: number;
  noteArabic: string;
}

/**
 * Checks whether an attendance record is missing check-out past the specified duration/grace period.
 */
export function checkIsMissingCheckOut(
  record: { checkInTime?: string; checkOutTime?: string; isAdjusted?: boolean } | null | undefined,
  dateStr: string,
  settings?: { workEndTime?: string; missingCheckOutDeductionAmount?: number; missingCheckOutGraceMinutes?: number } | null,
  now: Date = new Date()
): MissingCheckOutInfo {
  const workEnd = settings?.workEndTime || '16:00';
  const deductionAmount = settings?.missingCheckOutDeductionAmount ?? 5000;
  const graceMins = settings?.missingCheckOutGraceMinutes ?? 30;

  if (!record || !record.checkInTime || record.checkOutTime || record.isAdjusted) {
    return {
      isMissingCheckOut: false,
      autoCheckOutTimeStr: workEnd,
      autoCheckOutIso: '',
      deductionAmount: 0,
      noteArabic: ''
    };
  }

  const todayStr = getEffectiveWorkDateStr(now);

  // Missing check-out is only recorded for past days (dateStr < todayStr).
  // On today's date (dateStr >= todayStr), the work day is still ongoing, so check-out is pending.
  if (dateStr < todayStr) {
    const [h, m] = workEnd.split(':').map(Number);
    const dateObj = new Date(`${dateStr}T${String(h || 16).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`);
    const autoCheckOutIso = dateObj.toISOString();

    return {
      isMissingCheckOut: true,
      autoCheckOutTimeStr: workEnd,
      autoCheckOutIso,
      deductionAmount,
      noteArabic: 'لم يبصم بصمة خروج'
    };
  }

  return {
    isMissingCheckOut: false,
    autoCheckOutTimeStr: workEnd,
    autoCheckOutIso: '',
    deductionAmount: 0,
    noteArabic: ''
  };
}

export interface AttendanceStatusDetails {
  status: 'present' | 'late' | 'early_departure' | 'late_and_early' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'holiday' | 'not_recorded' | 'waiting_for_check_in' | 'not_employed' | 'exempt_from_fingerprint';
  source: 'Actual Check-in' | 'Computed' | 'Administrative Adjustment';
  sourceArabic: string;
  explanation: string;
}

/**
 * Detailed timeline status resolver for UI displaying status source and explanation tooltip.
 */
export function resolveDailyAttendanceStatusDetails(
  record: { checkInTime?: string; status?: string; isAdjusted?: boolean; adjustedBy?: string; lateMinutes?: number; earlyCheckoutMinutes?: number; employeeId?: string } | null | undefined,
  dateStr: string,
  settings?: { workStartTime?: string; workEndTime?: string; maxLateMinutes?: number; missingCheckOutDeductionAmount?: number; missingCheckOutGraceMinutes?: number } | null,
  now: Date = new Date(),
  leaveRequests?: Array<{ employeeId: string; startDate: string; endDate: string; status: string; type: 'paid' | 'unpaid' }> | null,
  employeeId?: string,
  employee?: { status?: string; employmentDate?: string; joinDate?: string; joinedAt?: string; terminationDate?: string; resignationDate?: string; isExemptFromFingerprint?: boolean; exemptFromFingerprint?: boolean } | null
): AttendanceStatusDetails {
  const status = resolveDailyAttendanceStatus(record, dateStr, settings, now, leaveRequests, employeeId, employee);

  // Check exemption
  const isExempt = employee?.isExemptFromFingerprint === true || employee?.exemptFromFingerprint === true;
  if (status === 'exempt_from_fingerprint' || (isExempt && !record?.checkInTime && !record?.isAdjusted)) {
    if (status === 'waiting_for_check_in') {
      return {
        status: 'waiting_for_check_in',
        source: 'Computed',
        sourceArabic: 'في انتظار بداية اليوم',
        explanation: 'الموظف غير مشمول بالبصمة — في انتظار حلول اليوم المطلوب (بداية اليوم الساعة 03:00 صباحاً)'
      };
    }
    return {
      status: 'exempt_from_fingerprint',
      source: 'Computed',
      sourceArabic: 'غير مشمول بالبصمة',
      explanation: 'الموظف غير مشمول بنظام البصمة الحيوية — يُستثنى من متابعة بصمة الحضور والإنصراف'
    };
  }

  // 1. Approved Leave
  if (status === 'leave_paid' || status === 'leave_unpaid') {
    return {
      status,
      source: 'Administrative Adjustment',
      sourceArabic: status === 'leave_paid' ? 'إجازة مدفوعة 🟣' : 'إجازة بدون راتب 🔵',
      explanation: status === 'leave_paid' ? 'إجازة مدفوعة الأجر معتمدة' : 'إجازة غير مدفوعة الأجر معتمدة'
    };
  }

  // 2. Administrative Adjustment
  if (record?.isAdjusted) {
    let finalStatus: 'present' | 'late' | 'early_departure' | 'late_and_early' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'holiday' | 'not_recorded' | 'waiting_for_check_in' | 'not_employed' | 'exempt_from_fingerprint' = 'present';
    if (record.status === 'present' || (record.lateMinutes === 0 && record.earlyCheckoutMinutes === 0)) {
      finalStatus = 'present';
    } else if (record.status) {
      finalStatus = record.status as any;
    }

    return {
      status: finalStatus as any,
      source: 'Administrative Adjustment',
      sourceArabic: 'تعديل إداري (استثناء معتمد)',
      explanation: (record as any).adjustmentReason || (record.adjustedBy ? `تم اعتماد طلب الاستثناء بواسطة (${record.adjustedBy})` : 'تم اعتماد طلب الاستثناء بالكامل وإلغاء أي خصم')
    };
  }

  // 3. Official Holiday
  if (status === 'holiday') {
    return {
      status,
      source: 'Administrative Adjustment',
      sourceArabic: 'عطلة رسمية',
      explanation: 'يوم عطلة رسمية معتمدة من النظام'
    };
  }

  // 4. Actual Check-in
  if (record?.checkInTime) {
    const isLate = !record.isAdjusted && (status === 'late' || Boolean(record.lateMinutes && record.lateMinutes > 0)) && record.lateMinutes !== 0;
    const missingInfo = checkIsMissingCheckOut(record, dateStr, settings, now);
    const earlyOutMinutes = getEffectiveEarlyCheckoutMinutes(
      record,
      settings?.workEndTime,
      (settings as any)?.earlyCheckoutToleranceMinutes
    );

    const hasEarlyOut = !record.isAdjusted && (earlyOutMinutes > 0 || missingInfo.isMissingCheckOut);

    let finalStatus: 'present' | 'late' | 'early_departure' | 'late_and_early' = 'present';
    if (isLate && hasEarlyOut) {
      finalStatus = 'late_and_early';
    } else if (isLate) {
      finalStatus = 'late';
    } else if (hasEarlyOut) {
      finalStatus = 'early_departure';
    } else {
      finalStatus = 'present';
    }

    let baseExp = '';
    if (isLate && hasEarlyOut) {
      baseExp = `تسجيل دخول متأخر (${record.lateMinutes || 0} دقيقة)`;
      if (missingInfo.isMissingCheckOut) {
        baseExp += ` مع عدم إثبات بصمة الخروج (خروج تلقائي الساعة ${missingInfo.autoCheckOutTimeStr})`;
      } else {
        baseExp += ` وخروج مبكر (${earlyOutMinutes} دقيقة)`;
      }
    } else if (isLate) {
      baseExp = `تم تسجيل بصمة الدخول متأخراً (${record.lateMinutes || 0} دقيقة)`;
    } else if (hasEarlyOut) {
      if (missingInfo.isMissingCheckOut) {
        baseExp = `حضور بالوقت المحدد مع عدم إثبات بصمة الخروج (خروج تلقائي الساعة ${missingInfo.autoCheckOutTimeStr})`;
      } else {
        baseExp = `حضور بالوقت المحدد مع تسجيل خروج مبكر (${earlyOutMinutes} دقيقة)`;
      }
    } else {
      baseExp = 'تم تسجيل بصمة الدخول والخروج في الوقت المحدد بنجاح';
    }

    let sourceArabic = 'بصمة فعلية';
    if (missingInfo.isMissingCheckOut) {
      sourceArabic = 'بصمة فعلية (خروج تلقائي)';
    } else if (hasEarlyOut) {
      sourceArabic = 'بصمة فعلية (خروج مبكر)';
    }

    return {
      status: finalStatus,
      source: 'Actual Check-in',
      sourceArabic,
      explanation: baseExp
    };
  }

  // 5. Computed Status
  let explanation = '';
  const todayStr = getEffectiveWorkDateStr(now);

  switch (status) {
    case 'not_employed': {
      let exp = 'الموظف ليس على رأس العمل في هذا التاريخ (لا يحتسب غياباً)';
      if (employee?.status === 'suspended') exp = 'الموظف موقوف عن العمل (ليس على رأس العمل - لا يحتسب غياباً)';
      else if (employee?.status === 'terminated') exp = 'الموظف منتهي الخدمة (ليس على رأس العمل - لا يحتسب غياباً)';
      else if (employee?.status === 'long_leave') exp = 'الموظف في إجازة طويلة (ليس على رأس العمل - لا يحتسب غياباً)';
      else if (employee) {
        const startStr = normalizeDateString(employee.employmentDate || employee.joinDate || employee.joinedAt);
        const normDate = normalizeDateString(dateStr);
        if (startStr && normDate < startStr) exp = 'تاريخ اليوم قبل تاريخ بداية مباشرة العمل للموظف';
      }
      return {
        status: 'not_employed',
        source: 'Computed',
        sourceArabic: 'غير على رأس العمل',
        explanation: exp
      };
    }
    case 'not_recorded':
      explanation = dateStr > todayStr
        ? 'تاريخ مستقبلي (لم يحن موعد الحضور)'
        : 'قبل بداية وقت الدوام الرسمي';
      break;
    case 'waiting_for_check_in':
      explanation = 'بانتظار بصمة الموظف (ضمن مهلة الحضور المسموحة)';
      break;
    case 'absent':
      explanation = dateStr < todayStr
        ? 'لم يتم تسجيل بصمة دخول لهذا اليوم'
        : 'تم احتساب اليوم غياباً تلقائياً لانتهاء مهلة الحضور';
      break;
    default:
      explanation = 'تم احتساب الحالة تلقائياً وفق جدول الدوام';
  }

  return {
    status,
    source: 'Computed',
    sourceArabic: 'حساب تلقائي',
    explanation
  };
}
