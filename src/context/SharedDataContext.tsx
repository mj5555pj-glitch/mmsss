import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { safeGetLocalStorage } from '../utils';
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
  getTasks,
  getAttendanceRecords,
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
  fetchTasks: (force?: boolean, limitCount?: number) => Promise<Task[]>;
  fetchAttendanceRecords: (force?: boolean, limitCount?: number) => Promise<AttendanceRecord[]>;
  fetchManualPoints: (force?: boolean) => Promise<ManualPointsRecord[]>;
  fetchPayrollRecords: (force?: boolean) => Promise<PayrollRecord[]>;
  fetchFinancialAdjustments: (force?: boolean) => Promise<FinancialAdjustment[]>;
  fetchPayrollPeriods: (force?: boolean) => Promise<PayrollPeriod[]>;
}

const SharedDataContext = createContext<SharedDataContextValue | null>(null);

export interface SharedDataProviderProps {
  children: ReactNode;
  currentEmployeeId?: string | null;
  currentUserRole?: string | null;
  activeTab?: string;
}

export function SharedDataProvider({
  children,
  currentEmployeeId: propEmployeeId,
  currentUserRole: propUserRole,
  activeTab: propActiveTab
}: SharedDataProviderProps) {
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

  // Active identity tracking: prioritize props, fallback to local storage
  const [activeEmployeeId, setActiveEmployeeId] = useState<string | null>(() => {
    return propEmployeeId !== undefined ? propEmployeeId : safeGetLocalStorage('futurex_logged_in_employee_id');
  });
  const [activeRole, setActiveRole] = useState<string>(() => {
    return propUserRole !== undefined ? propUserRole : (safeGetLocalStorage('futurex_user_role') || 'technician');
  });

  useEffect(() => {
    if (propEmployeeId !== undefined) {
      setActiveEmployeeId(propEmployeeId);
    } else {
      const stored = safeGetLocalStorage('futurex_logged_in_employee_id');
      if (stored !== activeEmployeeId) {
        setActiveEmployeeId(stored);
      }
    }
  }, [propEmployeeId]);

  useEffect(() => {
    if (propUserRole !== undefined) {
      setActiveRole(propUserRole);
    } else {
      const stored = safeGetLocalStorage('futurex_user_role') || 'technician';
      if (stored !== activeRole) {
        setActiveRole(stored);
      }
    }
  }, [propUserRole]);

  // On-demand fetchers with 30-50 record limits for Owner / Manager
  const fetchTasks = async (force: boolean = false, limitCount: number = 50) => {
    const isTechnician = activeRole === 'technician';
    const targetEmpId = isTechnician ? (activeEmployeeId || undefined) : undefined;
    const data = await getTasks(force, limitCount, targetEmpId);
    setTasks(data);
    return data;
  };

  const fetchAttendanceRecords = async (force: boolean = false, limitCount: number = 50) => {
    const isTechnician = activeRole === 'technician';
    const targetEmpId = isTechnician ? (activeEmployeeId || undefined) : undefined;
    const data = await getAttendanceRecords(force, targetEmpId, limitCount);
    setAttendanceRecords(data);
    return data;
  };

  useEffect(() => {
    let isMounted = true;
    const noopError = () => {};

    const isTechnician = activeRole === 'technician';
    const targetEmployeeId = isTechnician ? (activeEmployeeId || undefined) : undefined;
    const isPrivileged = activeRole === 'owner' || activeRole === 'manager';

    let unsubTasks: (() => void) | null = null;
    let unsubAttendance: (() => void) | null = null;

    if (isTechnician && targetEmployeeId) {
      // 1. Technicians: Lightweight listener strictly scoped by where('employeeId', '==', targetEmployeeId) with limit(50)
      unsubTasks = subscribeTasks(
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
        },
        targetEmployeeId
      );

      unsubAttendance = subscribeAttendanceRecords(
        (list) => {
          if (!isMounted) return;
          setAttendanceRecords(list);
        },
        noopError,
        targetEmployeeId
      );
    } else {
      // 1b. Owner / Manager: Convert large collection queries (Tasks & Attendance)
      // from continuous real-time onSnapshot to on-demand getDocs with limit 50!
      // This stops endless background reads across thousands of historical records.
      getTasks(false, 50).then((list) => {
        if (isMounted) setTasks(list);
      }).catch(noopError);

      getAttendanceRecords(false, undefined, 50).then((list) => {
        if (isMounted) setAttendanceRecords(list);
      }).catch(noopError);
    }

    // 2. Employees (Real-Time lightweight list)
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

    // 3. Settings & Credentials: Pruned for background screens
    // Only active when on settings screens; otherwise closed to prevent unnecessary reads
    let unsubSettings: (() => void) | null = null;
    const isSettingsScreen = !propActiveTab || propActiveTab === 'settings' || propActiveTab === 'hr_settings';
    if (isPrivileged && isSettingsScreen) {
      unsubSettings = subscribeSettings(
        (creds) => {
          if (!isMounted) return;
          if (creds) setAdminCredentials(creds);
        },
        noopError
      );
    } else {
      setAdminCredentials(null);
    }

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

    // 6. Users: Pruned for background screens
    // Only active when in users / HR settings screen; otherwise closed to prevent unnecessary reads
    let unsubUsers: (() => void) | null = null;
    const isUsersScreen = !propActiveTab || propActiveTab === 'settings' || propActiveTab === 'employee_hr_center' || propActiveTab === 'users';
    if (isPrivileged && isUsersScreen) {
      unsubUsers = subscribeUsers(
        (list) => {
          if (!isMounted) return;
          setUsers(list);
        },
        noopError
      );
    } else {
      setUsers([]);
    }

    // 7. Company Settings
    const unsubCompanySettings = subscribeCompanySettings(
      (sets) => {
        if (!isMounted) return;
        setCompanySettings(sets);
      },
      noopError
    );

    return () => {
      isMounted = false;
      if (unsubTasks) unsubTasks();
      if (unsubEmployees) unsubEmployees();
      if (unsubSettings) unsubSettings();
      if (unsubTaskTypes) unsubTaskTypes();
      if (unsubPointsRules) unsubPointsRules();
      if (unsubUsers) unsubUsers();
      if (unsubCompanySettings) unsubCompanySettings();
      if (unsubAttendance) unsubAttendance();
    };
  }, [activeEmployeeId, activeRole, propActiveTab]);

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
    fetchTasks,
    fetchAttendanceRecords,
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
    dbError,
    activeRole,
    activeEmployeeId
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
