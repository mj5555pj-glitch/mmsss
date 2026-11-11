export enum TaskType {
  Installation = 'تنصيب',
  Maintenance = 'صيانة',
  Collection = 'سحب',
  Ports = 'منافذ',
  Click = 'كلك',
  Delivery = 'دلفري',
  Support = 'دعم'
}

export const TASK_POINTS: Record<TaskType, number> = {
  [TaskType.Installation]: 20,
  [TaskType.Maintenance]: 18,
  [TaskType.Collection]: 14,
  [TaskType.Ports]: 10,
  [TaskType.Click]: 8,
  [TaskType.Delivery]: 5,
  [TaskType.Support]: 4,
};

export interface Employee {
  id: string;
  name: string;
  phone?: string;
  joinedAt: string; // ISO string
  employmentDate?: string; // YYYY-MM-DD or ISO string
  joinDate?: string; // YYYY-MM-DD or ISO string
  avatarUrl?: string;
  fcmToken?: string;
  fcmTokens?: string[];
  oneSignalSubscriptionId?: string;
  oneSignalSubscriptionIds?: string[];
  status?: EmployeeStatus;
  baseSalary?: number;
  role?: string;
  department?: string;

  // Fingerprint Exemption Fields
  isExemptFromFingerprint?: boolean;
  exemptFromFingerprint?: boolean;

  // Reward Management Fields
  rewardStatus?: 'eligible' | 'excluded';
  eligible?: boolean;
  excluded?: boolean;
  rewardExclusionReason?: string;
}

export interface TaskEditLog {
  id: string;
  editedBy: string; // username or display name
  editedAt: string; // ISO string
  changes: string; // Details of what changed
  reason?: string; // Optional reason for the edit
}

export interface Task {
  id: string;
  employeeId: string;
  employeeName: string; // snapshot of name at the time
  taskType: string;
  startTime: string; // ISO string
  endTime?: string; // ISO string (when completed)
  status: 'active' | 'completed' | 'paused' | 'pending' | 'rejected' | 'postponed';
  points: number;
  notes?: string;
  operationDetails?: string; // Mandatory execution/operation notes provided by technician on task completion
  pausedAt?: string; // ISO string when paused
  totalPausedMs?: number; // total accumulated pause duration in milliseconds
  pauseReason?: string; // reason for current/last pause
  // Postponed task fields
  postponedAt?: string; // ISO string when technician postponed task
  postponeReason?: string; // Mandatory reason provided by technician for postponement
  postponedByTechName?: string; // Name of technician who postponed task
  postponeResolvedAt?: string; // ISO timestamp when supervisor/owner re-sent task
  postponeResolvedBy?: string; // Name of supervisor/owner who re-sent task
  sentAt?: string; // ISO string of when task was sent/dispatched to technician
  subscriberName?: string; // Subscriber name
  subscriberPhone?: string; // Subscriber phone number
  assignedDate?: string; // Date task was assigned
  pointsDeducted?: number; // points deducted
  deductionReason?: string; // reason of deduction
  editLogs?: TaskEditLog[]; // edit logs history
  parentTaskId?: string; // ID of the main task if this is a Support (دعم) task
  originalPoints?: number; // The total points of the task before any support splitting
  acceptedAt?: string; // ISO string when technician accepted task
  rejectedAt?: string; // ISO string when technician rejected task
  rejectionReason?: string; // Mandatory reason if technician rejects task
  rejectionByTechName?: string; // Legacy typo alias
  rejectedByTechName?: string; // Technician name who rejected the task
  previousRejectionReason?: string; // First / Previous rejection reason when task is re-sent
  reopenCount?: number; // How many times task/subscriber history was opened
  // Technician Re-send Request fields
  reopenRequested?: boolean; // True if technician requested to re-send this completed task
  reopenRequestedAt?: string; // ISO timestamp of request
  reopenRequestReason?: string; // Reason provided by technician
  reopenRequestTaskType?: string; // Requested new task type provided by technician
  reopenRequestStatus?: 'pending' | 'approved' | 'rejected'; // Status of the re-send request
  // Technician Pause Request & Approval fields
  pauseRequested?: boolean; // True if technician requested to pause the task
  pauseRequestedAt?: string; // ISO timestamp when pause was requested
  pauseRequestReason?: string; // Reason provided by technician for the pause
  pauseRequestStatus?: 'pending' | 'approved' | 'rejected'; // Status of the pause request
  pauseApprovedBy?: string; // Name of supervisor/owner who approved the pause
  pauseApprovedAt?: string; // ISO timestamp when pause was approved
  pauseRejectedBy?: string; // Name of supervisor/owner who rejected the pause
  pauseRejectedAt?: string; // ISO timestamp when pause was rejected
  pauseRejectionReason?: string; // Reason why supervisor/owner rejected the pause
  // Delay Reason & Overtime Approval fields
  delayReason?: string; // Reason provided by technician for overtime/delay
  delaySubmittedAt?: string; // ISO timestamp when delay reason was submitted
  delayStatus?: 'pending' | 'approved' | 'rejected'; // Approval status of delay reason
  delayApproved?: boolean; // Whether manager/supervisor approved reason (cancels deduction)
  delayApprovedBy?: string; // Name of supervisor/manager who approved or rejected
  delayApprovedAt?: string; // ISO timestamp of decision
  title?: string; // Task title or type label
  isPaused?: boolean; // Convenience flag for paused status
  completedAt?: string; // Alias timestamp for task completion
  durationMinutes?: number; // Duration of task in minutes
  activeWorkTimeMs?: number; // Total active work time in milliseconds
  totalPausedTimeMs?: number; // Total paused time in milliseconds
  previousPostponeReason?: string; // First / Previous postpone reason when re-dispatched
}

export interface LeaderboardEntry {
  rank: number;
  employeeId: string;
  employeeName: string;
  totalPoints: number;
  taskCount: number;
}

export interface DashboardStats {
  employeeCount: number;
  tasksTodayCount: number;
  pointsToday: number;
  employeeOfTheDayName: string;
}

export interface DbTaskType {
  id: string;
  name: string;
  points: number;
  color: string;
  status: 'active' | 'disabled';
  isArchived?: boolean;
  description?: string;
  order: number;
  icon: string;
  visibleToTech: boolean;
  // Per-task points rules
  delayDeductionPerMinute?: number;
  maxDeduction?: number;
  allowPause?: boolean;
  freeMinutes?: number;
  fastCompletionBonusEnabled?: boolean;
  fastCompletionMinutes?: number;
  fastCompletionBonusPoints?: number;
  customRules?: string;
  // Graduated system
  graduatedEnabled?: boolean;
  graduatedInterval?: number;
  graduatedPointsPerInterval?: number;
  graduatedMaxPoints?: number;
  deductionStartAfter?: number;
  deductionInterval?: number;
  deductionPointsPerInterval?: number;
  deductionMinPoints?: number;
}

export interface PointsRules {
  delayDeductionPerMinute: number;
  maxDeduction: number;
  additionalRewards: string;
  customRules: string;
}

export interface ManualPointsRecord {
  id: string;
  type: 'gift' | 'penalty';
  employeeId: string;
  employeeName: string;
  points: number;
  reason: string;
  adminName: string;
  timestamp: string; // ISO string
}

export interface SystemUser {
  id: string;
  username: string;
  password?: string;
  displayName?: string;
  role: 'owner' | 'supervisor' | 'manager' | 'technician';
  status: 'active' | 'disabled';
  createdAt?: string;
  lastDevice?: string;
  lastLogin?: string;
  sessionKey?: string;
  locked?: boolean;
  employeeId?: string; // Links to the Employee ID if technician
  employeeName?: string; // Links to the Employee Name if technician
  phone?: string; // Optional phone number
  fcmToken?: string;
  fcmTokens?: string[];
  oneSignalSubscriptionId?: string;
  oneSignalSubscriptionIds?: string[];
}

export type EmployeeStatus = 'on_duty' | 'under_training' | 'probation' | 'long_leave' | 'suspended' | 'terminated';

export interface CompanyLocation {
  id: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  checkInTime?: string; // ISO string
  checkOutTime?: string; // ISO string
  locationName?: string;
  checkOutLocationName?: string;
  location?: {
    latitude: number;
    longitude: number;
    distanceMeters?: number;
    isWithinRadius: boolean;
  };
  checkOutLocation?: {
    latitude: number;
    longitude: number;
    distanceMeters?: number;
    isWithinRadius: boolean;
  };
  lateMinutes: number;
  earlyCheckoutMinutes?: number;
  status: 'present' | 'late' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'holiday' | 'not_recorded' | 'waiting_for_check_in' | 'not_employed' | 'exempt_from_fingerprint';
  isAdjusted?: boolean;
  adjustedBy?: string;
  adjustedAt?: string; // ISO string
  adjustmentReason?: string;
  originalStatus?: string;
  originalCheckInTime?: string;
  originalCheckOutTime?: string;
  notes?: string;
  isDeleted?: boolean;
}

export interface OvertimeRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // ISO string
  endTime?: string; // ISO string
  durationMinutes: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string; // ISO string
  rejectionReason?: string;
  notes?: string;
  source?: string;
  isDeleted?: boolean;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'paid' | 'unpaid';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalDays: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  requestedAt: string; // ISO string
  createdAt?: string; // ISO string
  processedBy?: string;
  processedAt?: string; // ISO string
  rejectionReason?: string;
  isDeleted?: boolean;
}

export interface GraceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  attendanceRecordId?: string;
  date: string; // YYYY-MM-DD
  type: 'late_arrival' | 'early_departure'; // طلب سماحية تأخير أو خروج مبكر
  minutes: number; // عدد دقائق التأخير أو الخروج المبكر
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string; // ISO string
  processedBy?: string;
  processedAt?: string; // ISO string
  rejectionReason?: string;
  notes?: string;
  isDeleted?: boolean;
}

export interface PayrollPeriod {
  id: string; // e.g. "2026-08"
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  actualDays: number; // actual days count in cycle (e.g. 30, 31, 28)
  status: 'open' | 'calculated' | 'closed' | 'archived';
  createdAt: string; // ISO string
  closedAt?: string; // ISO string
  closedBy?: string;
}

export interface PayrollRecord {
  id: string;
  periodId: string;
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  cycleDays: number;
  dailyRate: number;

  lateMinutes: number;
  lateDeduction: number;
  earlyCheckoutMinutes?: number;
  earlyCheckoutDeduction?: number;
  missingCheckOutCount?: number;
  missingCheckOutDeduction?: number;
  absenceDays: number;
  absenceDeduction: number;
  notEmployedDays?: number;
  notEmployedDeduction?: number;
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  paidLeaveDays: number;

  overtimeMinutes: number;
  overtimeAddition: number;
  bonuses: number;

  advances: number;
  manualDeductions: number;

  rewardAmount?: number;
  rewardPoints?: number;
  rewardType?: 'reward' | 'deduction' | 'neutral';
  rewardCalculationVersion?: string;
  rewardCalculatedAt?: string; // ISO string

  totalAdditions: number;
  totalDeductions: number;
  netSalary: number;

  calculationVersion?: string;
  status: 'draft' | 'approved' | 'paid';
  generatedAt: string; // ISO string
  approvedBy?: string;
  approvedAt?: string; // ISO string
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss or ISO
  timestamp: string; // ISO string
  action: string;
  reason?: string;
  dataBefore?: Record<string, any> | null;
  dataAfter?: Record<string, any> | null;
  targetEntity?: string;
  targetId?: string;
}

export interface CompanySettings {
  companyName?: string;
  companyLogo?: string;
  companyAddress?: string;
  companyLatitude: number;
  companyLongitude: number;
  allowedRadiusMeters: number;
  companyLocations?: CompanyLocation[];

  workStartTime: string;
  workEndTime: string;

  earlyCheckInMinutes: number;
  lateToleranceMinutes: number;
  earlyCheckoutToleranceMinutes: number;
  maxLateMinutes: number;
  allowEarlyCheckIn?: boolean;
  preventTaskWithoutCheckIn?: boolean;
  workHoursPerDay?: number;

  // Missing Check-Out Penalty Settings
  enableMissingCheckOutDeduction?: boolean;
  missingCheckOutDeductionAmount?: number;
  missingCheckOutGraceMinutes?: number;

  salaryCycleStartDay: number;
  salaryCycleEndDay: number;

  paidLeavesPerCycle: number;
  unpaidLeavesPerCycle: number;

  overtimeHourlyRate: number;

  defaultEmployeeStatus?: string;
  allowAutoAccountCreation?: boolean;
  terminationPolicy?: string;
  allowEmployeeReactivation?: boolean;

  rewardPoolPercentage?: number; // default 5%
  rewardPointValue?: number; // default 35
}

export interface FinancialAdjustment {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'deduction' | 'reward';
  amount: number;
  reason: string; // Mandatory
  date: string; // YYYY-MM-DD
  cycleId?: string; // e.g. "2026-09"
  periodStartDate?: string; // YYYY-MM-DD
  periodEndDate?: string; // YYYY-MM-DD
  notes?: string;
  createdById?: string;
  createdBy?: string;
  createdAt: string; // ISO string
}




