import { Employee, Task, ManualPointsRecord } from '../types';

export interface EmployeeRewardResult {
  employeeId: string;
  employeeName: string;
  employeeStatus?: string;
  isEligible: boolean;
  totalPoints: number; // Total points earned by this employee
  averagePoints: number; // Average points across eligible employees
  difference: number; // EmployeePoints - AveragePoints
  rewardPointValue: number; // Value of 1 point in Dinars
  rewardAmount: number; // Difference * rewardPointValue
  type: 'reward' | 'deduction' | 'neutral';
}

export interface RewardCalculationSummary {
  eligibleEmployeesCount: number;
  totalPoints: number; // Sum of points for all eligible employees
  rewardPoolPercentage: number; // e.g. 5%
  reservePoints: number; // TotalPoints * (rewardPoolPercentage / 100)
  remainingPoints: number; // TotalPoints - reservePoints
  averagePoints: number; // RemainingPoints / eligibleEmployeesCount
  rewardPointValue: number; // e.g. 35 Dinars
  employeeResults: Record<string, EmployeeRewardResult>;
}

/**
 * Checks if an employee is eligible for the reward & incentive system.
 * Only employees with status 'on_duty' (or undefined / 'On Duty') are eligible.
 * Employees under training, probation, long leave, suspended, or terminated are strictly excluded.
 */
export function isEmployeeEligibleForRewards(emp: Employee): boolean {
  if (!emp) return false;
  if (emp.rewardStatus === 'excluded' || emp.excluded === true) return false;
  if (emp.rewardStatus === 'eligible' || emp.eligible === true) return true;
  if (emp.status === undefined || emp.status === null) return true;
  const statusNormalized = emp.status.toString().toLowerCase().trim().replace(/ /g, '_');
  return statusNormalized === 'on_duty' || statusNormalized === 'onduty';
}

/**
 * Calculates reward pool, average points, difference, and monetary rewards/deductions.
 * Runs 100% in-memory using React State arrays (Zero Firestore calls).
 */
export function calculateRewards(params: {
  employees: Employee[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  rewardPoolPercentage?: number;
  rewardPointValue?: number;
  startDate?: string;
  endDate?: string;
}): RewardCalculationSummary {
  const {
    employees,
    tasks: inputTasks,
    manualPoints: inputManualPoints = [],
    rewardPoolPercentage = 5,
    rewardPointValue = 35,
    startDate,
    endDate,
  } = params;

  // Filter tasks by date range if startDate or endDate is provided
  const tasks = inputTasks.filter((t) => {
    if (startDate || endDate) {
      const taskDateStr = t.endTime
        ? t.endTime.split('T')[0]
        : t.assignedDate || (t.startTime ? t.startTime.split('T')[0] : '');
      if (taskDateStr) {
        if (startDate && taskDateStr < startDate) return false;
        if (endDate && taskDateStr > endDate) return false;
      }
    }
    return true;
  });

  // Filter manual points by date range if startDate or endDate is provided
  const manualPoints = inputManualPoints.filter((mp) => {
    if (startDate || endDate) {
      const pointDateStr = mp.timestamp ? mp.timestamp.split('T')[0] : '';
      if (pointDateStr) {
        if (startDate && pointDateStr < startDate) return false;
        if (endDate && pointDateStr > endDate) return false;
      }
    }
    return true;
  });

  // 1. Filter eligible employees (On Duty only)
  const eligibleEmployees = employees.filter(isEmployeeEligibleForRewards);
  const eligibleEmployeesCount = eligibleEmployees.length;

  // 2. Calculate points for each eligible employee
  const employeePointsMap: Record<string, number> = {};

  eligibleEmployees.forEach((emp) => {
    // Completed tasks for this employee
    const empTasks = tasks.filter(
      (t) => t.employeeId === emp.id && t.status === 'completed'
    );
    const taskPointsSum = empTasks.reduce((sum, t) => sum + (t.points || 0), 0);

    // Manual gift/penalty points for this employee
    const empManual = manualPoints.filter((mp) => mp.employeeId === emp.id);
    const manualPointsSum = empManual.reduce((sum, mp) => {
      if (mp.type === 'gift') return sum + (mp.points || 0);
      if (mp.type === 'penalty') return sum - (mp.points || 0);
      return sum;
    }, 0);

    employeePointsMap[emp.id] = Math.max(0, taskPointsSum + manualPointsSum);
  });

  // 3. Sum total points for eligible employees
  const totalPoints = Object.values(employeePointsMap).reduce(
    (sum, pts) => sum + pts,
    0
  );

  // 4. Reserve Points & Remaining Points
  const poolPct = Math.max(0, rewardPoolPercentage);
  const reservePoints = totalPoints * (poolPct / 100);
  const remainingPoints = totalPoints - reservePoints;

  // 5. Average Points across eligible employees
  const averagePoints =
    eligibleEmployeesCount > 0 ? remainingPoints / eligibleEmployeesCount : 0;

  // 6. Build per-employee results map
  const employeeResults: Record<string, EmployeeRewardResult> = {};

  employees.forEach((emp) => {
    const isEligible = isEmployeeEligibleForRewards(emp);

    if (!isEligible) {
      employeeResults[emp.id] = {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeStatus: emp.status,
        isEligible: false,
        totalPoints: 0,
        averagePoints: 0,
        difference: 0,
        rewardPointValue,
        rewardAmount: 0,
        type: 'neutral',
      };
      return;
    }

    const empPts = employeePointsMap[emp.id] || 0;
    const diff = empPts - averagePoints;
    const rewardAmount = Number((diff * rewardPointValue).toFixed(2));

    let type: 'reward' | 'deduction' | 'neutral' = 'neutral';
    if (rewardAmount > 0) type = 'reward';
    else if (rewardAmount < 0) type = 'deduction';

    employeeResults[emp.id] = {
      employeeId: emp.id,
      employeeName: emp.name,
      employeeStatus: emp.status,
      isEligible: true,
      totalPoints: empPts,
      averagePoints: Number(averagePoints.toFixed(2)),
      difference: Number(diff.toFixed(2)),
      rewardPointValue,
      rewardAmount,
      type,
    };
  });

  return {
    eligibleEmployeesCount,
    totalPoints,
    rewardPoolPercentage: poolPct,
    reservePoints: Number(reservePoints.toFixed(2)),
    remainingPoints: Number(remainingPoints.toFixed(2)),
    averagePoints: Number(averagePoints.toFixed(2)),
    rewardPointValue,
    employeeResults,
  };
}

/**
 * Helper to get live reward status for a single technician.
 */
export function getTechnicianRewardResult(params: {
  employeeId: string;
  employees: Employee[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  rewardPoolPercentage?: number;
  rewardPointValue?: number;
  startDate?: string;
  endDate?: string;
}): EmployeeRewardResult | null {
  const summary = calculateRewards({
    employees: params.employees,
    tasks: params.tasks,
    manualPoints: params.manualPoints,
    rewardPoolPercentage: params.rewardPoolPercentage,
    rewardPointValue: params.rewardPointValue,
    startDate: params.startDate,
    endDate: params.endDate,
  });

  return summary.employeeResults[params.employeeId] || null;
}
