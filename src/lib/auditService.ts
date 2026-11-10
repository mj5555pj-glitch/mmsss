import { AuditLogEntry } from '../types';

export type AuditSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AuditValidationResult {
  isValid: boolean;
  errorCode?: 'MISSING_USER' | 'MISSING_ACTION' | 'REASON_REQUIRED';
  errorMessage?: string;
}

export interface ObjectDiff {
  field: string;
  before: any;
  after: any;
}

export interface AuditSummary {
  action: string;
  userName: string;
  userRole: string;
  timestamp: string;
  date: string;
  time: string;
  changedFieldsCount: number;
  severity: AuditSeverity;
}

/**
 * List of actions that strictly mandate a written reason.
 */
const ACTIONS_REQUIRING_REASON: string[] = [
  'ATTENDANCE_ADJUSTMENT',
  'ATTENDANCE_STATUS_CHANGE',
  'SALARY_ADJUSTMENT',
  'EMPLOYEE_TERMINATION',
  'EMPLOYEE_SUSPENSION',
  'OVERTIME_REJECTION',
  'LEAVE_REJECTION',
  'MANUAL_DEDUCTION_ADDED',
  'PAYROLL_RECORD_MODIFIED',
];

/**
 * Checks if a specific action requires a reason to be provided.
 */
export function requiresReason(action: string): boolean {
  if (!action) return false;
  const normalizedAction = action.toUpperCase().trim();
  return (
    ACTIONS_REQUIRING_REASON.includes(normalizedAction) ||
    normalizedAction.includes('ADJUSTMENT') ||
    normalizedAction.includes('TERMINAT') ||
    normalizedAction.includes('SUSPEND') ||
    normalizedAction.includes('REJECT')
  );
}

/**
 * Evaluates the severity level of an administrative operation.
 */
export function getAuditSeverity(action: string): AuditSeverity {
  if (!action) return 'LOW';
  const upper = action.toUpperCase();

  if (upper.includes('LOGIN') || upper.includes('LOGOUT') || upper.includes('VIEW')) {
    return 'LOW';
  }

  if (
    upper.includes('ATTENDANCE') ||
    upper.includes('OVERTIME') ||
    upper.includes('LEAVE') ||
    upper.includes('TASK')
  ) {
    return 'MEDIUM';
  }

  if (
    upper.includes('PAYROLL') ||
    upper.includes('SALARY') ||
    upper.includes('BONUS') ||
    upper.includes('SETTINGS')
  ) {
    return 'HIGH';
  }

  if (
    upper.includes('TERMINATION') ||
    upper.includes('SUSPEND') ||
    upper.includes('USER_DELETE') ||
    upper.includes('SECURITY')
  ) {
    return 'CRITICAL';
  }

  return 'MEDIUM';
}

/**
 * Compares beforeState and afterState objects and returns changed fields with old & new values.
 */
export function compareObjects(
  beforeState: Record<string, any> | null | undefined,
  afterState: Record<string, any> | null | undefined
): ObjectDiff[] {
  const diffs: ObjectDiff[] = [];

  const before = beforeState || {};
  const after = afterState || {};

  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  for (const key of allKeys) {
    const valBefore = before[key];
    const valAfter = after[key];

    // Deep stringify comparison for simple object/array equality check
    if (JSON.stringify(valBefore) !== JSON.stringify(valAfter)) {
      diffs.push({
        field: key,
        before: valBefore,
        after: valAfter,
      });
    }
  }

  return diffs;
}

/**
 * Pure validation for audit log entries before creation/persistence.
 */
export function validateAuditEntry(params: {
  userId: string;
  action: string;
  reason?: string;
}): AuditValidationResult {
  if (!params.userId || !params.userId.trim()) {
    return {
      isValid: false,
      errorCode: 'MISSING_USER',
      errorMessage: 'معرف المستخدم (actorUserId) مطلوب لتسجيل عملية التدقيق',
    };
  }

  if (!params.action || !params.action.trim()) {
    return {
      isValid: false,
      errorCode: 'MISSING_ACTION',
      errorMessage: 'نوع العملية (action) مطلوب لتسجيل عملية التدقيق',
    };
  }

  if (requiresReason(params.action) && (!params.reason || !params.reason.trim())) {
    return {
      isValid: false,
      errorCode: 'REASON_REQUIRED',
      errorMessage: `العملية (${params.action}) تتطلب كتابة سبب التعديل/الإجراء`,
    };
  }

  return { isValid: true };
}

/**
 * Creates an AuditLogEntry pure object. Does NOT perform any Firestore writes.
 */
export function createAuditEntry(params: {
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  targetEntity?: string;
  targetId?: string;
  reason?: string;
  dataBefore?: Record<string, any> | null;
  dataAfter?: Record<string, any> | null;
}): AuditLogEntry {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss
  const timestampStr = now.toISOString();

  return {
    id: `audit_${now.getTime()}_${Math.random().toString(36).substring(2, 7)}`,
    userId: params.userId,
    userName: params.userName,
    userRole: params.userRole,
    date: dateStr,
    time: timeStr,
    timestamp: timestampStr,
    action: params.action,
    targetEntity: params.targetEntity,
    targetId: params.targetId,
    reason: params.reason,
    dataBefore: params.dataBefore || null,
    dataAfter: params.dataAfter || null,
  };
}

/**
 * Generates human-readable audit summary including severity and count of changed fields.
 */
export function generateAuditSummary(entry: AuditLogEntry): AuditSummary {
  const diffs = compareObjects(entry.dataBefore, entry.dataAfter);
  const severity = getAuditSeverity(entry.action);

  return {
    action: entry.action,
    userName: entry.userName,
    userRole: entry.userRole,
    timestamp: entry.timestamp,
    date: entry.date,
    time: entry.time,
    changedFieldsCount: diffs.length,
    severity,
  };
}
