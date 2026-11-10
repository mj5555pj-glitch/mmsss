import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  ClipboardList,
  Clock,
  FileText,
  Settings,
  ShieldCheck,
  Activity,
  Users,
  GitPullRequest,
  ArrowUpRight,
  Zap,
  Settings2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  LayoutGrid,
  Trophy,
  BarChart3,
  X,
  UserCheck,
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  Layers,
  Search,
  Phone,
  Eye,
  Boxes,
  Package
} from 'lucide-react';
import { Employee, Task, DbTaskType, PointsRules, ManualPointsRecord, AttendanceRecord } from '../types';
import { getEffectiveWorkDateStr, isTechnicianEmployee, formatArabicDateOnly } from '../utils';
import { getAttendanceRecords } from '../lib/dbService';
import TaskRegistration from './TaskRegistration';
import ActiveTasksView from './ActiveTasksView';
import DashboardStatsCard from './DashboardStatsCard';
import DailyOperationsCenter from './DailyOperationsCenter';
import ManualPointsCard from './ManualPointsCard';

interface OwnerDashboardViewProps {
  employees: Employee[];
  activeTasks: Task[];
  allTasks: Task[];
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  userRole: string;
  manualPoints?: ManualPointsRecord[];
  attendanceRecords?: AttendanceRecord[];
  onStartTask: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string,
    parentTaskId?: string
  ) => Promise<any>;
  onCompleteTask: (
    id: string, 
    endTime: string, 
    delayReason?: string, 
    operationDetails?: string,
    consumedMaterials?: any[],
    paymentInfo?: {
      paymentStatus: 'collected' | 'free';
      collectedAmount?: number;
      paymentNotes?: string;
    }
  ) => Promise<any>;
  onPauseTask: (id: string, reason: string) => Promise<any>;
  onResumeTask: (id: string) => Promise<any>;
  onCancelActiveTask: (id: string) => Promise<any>;
  onRegisterCompletedTask: (
    employeeId: string,
    taskType: string,
    startTime: string,
    endTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => Promise<any>;
  onEditActiveTask?: (task: Task) => void;
  onExecuteManualPoints?: (employeeId: string, type: 'gift' | 'penalty', pointsValue: number, reason: string) => Promise<any>;
  onNavigateTab: (tab: string, employeeId?: string) => void;
}

export interface CardDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

// Available Cards Registry
const ALL_AVAILABLE_CARDS: CardDefinition[] = [
  {
    id: 'send_task',
    title: 'إرسال وتكليف مهمة جديدة',
    category: 'إدارة المهام الميدانية',
    description: 'نموذج إدخال وتكليف المهمة الميدانية وإرسالها فورياً للفنيين',
    icon: Send,
    color: 'emerald'
  },
  {
    id: 'quick_stats',
    title: 'شريط الإحصائيات والملخص السريع',
    category: 'المؤشرات والتحليلات',
    description: 'ملخص شامل لعدد الموظفين، المهام القائمة والمنجزة اليوم ومجموع النقاط',
    icon: BarChart3,
    color: 'blue'
  },
  {
    id: 'active_tasks',
    title: 'متابعة المهام القائمة والميدانية',
    category: 'إدارة المهام الميدانية',
    description: 'عرض ومتابعة كافة المهام الجارية ميدانياً واستكمالها أو إيقافها',
    icon: ClipboardList,
    color: 'sky'
  },
  {
    id: 'daily_attendance',
    title: 'سجل الحضور والعمليات اليومية',
    category: 'الموارد البشرية والدوام',
    description: 'متابعة حضور وانصراف الكادر الوظيفي والتأخيرات والطلبات اليومية',
    icon: Clock,
    color: 'indigo'
  },
  {
    id: 'manual_points',
    title: 'إصدار النقاط والخصومات اليدوية',
    category: 'النقاط والحوافز',
    description: 'منح نقاط المكافأة الإدارية الاستثنائية أو الخصومات اليدوية السريعة',
    icon: Zap,
    color: 'amber'
  },
  {
    id: 'quick_links',
    title: 'الوصول السريع للأقسام والمراكز',
    category: 'التنقل الإداري',
    description: 'اختصارات سريعة بضغطة زر للانتقال لمركز الطلبات، الموظفين، والتقارير',
    icon: LayoutGrid,
    color: 'purple'
  },
  {
    id: 'top_performers',
    title: 'لوحة صدارة متصدري اليوم',
    category: 'النقاط والحوافز',
    description: 'قائمة الفنيين الأكثر إنجازاً وتحصيلاً للنقاط خلال اليوم',
    icon: Trophy,
    color: 'amber'
  },
  {
    id: 'workforce_status',
    title: 'حالة الكادر الميداني المتاح',
    category: 'الموارد البشرية والدوام',
    description: 'متابعة توزيع الفنيين بين المتاحين والمشغولين بمهام ميدانية',
    icon: Users,
    color: 'teal'
  }
];

const DEFAULT_CARD_IDS = [
  'send_task',
  'quick_stats',
  'active_tasks',
  'daily_attendance',
  'manual_points',
  'quick_links',
  'top_performers',
  'workforce_status'
];

const STORAGE_KEY = 'futurex_owner_dashboard_cards_v2';

export default function OwnerDashboardView({
  employees,
  activeTasks,
  allTasks,
  taskTypes,
  pointsRules,
  userRole,
  manualPoints = [],
  attendanceRecords: propAttendanceRecords = [],
  onStartTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onCancelActiveTask,
  onRegisterCompletedTask,
  onEditActiveTask,
  onExecuteManualPoints,
  onNavigateTab
}: OwnerDashboardViewProps) {
  // State for attendance records
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(propAttendanceRecords || []);

  useEffect(() => {
    if (propAttendanceRecords && propAttendanceRecords.length > 0) {
      setAttendanceRecords(propAttendanceRecords);
      return;
    }
    // On-demand fetch with limit 50 instead of continuous onSnapshot
    getAttendanceRecords(false, undefined, 50)
      .then((recs) => setAttendanceRecords(recs))
      .catch((err) => console.error('Attendance fetch error in OwnerDashboardView:', err));
  }, [propAttendanceRecords]);

  // State for active cards on dashboard
  const [activeCardIds, setActiveCardIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Failed to load saved dashboard cards:', e);
    }
    return DEFAULT_CARD_IDS;
  });

  const [isEditingLayout, setIsEditingLayout] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);

  // Modal State for Workforce Status Drilldown
  const [workforceModalType, setWorkforceModalType] = useState<'total' | 'present' | 'busy' | 'ready' | 'pending_approval' | null>(null);
  const [workforceSearchQuery, setWorkforceSearchQuery] = useState('');

  // Workforce Readiness Derived Calculations
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // 1. All active non-terminated employees
  const activeEmployeesList = useMemo(() => {
    return employees.filter((e) => e.status !== 'terminated');
  }, [employees]);

  // 2. Attendance Map for Today
  const todayAttendanceMap = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    (attendanceRecords || []).forEach((r) => {
      if (r.date === todayStr && !r.isDeleted && (r.status === 'present' || r.status === 'late' || !!r.checkInTime)) {
        map.set(r.employeeId, r);
      }
    });
    return map;
  }, [attendanceRecords, todayStr]);

  // 3. Effective Active Tasks (falls back to filtering allTasks if activeTasks is empty)
  const effectiveActiveTasks = useMemo(() => {
    if (activeTasks && activeTasks.length > 0) return activeTasks;
    return (allTasks || []).filter((t) => t.status === 'active' || t.status === 'paused' || t.status === 'pending');
  }, [activeTasks, allTasks]);

  // 3.1 Pending Approval Tasks (tasks dispatched to technician and awaiting their approval/acceptance)
  const pendingApprovalTasks = useMemo(() => {
    return effectiveActiveTasks.filter((t) => t.status === 'pending' && !t.parentTaskId);
  }, [effectiveActiveTasks]);

  // 4. Map of Employee ID to running active task(s)
  const busyEmployeeTaskMap = useMemo(() => {
    const map = new Map<string, Task[]>();
    effectiveActiveTasks.forEach((t) => {
      if (t.status === 'active' || t.status === 'paused' || t.status === 'pending') {
        if (t.employeeId) {
          const list = map.get(t.employeeId) || [];
          list.push(t);
          map.set(t.employeeId, list);
        }
      }
    });
    return map;
  }, [effectiveActiveTasks]);

  // 5. Present Employees List (checked in today)
  const presentEmployeesList = useMemo(() => {
    return activeEmployeesList.filter((e) => todayAttendanceMap.has(e.id));
  }, [activeEmployeesList, todayAttendanceMap]);

  // 6. Busy Employees List (currently assigned an active running task)
  const busyEmployeesList = useMemo(() => {
    return activeEmployeesList.filter((e) => busyEmployeeTaskMap.has(e.id));
  }, [activeEmployeesList, busyEmployeeTaskMap]);

  // 7. Ready / Waiting Employees List (Technicians only, checked in today AND have NO active tasks)
  const readyEmployeesList = useMemo(() => {
    return presentEmployeesList.filter((e) => isTechnicianEmployee(e) && !busyEmployeeTaskMap.has(e.id));
  }, [presentEmployeesList, busyEmployeeTaskMap]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeCardIds));
    } catch (e) {
      console.warn('Failed to save dashboard cards layout:', e);
    }
  }, [activeCardIds]);

  // Calculations for Today
  const completedToday = allTasks.filter((t) => {
    if (t.status !== 'completed') return false;
    const todayStr = getEffectiveWorkDateStr();
    const taskDateStr = new Date(t.endTime || t.startTime).toISOString().split('T')[0];
    return todayStr === taskDateStr;
  });

  const totalPointsToday = completedToday.reduce((acc, t) => acc + (t.points || 0), 0);

  // Card Management Actions
  const moveCard = (index: number, direction: 'up' | 'down') => {
    const newCards = [...activeCardIds];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newCards.length) return;
    const temp = newCards[index];
    newCards[index] = newCards[targetIndex];
    newCards[targetIndex] = temp;
    setActiveCardIds(newCards);
  };

  const moveCardToPosition = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= activeCardIds.length) return;
    const newCards = [...activeCardIds];
    const [movedItem] = newCards.splice(fromIndex, 1);
    newCards.splice(toIndex, 0, movedItem);
    setActiveCardIds(newCards);
  };

  const removeCard = (cardId: string) => {
    setActiveCardIds(prev => prev.filter(id => id !== cardId));
  };

  const addCard = (cardId: string) => {
    if (!activeCardIds.includes(cardId)) {
      setActiveCardIds(prev => [...prev, cardId]);
    }
  };

  const clearAllCards = () => {
    if (window.confirm('هل أنت تأكد من تفريغ ومسح جميع البطاقات من اللوحة الرئيسية؟')) {
      setActiveCardIds([]);
    }
  };

  const resetToDefaultLayout = () => {
    setActiveCardIds(DEFAULT_CARD_IDS);
  };

  const availableToAdd = ALL_AVAILABLE_CARDS.filter(c => !activeCardIds.includes(c.id));

  // Render logic for each individual card component
  const renderCardContent = (cardId: string) => {
    switch (cardId) {
      case 'send_task':
        return (
          <div className="bg-white rounded-3xl border-2 border-emerald-500/80 p-5 md:p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-emerald-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black shadow-md">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg md:text-xl font-black text-slate-900 flex items-center gap-2">
                    <span>إرسال وتكليف مهمة جديدة</span>
                    <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      فوري ومباشر
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    قم باختيار نوع المهمة وتعيين الفنيين لإرسال التكليف الميداني فوراً للوحة الفني
                  </p>
                </div>
              </div>
            </div>

            <TaskRegistration
              employees={employees}
              activeTasks={activeTasks}
              allTasks={allTasks}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              onStartTask={onStartTask}
              onCompleteTask={onCompleteTask}
              onPauseTask={onPauseTask}
              onResumeTask={onResumeTask}
              onCancelActiveTask={onCancelActiveTask}
              onRegisterCompletedTask={onRegisterCompletedTask}
              userRole={userRole as any}
              onEditActiveTask={onEditActiveTask}
              hideActiveTasksList={true}
            />
          </div>
        );

      case 'quick_stats':
        return (
          <DashboardStatsCard
            employeeCount={employees.length}
            activeTasksCount={activeTasks.length}
            completedTasksTodayCount={completedToday.length}
            totalPoints={totalPointsToday}
          />
        );

      case 'active_tasks':
        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>متابعة المهام القائمة والميدانية ({activeTasks.length})</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    عرض حالة المهام الجارية في الميدان حالياً وإمكانية إدارتها أو استكمالها
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('task_management')}
                className="text-xs font-black text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>مركز المهام الكامل</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <ActiveTasksView
              activeTasks={activeTasks}
              employees={employees}
              taskTypes={taskTypes}
              pointsRules={pointsRules}
              onCompleteTask={onCompleteTask}
              onPauseTask={onPauseTask}
              onResumeTask={onResumeTask}
              onCancelActiveTask={onCancelActiveTask}
              onEditActiveTask={onEditActiveTask}
              userRole={userRole as any}
            />
          </div>
        );

      case 'daily_attendance':
        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">سجل الحضور والعمليات اليومية</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    متابعة حضور الكادر الوظيفي والتأخيرات والإنصراف اليومي
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('attendance_management')}
                className="text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>إدارة الحضور</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <DailyOperationsCenter
              employees={employees}
              onNavigateTab={(tab) => onNavigateTab(tab)}
            />
          </div>
        );

      case 'manual_points':
        if (!onExecuteManualPoints) return null;
        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900">إصدار النقاط والخصومات اليدوية السريعة</h2>
                <p className="text-xs text-slate-500 font-medium">
                  منح نقاط المكافأة الإدارية أو الخصومات اليدوية الاستثنائية للموظفين
                </p>
              </div>
            </div>

            <ManualPointsCard
              employees={employees}
              onExecuteManualPoints={onExecuteManualPoints}
            />
          </div>
        );

      case 'quick_links':
        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h2 className="text-base font-black text-slate-900">الوصول السريع للأقسام والمراكز الإدارية</h2>
              <p className="text-xs text-slate-500 font-medium">
                روابط مباشرة لإدارة كافة أقسام ومراكز النظام بضغطة زر
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('inventory')}
                className="p-4 bg-blue-50/70 hover:bg-blue-100/90 border border-blue-200/90 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-blue-950 block group-hover:text-blue-700">المخزون والعهد</span>
                  <span className="text-[10px] text-blue-700 font-medium block">عهد الفنيين والمواد</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('employee_hr_center')}
                className="p-4 bg-purple-50/60 hover:bg-purple-100/80 border border-purple-200/80 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-purple-950 block group-hover:text-purple-700">الموظفون والرواتب</span>
                  <span className="text-[10px] text-purple-700 font-medium block">الملفات والمسيرات</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('requests_center')}
                className="p-4 bg-amber-50/60 hover:bg-amber-100/80 border border-amber-200/80 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                  <GitPullRequest className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-amber-950 block group-hover:text-amber-700">مركز الطلبات</span>
                  <span className="text-[10px] text-amber-700 font-medium block">الإجازات والطلبات</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('reports')}
                className="p-4 bg-teal-50/60 hover:bg-teal-100/80 border border-teal-200/80 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-xs">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-teal-950 block group-hover:text-teal-700">التقارير الشاملة</span>
                  <span className="text-[10px] text-teal-700 font-medium block">استخراج البيانات</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('audit_activity_center')}
                className="p-4 bg-rose-50/60 hover:bg-rose-100/80 border border-rose-200/80 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-rose-950 block group-hover:text-rose-700">سجل التدقيق</span>
                  <span className="text-[10px] text-rose-700 font-medium block">مراقبة الأنشطة</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('settings')}
                className="p-4 bg-slate-100/80 hover:bg-slate-200/80 border border-slate-200 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-slate-800 text-white flex items-center justify-center shadow-xs">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-slate-900 block group-hover:text-slate-700">إعدادات النظام</span>
                  <span className="text-[10px] text-slate-500 font-medium block">قواعد النقاط</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('system_diagnostics')}
                className="p-4 bg-sky-50/60 hover:bg-sky-100/80 border border-sky-200/80 rounded-2xl transition-all cursor-pointer text-right flex flex-col justify-between space-y-2 group"
              >
                <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-black text-xs text-sky-950 block group-hover:text-sky-700">تشخيص النظام</span>
                  <span className="text-[10px] text-sky-700 font-medium block">حالة السيرفر والربط</span>
                </div>
              </button>
            </div>
          </div>
        );

      case 'top_performers': {
        const todayStr = getEffectiveWorkDateStr();
        const techRankings = employees
          .filter(e => e.role === 'technician')
          .map(emp => {
            const empDoneToday = allTasks.filter(t => {
              if (t.employeeId !== emp.id || t.status !== 'completed') return false;
              const dateStr = new Date(t.endTime || t.startTime).toISOString().split('T')[0];
              return dateStr === todayStr;
            });
            const taskPts = empDoneToday.reduce((sum, t) => sum + (t.points || 0), 0);
            const manualPts = manualPoints
              .filter(m => m.employeeId === emp.id && (m.timestamp || '').startsWith(todayStr))
              .reduce((sum, m) => sum + (m.type === 'gift' ? m.points : -m.points), 0);

            return {
              emp,
              taskCount: empDoneToday.length,
              totalPts: taskPts + manualPts
            };
          })
          .sort((a, b) => b.totalPts - a.totalPts)
          .slice(0, 5);

        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">متصدرو النقاط والإنتاجية اليوم</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    ترتيب الفنيين الأكثر إنجازاً وتحصيلاً للنقاط اليوم
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('leaderboard')}
                className="text-xs font-black text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0"
              >
                <span>لوحة الصدارة الكاملة</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {techRankings.map((item, idx) => (
                <div key={item.emp.id} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shadow-xs ${
                      idx === 0 ? 'bg-amber-400 text-slate-950' :
                      idx === 1 ? 'bg-slate-300 text-slate-900' :
                      idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 text-slate-700'
                    }`}>
                      #{idx + 1}
                    </span>
                    <div>
                      <span className="font-black text-xs text-slate-900 block">{item.emp.name}</span>
                      <span className="text-[10px] text-slate-500 font-bold block">{item.taskCount} مهمة منجزة اليوم</span>
                    </div>
                  </div>
                  <span className="font-mono font-black text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
                    +{item.totalPts} ن
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }

      case 'workforce_status': {
        return (
          <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold shadow-xs">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">جاهزية الكادر الميداني اليوم</h2>
                  <p className="text-xs text-slate-500 font-medium">
                    متابعة فورية لإجمالي الموظفين، الحضور، الفنيين المشغولين بمهام والجاهزين للاستلام (انقر التفاصيل)
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-teal-50 text-teal-700 border border-teal-200/80 px-2.5 py-1 rounded-full hidden sm:inline-block">
                مباشر
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              {/* 1. Total Employees */}
              <button
                type="button"
                onClick={() => {
                  setWorkforceModalType('total');
                  setWorkforceSearchQuery('');
                }}
                className="p-4 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 hover:border-slate-300 rounded-2xl text-right transition-all hover:shadow-xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900">إجمالي الموظفين</span>
                  <div className="w-7 h-7 rounded-xl bg-slate-200/80 group-hover:bg-slate-300 text-slate-700 flex items-center justify-center transition-colors">
                    <Users className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xl font-black text-slate-900 font-mono mt-2 block">
                  {activeEmployeesList.length} <span className="text-xs font-medium text-slate-500">موظف</span>
                </span>
                <span className="text-[10px] text-slate-400 font-medium mt-1 flex items-center justify-between">
                  <span>الكادر بالكامل</span>
                  <span className="text-slate-600 font-bold group-hover:underline flex items-center gap-0.5">
                    عرض الأسماء 👁️
                  </span>
                </span>
              </button>

              {/* 2. Present Today */}
              <button
                type="button"
                onClick={() => {
                  setWorkforceModalType('present');
                  setWorkforceSearchQuery('');
                }}
                className="p-4 bg-blue-50/70 hover:bg-blue-100/60 border border-blue-200/80 hover:border-blue-300 rounded-2xl text-right transition-all hover:shadow-xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 group-hover:text-blue-950">الموظفين الحاضرين</span>
                  <div className="w-7 h-7 rounded-xl bg-blue-100 group-hover:bg-blue-200 text-blue-700 flex items-center justify-center transition-colors">
                    <UserCheck className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xl font-black text-blue-950 font-mono mt-2 block">
                  {presentEmployeesList.length} <span className="text-xs font-medium text-blue-600">حاضر</span>
                </span>
                <span className="text-[10px] text-blue-600/80 font-medium mt-1 flex items-center justify-between">
                  <span>سجلوا حضورهم اليوم</span>
                  <span className="text-blue-700 font-bold group-hover:underline flex items-center gap-0.5">
                    عرض الحاضرين 🟢
                  </span>
                </span>
              </button>

              {/* 3. Busy Technicians */}
              <button
                type="button"
                onClick={() => {
                  setWorkforceModalType('busy');
                  setWorkforceSearchQuery('');
                }}
                className="p-4 bg-amber-50/70 hover:bg-amber-100/60 border border-amber-200/80 hover:border-amber-300 rounded-2xl text-right transition-all hover:shadow-xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 group-hover:text-amber-950">فنيون مشغولون بمهام</span>
                  <div className="w-7 h-7 rounded-xl bg-amber-100 group-hover:bg-amber-200 text-amber-700 flex items-center justify-center transition-colors">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xl font-black text-amber-950 font-mono mt-2 block">
                  {busyEmployeesList.length} <span className="text-xs font-medium text-amber-600">فني/موظف</span>
                </span>
                <span className="text-[10px] text-amber-700/80 font-medium mt-1 flex items-center justify-between">
                  <span>قيد تنفيذ مهام ميدانية</span>
                  <span className="text-amber-800 font-bold group-hover:underline flex items-center gap-0.5">
                    عرض المهام الجارية ⚡
                  </span>
                </span>
              </button>

              {/* 4. Ready Technicians */}
              <button
                type="button"
                onClick={() => {
                  setWorkforceModalType('ready');
                  setWorkforceSearchQuery('');
                }}
                className="p-4 bg-emerald-50/70 hover:bg-emerald-100/60 border border-emerald-200/80 hover:border-emerald-300 rounded-2xl text-right transition-all hover:shadow-xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 group-hover:text-emerald-950">جاهزون منتظرون لمهام</span>
                  <div className="w-7 h-7 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xl font-black text-emerald-950 font-mono mt-2 block">
                  {readyEmployeesList.length} <span className="text-xs font-medium text-emerald-600">فني</span>
                </span>
                <span className="text-[10px] text-emerald-700/80 font-medium mt-1 flex items-center justify-between">
                  <span>حاضرون وبانتظار التكليف</span>
                  <span className="text-emerald-800 font-bold group-hover:underline flex items-center gap-0.5">
                    عرض الجاهزين ✨
                  </span>
                </span>
              </button>

              {/* 5. Pending Approval / Acceptance Requests */}
              <button
                type="button"
                onClick={() => {
                  setWorkforceModalType('pending_approval');
                  setWorkforceSearchQuery('');
                }}
                className="p-4 bg-purple-50/70 hover:bg-purple-100/60 border border-purple-200/80 hover:border-purple-300 rounded-2xl text-right transition-all hover:shadow-xs group cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400 col-span-2 sm:col-span-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-900 group-hover:text-purple-950">طلبات بانتظار الموافقة</span>
                  <div className="w-7 h-7 rounded-xl bg-purple-100 group-hover:bg-purple-200 text-purple-700 flex items-center justify-center transition-colors">
                    <Clock className="w-3.5 h-3.5" />
                  </div>
                </div>
                <span className="text-xl font-black text-purple-950 font-mono mt-2 block">
                  {pendingApprovalTasks.length} <span className="text-xs font-medium text-purple-600">طلب</span>
                </span>
                <span className="text-[10px] text-purple-700/80 font-medium mt-1 flex items-center justify-between">
                  <span>مرسلة ولم يوافق عليها الفني</span>
                  <span className="text-purple-800 font-bold group-hover:underline flex items-center gap-0.5">
                    عرض الطلبات ⏳
                  </span>
                </span>
              </button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 dir-rtl pb-12" dir="rtl">
      
      {/* Main Content Area - Render Active Cards First */}
      {activeCardIds.length === 0 ? (
        /* Empty Dashboard State (When all cards cleared) */
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-300 p-10 text-center space-y-4 shadow-sm my-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
            <Layers className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-black text-slate-900">اللوحة الرئيسية فارغة حالياً</h3>
            <p className="text-xs text-slate-500 font-medium">
              لقد قمت بإزالة وتفريغ جميع البطاقات من اللوحة. يمكنك إضافة البطاقات التي ترغب بظهورها من الشريط بالأسفل.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddCardModal(true)}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة بطاقات الآن</span>
            </button>
            <button
              type="button"
              onClick={resetToDefaultLayout}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>استعادة البطاقات الافتراضية</span>
            </button>
          </div>
        </div>
      ) : (
        /* Render Card Sequence */
        <div className="space-y-6">
          {activeCardIds.map((cardId, index) => {
            const cardDef = ALL_AVAILABLE_CARDS.find(c => c.id === cardId);
            return (
              <div key={cardId} className="relative transition-all">
                {/* Control Header Bar for Each Card in Edit Mode */}
                {isEditingLayout && cardDef && (
                  <div className="bg-slate-950 text-white p-2.5 rounded-2xl mb-2 flex flex-wrap items-center justify-between gap-2 shadow-md border border-slate-800 animate-fadeIn">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-xs">
                        #{index + 1}
                      </span>
                      <div>
                        <span className="font-black text-xs text-white block">{cardDef.title}</span>
                        <span className="text-[10px] text-slate-400 font-medium block">{cardDef.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Move Up */}
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveCard(index, 'up')}
                        className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 border border-slate-700"
                        title="تحريك للأعلى"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span className="text-[10px] hidden sm:inline">أعلى</span>
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        disabled={index === activeCardIds.length - 1}
                        onClick={() => moveCard(index, 'down')}
                        className="p-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 border border-slate-700"
                        title="تحريك للأسفل"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        <span className="text-[10px] hidden sm:inline">أسفل</span>
                      </button>

                      {/* Direct Position Selector */}
                      <div className="flex items-center gap-1 bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-700">
                        <span className="text-[10px] text-slate-400 font-bold">الموقع:</span>
                        <select
                          value={index}
                          onChange={(e) => moveCardToPosition(index, Number(e.target.value))}
                          className="bg-transparent text-amber-400 font-mono text-xs font-black cursor-pointer focus:outline-none"
                        >
                          {activeCardIds.map((_, i) => (
                            <option key={i} value={i} className="bg-slate-900 text-white">
                              {i + 1}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Remove Card Button */}
                      <button
                        type="button"
                        onClick={() => removeCard(cardId)}
                        className="p-1 bg-rose-600/90 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 mr-1"
                        title="إزالة هذه البطاقة من اللوحة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="text-[10px]">إزالة</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Render Actual Card Content */}
                {renderCardContent(cardId)}
              </div>
            );
          })}
        </div>
      )}

      {/* Very Small Compact Card at Bottom for Dashboard Customization */}
      <div className="mt-8 bg-slate-900 text-white rounded-2xl p-3 md:p-3.5 shadow-lg border border-slate-800 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black text-white flex items-center gap-2">
                <span>تعديل بطاقات اللوحة الرئيسية</span>
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-400/30">
                  {activeCardIds.length} معروضة
                </span>
              </h4>
              <p className="text-[11px] text-slate-400 font-medium">
                تغيير ترتيب البطاقات، حذف أو إضافة بطاقات جديدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setIsEditingLayout(!isEditingLayout)}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                isEditingLayout
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              }`}
            >
              {isEditingLayout ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ الترتيب</span>
                </>
              ) : (
                <>
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>تعديل اللوحة</span>
                </>
              )}
            </button>

            {isEditingLayout && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAddCardModal(true)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-400/30 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة</span>
                </button>

                <button
                  type="button"
                  onClick={clearAllCards}
                  className="px-2.5 py-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800/80 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                  title="مسح وتفريغ جميع البطاقات"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>مسح الكل</span>
                </button>

                <button
                  type="button"
                  onClick={resetToDefaultLayout}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                  title="إعادة الضبط"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>إعادة ضبط</span>
                </button>
              </>
            )}
          </div>
        </div>

        {isEditingLayout && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-xl text-amber-200 text-[11px] flex items-center justify-between gap-2 animate-fadeIn">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>وضع التعديل مفعل: استخدم أزرار (أعلى / أسفل / الموقع) فوق كل بطاقة لإعادة الترتيب.</span>
            </span>
            <button
              type="button"
              onClick={() => setShowAddCardModal(true)}
              className="bg-amber-400 text-slate-950 font-black text-[10px] px-2 py-1 rounded-lg hover:bg-amber-300 cursor-pointer transition-colors shrink-0"
            >
              + إضافة بطاقات ({availableToAdd.length})
            </button>
          </div>
        )}
      </div>

      {/* MODAL: Add Cards to Dashboard */}
      {showAddCardModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">إضافة بطاقات للوحة الرئيسية</h3>
                  <p className="text-xs text-slate-300 font-medium">
                    اختر البطاقة التي ترغب بإظهارها وإضافتها للوحة التحكم
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddCardModal(false)}
                className="w-8 h-8 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {availableToAdd.length === 0 ? (
                <div className="p-8 text-center space-y-2 bg-emerald-50 rounded-2xl border border-emerald-200">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="font-black text-emerald-950 text-sm">جميع البطاقات المتاحة معروضة حالياً على اللوحة!</p>
                  <p className="text-xs text-emerald-800 font-medium">لا توجد بطاقات مخفية لإضافتها.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {availableToAdd.map(card => {
                    const CardIcon = card.icon;
                    return (
                      <div
                        key={card.id}
                        className="p-4 rounded-2xl border border-slate-200 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/30 transition-all flex items-center justify-between gap-4 group"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-slate-200/80 text-slate-800 group-hover:bg-amber-400 group-hover:text-slate-950 flex items-center justify-center font-bold shrink-0 transition-colors">
                            <CardIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-sm text-slate-900">{card.title}</h4>
                              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md">
                                {card.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 font-medium mt-1">
                              {card.description}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            addCard(card.id);
                          }}
                          className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span>إضافة</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setActiveCardIds(DEFAULT_CARD_IDS);
                  setShowAddCardModal(false);
                }}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إضافة جميع البطاقات المتاحة</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAddCardModal(false)}
                className="px-5 py-2 bg-slate-900 text-white font-black text-xs rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Workforce Drilldown Modal */}
      {workforceModalType && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 dir-rtl" dir="rtl">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  workforceModalType === 'pending_approval'
                    ? 'bg-purple-500/20 border border-purple-500/30 text-purple-300'
                    : 'bg-teal-500/20 border border-teal-500/30 text-teal-300'
                }`}>
                  {workforceModalType === 'pending_approval' ? <Clock className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                    {workforceModalType === 'total' && `👥 إجمالي الموظفين المسجلين (${activeEmployeesList.length})`}
                    {workforceModalType === 'present' && `🟢 الموظفين الحاضرين اليوم (${presentEmployeesList.length})`}
                    {workforceModalType === 'busy' && `⚡ فنيون وموظفون مشغولون بمهام (${busyEmployeesList.length})`}
                    {workforceModalType === 'ready' && `✨ جاهزون منتظرون لمهام جديدة (${readyEmployeesList.length})`}
                    {workforceModalType === 'pending_approval' && `⏳ طلبات بانتظار موافقة الفني (${pendingApprovalTasks.length})`}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {workforceModalType === 'total' && 'قائمة الموظفين غير المنتهية خدماتهم وحالتهم اليومية بالكامل'}
                    {workforceModalType === 'present' && 'قائمة الموظفين الذين سجلوا بصمة حضور اليوم'}
                    {workforceModalType === 'busy' && 'الفنيون والموظفون الذين لديهم مهام قيد التنفيذ حالياً'}
                    {workforceModalType === 'ready' && 'الفنيون الحاضرون اليوم المصنفون كـ (فني) ولا تتواجد لديهم أي مهام جارية'}
                    {workforceModalType === 'pending_approval' && 'المهام والطلبات المرسلة للفنيين ولم يوافق عليها الفني أو يقبلها بعد'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setWorkforceModalType(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={workforceSearchQuery}
                  onChange={(e) => setWorkforceSearchQuery(e.target.value)}
                  placeholder={
                    workforceModalType === 'pending_approval'
                      ? "بحث في الطلبات باسم الفني، المشترك، رقم الهاتف، أو نوع المهمة..."
                      : "بحث عن موظف بالاسم، رقم الهاتف، أو المسمى الوظيفي..."
                  }
                  className="w-full pr-10 pl-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition-all"
                />
              </div>
            </div>

            {/* Modal Content List */}
            <div className="p-4 md:p-6 overflow-y-auto space-y-3 flex-1">
              {(() => {
                // If modal is pending_approval, render tasks awaiting technician acceptance
                if (workforceModalType === 'pending_approval') {
                  const q = workforceSearchQuery.trim().toLowerCase();
                  let pTasks = pendingApprovalTasks;
                  if (q) {
                    pTasks = pTasks.filter(
                      (t) =>
                        (t.employeeName && t.employeeName.toLowerCase().includes(q)) ||
                        (t.subscriberName && t.subscriberName.toLowerCase().includes(q)) ||
                        (t.subscriberPhone && t.subscriberPhone.includes(q)) ||
                        (t.taskType && t.taskType.toLowerCase().includes(q)) ||
                        (t.title && t.title.toLowerCase().includes(q)) ||
                        (t.notes && t.notes.toLowerCase().includes(q))
                    );
                  }

                  if (pTasks.length === 0) {
                    return (
                      <div className="text-center py-12 text-slate-400 space-y-2">
                        <Clock className="w-12 h-12 mx-auto text-purple-300 opacity-60" />
                        <p className="text-sm font-black text-slate-700">لا توجد طلبات بانتظار الموافقة حالياً</p>
                        <p className="text-xs text-slate-400">جميع المهام المرسلة تم قبولها من قبل الفنيين أو لا توجد مهام معلقة</p>
                      </div>
                    );
                  }

                  return pTasks.map((task) => {
                    const assignedEmp = employees.find((e) => e.id === task.employeeId);
                    return (
                      <div
                        key={task.id}
                        className="p-4 bg-white rounded-2xl border border-purple-200 hover:border-purple-300 shadow-2xs space-y-3 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 font-black flex items-center justify-center text-xs shrink-0">
                              {(assignedEmp?.name || task.employeeName || 'فني').slice(0, 1)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-slate-900">
                                  {assignedEmp?.name || task.employeeName || 'فني غير محدد'}
                                </span>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                  🔧 فني
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-400 font-medium">
                                مرسل إليه: {task.startTime ? formatArabicDateOnly(task.startTime) : 'اليوم'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
                              <span>بانتظار قبول الفني ⏳</span>
                            </span>
                            <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                              {task.points} نقطة
                            </span>
                          </div>
                        </div>

                        {/* Task Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 font-medium block text-[10px]">نوع المهمة:</span>
                            <span className="font-black text-slate-800">{task.title || task.taskType}</span>
                          </div>

                          <div>
                            <span className="text-slate-400 font-medium block text-[10px]">المشترك:</span>
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <span>{task.subscriberName || 'غير محدد'}</span>
                              {task.subscriberPhone && (
                                <a
                                  href={`tel:${task.subscriberPhone}`}
                                  className="text-[11px] font-mono text-blue-600 hover:underline flex items-center gap-0.5"
                                >
                                  <Phone className="w-3 h-3" />
                                  <span>{task.subscriberPhone}</span>
                                </a>
                              )}
                            </div>
                          </div>

                          {task.notes && (
                            <div className="sm:col-span-2 pt-1 border-t border-slate-200/60">
                              <span className="text-slate-400 font-medium block text-[10px]">ملاحظات:</span>
                              <span className="text-slate-700 font-medium text-[11px] line-clamp-2">{task.notes}</span>
                            </div>
                          )}
                        </div>

                        {/* Quick Action */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setWorkforceModalType(null);
                              if (onNavigateTab) onNavigateTab('active_tasks');
                            }}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>متابعة في المهام الجارية ⚡</span>
                          </button>
                        </div>
                      </div>
                    );
                  });
                }

                let list: Employee[] = [];
                if (workforceModalType === 'total') list = activeEmployeesList;
                else if (workforceModalType === 'present') list = presentEmployeesList;
                else if (workforceModalType === 'busy') list = busyEmployeesList;
                else if (workforceModalType === 'ready') list = readyEmployeesList;

                const q = workforceSearchQuery.trim().toLowerCase();
                if (q) {
                  list = list.filter(
                    (e) =>
                      e.name.toLowerCase().includes(q) ||
                      (e.phone && e.phone.includes(q)) ||
                      (e.role && e.role.toLowerCase().includes(q))
                  );
                }

                if (list.length === 0) {
                  return (
                    <div className="text-center py-10 text-slate-400 space-y-2">
                      <Users className="w-10 h-10 mx-auto opacity-30" />
                      <p className="text-xs font-bold">لا توجد نتائج مطابقة لهذه الفئة حالياً</p>
                    </div>
                  );
                }

                return list.map((emp) => {
                  const att = todayAttendanceMap.get(emp.id);
                  const tasks = busyEmployeeTaskMap.get(emp.id) || [];
                  const isBusy = tasks.length > 0;
                  const isPresent = !!att;

                  // Arabic role label
                  const roleLabel =
                    emp.role === 'technician' ? 'فني ميداني' :
                    emp.role === 'field' ? 'فني ميداني' :
                    emp.role === 'admin' ? 'مدير نظام' :
                    emp.role === 'owner' ? 'مالك الشركة' :
                    emp.role === 'hr' ? 'موارد بشرية' :
                    emp.role === 'accountant' ? 'محاسب' :
                    emp.role === 'worker' ? 'عامل' : emp.role || 'موظف';

                  return (
                    <div
                      key={emp.id}
                      className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                          isBusy ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          isPresent ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {emp.name.charAt(0)}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-extrabold text-sm text-slate-900">{emp.name}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                              {roleLabel}
                            </span>
                            {emp.phone && (
                              <a
                                href={`tel:${emp.phone}`}
                                className="text-[11px] font-mono font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{emp.phone}</span>
                              </a>
                            )}
                          </div>

                          {/* Attendance Info */}
                          <div className="flex items-center gap-2 text-xs">
                            {isPresent ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                                <UserCheck className="w-3 h-3 text-emerald-600" />
                                حاضر اليوم {att.checkInTime ? `(${new Date(att.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })})` : ''}
                              </span>
                            ) : (emp.isExemptFromFingerprint || emp.exemptFromFingerprint) ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-lg">
                                🛡️ غير مشمول بالبصمة
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-lg">
                                🔴 لم يسجل بصمة حضور اليوم
                              </span>
                            )}
                          </div>

                          {/* Tasks Info */}
                          {isBusy ? (
                            <div className="space-y-1 pt-1">
                              {tasks.map((t) => (
                                <div key={t.id} className="text-xs bg-amber-50 border border-amber-200 p-2 rounded-xl text-amber-950 font-bold flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span>مهمة جارية: <strong className="text-slate-900">{t.title || t.taskType}</strong> {t.subscriberName ? `(${t.subscriberName})` : ''}</span>
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-extrabold shrink-0">
                                    {t.status === 'active' ? 'جارية' : t.status === 'paused' ? 'مؤقتة' : 'معلقة'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1 pt-0.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>جاهز ومنتظر استقبال مهام جديدة</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Assign Task Action Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setWorkforceModalType(null);
                          if (onNavigateTab) onNavigateTab('task_management', emp.id);
                        }}
                        className="self-end sm:self-center px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>إسناد مهمة ⚡</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-500">
                انقر على زر الإغلاق للعودة للوحة الرئيسية
              </span>
              <button
                type="button"
                onClick={() => setWorkforceModalType(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
