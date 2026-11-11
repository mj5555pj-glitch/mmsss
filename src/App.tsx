import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, Users, Trophy, FileText, Info, Award, CircleHelp, Settings, LogOut, Clock, Zap, FolderKanban, Database, UserCheck, Inbox, DollarSign, History, ShieldCheck, ClipboardList, Calendar } from 'lucide-react';
import { Employee, EmployeeStatus, Task, TaskType, TASK_POINTS, DbTaskType, PointsRules, ManualPointsRecord, SystemUser, AttendanceRecord, CompanySettings } from './types';
import { SEED_EMPLOYEES, SEED_TASKS } from './data';
import { isToday, calculateTaskPoints, getTaskTimeLimitMinutes, safeGetLocalStorage, safeSetLocalStorage, safeRemoveLocalStorage, canAssignTaskToTechnician, normalizeDateString } from './utils';
import { 
  initCollectionsIfEmpty,
  subscribeEmployees,
  subscribeTasks,
  subscribeSettings,
  subscribeCompanySettings,
  saveEmployee,
  deleteEmployee,
  saveTask,
  deleteTask,
  saveSettings,
  updateLeaderboardRankings,
  resetDatabaseToDemo,
  wipeDatabase,
  subscribeTaskTypes,
  subscribePointsRules,
  saveTaskType,
  deleteTaskType,
  savePointsRules,
  getManualPoints,
  getManualPointsCachedSync,
  saveManualPoint,
  deleteManualPoint,
  subscribeUsers,
  saveUser,
  deleteUser,
  updateUserLoginMetadata
} from './lib/dbService';
import { triggerWebNotification, requestNotificationPermission, unlockAudioForSafari } from './lib/notificationService';
import { 
  initOneSignal,
  registerUserInOneSignal,
  sendOneSignalToEmployee,
  sendOneSignalToAdmins,
  setupOneSignalForegroundListener
} from './lib/onesignalService';

// Import our modular components
import Header from './components/Header';
import OwnerDashboardView from './components/OwnerDashboardView';
import InAppToastsContainer from './components/InAppToastsContainer';
import DashboardStatsCard from './components/DashboardStatsCard';
import TaskRegistration from './components/TaskRegistration';
import LeaderboardTab from './components/LeaderboardTab';
import EmployeeManager from './components/EmployeeManager';
import ReportsView from './components/ReportsView';
import AboutCard from './components/AboutCard';
import LoginView from './components/LoginView';
import SettingsView from './components/SettingsView';
import ViewerTasksView from './components/ViewerTasksView';
import ManualPointsCard from './components/ManualPointsCard';
import ActiveTasksView from './components/ActiveTasksView';
import TechnicianDashboard from './components/TechnicianDashboard';
import AllTasksView from './components/AllTasksView';
import VersionUpdateBanner from './components/VersionUpdateBanner';
import ProductionReadiness from './components/ProductionReadiness';
import TaskManagementCenter from './components/TaskManagementCenter';
import SystemDiagnostics from './components/SystemDiagnostics';
import TechnicianPointsView from './components/TechnicianPointsView';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'task_management' | 'production_readiness' | 'system_diagnostics' | 'active_tasks' | 'all_tasks' | 'employees' | 'leaderboard' | 'reports' | 'settings' | 'about' | 'tasks' | 'achievements' | 'points'>('dashboard');
  const [selectedEmployeeForTask, setSelectedEmployeeForTask] = useState<string | undefined>(undefined);

  const handleNavigateTab = (tab: string, employeeId?: string) => {
    if (employeeId) {
      setSelectedEmployeeForTask(employeeId);
    }
    let targetTab = tab;
    if (tab === 'tasks' && userRole !== 'technician') {
      targetTab = 'task_management';
    }
    if (['employee_hr_center', 'attendance_management', 'payroll_management', 'requests_center', 'hr_settings', 'payroll'].includes(tab)) {
      targetTab = 'employees';
    }
    setActiveTab(targetTab as any);
  };

  // Application Data State - loaded and sync'd from Firestore in real-time
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [manualPoints, setManualPoints] = useState<ManualPointsRecord[]>(() => getManualPointsCachedSync());
  const [taskTypes, setTaskTypes] = useState<DbTaskType[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [pointsRules, setPointsRules] = useState<PointsRules>({
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    additionalRewards: '',
    customRules: ''
  });
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Lazy load points history on demand when points/leaderboard/reports tabs are opened
  useEffect(() => {
    if (['leaderboard', 'achievements', 'reports', 'points'].includes(activeTab)) {
      getManualPoints().then(recs => {
        setManualPoints(recs);
      }).catch(err => console.warn('Manual points lazy load warning:', err));
    }
  }, [activeTab]);

  // Authentication & Credentials States
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return safeGetLocalStorage('futurex_is_logged_in') === 'true';
  });

  const [userRole, setUserRole] = useState<'owner' | 'supervisor' | 'manager' | 'technician'>(() => {
    const saved = safeGetLocalStorage('futurex_user_role');
    return (saved as 'owner' | 'supervisor' | 'manager' | 'technician') || 'technician';
  });

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string>(() => {
    return safeGetLocalStorage('futurex_logged_in_username') || '';
  });

  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('admin123');
  const [viewerUsername, setViewerUsername] = useState('viewer');
  const [viewerPassword, setViewerPassword] = useState('viewer123');

  // Track previous tasks state for real-time sound and web notification alerts
  const prevTasksRef = React.useRef<Task[] | null>(null);

  // Auto initialize OneSignal PWA notifications, request notification permission, and unlock Safari AudioContext
  useEffect(() => {
    requestNotificationPermission();

    const handleUserGesture = () => {
      unlockAudioForSafari();
    };

    window.addEventListener('click', handleUserGesture, { once: true });
    window.addEventListener('touchstart', handleUserGesture, { once: true });

    // Initialize OneSignal SDK & listener
    initOneSignal().catch(err => console.warn('OneSignal init error:', err));
    setupOneSignalForegroundListener((title, body, soundType) => {
      triggerWebNotification(title, body, soundType);
    });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
    };
  }, []);

  // Load data and set up real-time Firebase subscriptions
  useEffect(() => {
    let isMounted = true;
    let unsubscribeEmployees: () => void;
    let unsubscribeTasks: () => void;
    let unsubscribeSettings: () => void;
    let unsubscribeTaskTypes: () => void;
    let unsubscribePointsRules: () => void;
    let unsubscribeUsers: () => void;
    let unsubscribeCompanySettings: () => void;

    async function setupFirebase() {
      try {
        await initCollectionsIfEmpty();
        if (!isMounted) return;
        
        unsubscribeEmployees = subscribeEmployees(
          (emps) => {
            if (!isMounted) return;
            const normalizedEmps = emps.map((emp) => {
              const rawDate = emp.employmentDate || emp.joinDate || emp.joinedAt;
              const normDate = normalizeDateString(rawDate);
              if (normDate && (emp.employmentDate !== normDate || emp.joinDate !== normDate)) {
                return {
                  ...emp,
                  employmentDate: normDate,
                  joinDate: normDate,
                  joinedAt: `${normDate}T00:00:00.000Z`
                };
              }
              return emp;
            });
            setEmployees(normalizedEmps);
            setLoading(false);
          },
          (err) => {
            if (!isMounted) return;
            console.warn('Employees subscription notice:', err);
            // Only set fatal dbError if no employees loaded and it's not a transient network drop
            const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('unavailable');
            if (!isOffline && employees.length === 0) {
              setDbError('فشل تحميل بيانات الموظفين من قاعدة البيانات.');
            }
            setLoading(false);
          }
        );

        unsubscribeTasks = subscribeTasks(
          (ts) => {
            if (!isMounted) return;

            prevTasksRef.current = ts;
            setTasks(ts);
          },
          (err) => {
            if (!isMounted) return;
            console.warn('Tasks subscription notice:', err);
            const isOffline = (err as any)?.code === 'unavailable' || String(err).includes('unavailable');
            if (!isOffline && tasks.length === 0) {
              setDbError('فشل تحميل المهام من قاعدة البيانات.');
            }
          }
        );

        unsubscribeSettings = subscribeSettings(
          (creds) => {
            if (!isMounted) return;
            if (creds) {
              if (creds.adminUsername) setAdminUsername(creds.adminUsername);
              if (creds.adminPassword) setAdminPassword(creds.adminPassword);
              if (creds.viewerUsername) setViewerUsername(creds.viewerUsername);
              if (creds.viewerPassword) setViewerPassword(creds.viewerPassword);
            }
          },
          (err) => {
            console.error(err);
          }
        );

        unsubscribeTaskTypes = subscribeTaskTypes(
          (typesList) => {
            if (!isMounted) return;
            setTaskTypes(typesList);
          },
          (err) => {
            console.error('Error fetching dynamic task types:', err);
          }
        );

        unsubscribePointsRules = subscribePointsRules(
          (rules) => {
            if (!isMounted) return;
            if (rules) setPointsRules(rules);
          },
          (err) => {
            console.error('Error fetching points rules:', err);
          }
        );

        unsubscribeUsers = subscribeUsers(
          (usersList) => {
            if (!isMounted) return;
            setUsers(usersList);
          },
          (err) => {
            console.error('Error fetching users:', err);
          }
        );

        unsubscribeCompanySettings = subscribeCompanySettings(
          (sets) => {
            if (!isMounted) return;
            if (sets) setCompanySettings(sets);
          },
          (err) => console.error('Company settings sub error:', err)
        );

        // If the component unmounted while we were establishing subscriptions, unsubscribe them immediately
        if (!isMounted) {
          if (unsubscribeEmployees) unsubscribeEmployees();
          if (unsubscribeTasks) unsubscribeTasks();
          if (unsubscribeSettings) unsubscribeSettings();
          if (unsubscribeTaskTypes) unsubscribeTaskTypes();
          if (unsubscribePointsRules) unsubscribePointsRules();
          if (unsubscribeUsers) unsubscribeUsers();
          if (unsubscribeCompanySettings) unsubscribeCompanySettings();
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error setting up DB subscriptions:', err);
        setDbError('فشل الاتصال بـ Firebase Firestore.');
        setLoading(false);
      }
    }

    setupFirebase();

    return () => {
      isMounted = false;
      if (unsubscribeEmployees) unsubscribeEmployees();
      if (unsubscribeTasks) unsubscribeTasks();
      if (unsubscribeSettings) unsubscribeSettings();
      if (unsubscribeTaskTypes) unsubscribeTaskTypes();
      if (unsubscribePointsRules) unsubscribePointsRules();
      if (unsubscribeUsers) unsubscribeUsers();
      if (unsubscribeCompanySettings) unsubscribeCompanySettings();
    };
  }, []);

  // Real-time account status checker for security
  useEffect(() => {
    if (isLoggedIn && currentUsername && users.length > 0) {
      const cleanCurrent = currentUsername.trim().toLowerCase();
      const me = users.find(u => u.username.trim().toLowerCase() === cleanCurrent);
      if (me) {
        // Check if disabled or locked
        if (me.status === 'disabled' || me.locked) {
          alert('عذراً، تم تعطيل أو قفل حسابك من قبل مالك النظام.');
          handleLogout();
          return;
        }

        // Note: Automatic background writes (registerUserInOneSignal) disabled in useEffect to prevent repeating writes
      }
    }
  }, [users, isLoggedIn, currentUsername]);

  const handleLogin = (usernameInput: string, passwordInput: string) => {
    const cleanUsername = usernameInput.trim().toLowerCase();
    const cleanPassword = passwordInput.trim();

    // 1. Search in our Firestore synchronized users list
    const matchedUser = users.find(u => u.username === cleanUsername);

    if (matchedUser) {
      if (matchedUser.password === cleanPassword) {
        if (matchedUser.status === 'disabled') {
          return { success: false, error: 'عذراً، هذا الحساب معطل حالياً من قبل مالك النظام.' };
        }
        if (matchedUser.locked) {
          return { success: false, error: 'عذراً، هذا الحساب مقفل مؤقتاً من قبل مالك النظام.' };
        }

        setIsLoggedIn(true);
        setUserRole(matchedUser.role);
        setCurrentUsername(matchedUser.username);
        
        safeSetLocalStorage('futurex_is_logged_in', 'true');
        safeSetLocalStorage('futurex_user_role', matchedUser.role);
        safeSetLocalStorage('futurex_logged_in_username', matchedUser.username);

        const sessionKey = Math.random().toString(36).substring(2, 15);
        safeSetLocalStorage('futurex_logged_in_session_key', sessionKey);

        // Register user in OneSignal PWA push notifications on user login
        registerUserInOneSignal(matchedUser.id, matchedUser.employeeId, matchedUser.role, matchedUser.username).catch(err => {
          console.warn('OneSignal registration on login warning:', err);
        });

        const getDeviceString = () => {
          const ua = navigator.userAgent;
          if (/android/i.test(ua)) return 'أندرويد (موبايل)';
          if (/iphone|ipad|ipod/i.test(ua)) return 'آيفون / آيباد';
          if (/windows/i.test(ua)) return 'ويندوز (كمبيوتر)';
          if (/macintosh/i.test(ua)) return 'ماك (كمبيوتر)';
          if (/linux/i.test(ua)) return 'لينكس (كمبيوتر)';
          return 'جهاز غير معروف';
        };

        updateUserLoginMetadata(
          matchedUser.id,
          getDeviceString(),
          new Date().toISOString(),
          sessionKey
        ).catch(err => console.error('Error logging user session:', err));

        if (matchedUser.role === 'technician') {
          setActiveTab('dashboard');
          if (matchedUser.employeeId) {
            safeSetLocalStorage('futurex_logged_in_employee_id', matchedUser.employeeId);
          } else {
            // Fallback match by name
            const matchedEmployee = employees.find(e => e.name.trim().toLowerCase() === (matchedUser.displayName || matchedUser.username).trim().toLowerCase());
            const employeeId = matchedEmployee ? matchedEmployee.id : (employees[0]?.id || 'emp-1');
            safeSetLocalStorage('futurex_logged_in_employee_id', employeeId);
          }
        } else {
          setActiveTab('dashboard');
        }

        return { success: true, role: matchedUser.role };
      }
    }

    // 2. Fallback: Check if username matches an employee's name, and password matches an active technician user's password
    const employeeViewer = employees.find(e => e.name.trim() === usernameInput.trim());
    if (employeeViewer) {
      const activeTechnicianUser = users.find(u => u.role === 'technician' && u.status === 'active');
      if (activeTechnicianUser && activeTechnicianUser.password === cleanPassword) {
        setIsLoggedIn(true);
        setUserRole('technician');
        setCurrentUsername(usernameInput.trim());
        
        safeSetLocalStorage('futurex_is_logged_in', 'true');
        safeSetLocalStorage('futurex_user_role', 'technician');
        safeSetLocalStorage('futurex_logged_in_username', usernameInput.trim());
        safeSetLocalStorage('futurex_logged_in_employee_id', employeeViewer.id);

        const sessionKey = Math.random().toString(36).substring(2, 15);
        safeSetLocalStorage('futurex_logged_in_session_key', sessionKey);

        const getDeviceString = () => {
          const ua = navigator.userAgent;
          if (/android/i.test(ua)) return 'أندرويد (موبايل)';
          if (/iphone|ipad|ipod/i.test(ua)) return 'آيفون / آيباد';
          if (/windows/i.test(ua)) return 'ويندوز (كمبيوتر)';
          if (/macintosh/i.test(ua)) return 'ماك (كمبيوتر)';
          if (/linux/i.test(ua)) return 'لينكس (كمبيوتر)';
          return 'جهاز غير معروف';
        };

        updateUserLoginMetadata(
          activeTechnicianUser.id,
          getDeviceString(),
          new Date().toISOString(),
          sessionKey
        ).catch(err => console.error('Error logging fallback session:', err));

        setActiveTab('dashboard');
        return { success: true, role: 'technician' as const };
      }
    }

    // 3. Fallback for offline or local default values if users array is empty
    if (users.length === 0) {
      if (cleanUsername === 'owner' && cleanPassword === 'owner123') {
        setIsLoggedIn(true);
        setUserRole('owner');
        setCurrentUsername('owner');
        setActiveTab('dashboard');
        safeSetLocalStorage('futurex_is_logged_in', 'true');
        safeSetLocalStorage('futurex_user_role', 'owner');
        safeSetLocalStorage('futurex_logged_in_username', 'owner');
        return { success: true, role: 'owner' as const };
      } else if (cleanUsername === 'manager' && cleanPassword === 'manager123') {
        setIsLoggedIn(true);
        setUserRole('manager');
        setCurrentUsername('manager');
        setActiveTab('dashboard');
        safeSetLocalStorage('futurex_is_logged_in', 'true');
        safeSetLocalStorage('futurex_user_role', 'manager');
        safeSetLocalStorage('futurex_logged_in_username', 'manager');
        return { success: true, role: 'manager' as const };
      } else if (cleanUsername === 'technician' && cleanPassword === 'technician123') {
        setIsLoggedIn(true);
        setUserRole('technician');
        setCurrentUsername('technician');
        setActiveTab('dashboard');
        safeSetLocalStorage('futurex_is_logged_in', 'true');
        safeSetLocalStorage('futurex_user_role', 'technician');
        safeSetLocalStorage('futurex_logged_in_username', 'technician');
        const fallbackEmpId = employees[0]?.id || 'emp-1';
        safeSetLocalStorage('futurex_logged_in_employee_id', fallbackEmpId);
        return { success: true, role: 'technician' as const };
      }
    }

    return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserRole('technician');
    setCurrentUsername('');
    safeRemoveLocalStorage('futurex_is_logged_in');
    safeRemoveLocalStorage('futurex_user_role');
    safeRemoveLocalStorage('futurex_logged_in_username');
    safeRemoveLocalStorage('futurex_logged_in_employee_id');
    safeRemoveLocalStorage('futurex_logged_in_session_key');
  };

  const handleUpdateAdminCreds = async (user: string, pass: string) => {
    setAdminUsername(user);
    setAdminPassword(pass);
    await saveSettings({
      adminUsername: user,
      adminPassword: pass,
      viewerUsername,
      viewerPassword
    });
  };

  const handleUpdateViewerCreds = async (user: string, pass: string) => {
    setViewerUsername(user);
    setViewerPassword(pass);
    await saveSettings({
      adminUsername,
      adminPassword,
      viewerUsername: user,
      viewerPassword: pass
    });
  };

  const handleResetToDemo = async () => {
    setLoading(true);
    await resetDatabaseToDemo();
    setLoading(false);
  };

  const handleWipeAllData = async () => {
    if (userRole !== 'owner') return;
    setLoading(true);
    await wipeDatabase();
    setLoading(false);
  };

  const handleSaveUser = async (user: SystemUser) => {
    if (userRole !== 'owner') return;
    await saveUser(user);
  };

  const handleDeleteUser = async (id: string) => {
    if (userRole !== 'owner') return;
    await deleteUser(id);
  };

  const handleSaveTaskType = async (type: DbTaskType) => {
    if (userRole !== 'owner') return;
    await saveTaskType(type);
  };

  const handleDeleteTaskType = async (type: DbTaskType) => {
    if (userRole !== 'owner') return;
    await deleteTaskType(type, tasks);
  };

  const handleSavePointsRules = async (rules: PointsRules) => {
    if (userRole !== 'owner') return;
    await savePointsRules(rules);
  };

  // --- ACTIONS (Saving immediately to Firestore and triggering leaderboard updates) ---

  // 1. Manual Points Actions
  const handleExecuteManualPoints = async (
    employeeId: string,
    type: 'gift' | 'penalty',
    pointsValue: number,
    reason: string
  ) => {
    const employeeName = employees.find(e => e.id === employeeId)?.name || 'موظف مجهول';
    const newRecord: ManualPointsRecord = {
      id: `mp-${Date.now()}`,
      type,
      employeeId,
      employeeName,
      points: pointsValue,
      reason,
      adminName: adminUsername,
      timestamp: new Date().toISOString()
    };
    await saveManualPoint(newRecord);
    await updateLeaderboardRankings(employees, tasks, [newRecord, ...manualPoints]);
  };

  const handleDeleteManualPoint = async (id: string) => {
    await deleteManualPoint(id);
    const remainingPoints = manualPoints.filter(mp => mp.id !== id);
    await updateLeaderboardRankings(employees, tasks, remainingPoints);
  };

  const handleEditManualPoint = async (id: string, points: number, reason: string) => {
    const originalRecord = manualPoints.find(mp => mp.id === id);
    if (!originalRecord) return;
    const updatedRecord: ManualPointsRecord = {
      ...originalRecord,
      points,
      reason
    };
    await saveManualPoint(updatedRecord);
    const updatedPoints = manualPoints.map(mp => mp.id === id ? updatedRecord : mp);
    await updateLeaderboardRankings(employees, tasks, updatedPoints);
  };

  // 1. Employee Actions
  const handleAddEmployee = async (name: string, phone?: string, baseSalary?: number, role?: string, isExemptFromFingerprint?: boolean, employmentDate?: string) => {
    if (userRole !== 'owner') return;
    const selectedDate = normalizeDateString(employmentDate) || new Date().toISOString().split('T')[0];
    const newEmp: Employee = {
      id: `emp-${Date.now()}`,
      name,
      phone,
      baseSalary,
      role,
      isExemptFromFingerprint: Boolean(isExemptFromFingerprint),
      exemptFromFingerprint: Boolean(isExemptFromFingerprint),
      employmentDate: selectedDate,
      joinDate: selectedDate,
      joinedAt: `${selectedDate}T00:00:00.000Z`
    };
    await saveEmployee(newEmp);
    await updateLeaderboardRankings([...employees, newEmp], tasks, manualPoints);
  };

  const handleEditEmployee = async (id: string, name: string, phone?: string, baseSalary?: number, status?: EmployeeStatus, isExemptFromFingerprint?: boolean, employmentDate?: string) => {
    if (userRole !== 'owner') return;
    const updatedEmployees = employees.map(emp => {
      if (emp.id === id) {
        const rawDate = employmentDate || emp.employmentDate || emp.joinDate;
        const selectedDate = normalizeDateString(rawDate);
        return {
          ...emp,
          name,
          phone,
          ...(baseSalary !== undefined ? { baseSalary } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(isExemptFromFingerprint !== undefined ? { isExemptFromFingerprint, exemptFromFingerprint: isExemptFromFingerprint } : {}),
          ...(selectedDate ? { employmentDate: selectedDate, joinDate: selectedDate, joinedAt: `${selectedDate}T00:00:00.000Z` } : {})
        };
      }
      return emp;
    });

    const editedEmp = updatedEmployees.find(emp => emp.id === id);
    if (editedEmp) {
      await saveEmployee(editedEmp);
    }

    // Also update any snapshots of employee names in previous tasks for data consistency!
    const updatedTasks = tasks.map(task => {
      if (task.employeeId === id) {
        return { ...task, employeeName: name };
      }
      return task;
    });

    for (const t of updatedTasks) {
      if (t.employeeId === id) {
        await saveTask(t);
      }
    }

    await updateLeaderboardRankings(updatedEmployees, updatedTasks, manualPoints);
  };

  const handleDeleteEmployee = async (id: string) => {
    if (userRole !== 'owner') return;
    await deleteEmployee(id);
    const updatedEmployees = employees.filter(emp => emp.id !== id);
    await updateLeaderboardRankings(updatedEmployees, tasks, manualPoints);
  };

  // 2. Task Actions
  const handleStartTask = async (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string,
    parentTaskId?: string
  ) => {
    const checkResult = canAssignTaskToTechnician(employeeId, employees);
    if (!checkResult.allowed) {
      const msg = checkResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني.';
      alert(msg);
      throw new Error(msg);
    }

    const employeeName = employees.find(e => e.id === employeeId)?.name || 'موظف مجهول';
    const matchedType = taskTypes.find(t => t.name === taskType || t.id === taskType);
    const initialPoints = matchedType ? matchedType.points : (TASK_POINTS[taskType as TaskType] ?? 10);

    const parentTask = parentTaskId ? tasks.find(t => t.id === parentTaskId) : undefined;
    const finalNotes = notes || (parentTask ? parentTask.notes : undefined);
    const finalSubName = subscriberName || (parentTask ? parentTask.subscriberName : undefined);
    const finalSubPhone = subscriberPhone || (parentTask ? parentTask.subscriberPhone : undefined);

    const nowIso = new Date().toISOString();
    const newTask: Task = {
      id: `task-${Date.now()}`,
      employeeId,
      employeeName,
      taskType,
      startTime,
      sentAt: nowIso,
      status: 'pending',
      points: initialPoints,
      notes: finalNotes,
      subscriberName: finalSubName,
      subscriberPhone: finalSubPhone,
      assignedDate: assignedDate || startTime,
      parentTaskId
    };
    await saveTask(newTask);
    await updateLeaderboardRankings(employees, [newTask, ...tasks], manualPoints);

    // Send OneSignal Push Notification to Technician
    sendOneSignalToEmployee(
      employeeId,
      '📋 مهمة جديدة مسندة إليك',
      `نوع المهمة: ${taskType}${finalSubName ? ` | المشترك: ${finalSubName}` : ''}`,
      'new_task'
    ).catch(err => console.warn('OneSignal start task push warning:', err));
  };

  const handleAcceptTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Ensure technician can only have one active task at a time
    const hasRunningOther = tasks.some(t => t.employeeId === task.employeeId && t.id !== task.id && t.status === 'active');
    if (hasRunningOther) {
      const activeTask = tasks.find(t => t.employeeId === task.employeeId && t.id !== task.id && t.status === 'active');
      const activeTaskName = activeTask?.taskType || 'مهمة أخرى';
      alert(`عذراً، لديك مهمة جارية حالياً (${activeTaskName})!\nيمكنك بدء هذه المهمة فقط بعد إكمال المهمة الحالية أو إيقافها مؤقتاً.`);
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      status: 'active',
      startTime: nowIso,
      acceptedAt: nowIso
    };

    await saveTask(updatedTask);
    const updatedTasks = tasks.map(t => t.id === id ? updatedTask : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    // Send OneSignal Push Notification to Admins / Managers
    sendOneSignalToAdmins(
      '🟢 تم قبول المهمة',
      `قام الفني ${task.employeeName} ببدء/قبول مهمة (${task.taskType})${task.subscriberName ? ` للمشترك ${task.subscriberName}` : ''}`,
      'accepted'
    ).catch(err => console.warn('OneSignal accept task push warning:', err));
  };

  const handleRejectTask = async (id: string, reason: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const existingLogs = task.editLogs || [];
    const rejectionLog = {
      id: `log-${Date.now()}`,
      editedBy: task.employeeName,
      editedAt: nowIso,
      changes: `اعتذر/رفض الفني (${task.employeeName}) عن المهمة. السبب: ${reason}`,
      reason: reason
    };

    const updatedTask: Task = {
      ...task,
      status: 'rejected',
      rejectedAt: nowIso,
      rejectionReason: reason,
      rejectedByTechName: task.employeeName,
      points: 0,
      pointsDeducted: 0,
      deductionReason: undefined,
      editLogs: [...existingLogs, rejectionLog]
    };

    await saveTask(updatedTask);
    const updatedTasks = tasks.map(t => t.id === id ? updatedTask : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    // Send OneSignal Push Notification to Admins / Managers
    sendOneSignalToAdmins(
      '🔴 اعتذار/رفض مهمة',
      `اعتذر الفني ${task.employeeName} عن مهمة (${task.taskType})${task.subscriberName ? ` للمشترك ${task.subscriberName}` : ''}. السبب: ${reason}`,
      'rejected'
    ).catch(err => console.warn('OneSignal reject task push warning:', err));
  };

  const handleCompleteTask = async (id: string, endTime: string, delayReason?: string, operationDetails?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const now = new Date(endTime).getTime();
    const start = new Date(task.startTime).getTime();
    
    // Calculate total pause time up to now
    const currentPauseMs = (task.status === 'paused' && task.pausedAt)
      ? (now - new Date(task.pausedAt).getTime())
      : 0;
    const totalPauseTimeMs = (task.totalPausedMs || 0) + currentPauseMs;
    
    const durationMs = (now - start) - totalPauseTimeMs;
    const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
    const limitMinutes = getTaskTimeLimitMinutes(task.taskType, taskTypes);
    const isOverdue = durationMinutes > limitMinutes;
    const finalDelayReason = delayReason || task.delayReason;

    // Calculate points (waived if task.delayApproved is true)
    const calculatedPoints = calculateTaskPoints(
      task.taskType, 
      durationMinutes, 
      taskTypes, 
      pointsRules, 
      task.delayApproved || false
    );

    // Find all supporter tasks associated with this parent task
    const supporterTasks = tasks.filter(t => t.parentTaskId === id);
    const completedSupporterTasks: Task[] = [];
    
    for (const sup of supporterTasks) {
      if (sup.status === 'active' || sup.status === 'paused') {
        const supStart = new Date(sup.startTime).getTime();
        const supNow = new Date(endTime).getTime();
        const supCurrentPauseMs = (sup.status === 'paused' && sup.pausedAt)
          ? (supNow - new Date(sup.pausedAt).getTime())
          : 0;
        const supTotalPauseMs = (sup.totalPausedMs || 0) + supCurrentPauseMs;

        const completedSup: Task = {
          ...sup,
          endTime,
          status: 'completed' as const,
          points: 0, // will be split below
          totalPausedMs: supTotalPauseMs,
          pausedAt: undefined,
          operationDetails: operationDetails || sup.operationDetails
        };
        completedSupporterTasks.push(completedSup);
      } else {
        completedSupporterTasks.push(sup);
      }
    }

    // Now calculate split points
    const totalParticipants = 1 + completedSupporterTasks.length;
    const basePoints = taskTypes?.find(t => t.name === task.taskType || t.id === task.taskType)?.points ?? (task.taskType === 'تنصيب' ? 20 : task.taskType === 'صيانة' ? 18 : 10);
    const rawDeduction = task.delayApproved ? 0 : (basePoints - calculatedPoints);
    const finalNetPoints = calculatedPoints - (task.pointsDeducted || 0);
    const splitPoints = Math.round((finalNetPoints / totalParticipants) * 100) / 100;

    const finalOperationDetails = operationDetails || task.operationDetails;
    let updatedNotes = task.notes;
    if (operationDetails && (!task.notes || !task.notes.includes(operationDetails))) {
      updatedNotes = task.notes ? `${task.notes}\n[معلومات العملية]: ${operationDetails}` : `معلومات العملية: ${operationDetails}`;
    }

    const completedTask: Task = {
      ...task,
      endTime,
      status: 'completed' as const,
      points: splitPoints,
      originalPoints: calculatedPoints,
      pointsDeducted: task.delayApproved ? 0 : rawDeduction,
      deductionReason: task.delayApproved ? 'تم إلغاء الخصم لقبول سبب التأخير' : (rawDeduction > 0 ? `خصم تأخير (${durationMinutes - limitMinutes} دقيقة)` : undefined),
      totalPausedMs: totalPauseTimeMs,
      pausedAt: undefined,
      delayReason: finalDelayReason,
      delaySubmittedAt: isOverdue && finalDelayReason ? new Date().toISOString() : task.delaySubmittedAt,
      delayStatus: (isOverdue && finalDelayReason && !task.delayApproved) ? 'pending' : task.delayStatus,
      delayApproved: task.delayApproved || false,
      operationDetails: finalOperationDetails,
      notes: updatedNotes
    };

    await saveTask(completedTask);

    const finalizedSupporters: Task[] = [];
    for (const sup of completedSupporterTasks) {
      const finalizedSup: Task = {
        ...sup,
        points: splitPoints,
        originalPoints: calculatedPoints
      };
      await saveTask(finalizedSup);
      finalizedSupporters.push(finalizedSup);
    }
    
    const completedTaskMap = new Map(finalizedSupporters.map(t => [t.id, t]));
    completedTaskMap.set(completedTask.id, completedTask);

    const updatedTasks = tasks.map(t => completedTaskMap.has(t.id) ? completedTaskMap.get(t.id)! : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    // Send OneSignal Push Notification
    if (isOverdue && finalDelayReason) {
      sendOneSignalToAdmins(
        '⚠️ سبب تأخير لمهمة ' + task.taskType,
        `تجاوز الفني ${task.employeeName} الوقت المحدد لمهمة (${task.taskType}) بواقع ${durationMinutes - limitMinutes} دقيقة. سبب التأخير: ${finalDelayReason}`,
        'new_task'
      ).catch(err => console.warn('OneSignal delay notice warning:', err));
    } else {
      sendOneSignalToAdmins(
        '🔵 إنجاز مهمة بنجاح',
        `أنجز الفني ${task.employeeName} مهمة (${task.taskType}) بنجاح${task.subscriberName ? ` للمشترك ${task.subscriberName}` : ''}`,
        'completed'
      ).catch(err => console.warn('OneSignal complete task push warning:', err));
    }
  };

  const handleRequestReopenTask = async (id: string, reason: string, newTaskType?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const selectedNewType = newTaskType || task.taskType;
    const updatedTask: Task = {
      ...task,
      reopenRequested: true,
      reopenRequestedAt: nowIso,
      reopenRequestReason: reason,
      reopenRequestTaskType: selectedNewType,
      reopenRequestStatus: 'pending'
    };

    await saveTask(updatedTask);

    sendOneSignalToAdmins(
      '🔄 طلب إعادة إرسال مهمة',
      `طلب الفني ${task.employeeName} إعادة إرسال مهمة (${selectedNewType})${task.subscriberName ? ` للمشترك ${task.subscriberName}` : ''}. السبب: ${reason}`,
      'new_task'
    ).catch(err => console.warn('OneSignal reopen request push warning:', err));
  };

  const handleApproveReopenTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const existingLogs = task.editLogs || [];
    const newTaskType = task.reopenRequestTaskType || task.taskType;
    const matchedType = taskTypes.find(t => t.name === newTaskType || t.id === newTaskType);
    const defaultPoints = matchedType ? matchedType.points : (TASK_POINTS[newTaskType as TaskType] || 10);

    const approveLog = {
      id: `log-${Date.now()}`,
      editedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
      editedAt: nowIso,
      changes: `تمت الموافقة على طلب إعادة إرسال مهمة جديدة (${newTaskType}) للمشترك (${task.subscriberName || 'المشترك'}) بطلب الفني (${task.employeeName}).`,
      reason: 'الموافقة على إعادة إرسال المهمة'
    };

    // 1. Keep original completed task completed
    const updatedOriginalTask: Task = {
      ...task,
      reopenRequested: false,
      reopenRequestStatus: 'approved',
      editLogs: [...existingLogs, approveLog]
    };

    // 2. Create second task for subscriber as a completely independent new task
    const newSecondTask: Task = {
      id: `task-${Date.now()}`,
      employeeId: task.employeeId,
      employeeName: task.employeeName,
      taskType: newTaskType,
      startTime: nowIso,
      sentAt: nowIso,
      status: 'pending',
      points: defaultPoints,
      notes: task.reopenRequestReason || `مهمة جديدة للمشترك (${newTaskType})`,
      subscriberName: task.subscriberName,
      subscriberPhone: task.subscriberPhone,
      assignedDate: nowIso.split('T')[0],
      editLogs: [
        {
          id: `log-${Date.now() + 1}`,
          editedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
          editedAt: nowIso,
          changes: `تمت إضافتها كمهمة جديدة مستقلة (${newTaskType}) للمشترك بطلب الفني (${task.employeeName}).`,
          reason: 'إعادة إرسال المهمة'
        }
      ]
    };

    await saveTask(updatedOriginalTask);
    await saveTask(newSecondTask);

    const updatedTasks = tasks.map(t => t.id === id ? updatedOriginalTask : t).concat(newSecondTask);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    sendOneSignalToAdmins(
      '✅ تمت إضافة مهمة ثانية للمشترك',
      `تمت الموافقة على طلب الفني ${task.employeeName} وتمت إضافة المهمة (${task.taskType}) كمهمة ثانية للمشترك (${task.subscriberName || 'المشترك'}).`,
      'accepted'
    ).catch(err => console.warn('OneSignal reopen approve push warning:', err));
  };

  const handleRejectReopenTask = async (id: string, reason?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const existingLogs = task.editLogs || [];
    const rejectLog = {
      id: `log-${Date.now()}`,
      editedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
      editedAt: nowIso,
      changes: `تم رفض طلب الفني (${task.employeeName}) لإعادة إرسال المهمة. ${reason ? `السبب: ${reason}` : ''}`,
      reason: reason || 'رفض طلب إعادة الإرسال'
    };

    const updatedTask: Task = {
      ...task,
      reopenRequested: false,
      reopenRequestStatus: 'rejected',
      editLogs: [...existingLogs, rejectLog]
    };

    await saveTask(updatedTask);

    sendOneSignalToAdmins(
      '❌ تم رفض طلب إعادة المهمة',
      `تم رفض طلب الفني ${task.employeeName} لإعادة المهمة (${task.taskType}).`,
      'rejected'
    ).catch(err => console.warn('OneSignal reopen reject push warning:', err));
  };

  const handleApproveDelayReason = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const durationMs = (task.endTime && task.startTime) 
      ? (new Date(task.endTime).getTime() - new Date(task.startTime).getTime() - (task.totalPausedMs || 0))
      : 0;
    const durationMinutes = Math.max(0, Math.round(durationMs / 60000));

    // Full points without delay deduction
    const fullPoints = calculateTaskPoints(task.taskType, durationMinutes, taskTypes, pointsRules, true);

    const updatedTask: Task = {
      ...task,
      points: fullPoints,
      pointsDeducted: 0,
      deductionReason: 'تم إلغاء الخصم لقبول سبب التأخير من المشرف',
      delayApproved: true,
      delayStatus: 'approved',
      delayApprovedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
      delayApprovedAt: nowIso,
      editLogs: [
        ...(task.editLogs || []),
        {
          id: `log-${Date.now()}`,
          editedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
          editedAt: nowIso,
          changes: `تمت الموافقة على سبب التأخير (${task.delayReason || ''}) وإلغاء خصم النقاط. النقاط المستحقة: ${fullPoints}.`,
          reason: 'قبول سبب التأخير'
        }
      ]
    };

    await saveTask(updatedTask);
    const updatedTasks = tasks.map(t => t.id === id ? updatedTask : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    sendOneSignalToAdmins(
      '✅ تمت الموافقة على سبب التأخير',
      `تمت الموافقة على سبب تأخير الفني ${task.employeeName} لمهمة (${task.taskType}) وتم إلغاء الخصم.`,
      'accepted'
    ).catch(err => console.warn('OneSignal approve delay push warning:', err));
  };

  const handleRejectDelayReason = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const updatedTask: Task = {
      ...task,
      delayApproved: false,
      delayStatus: 'rejected',
      delayApprovedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
      delayApprovedAt: nowIso,
      editLogs: [
        ...(task.editLogs || []),
        {
          id: `log-${Date.now()}`,
          editedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
          editedAt: nowIso,
          changes: `تم رفض سبب التأخير (${task.delayReason || ''}). إبقاء خصم التأخير.`,
          reason: 'رفض سبب التأخير'
        }
      ]
    };

    await saveTask(updatedTask);
    const updatedTasks = tasks.map(t => t.id === id ? updatedTask : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    sendOneSignalToAdmins(
      '❌ تم رفض سبب التأخير',
      `تم رفض سبب تأخير الفني ${task.employeeName} لمهمة (${task.taskType}).`,
      'rejected'
    ).catch(err => console.warn('OneSignal reject delay push warning:', err));
  };

  const handlePauseTask = async (id: string, reason: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (userRole === 'technician') {
      // Technicians submit a pause request that requires supervisor or owner approval
      const pauseReqTask: Task = {
        ...task,
        pauseRequested: true,
        pauseRequestedAt: new Date().toISOString(),
        pauseRequestReason: reason || 'بدون سبب محدد',
        pauseRequestStatus: 'pending',
      };
      await saveTask(pauseReqTask);

      sendOneSignalToAdmins(
        '⏸️ طلب إيقاف مهمة مؤقتاً',
        `طلب الفني ${task.employeeName || 'الفني'} إيقاف المهمة (${task.taskType}) مؤقتاً.\nالسبب: ${reason || 'غير محدد'}`,
        'new_task'
      ).catch(err => console.warn('OneSignal pause request push warning:', err));

      alert('تم إرسال طلب إيقاف المهمة مؤقتاً إلى المشرف والمالك بنجاح. بانتظار الاعتماد.');
      return;
    }

    // Direct pause for supervisors/owners
    const nowIso = new Date().toISOString();
    const pausedTask: Task = {
      ...task,
      status: 'paused' as const,
      pausedAt: nowIso,
      pauseReason: reason,
      pauseRequested: true,
      pauseRequestStatus: 'approved',
      pauseApprovedBy: userRole === 'owner' ? 'المالك' : 'المشرف',
      pauseApprovedAt: nowIso
    };

    await saveTask(pausedTask);

    // Also pause any active supporters for this parent task
    const activeSupporters = tasks.filter(t => t.parentTaskId === id && t.status === 'active');
    const updatedSupporterTasks: Task[] = [];
    for (const sup of activeSupporters) {
      const pausedSup: Task = {
        ...sup,
        status: 'paused' as const,
        pausedAt: nowIso,
        pauseReason: `توقف مع المهمة الأصلية: ${reason}`
      };
      await saveTask(pausedSup);
      updatedSupporterTasks.push(pausedSup);
    }
    
    const supMap = new Map(updatedSupporterTasks.map(t => [t.id, t]));
    supMap.set(pausedTask.id, pausedTask);

    const updatedTasks = tasks.map(t => supMap.has(t.id) ? supMap.get(t.id)! : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
  };

  const handleApprovePauseTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const approverName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير' : 'المشرف';

    const pausedTask: Task = {
      ...task,
      status: 'paused' as const,
      pausedAt: nowIso,
      pauseReason: task.pauseRequestReason || 'تمت الموافقة على الإيقاف المؤقت',
      pauseRequested: true,
      pauseRequestStatus: 'approved',
      pauseApprovedBy: approverName,
      pauseApprovedAt: nowIso,
    };

    await saveTask(pausedTask);

    // Also pause any active supporters for this parent task
    const activeSupporters = tasks.filter(t => t.parentTaskId === id && t.status === 'active');
    for (const sup of activeSupporters) {
      const pausedSup: Task = {
        ...sup,
        status: 'paused' as const,
        pausedAt: nowIso,
        pauseReason: `توقف مع المهمة الأصلية بناءً على موافقة الإدارة: ${task.pauseRequestReason || ''}`
      };
      await saveTask(pausedSup);
    }

    sendOneSignalToAdmins(
      '✅ تمت الموافقة على إيقاف المهمة مؤقتاً',
      `تمت الموافقة على إيقاف المهمة (${task.taskType}) مؤقتاً للفني ${task.employeeName}.`,
      'accepted'
    ).catch(err => console.warn('OneSignal approve pause push warning:', err));
  };

  const handleRejectPauseTask = async (id: string, reason?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const rejectorName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير' : 'المشرف';

    const rejectedPauseTask: Task = {
      ...task,
      pauseRequested: true,
      pauseRequestStatus: 'rejected',
      pauseRejectedBy: rejectorName,
      pauseRejectedAt: new Date().toISOString(),
      pauseRejectionReason: reason || 'مرفوض من الإدارة',
    };

    await saveTask(rejectedPauseTask);

    sendOneSignalToAdmins(
      '❌ تم رفض طلب الإيقاف المؤقت',
      `تم رفض طلب إيقاف المهمة (${task.taskType}) للفني ${task.employeeName}.\nالسبب: ${reason || 'يرجى متابعة العمل'}`,
      'rejected'
    ).catch(err => console.warn('OneSignal reject pause push warning:', err));
  };

  const handlePostponeTask = async (id: string, reason: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const nowIso = new Date().toISOString();
    const techName = task.employeeName || 'الفني';
    const existingLogs = task.editLogs || [];
    const postponeLog = {
      id: `log-${Date.now()}`,
      editedBy: techName,
      editedAt: nowIso,
      changes: `تم تحديد المهمة كمؤجلة بواسطة (${techName}). السبب: ${reason}`,
      reason: reason
    };

    // Calculate elapsed active work time up to now if it was active
    const start = new Date(task.startTime).getTime();
    const now = new Date(nowIso).getTime();
    const totalPaused = task.totalPausedMs || 0;
    const currentPause = (task.status === 'paused' && task.pausedAt) ? (now - new Date(task.pausedAt).getTime()) : 0;
    const activeWorkTimeMs = Math.max(0, now - start - totalPaused - currentPause);

    const postponedTask: Task = {
      ...task,
      status: 'postponed' as const,
      postponedAt: nowIso,
      postponeReason: reason,
      postponedByTechName: techName,
      pausedAt: undefined,
      isPaused: false,
      totalPausedMs: totalPaused + currentPause,
      editLogs: [...existingLogs, postponeLog]
    };

    await saveTask(postponedTask);

    // Also postpone any supporter tasks
    const activeSupporters = tasks.filter(t => t.parentTaskId === id && (t.status === 'active' || t.status === 'paused'));
    for (const sup of activeSupporters) {
      const postponedSup: Task = {
        ...sup,
        status: 'postponed' as const,
        postponedAt: nowIso,
        postponeReason: `تأجيل تزامناً مع المهمة الرئيسية: ${reason}`,
        postponedByTechName: techName,
        pausedAt: undefined,
        isPaused: false
      };
      await saveTask(postponedSup);
    }

    const updatedTasks = tasks.map(t => t.id === id ? postponedTask : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);

    sendOneSignalToAdmins(
      '⏳ مهمة مؤجلة',
      `قام الفني ${techName} بتأجيل المهمة (${task.taskType})${task.subscriberName ? ` للمشترك ${task.subscriberName}` : ''}. السبب: ${reason}`,
      'new_task'
    ).catch(err => console.warn('OneSignal postpone task push warning:', err));
  };

  const handleResumeTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // Check if the employee has another running task (status === 'active')
    const hasRunningOther = tasks.some(t => t.employeeId === task.employeeId && t.id !== task.id && t.status === 'active');
    if (hasRunningOther) {
      alert("لا يمكن استئناف هذه المهمة لأن لديك مهمة جارية حالياً.\nقم بإيقاف المهمة الحالية أو إنهائها أولاً.");
      return;
    }

    const now = new Date().getTime();
    const pausedAtTime = task.pausedAt ? new Date(task.pausedAt).getTime() : now;
    const diffMs = now - pausedAtTime;
    const newTotalPausedMs = (task.totalPausedMs || 0) + diffMs;

    const activeTask: Task = {
      ...task,
      status: 'active' as const,
      pausedAt: undefined,
      totalPausedMs: newTotalPausedMs
    };

    await saveTask(activeTask);

    // Also resume any paused supporters for this parent task
    const pausedSupporters = tasks.filter(t => t.parentTaskId === id && t.status === 'paused');
    const updatedSupporterTasks: Task[] = [];
    for (const sup of pausedSupporters) {
      // Check if this supporter has another running task
      const hasRunningOtherSup = tasks.some(t => t.employeeId === sup.employeeId && t.id !== sup.id && t.status === 'active');
      if (hasRunningOtherSup) {
        continue;
      }

      const supPausedAtTime = sup.pausedAt ? new Date(sup.pausedAt).getTime() : now;
      const supDiffMs = now - supPausedAtTime;
      const supNewTotalPausedMs = (sup.totalPausedMs || 0) + supDiffMs;
      
      const activeSup: Task = {
        ...sup,
        status: 'active' as const,
        pausedAt: undefined,
        totalPausedMs: supNewTotalPausedMs
      };
      await saveTask(activeSup);
      updatedSupporterTasks.push(activeSup);
    }
    
    const supMap = new Map(updatedSupporterTasks.map(t => [t.id, t]));
    supMap.set(activeTask.id, activeTask);

    const updatedTasks = tasks.map(t => supMap.has(t.id) ? supMap.get(t.id)! : t);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
  };

  const handleCancelActiveTask = async (id: string) => {
    // Also delete any supporter tasks for this parent task
    const supporterTasks = tasks.filter(t => t.parentTaskId === id);
    for (const sup of supporterTasks) {
      await deleteTask(sup.id);
    }

    await deleteTask(id);
    const updatedTasks = tasks.filter(t => t.id !== id && t.parentTaskId !== id);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
  };

  const handleRegisterCompletedTask = async (
    employeeId: string,
    taskType: string,
    startTime: string,
    endTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => {
    const checkResult = canAssignTaskToTechnician(employeeId, employees);
    if (!checkResult.allowed) {
      const msg = checkResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني.';
      alert(msg);
      throw new Error(msg);
    }

    const employeeName = employees.find(e => e.id === employeeId)?.name || 'موظف مجهول';
    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
    const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
    const calculatedPoints = calculateTaskPoints(taskType, durationMinutes, taskTypes, pointsRules);

    const newTask: Task = {
      id: `task-${Date.now()}`,
      employeeId,
      employeeName,
      taskType,
      startTime,
      sentAt: startTime,
      endTime,
      status: 'completed',
      points: calculatedPoints,
      notes,
      subscriberName,
      subscriberPhone,
      assignedDate: assignedDate || startTime
    };

    await saveTask(newTask);
    await updateLeaderboardRankings(employees, [newTask, ...tasks], manualPoints);

    // Send OneSignal Push Notification to Technician
    sendOneSignalToEmployee(
      employeeId,
      '🔵 تسجيل مهمة مكتملة',
      `تم تسجيل مهمة (${taskType}) مكتملة لك${subscriberName ? ` للمشترك ${subscriberName}` : ''}`,
      'completed'
    ).catch(err => console.warn('OneSignal register task push warning:', err));
  };

  const handleDeleteTaskHistory = async (id: string) => {
    // Delete any supporter tasks linked to this parent task
    const supporterTasks = tasks.filter(t => t.parentTaskId === id);
    for (const sup of supporterTasks) {
      await deleteTask(sup.id);
    }

    await deleteTask(id);
    const updatedTasks = tasks.filter(t => t.id !== id && t.parentTaskId !== id);
    await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
  };

  const handleEditTaskHistory = async (updatedTask: Task) => {
    // Check if this is a main task (has supporters)
    const supporters = tasks.filter(t => t.parentTaskId === updatedTask.id && t.status === 'completed');
    if (supporters.length > 0) {
      const totalParticipants = 1 + supporters.length;
      const originalPoints = updatedTask.points; // Since edit modal loaded originalPoints as points, updatedTask.points has the edited total points before split
      const finalNetPoints = Math.max(0, originalPoints - (updatedTask.pointsDeducted || 0));
      const splitPoints = Math.round((finalNetPoints / totalParticipants) * 100) / 100;
      
      const finalizedMainTask: Task = {
        ...updatedTask,
        points: splitPoints,
        originalPoints: originalPoints
      };
      
      await saveTask(finalizedMainTask);
      
      const updatedSupporters: Task[] = [];
      for (const sup of supporters) {
        const updatedSup: Task = {
          ...sup,
          points: splitPoints,
          originalPoints: originalPoints,
          subscriberName: updatedTask.subscriberName,
          subscriberPhone: updatedTask.subscriberPhone,
          notes: updatedTask.notes,
          assignedDate: updatedTask.assignedDate,
          endTime: updatedTask.endTime
        };
        await saveTask(updatedSup);
        updatedSupporters.push(updatedSup);
      }
      
      const taskMap = new Map(updatedSupporters.map(t => [t.id, t]));
      taskMap.set(finalizedMainTask.id, finalizedMainTask);
      
      const updatedTasks = tasks.map(t => taskMap.has(t.id) ? taskMap.get(t.id)! : t);
      await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
    } 
    // If this is a supporter task itself
    else if (updatedTask.parentTaskId) {
      const parentTask = tasks.find(t => t.id === updatedTask.parentTaskId);
      if (parentTask) {
        const allSupporters = tasks.filter(t => t.parentTaskId === parentTask.id && t.id !== updatedTask.id && t.status === 'completed');
        const totalParticipants = 1 + allSupporters.length + 1; // parent + other supporters + this supporter
        
        const originalPoints = updatedTask.originalPoints ?? parentTask.originalPoints ?? parentTask.points;
        const finalNetPoints = Math.max(0, originalPoints - (parentTask.pointsDeducted || 0));
        const splitPoints = Math.round((finalNetPoints / totalParticipants) * 100) / 100;
        
        const finalizedUpdatedTask: Task = {
          ...updatedTask,
          points: splitPoints,
          originalPoints: originalPoints
        };
        await saveTask(finalizedUpdatedTask);
        
        const finalizedParent: Task = {
          ...parentTask,
          points: splitPoints,
          originalPoints: originalPoints
        };
        await saveTask(finalizedParent);
        
        const updatedOtherSupporters: Task[] = [];
        for (const sup of allSupporters) {
          const updatedSup: Task = {
            ...sup,
            points: splitPoints,
            originalPoints: originalPoints,
            subscriberName: parentTask.subscriberName,
            subscriberPhone: parentTask.subscriberPhone,
            notes: parentTask.notes,
            assignedDate: parentTask.assignedDate,
            endTime: parentTask.endTime
          };
          await saveTask(updatedSup);
          updatedOtherSupporters.push(updatedSup);
        }
        
        const taskMap = new Map(updatedOtherSupporters.map(t => [t.id, t]));
        taskMap.set(finalizedUpdatedTask.id, finalizedUpdatedTask);
        taskMap.set(finalizedParent.id, finalizedParent);
        
        const updatedTasks = tasks.map(t => taskMap.has(t.id) ? taskMap.get(t.id)! : t);
        await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
      } else {
        await saveTask(updatedTask);
        const updatedTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
        await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
      }
    } else {
      // Normal task without supporters
      await saveTask(updatedTask);
      const exists = tasks.some(t => t.id === updatedTask.id);
      const updatedTasks = exists 
        ? tasks.map(t => t.id === updatedTask.id ? updatedTask : t)
        : [updatedTask, ...tasks];
      await updateLeaderboardRankings(employees, updatedTasks, manualPoints);
    }
  };

  const handleEditSubscriber = async (oldTasks: Task[], newName: string, newPhone: string) => {
    const cleanName = newName.trim();
    const cleanPhone = newPhone.trim();
    for (const task of oldTasks) {
      const updatedTask: Task = {
        ...task,
        subscriberName: cleanName,
        subscriberPhone: cleanPhone
      };
      await saveTask(updatedTask);
    }
  };

  const handleDeleteSubscriber = async (tasksToDelete: Task[]) => {
    for (const task of tasksToDelete) {
      await deleteTask(task.id);
    }
  };

  // --- DERIVED STATISTICS ---

  const activeTasks = useMemo(() => {
    return tasks.filter(t => t.status === 'active' || t.status === 'paused' || t.status === 'pending');
  }, [tasks]);

  const completedTasksToday = useMemo(() => {
    return tasks.filter(t => t.status === 'completed' && isToday(t.endTime || t.startTime));
  }, [tasks]);

  const manualPointsToday = useMemo(() => {
    return manualPoints.filter(mp => isToday(mp.timestamp));
  }, [manualPoints]);

  const pointsToday = useMemo(() => {
    const taskPointsSum = completedTasksToday.reduce((sum, task) => sum + task.points, 0);
    const manualPointsSum = manualPointsToday.reduce((sum, mp) => {
      const diff = mp.type === 'gift' ? mp.points : -mp.points;
      return sum + diff;
    }, 0);
    return taskPointsSum + manualPointsSum;
  }, [completedTasksToday, manualPointsToday]);

  const totalPoints = useMemo(() => {
    const taskPoints = tasks.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.points || 0), 0);
    const manualPointsSum = manualPoints.reduce((sum, mp) => {
      const diff = mp.type === 'gift' ? mp.points : -mp.points;
      return sum + diff;
    }, 0);
    return Math.max(0, taskPoints + manualPointsSum);
  }, [tasks, manualPoints]);

  // Employee of the Day Calculation (incorporates tasks and manual points today)
  const employeeOfTheDayName = useMemo(() => {
    if (completedTasksToday.length === 0 && manualPointsToday.length === 0) return '';
    
    // Aggregate points today by employee
    const scoresToday: Record<string, { name: string; points: number }> = {};
    completedTasksToday.forEach(task => {
      if (!scoresToday[task.employeeId]) {
        scoresToday[task.employeeId] = { name: task.employeeName, points: 0 };
      }
      scoresToday[task.employeeId].points += task.points;
    });

    manualPointsToday.forEach(mp => {
      if (!scoresToday[mp.employeeId]) {
        scoresToday[mp.employeeId] = { name: mp.employeeName, points: 0 };
      }
      const diff = mp.type === 'gift' ? mp.points : -mp.points;
      scoresToday[mp.employeeId].points += diff;
    });

    let bestName = '';
    let maxPoints = 0;

    Object.values(scoresToday).forEach(score => {
      if (score.points > maxPoints) {
        maxPoints = score.points;
        bestName = score.name;
      }
    });

    return maxPoints > 0 ? bestName : '';
  }, [completedTasksToday, manualPointsToday]);

  // State for the viewer selected employee
  const [viewerEmployeeId, setViewerEmployeeId] = useState<string>(() => {
    return safeGetLocalStorage('futurex_viewer_selected_employee_id') || 
           safeGetLocalStorage('futurex_logged_in_employee_id') || 
           (employees[0]?.id || '');
  });

  const handleSelectViewerEmployee = (id: string) => {
    setViewerEmployeeId(id);
    safeSetLocalStorage('futurex_viewer_selected_employee_id', id);
  };

  useEffect(() => {
    if (!viewerEmployeeId && employees.length > 0) {
      const firstId = employees[0].id;
      setViewerEmployeeId(firstId);
      safeSetLocalStorage('futurex_viewer_selected_employee_id', firstId);
    }
  }, [employees, viewerEmployeeId]);

  // Main navigation items, conditionally visible according to strict user roles
  const navItems = useMemo(() => {
    if (userRole === 'technician') {
      return [
        { id: 'tasks' as const, label: 'المهام', icon: Clock },
        { id: 'points' as const, label: 'النقاط', icon: Award },
      ];
    }
    if (userRole === 'supervisor') {
      return [
        { id: 'dashboard' as const, label: 'الرئيسية', icon: LayoutDashboard },
        { id: 'task_management' as const, label: 'إدارة المهام', icon: ClipboardList },
        { id: 'reports' as const, label: 'التقارير', icon: FileText },
        { id: 'settings' as const, label: 'الإعدادات', icon: Settings },
        { id: 'about' as const, label: 'عن النظام', icon: Info },
      ];
    }
    // Owner & Manager & others
    return [
      { id: 'dashboard' as const, label: 'الرئيسية', icon: LayoutDashboard },
      { id: 'task_management' as const, label: 'إدارة المهام', icon: ClipboardList },
      { id: 'employees' as const, label: 'الموظفين', icon: Users },
      { id: 'reports' as const, label: 'التقارير', icon: FileText },
      { id: 'settings' as const, label: 'الإعدادات', icon: Settings },
      { id: 'about' as const, label: 'عن النظام', icon: Info },
    ];
  }, [userRole]);

  // Ensure unauthorized roles cannot access restricted tabs
  useEffect(() => {
    if (userRole === 'technician' && activeTab !== 'tasks' && activeTab !== 'points' && activeTab !== 'about' && activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    }
  }, [userRole, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg text-center max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto animate-spin">
            <Clock className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-slate-800 text-lg">جاري الاتصال بقاعدة البيانات...</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            يتم الاتصال بقاعدة بيانات Firebase المباشرة لضمان مزامنة البيانات والمهام في الوقت الفعلي.
          </p>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans" dir="rtl">
        <div className="bg-white p-8 rounded-3xl border border-red-100 shadow-lg text-center max-w-sm w-full space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <Info className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-slate-800 text-lg">حدث خطأ في الاتصال!</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {dbError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-20 md:pb-6">
      <VersionUpdateBanner />
      <InAppToastsContainer />
      {/* Dynamic Header */}
      <Header
        employeeCount={employees.length}
        activeTasksCount={activeTasks.length}
        userRole={userRole}
        employees={employees}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Navigation Tabs (Desktop only) */}
        <div className="hidden md:flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm max-w-2xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Switchboard content */}
        <div className="space-y-6">
          {(activeTab === 'tasks' || activeTab === 'dashboard') && userRole === 'technician' && (
            <TechnicianDashboard
              employee={employees.find(emp => emp.id === (safeGetLocalStorage('futurex_logged_in_employee_id') || ''))}
              tasks={tasks}
              manualPoints={manualPoints}
              allEmployees={employees}
              taskTypes={taskTypes}
              onAcceptTask={handleAcceptTask}
              onRejectTask={handleRejectTask}
              onCompleteTask={handleCompleteTask}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onRequestReopenTask={handleRequestReopenTask}
              onPostponeTask={handlePostponeTask}
            />
          )}

          {activeTab === 'points' && userRole === 'technician' && (
            <TechnicianPointsView
              employee={employees.find(emp => emp.id === (safeGetLocalStorage('futurex_logged_in_employee_id') || ''))}
              tasks={tasks}
              manualPoints={manualPoints}
              allEmployees={employees}
              taskTypes={taskTypes}
            />
          )}

          {activeTab === 'dashboard' && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager') && (
            <OwnerDashboardView
              employees={employees}
              activeTasks={activeTasks}
              allTasks={tasks}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              userRole={userRole as any}
              manualPoints={manualPoints}
              onStartTask={handleStartTask}
              onCompleteTask={handleCompleteTask}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onCancelActiveTask={handleCancelActiveTask}
              onRegisterCompletedTask={handleRegisterCompletedTask}
              onEditActiveTask={handleEditTaskHistory}
              onExecuteManualPoints={handleExecuteManualPoints}
              onNavigateTab={(tab, employeeId) => handleNavigateTab(tab, employeeId)}
            />
          )}

          {activeTab === 'production_readiness' && userRole === 'owner' && (
            <ProductionReadiness
              employees={employees}
              tasks={tasks}
              userRole={userRole as any}
            />
          )}

          {activeTab === 'system_diagnostics' && userRole === 'owner' && (
            <SystemDiagnostics
              userRole={userRole as any}
              employees={employees}
              tasks={tasks}
            />
          )}

          {activeTab === 'task_management' && (userRole === 'owner' || userRole === 'manager' || userRole === 'supervisor') && (
            <TaskManagementCenter
              employees={employees}
              activeTasks={activeTasks}
              allTasks={tasks}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              userRole={userRole as any}
              initialEmployeeId={selectedEmployeeForTask}
              onStartTask={handleStartTask}
              onCompleteTask={handleCompleteTask}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onCancelActiveTask={handleCancelActiveTask}
              onRegisterCompletedTask={handleRegisterCompletedTask}
              onEditActiveTask={handleEditTaskHistory}
              onEditTaskHistory={handleEditTaskHistory}
              onDeleteTaskHistory={handleDeleteTaskHistory}
              onEditSubscriber={handleEditSubscriber}
              onDeleteSubscriber={handleDeleteSubscriber}
              onAcceptTask={handleAcceptTask}
              onRejectTask={handleRejectTask}
              onApproveReopenTask={handleApproveReopenTask}
              onRejectReopenTask={handleRejectReopenTask}
              onApproveDelayReason={handleApproveDelayReason}
              onRejectDelayReason={handleRejectDelayReason}
              onApprovePauseTask={handleApprovePauseTask}
              onRejectPauseTask={handleRejectPauseTask}
              onPostponeTask={handlePostponeTask}
            />
          )}



          {activeTab === 'active_tasks' && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager') && (
            <ActiveTasksView
              employees={employees}
              activeTasks={activeTasks}
              allTasks={tasks}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              onStartTask={handleStartTask}
              onCompleteTask={handleCompleteTask}
              onPauseTask={handlePauseTask}
              onResumeTask={handleResumeTask}
              onCancelActiveTask={handleCancelActiveTask}
              userRole={userRole}
              onEditActiveTask={handleEditTaskHistory}
              onAcceptTask={handleAcceptTask}
              onRejectTask={handleRejectTask}
              onApproveReopenTask={handleApproveReopenTask}
              onRejectReopenTask={handleRejectReopenTask}
              onApproveDelayReason={handleApproveDelayReason}
              onRejectDelayReason={handleRejectDelayReason}
              onApprovePauseTask={handleApprovePauseTask}
              onRejectPauseTask={handleRejectPauseTask}
            />
          )}

          {activeTab === 'all_tasks' && (
            <AllTasksView
              tasks={tasks}
              employees={employees}
              taskTypes={taskTypes}
              userRole={userRole}
              onStartTask={handleStartTask}
              onEditTaskHistory={handleEditTaskHistory}
              onDeleteTaskHistory={handleDeleteTaskHistory}
              onEditSubscriber={handleEditSubscriber}
              onDeleteSubscriber={handleDeleteSubscriber}
              onApproveReopenTask={handleApproveReopenTask}
              onRejectReopenTask={handleRejectReopenTask}
              onApproveDelayReason={handleApproveDelayReason}
              onRejectDelayReason={handleRejectDelayReason}
            />
          )}

          {activeTab === 'employees' && (userRole === 'owner' || userRole === 'manager') && (
            <EmployeeManager
              employees={employees}
              onAddEmployee={handleAddEmployee}
              onEditEmployee={handleEditEmployee}
              onDeleteEmployee={handleDeleteEmployee}
            />
          )}

          {activeTab === 'leaderboard' && (
            <LeaderboardTab
              employees={employees}
              tasks={tasks}
              manualPoints={manualPoints}
              userRole={userRole}
            />
          )}

          {activeTab === 'achievements' && userRole === 'technician' && (
            <ViewerTasksView
              employees={employees}
              activeTasks={activeTasks}
              tasks={tasks}
              manualPoints={manualPoints}
              selectedEmployeeId={safeGetLocalStorage('futurex_logged_in_employee_id') || ''}
              onSelectEmployee={() => {}}
              activeTab="achievements"
              userRole={userRole}
              onDeleteManualPoint={handleDeleteManualPoint}
              onEditManualPoint={handleEditManualPoint}
            />
          )}

          {activeTab === 'reports' && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager') && (
            <ReportsView
              tasks={tasks}
              onDeleteTaskHistory={handleDeleteTaskHistory}
              onEditTaskHistory={handleEditTaskHistory}
              userRole={userRole}
              employees={employees}
              manualPoints={manualPoints}
              onDeleteManualPoint={handleDeleteManualPoint}
              onEditManualPoint={handleEditManualPoint}
              onApproveDelayReason={handleApproveDelayReason}
              onRejectDelayReason={handleRejectDelayReason}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
            />
          )}

          {activeTab === 'settings' && userRole === 'owner' && (
            <SettingsView
              adminUsername={adminUsername}
              adminPasswordKey={adminPassword}
              viewerUsername={viewerUsername}
              viewerPasswordKey={viewerPassword}
              onUpdateAdminCreds={handleUpdateAdminCreds}
              onUpdateViewerCreds={handleUpdateViewerCreds}
              onResetToDemo={handleResetToDemo}
              onWipeAllData={handleWipeAllData}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              tasks={tasks}
              onSaveTaskType={handleSaveTaskType}
              onDeleteTaskType={handleDeleteTaskType}
              onSavePointsRules={handleSavePointsRules}
              users={users}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              userRole={userRole}
              currentUsername={currentUsername}
              employees={employees}
              onSaveEmployee={async (employee) => { await saveEmployee(employee); }}
            />
          )}

          {activeTab === 'about' && (
            <AboutCard />
          )}
        </div>
      </main>

      {/* Sticky Bottom Navigation Bar (Mobile / PWA Viewport) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] px-3 py-2 flex justify-around items-center z-40">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
                isActive ? 'text-blue-700' : 'text-slate-400'
              }`}
            >
              <Icon className={`w-5.5 h-5.5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              <span className={`text-[10px] mt-1 font-bold ${isActive ? 'text-blue-700' : 'text-slate-400'}`}>
                {item.label.split(' ')[0]} {/* single word for small screen labels */}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
