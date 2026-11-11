import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import {
  Employee,
  Task,
  DbTaskType,
  PointsRules,
  ManualPointsRecord,
  SystemUser,
  AttendanceRecord,
  OvertimeRecord,
  LeaveRequest,
  GraceRequest,
  PayrollPeriod,
  PayrollRecord,
  AuditLogEntry,
  CompanySettings,
  FinancialAdjustment
} from '../types';
import {
  subscribeEmployees,
  subscribeTasks,
  subscribeSettings,
  subscribeTaskTypes,
  subscribePointsRules,
  subscribeUsers,
  subscribeCompanySettings,
  subscribeAttendanceRecords,
  getManualPoints,
  getManualPointsCachedSync,
  getPayrollRecords,
  getPayrollRecordsCachedSync,
  getFinancialAdjustments,
  getFinancialAdjustmentsCachedSync,
  getPayrollPeriods,
  getPayrollPeriodsCachedSync,
  DEFAULT_POINTS_RULES
} from '../lib/dbService';

export interface SharedDataContextValue {
  employees: Employee[];
  tasks: Task[];
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  manualPoints: ManualPointsRecord[];
  users: SystemUser[];
  companySettings: CompanySettings | null;
  attendanceRecords: AttendanceRecord[];
  overtimeRecords: OvertimeRecord[];
  leaveRequests: LeaveRequest[];
  graceRequests: GraceRequest[];
  payrollPeriods: PayrollPeriod[];
  payrollRecords: PayrollRecord[];
  auditLogs: AuditLogEntry[];
  financialAdjustments: FinancialAdjustment[];
  adminCredentials: {
    adminUsername?: string;
    adminPassword?: string;
    viewerUsername?: string;
    viewerPassword?: string;
  } | null;
  loading: boolean;
  dbError: string | null;
  fetchManualPoints: (force?: boolean) => Promise<ManualPointsRecord[]>;
  fetchPayrollRecords: (force?: boolean) => Promise<PayrollRecord[]>;
  fetchFinancialAdjustments: (force?: boolean) => Promise<FinancialAdjustment[]>;
  fetchPayrollPeriods: (force?: boolean) => Promise<PayrollPeriod[]>;
}

const SharedDataContext = createContext<SharedDataContextValue | null>(null);

export function SharedDataProvider({ children }: { children: ReactNode }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTypes, setTaskTypes] = useState<DbTaskType[]>([]);
  const [pointsRules, setPointsRules] = useState<PointsRules>(DEFAULT_POINTS_RULES);
  const [manualPoints, setManualPoints] = useState<ManualPointsRecord[]>(() => getManualPointsCachedSync());
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [graceRequests, setGraceRequests] = useState<GraceRequest[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() => getPayrollRecordsCachedSync());
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>(() => getFinancialAdjustmentsCachedSync());
  const [adminCredentials, setAdminCredentials] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const noopError = () => {};

    // 1. Tasks (Always Real-Time)
    const unsubTasks = subscribeTasks(
      (list) => {
        if (!isMounted) return;
        setTasks(list);
      },
      (err) => {
        if (!isMounted) return;
        const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('unavailable');
        if (!isOffline && tasks.length === 0) {
          setDbError('فشل تحميل المهام من قاعدة البيانات.');
        }
      }
    );

    // 2. Employees (Real-Time)
    const unsubEmployees = subscribeEmployees(
      (list) => {
        if (!isMounted) return;
        setEmployees(list);
        setLoading(false);
      },
      (err) => {
        if (!isMounted) return;
        const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('unavailable');
        if (!isOffline && employees.length === 0) {
          setDbError('فشل تحميل بيانات الموظفين من قاعدة البيانات.');
        }
        setLoading(false);
      }
    );

    // 3. Settings & Credentials
    const unsubSettings = subscribeSettings(
      (creds) => {
        if (!isMounted) return;
        if (creds) setAdminCredentials(creds);
      },
      noopError
    );

    // 4. Task Types
    const unsubTaskTypes = subscribeTaskTypes(
      (types) => {
        if (!isMounted) return;
        setTaskTypes(types);
      },
      noopError
    );

    // 5. Points Rules
    const unsubPointsRules = subscribePointsRules(
      (rules) => {
        if (!isMounted) return;
        if (rules) setPointsRules(rules);
      },
      noopError
    );

    // 6. Users
    const unsubUsers = subscribeUsers(
      (list) => {
        if (!isMounted) return;
        setUsers(list);
      },
      noopError
    );

    // 7. Company Settings
    const unsubCompanySettings = subscribeCompanySettings(
      (sets) => {
        if (!isMounted) return;
        setCompanySettings(sets);
      },
      noopError
    );

    // 8. Attendance Records (for task assignment availability)
    const unsubAttendance = subscribeAttendanceRecords(
      (list) => {
        if (!isMounted) return;
        setAttendanceRecords(list);
      },
      noopError
    );

    return () => {
      isMounted = false;
      unsubTasks();
      unsubEmployees();
      unsubSettings();
      unsubTaskTypes();
      unsubPointsRules();
      unsubUsers();
      unsubCompanySettings();
      unsubAttendance();
    };
  }, []);

  const fetchManualPoints = async (force: boolean = false) => {
    const data = await getManualPoints(force);
    setManualPoints(data);
    return data;
  };

  const fetchPayrollRecords = async (force: boolean = false) => {
    const data = await getPayrollRecords(force);
    setPayrollRecords(data);
    return data;
  };

  const fetchFinancialAdjustments = async (force: boolean = false) => {
    const data = await getFinancialAdjustments(force);
    setFinancialAdjustments(data);
    return data;
  };

  const fetchPayrollPeriods = async (force: boolean = false) => {
    const data = await getPayrollPeriods(force);
    setPayrollPeriods(data);
    return data;
  };

  const value = useMemo<SharedDataContextValue>(() => ({
    employees,
    tasks,
    taskTypes,
    pointsRules,
    manualPoints,
    users,
    companySettings,
    attendanceRecords,
    overtimeRecords,
    leaveRequests,
    graceRequests,
    payrollPeriods,
    payrollRecords,
    auditLogs,
    financialAdjustments,
    adminCredentials,
    loading,
    dbError,
    fetchManualPoints,
    fetchPayrollRecords,
    fetchFinancialAdjustments,
    fetchPayrollPeriods
  }), [
    employees,
    tasks,
    taskTypes,
    pointsRules,
    manualPoints,
    users,
    companySettings,
    attendanceRecords,
    overtimeRecords,
    leaveRequests,
    graceRequests,
    payrollPeriods,
    payrollRecords,
    auditLogs,
    financialAdjustments,
    adminCredentials,
    loading,
    dbError
  ]);

  return (
    <SharedDataContext.Provider value={value}>
      {children}
    </SharedDataContext.Provider>
  );
}

export function useSharedData(): SharedDataContextValue {
  const context = useContext(SharedDataContext);
  if (!context) {
    throw new Error('useSharedData must be used within a SharedDataProvider');
  }
  return context;
}
