import { CompanySettings, LeaveRequest } from '../types';

export interface LeaveBalance {
  usedPaidLeaves: number;
  remainingPaidLeaves: number;
  maxPaidLeaves: number;
  usedUnpaidLeaves: number;
  remainingUnpaidLeaves: number;
  maxUnpaidLeaves: number;
}

export interface LeaveRequestValidationResult {
  allowed: boolean;
  reason?: string;
  errorCode?: 'INVALID_TYPE' | 'INVALID_DAYS' | 'OUTSIDE_CYCLE' | 'INSUFFICIENT_BALANCE';
}

export interface LeaveTypeImpact {
  type: 'paid' | 'unpaid';
  days: number;
  salaryDeductionAmount: number;
  deductsFromPaidBalance: boolean;
  description: string;
}

export interface CycleLeaveSummary {
  usedPaidLeaves: number;
  remainingPaidLeaves: number;
  usedUnpaidLeaves: number;
  remainingUnpaidLeaves: number;
  absenceDays: number;
}

/**
 * Calculates current leave balances for an employee in a given cycle.
 */
export function calculateLeaveBalance(
  usedPaidLeaves: number,
  usedUnpaidLeaves: number,
  settings: CompanySettings
): LeaveBalance {
  const maxPaid = settings.paidLeavesPerCycle ?? 2;
  const maxUnpaid = settings.unpaidLeavesPerCycle ?? 2;

  const remainingPaid = Math.max(0, maxPaid - usedPaidLeaves);
  const remainingUnpaid = Math.max(0, maxUnpaid - usedUnpaidLeaves);

  return {
    usedPaidLeaves,
    remainingPaidLeaves: remainingPaid,
    maxPaidLeaves: maxPaid,
    usedUnpaidLeaves,
    remainingUnpaidLeaves: remainingUnpaid,
    maxUnpaidLeaves: maxUnpaid,
  };
}

/**
 * Calculates employee's leave balance specifically for the given payroll cycle.
 * The leave balance completely renews each payroll cycle.
 */
export function calculateCycleLeaveBalance(
  employeeId: string,
  leaveRequests: LeaveRequest[],
  period: { startDate: string; endDate: string },
  settings: CompanySettings
): LeaveBalance {
  const cycleLeaves = leaveRequests.filter((r) => {
    if (r.employeeId !== employeeId || r.isDeleted || r.status !== 'approved') return false;
    const lStart = r.startDate;
    const lEnd = r.endDate || r.startDate;
    return lStart <= period.endDate && lEnd >= period.startDate;
  });

  const usedPaidLeaves = cycleLeaves
    .filter((r) => r.type === 'paid')
    .reduce((sum, r) => sum + (r.totalDays || 0), 0);

  const usedUnpaidLeaves = cycleLeaves
    .filter((r) => r.type === 'unpaid')
    .reduce((sum, r) => sum + (r.totalDays || 0), 0);

  return calculateLeaveBalance(usedPaidLeaves, usedUnpaidLeaves, settings);
}

/**
 * Pure validation function to check if a leave request can be submitted.
 */
export function canRequestLeave(
  type: 'paid' | 'unpaid',
  requestedDays: number,
  usedPaidLeaves: number,
  usedUnpaidLeaves: number,
  settings: CompanySettings,
  isWithinPayrollCycle: boolean = true
): LeaveRequestValidationResult {
  if (type !== 'paid' && type !== 'unpaid') {
    return {
      allowed: false,
      errorCode: 'INVALID_TYPE',
      reason: 'نوع الإجازة غير صحيح',
    };
  }

  if (requestedDays <= 0) {
    return {
      allowed: false,
      errorCode: 'INVALID_DAYS',
      reason: 'عدد أيام الإجازة يجب أن يكون أكبر من 0',
    };
  }

  if (!isWithinPayrollCycle) {
    return {
      allowed: false,
      errorCode: 'OUTSIDE_CYCLE',
      reason: 'طلب الإجازة خارج دورة الرواتب الحالية',
    };
  }

  const balance = calculateLeaveBalance(usedPaidLeaves, usedUnpaidLeaves, settings);

  if (type === 'paid') {
    if (requestedDays > balance.remainingPaidLeaves) {
      return {
        allowed: false,
        errorCode: 'INSUFFICIENT_BALANCE',
        reason: `رصيد الإجازات المدفوعة غير كافٍ. المتبقي: ${balance.remainingPaidLeaves} يوم`,
      };
    }
  } else {
    if (requestedDays > balance.remainingUnpaidLeaves) {
      return {
        allowed: false,
        errorCode: 'INSUFFICIENT_BALANCE',
        reason: `رصيد الإجازات بدون راتب غير كافٍ. المتبقي: ${balance.remainingUnpaidLeaves} يوم`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Returns the exact financial & balance impact of a leave type.
 */
export function getLeaveTypeResult(
  type: 'paid' | 'unpaid',
  days: number,
  dailyRate: number
): LeaveTypeImpact {
  if (type === 'paid') {
    return {
      type: 'paid',
      days,
      salaryDeductionAmount: 0,
      deductsFromPaidBalance: true,
      description: 'إجازة مدفوعة: لا يخصم من الراتب وتخصم من رصيد الإجازات المدفوعة',
    };
  }

  const deduction = calculateLeaveDeduction(days, dailyRate);
  return {
    type: 'unpaid',
    days,
    salaryDeductionAmount: deduction,
    deductsFromPaidBalance: false,
    description: 'إجازة بدون راتب: يخصم قيمة اليوم عن كل يوم إجازة',
  };
}

/**
 * Calculates leave financial deduction without touching full salary logic.
 */
export function calculateLeaveDeduction(
  unpaidLeaveDays: number,
  dailyRate: number
): number {
  if (unpaidLeaveDays <= 0 || dailyRate <= 0) {
    return 0;
  }
  return unpaidLeaveDays * dailyRate;
}

/**
 * Provides a summary of leaves and absences for the active cycle.
 */
export function getCycleLeaveSummary(
  usedPaidLeaves: number,
  usedUnpaidLeaves: number,
  absenceDays: number,
  settings: CompanySettings
): CycleLeaveSummary {
  const balance = calculateLeaveBalance(usedPaidLeaves, usedUnpaidLeaves, settings);

  return {
    usedPaidLeaves: balance.usedPaidLeaves,
    remainingPaidLeaves: balance.remainingPaidLeaves,
    usedUnpaidLeaves: balance.usedUnpaidLeaves,
    remainingUnpaidLeaves: balance.remainingUnpaidLeaves,
    absenceDays,
  };
}
