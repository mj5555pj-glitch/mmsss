import {
  Employee,
  AttendanceRecord,
  LeaveRequest,
  OvertimeRecord,
  Task,
  ManualPointsRecord,
  CompanySettings,
  PayrollPeriod,
} from '../types';
import * as attendanceService from './attendanceService';
import * as leaveService from './leaveService';
import * as overtimeService from './overtimeService';
import * as payrollService from './payrollService';
import * as rewardService from './rewardService';
import * as auditService from './auditService';

export {
  attendanceService,
  leaveService,
  overtimeService,
  payrollService,
  rewardService,
  auditService,
};

/**
 * HR Engine - Centralized Facade Layer for HR Services
 * Unifies access to Attendance, Leave, Overtime, Payroll, Reward, and Audit services
 * without duplicating or modifying underlying domain logic or formulas.
 */

/**
 * Resolves today's attendance status and record for a specific employee.
 */
export function getEmployeeTodayAttendance(params: {
  attendanceRecords: AttendanceRecord[];
  employeeId: string;
  employee?: Employee;
  leaveRequests?: LeaveRequest[];
  dateStr?: string;
  settings?: CompanySettings | null;
  now?: Date;
}) {
  const dateStr = params.dateStr || new Date().toISOString().split('T')[0];
  const now = params.now || new Date();
  const record =
    params.attendanceRecords.find(
      (r) => r.employeeId === params.employeeId && r.date === dateStr && !(r as any).isDeleted
    ) || null;

  const statusDetails = attendanceService.resolveDailyAttendanceStatusDetails(
    record,
    dateStr,
    params.settings,
    now,
    params.leaveRequests,
    params.employeeId,
    params.employee
  );

  return {
    record,
    status: statusDetails.status,
    statusDetails,
  };
}

/**
 * Obtains the live reward summary for an employee.
 */
export function getEmployeeRewardSummary(params: {
  employeeId: string;
  employees: Employee[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  rewardPoolPercentage?: number;
  rewardPointValue?: number;
  startDate?: string;
  endDate?: string;
}) {
  return rewardService.getTechnicianRewardResult(params);
}

/**
 * Generates payroll calculation preview for an employee.
 */
export function getEmployeePayrollPreview(params: {
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  period: PayrollPeriod;
  employee?: any;
  attendanceRecords?: AttendanceRecord[];
  leaveRequests?: LeaveRequest[];
  overtimeRecords?: OvertimeRecord[];
  advances?: number;
  bonuses?: number;
  manualDeductions?: number;
  rewardAmount?: number;
  rewardPoints?: number;
  overtimeHourlyRate?: number;
  workHoursPerDay?: number;
  settings?: any;
  now?: Date;
}) {
  return payrollService.generateCalculationDetails(params);
}

/**
 * Calculates current leave balances for an employee.
 */
export function getEmployeeLeaveBalance(params: {
  usedPaidLeaves: number;
  usedUnpaidLeaves: number;
  settings: CompanySettings;
}) {
  return leaveService.calculateLeaveBalance(
    params.usedPaidLeaves,
    params.usedUnpaidLeaves,
    params.settings
  );
}

/**
 * Generates overtime summary metrics.
 */
export function getEmployeeOvertimeSummary(params: {
  records: OvertimeRecord[];
  overtimeHourlyRate?: number;
}) {
  return overtimeService.getOvertimeSummary(params.records, params.overtimeHourlyRate);
}

/**
 * Consolidates full HR summary for a specific employee.
 */
export function getEmployeeHRSummary(params: {
  employee: Employee;
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  overtimeRecords: OvertimeRecord[];
  tasks?: Task[];
  manualPoints?: ManualPointsRecord[];
  settings: CompanySettings;
  period?: PayrollPeriod;
  dateStr?: string;
  now?: Date;
}) {
  const dateStr = params.dateStr || new Date().toISOString().split('T')[0];
  const now = params.now || new Date();

  const empAttendance = params.attendanceRecords.filter(
    (r) => r.employeeId === params.employee.id && !(r as any).isDeleted
  );
  const todayAttendance = getEmployeeTodayAttendance({
    attendanceRecords: params.attendanceRecords,
    employeeId: params.employee.id,
    leaveRequests: params.leaveRequests,
    dateStr,
    settings: params.settings,
    now,
  });

  const empLeaves = params.leaveRequests.filter(
    (l) => l.employeeId === params.employee.id && l.status === 'approved'
  );
  const usedPaidLeaves = empLeaves
    .filter((l) => l.type === 'paid')
    .reduce((s, l) => s + (l.totalDays || 0), 0);
  const usedUnpaidLeaves = empLeaves
    .filter((l) => l.type === 'unpaid')
    .reduce((s, l) => s + (l.totalDays || 0), 0);

  const leaveBalance = getEmployeeLeaveBalance({
    usedPaidLeaves,
    usedUnpaidLeaves,
    settings: params.settings,
  });

  const empOvertime = params.overtimeRecords.filter(
    (o) => o.employeeId === params.employee.id
  );
  const overtimeSummary = getEmployeeOvertimeSummary({
    records: empOvertime,
    overtimeHourlyRate: params.settings.overtimeHourlyRate || 5000,
  });

  const rewardResult = params.tasks
    ? getEmployeeRewardSummary({
        employeeId: params.employee.id,
        employees: params.employees,
        tasks: params.tasks,
        manualPoints: params.manualPoints,
        rewardPoolPercentage: params.settings.rewardPoolPercentage,
        rewardPointValue: params.settings.rewardPointValue,
        startDate: params.period?.startDate,
        endDate: params.period?.endDate,
      })
    : null;

  const payrollPreview = params.period
    ? getEmployeePayrollPreview({
        employeeId: params.employee.id,
        employeeName: params.employee.name,
        baseSalary: params.employee.baseSalary || 0,
        period: params.period,
        attendanceRecords: empAttendance,
        leaveRequests: empLeaves,
        overtimeRecords: empOvertime,
        rewardAmount: rewardResult?.rewardAmount || 0,
        rewardPoints: rewardResult?.totalPoints || 0,
        overtimeHourlyRate: params.settings.overtimeHourlyRate || 5000,
        workHoursPerDay: params.settings.workHoursPerDay || 8,
      })
    : null;

  return {
    employee: params.employee,
    todayAttendance,
    leaveBalance,
    overtimeSummary,
    rewardResult,
    payrollPreview,
  };
}

/**
 * Calculates high-level dashboard metrics across the enterprise.
 */
export function getDashboardSummary(params: {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  overtimeRecords: OvertimeRecord[];
  settings?: CompanySettings | null;
  dateStr?: string;
  now?: Date;
}) {
  const dateStr = params.dateStr || new Date().toISOString().split('T')[0];
  const now = params.now || new Date();
  const activeEmployees = params.employees.filter((e) => e.status !== 'terminated');

  let checkedInCount = 0;
  let lateCount = 0;
  let absentCount = 0;
  let waitingForCheckInCount = 0;
  let leaveCount = 0;

  activeEmployees.forEach((emp) => {
    const rec =
      params.attendanceRecords.find(
        (r) => r.employeeId === emp.id && r.date === dateStr && !(r as any).isDeleted
      ) || null;
    const status = attendanceService.resolveDailyAttendanceStatus(
      rec,
      dateStr,
      params.settings,
      now,
      params.leaveRequests,
      emp.id,
      emp
    );

    if (status === 'present') {
      checkedInCount++;
    } else if (status === 'late') {
      checkedInCount++;
      lateCount++;
    } else if (status === 'absent') {
      absentCount++;
    } else if (status === 'waiting_for_check_in') {
      waitingForCheckInCount++;
    } else if (status === 'leave_paid' || status === 'leave_unpaid') {
      leaveCount++;
    }
  });

  const pendingLeavesCount = params.leaveRequests.filter(
    (l) => l.status === 'pending'
  ).length;
  const pendingOvertimeCount = params.overtimeRecords.filter(
    (o) => o.status === 'pending'
  ).length;

  return {
    totalEmployees: activeEmployees.length,
    checkedInCount,
    lateCount,
    absentCount,
    waitingForCheckInCount,
    leaveCount,
    pendingLeavesCount,
    pendingOvertimeCount,
  };
}

/**
 * Consolidates manager and operational statistics.
 */
export function getManagerStatistics(params: {
  employees: Employee[];
  attendanceRecords: AttendanceRecord[];
  leaveRequests: LeaveRequest[];
  overtimeRecords: OvertimeRecord[];
  tasks: Task[];
  settings?: CompanySettings | null;
}) {
  const dashboard = getDashboardSummary(params);
  const totalTasks = params.tasks.length;
  const completedTasks = params.tasks.filter((t) => t.status === 'completed').length;
  const pendingTasks = params.tasks.filter(
    (t) => (t.status as string) === 'pending' || t.status === 'active' || t.status === 'paused'
  ).length;

  return {
    ...dashboard,
    totalTasks,
    completedTasks,
    pendingTasks,
  };
}

export const hrEngine = {
  attendanceService,
  leaveService,
  overtimeService,
  payrollService,
  rewardService,
  auditService,
  getEmployeeTodayAttendance,
  getEmployeeLeaveBalance,
  getEmployeeHRSummary,
  getEmployeeOvertimeSummary,
  getEmployeePayrollPreview,
  getEmployeeRewardSummary,
  getDashboardSummary,
  getManagerStatistics,
};

export default hrEngine;
