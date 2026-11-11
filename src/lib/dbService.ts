import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDocs,
  getDoc,
  updateDoc,
  writeBatch,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  Employee, 
  Task, 
  LeaderboardEntry, 
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
  FinancialAdjustment,
  ConsumedMaterial,
  MaterialItem,
  TechnicianStockItem,
  MaterialTransaction
} from '../types';
import { SEED_EMPLOYEES, SEED_TASKS } from '../data';
import { isToday, isThisWeek, isThisMonth } from '../utils';
import { diagnostics } from './diagnosticsLogger';

export const DEFAULT_TASK_TYPES: DbTaskType[] = [
  {
    id: 'tt-1',
    name: 'تنصيب',
    points: 20,
    color: '#3B82F6', // Blue
    status: 'active',
    description: 'تركيب وتنصيب خطوط المشتركين الجديدة والتحقق من التوصيلات الميدانية',
    order: 1,
    icon: 'wrench',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 45,
    fastCompletionBonusEnabled: true,
    fastCompletionMinutes: 15,
    fastCompletionBonusPoints: 5,
    customRules: 'مكافأة إضافية بقيمة 5 نقاط لكل مهمة من نوع "تنصيب" تنجز بالكامل في أقل من 15 دقيقة.'
  },
  {
    id: 'tt-2',
    name: 'صيانة',
    points: 18,
    color: '#10B981', // Emerald
    status: 'active',
    description: 'فحص وإصلاح مشاكل الاتصال والأسلاك الخارجية والداخلية ومودم المشترك',
    order: 2,
    icon: 'wrench',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 30,
    fastCompletionBonusEnabled: false,
    fastCompletionMinutes: 0,
    fastCompletionBonusPoints: 0,
    customRules: 'قوانين تدريجية: كسب 3 نقاط عن كل 5 دقائق حتى 30 دقيقة.'
  },
  {
    id: 'tt-3',
    name: 'سحب',
    points: 14,
    color: '#F59E0B', // Amber
    status: 'active',
    description: 'إلغاء الاشتراك وسحب الأجهزة والأسلاك وإرجاعها للشركة',
    order: 3,
    icon: 'truck',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 60,
    fastCompletionBonusEnabled: false,
    customRules: ''
  },
  {
    id: 'tt-4',
    name: 'منافذ',
    points: 10,
    color: '#8B5CF6', // Violet
    status: 'active',
    description: 'توزيع وترتيب الكوابل في الكابينة الرئيسية وفتح منافذ جديدة لخطوط الربط',
    order: 4,
    icon: 'settings',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 60,
    fastCompletionBonusEnabled: false,
    customRules: ''
  },
  {
    id: 'tt-5',
    name: 'كلك',
    points: 8,
    color: '#06B6D4', // Cyan
    status: 'active',
    description: 'تحديث فوري وتغيير إعدادات السيرفر أو برمجة الأجهزة عن بعد بالموقع',
    order: 5,
    icon: 'play',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 60,
    fastCompletionBonusEnabled: false,
    customRules: ''
  },
  {
    id: 'tt-6',
    name: 'دلفري',
    points: 5,
    color: '#EC4899', // Pink
    status: 'active',
    description: 'توصيل كروت الشحن، الراوتر، أو قطع الغيار الاستهلاكية لمنزل المشترك',
    order: 6,
    icon: 'truck',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 60,
    fastCompletionBonusEnabled: false,
    customRules: ''
  },
  {
    id: 'tt-7',
    name: 'دعم',
    points: 4,
    color: '#64748B', // Slate
    status: 'active',
    description: 'مساعدة الفنيين الميدانيين الآخرين أو تقديم الدعم التقني التلفوني المباشر',
    order: 7,
    icon: 'help',
    visibleToTech: true,
    delayDeductionPerMinute: 0.5,
    maxDeduction: 10,
    allowPause: true,
    freeMinutes: 60,
    fastCompletionBonusEnabled: false,
    customRules: ''
  }
];

export const DEFAULT_POINTS_RULES: PointsRules = {
  delayDeductionPerMinute: 0.5,
  maxDeduction: 10,
  additionalRewards: 'مكافأة إضافية بقيمة 5 نقاط لكل مهمة من نوع "تنصيب" تنجز بالكامل في أقل من 15 دقيقة.',
  customRules: 'تحتسب النقاط تلقائياً بناءً على نوع المهمة وزمن الإنجاز الفعلي بعد طرح أوقات الإيقاف المؤقت.'
};


// Operation Types for error tracing
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// Error handler utility
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, shouldThrow = true) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';

  const isNetworkOrOffline = 
    errCode === 'unavailable' ||
    errCode === 'failed-precondition' ||
    errMsg.includes('unavailable') ||
    errMsg.includes('Could not reach Cloud Firestore') ||
    errMsg.includes('offline') ||
    errMsg.includes('network');

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };

  if (isNetworkOrOffline) {
    console.warn(`[Firestore Network/Offline] (${operationType} ${path}): ${errMsg}`);
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  if (shouldThrow) {
    throw new Error(JSON.stringify(errInfo));
  }
}

// Collections names
const EMPLOYEES_COLLECTION = 'employees';
const TASKS_COLLECTION = 'tasks';
const SETTINGS_COLLECTION = 'settings';
const LEADERBOARD_COLLECTION = 'leaderboard';
export const MANUAL_POINTS_COLLECTION = 'manual_points_history';
export const ATTENDANCE_COLLECTION = 'attendance_records';
export const OVERTIME_COLLECTION = 'overtime_records';
export const LEAVE_REQUESTS_COLLECTION = 'leave_requests';
export const GRACE_REQUESTS_COLLECTION = 'grace_requests';
export const PAYROLL_PERIODS_COLLECTION = 'payroll_periods';
export const PAYROLL_RECORDS_COLLECTION = 'payroll_records';
export const AUDIT_LOGS_COLLECTION = 'audit_logs';
export const FINANCIAL_ADJUSTMENTS_COLLECTION = 'financial_adjustments';
export const MATERIAL_ITEMS_COLLECTION = 'material_items';
export const TECHNICIAN_INVENTORY_COLLECTION = 'technician_inventory';
export const MATERIAL_TRANSACTIONS_COLLECTION = 'material_transactions';

export const DEFAULT_MATERIAL_ITEMS: MaterialItem[] = [
  {
    id: 'mat-1',
    name: 'راوتر واي فاي (Router Wi-Fi)',
    unit: 'قطعة',
    category: 'أجهزة',
    description: 'راوتر منزلي لاسلكي ثنائي الحزمة',
    minAlertThreshold: 5,
    warehouseStock: 40,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-2',
    name: 'أونيو ضوئي (ONU / ONT)',
    unit: 'قطعة',
    category: 'أجهزة',
    description: 'جهاز تحويل الإشارة الضوئية للمشترك',
    minAlertThreshold: 5,
    warehouseStock: 60,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-3',
    name: 'كابل ألياف خارجي (Drop Cable FTTH)',
    unit: 'متر',
    category: 'كوابل',
    description: 'كابل فايبر خارجي مع سلك دعم فولاذي',
    minAlertThreshold: 200,
    warehouseStock: 2500,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-4',
    name: 'كابل شبكة داخلي (UTP Cat6)',
    unit: 'متر',
    category: 'كوابل',
    description: 'سلك شبكة نحاسي داخلي عالي السرعة',
    minAlertThreshold: 100,
    warehouseStock: 1200,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-5',
    name: 'فاست كونكتر ألياف (Fast Connector SC)',
    unit: 'قطعة',
    category: 'ملحقات وتوصيلات',
    description: 'كونكتر ضوئي سريع SC/UPC',
    minAlertThreshold: 30,
    warehouseStock: 350,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-6',
    name: 'قسام ضوئي سبلتر (Optical Splitter)',
    unit: 'قطعة',
    category: 'ملحقات وتوصيلات',
    description: 'سبلتر توزيع إشارة ضوئية',
    minAlertThreshold: 10,
    warehouseStock: 50,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-7',
    name: 'بكسية خارجية / روزتة (FAT / Box)',
    unit: 'قطعة',
    category: 'ملحقات وتوصيلات',
    description: 'صندوق حماية نهايات الألياف',
    minAlertThreshold: 10,
    warehouseStock: 35,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-8',
    name: 'فيش شبكة (RJ-45 Plug)',
    unit: 'قطعة',
    category: 'ملحقات وتوصيلات',
    description: 'رؤوس توصيل كابلات الشبكة UTP',
    minAlertThreshold: 50,
    warehouseStock: 300,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-9',
    name: 'باج كورد ضوئي (Patch Cord SC)',
    unit: 'قطعة',
    category: 'ملحقات وتوصيلات',
    description: 'سلك توصيل بصري جاهز 1-2 متر',
    minAlertThreshold: 15,
    warehouseStock: 80,
    createdAt: new Date().toISOString()
  },
  {
    id: 'mat-10',
    name: 'محول طاقة / شاحن 12V (Adapter)',
    unit: 'قطعة',
    category: 'أجهزة',
    description: 'شاحن طاقة للأجهزة والمودمات',
    minAlertThreshold: 10,
    warehouseStock: 45,
    createdAt: new Date().toISOString()
  }
];

// Calculate rankings on the fly
export function calculateRankings(
  employees: Employee[], 
  tasks: Task[], 
  period: 'day' | 'week' | 'month',
  manualPoints?: ManualPointsRecord[]
): LeaderboardEntry[] {
  const completedTasks = tasks.filter(t => t.status === 'completed');
  
  const filteredTasks = completedTasks.filter((task) => {
    const dateStr = task.endTime || task.startTime;
    if (period === 'day') return isToday(dateStr);
    if (period === 'week') return isThisWeek(dateStr);
    return isThisMonth(dateStr);
  });

  const filteredManual = (manualPoints || []).filter((mp) => {
    const dateStr = mp.timestamp;
    if (period === 'day') return isToday(dateStr);
    if (period === 'week') return isThisWeek(dateStr);
    return isThisMonth(dateStr);
  });

  const aggregates: Record<string, { name: string; points: number; count: number }> = {};
  
  employees.forEach(emp => {
    aggregates[emp.id] = { name: emp.name, points: 0, count: 0 };
  });

  filteredTasks.forEach((task) => {
    if (aggregates[task.employeeId]) {
      aggregates[task.employeeId].points += task.points;
      aggregates[task.employeeId].count += 1;
    } else {
      aggregates[task.employeeId] = {
        name: task.employeeName,
        points: task.points,
        count: 1,
      };
    }
  });

  // Aggregate manual points
  filteredManual.forEach((mp) => {
    const pointsDiff = mp.type === 'gift' ? mp.points : -mp.points;
    if (aggregates[mp.employeeId]) {
      aggregates[mp.employeeId].points += pointsDiff;
    } else {
      // In case of historical record of deleted employee
      aggregates[mp.employeeId] = {
        name: mp.employeeName,
        points: pointsDiff,
        count: 0
      };
    }
  });

  const entries: LeaderboardEntry[] = Object.keys(aggregates).map((empId) => ({
    rank: 1,
    employeeId: empId,
    employeeName: aggregates[empId].name,
    totalPoints: aggregates[empId].points,
    taskCount: aggregates[empId].count,
  }));

  entries.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.taskCount - a.taskCount;
  });

  let currentRank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].totalPoints < entries[i - 1].totalPoints) {
      currentRank = i + 1;
    }
    entries[i].rank = currentRank;
  }

  return entries;
}

// Subscription Multiplexing Manager
// Ensures that only ONE single onSnapshot listener is open to Firestore per query/collection/document,
// and multiplexes events in-memory to all active components with local cache first.
// When all listeners unsubscribe, it closes the underlying Firestore listener immediately to prevent unnecessary reads.
class SubscriptionManager<T> {
  private path: string;
  private isDoc: boolean;
  private transform: (snapshot: any) => T;
  private activeUnsub: (() => void) | null = null;
  private listeners: Set<(data: T) => void> = new Set();
  private errorListeners: Set<(err: any) => void> = new Set();
  private cachedData: T | null = null;
  private hasLoaded: boolean = false;
  private cacheStorageKey?: string;
  private queryFactory?: () => any;
  private tag?: string;

  constructor(
    path: string, 
    isDoc: boolean, 
    transform: (snapshot: any) => T, 
    cacheStorageKey?: string,
    queryFactory?: () => any,
    tag?: string
  ) {
    this.path = path;
    this.isDoc = isDoc;
    this.transform = transform;
    this.cacheStorageKey = cacheStorageKey;
    this.queryFactory = queryFactory;
    this.tag = tag;

    if (cacheStorageKey) {
      try {
        const raw = localStorage.getItem(cacheStorageKey);
        if (raw) {
          this.cachedData = JSON.parse(raw) as T;
          this.hasLoaded = true;
        }
      } catch (_) {}
    }
  }

  public subscribe(onUpdate: (data: T) => void, onError?: (err: any) => void): () => void {
    this.listeners.add(onUpdate);
    if (onError) {
      this.errorListeners.add(onError);
    }

    // Immediately emit cached memory/IndexedDB data if already loaded
    if (this.hasLoaded && this.cachedData !== null) {
      try {
        diagnostics.logCacheHit(this.path, `SubscriptionManager.subscribe (Immediate Cache Hit${this.tag ? ` [${this.tag}]` : ''})`);
        onUpdate(this.cachedData);
      } catch (err) {
        console.error(`Error in immediate subscriber callback for ${this.path}:`, err);
      }
    }

    // Connect to Firestore once on demand
    if (!this.activeUnsub) {
      this.startFirestoreListener();
    }

    return () => {
      this.listeners.delete(onUpdate);
      if (onError) {
        this.errorListeners.delete(onError);
      }

      // CRITICAL FOR READ CONSUMPTION: When all components have unsubscribed,
      // close the Firestore onSnapshot stream immediately to prevent runaway background reads!
      if (this.listeners.size === 0 && this.activeUnsub) {
        try {
          this.activeUnsub();
        } catch (err) {
          console.warn(`Error unsubscribing Firestore listener for ${this.path}:`, err);
        }
        this.activeUnsub = null;
        const listenerTag = this.tag ? `${this.path} [${this.tag}]` : this.path;
        diagnostics.unregisterListener(listenerTag, 'SubscriptionManager');
      }
    };
  }

  public close() {
    this.listeners.clear();
    this.errorListeners.clear();
    if (this.activeUnsub) {
      try {
        this.activeUnsub();
      } catch (err) {
        console.warn(`Error closing Firestore listener for ${this.path}:`, err);
      }
      this.activeUnsub = null;
      const listenerTag = this.tag ? `${this.path} [${this.tag}]` : this.path;
      diagnostics.unregisterListener(listenerTag, 'SubscriptionManager');
    }
  }

  private startFirestoreListener() {
    const listenerTag = this.tag ? `${this.path} [${this.tag}]` : this.path;
    diagnostics.registerListener(listenerTag, 'SubscriptionManager');
    const targetRef = this.queryFactory
      ? this.queryFactory()
      : (this.isDoc ? doc(db, this.path) : collection(db, this.path));

    this.activeUnsub = onSnapshot(
      targetRef as any,
      (snapshot: any) => {
        try {
          const docCount = snapshot.docChanges ? snapshot.docChanges().length : (snapshot.size || (snapshot.exists && snapshot.exists() ? 1 : 0));
          diagnostics.logListenerEvent(listenerTag, docCount);
          diagnostics.logRead(listenerTag, 'SubscriptionManager.onSnapshot', docCount, `تحديث لحظي Real-Time Stream (${this.tag || 'All'})`);

          const transformed = this.transform(snapshot);
          this.cachedData = transformed;
          this.hasLoaded = true;

          if (this.cacheStorageKey) {
            try {
              localStorage.setItem(this.cacheStorageKey, JSON.stringify(transformed));
            } catch (_) {}
          }

          this.listeners.forEach((callback) => {
            try {
              callback(transformed);
            } catch (err) {
              console.error(`Error in listener callback for ${listenerTag}:`, err);
            }
          });
        } catch (err) {
          console.error(`Error transforming snapshot for ${listenerTag}:`, err);
        }
      },
      (error: any) => {
        handleFirestoreError(error, OperationType.GET, this.path, false);
        this.errorListeners.forEach((errCb) => {
          try {
            errCb(error);
          } catch (e) {
            console.error(`Error in error callback for ${listenerTag}:`, e);
          }
        });
      }
    );
  }

  public getCached(): T | null {
    if (this.cachedData !== null) {
      diagnostics.logCacheHit(this.path, 'SubscriptionManager.getCachedSync');
    }
    return this.cachedData;
  }

  public hasData(): boolean {
    return this.hasLoaded;
  }
}

// 1. Initialize collections with default seed data if completely empty
export async function initCollectionsIfEmpty() {
  // Automatic background writes inside useEffect/mount are disabled per instructions
  // All initializations or resets must be triggered strictly by explicit user action.
  console.log('[Firestore Read] initCollectionsIfEmpty called - automatic background writes disabled.');
  return;
}

// Multiplexed Singletons for primary collections
const employeesManager = new SubscriptionManager<Employee[]>(
  EMPLOYEES_COLLECTION,
  false,
  (snapshot) => {
    const list: Employee[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as Employee);
    });
    list.sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
    return list;
  }
);

// Map of scoped task subscription managers (e.g. 'all' or by specific technician employeeId)
const tasksManagersMap = new Map<string, SubscriptionManager<Task[]>>();

export function getOrCreateTasksManager(employeeId?: string): SubscriptionManager<Task[]> {
  const key = employeeId ? `emp_${employeeId}` : 'all';
  let mgr = tasksManagersMap.get(key);
  if (!mgr) {
    mgr = new SubscriptionManager<Task[]>(
      TASKS_COLLECTION,
      false,
      (snapshot) => {
        const list: Task[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push(docSnap.data() as Task);
        });
        list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        return list;
      },
      key === 'all' ? 'futurex_tasks_cache' : `futurex_tasks_cache_${key}`,
      () => {
        if (employeeId) {
          return query(collection(db, TASKS_COLLECTION), where('employeeId', '==', employeeId), limit(50));
        }
        return query(collection(db, TASKS_COLLECTION), limit(50));
      },
      employeeId ? `where('employeeId', '==', '${employeeId}'), limit(50)` : 'limit(50)'
    );
    tasksManagersMap.set(key, mgr);
  }
  return mgr;
}

const tasksManager = getOrCreateTasksManager();

/**
 * On-demand task fetcher with strict limit (default: 50) and local caching.
 * Transforms large collection reading from continuous onSnapshot to on-demand getDocs,
 * drastically reducing Firestore read consumption for Owner / Manager dashboards.
 */
export async function getTasks(
  forceRefresh: boolean = false, 
  limitCount: number = 50, 
  employeeId?: string
): Promise<Task[]> {
  const cacheKey = employeeId ? `futurex_tasks_cache_${employeeId}` : 'futurex_tasks_cache';
  const syncKey = employeeId ? `futurex_tasks_sync_${employeeId}` : 'futurex_tasks_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<Task[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(TASKS_COLLECTION, `getTasks (Local Cache Hit${employeeId ? ` emp=${employeeId}` : ''})`);
      return cached.data;
    }
  }

  const docPath = TASKS_COLLECTION;
  try {
    const q = employeeId
      ? query(collection(db, TASKS_COLLECTION), where('employeeId', '==', employeeId), limit(limitCount))
      : query(collection(db, TASKS_COLLECTION), limit(limitCount));

    const snap = await getDocs(q as any);
    diagnostics.logRead(TASKS_COLLECTION, 'getTasks', snap.size, `جلب المهام عند الطلب بحد أقصى ${limitCount}${employeeId ? ` للموظف (${employeeId})` : ' (حساب المالك/المدير)'}`);
    const list: Task[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as Task);
    });
    list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<Task[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

const settingsManager = new SubscriptionManager<any>(
  `${SETTINGS_COLLECTION}/credentials`,
  true,
  (snapshot) => (snapshot.exists() ? snapshot.data() : null)
);

const taskTypesManager = new SubscriptionManager<DbTaskType[]>(
  'task_types',
  false,
  (snapshot) => {
    const list: DbTaskType[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as DbTaskType);
    });
    list.sort((a, b) => (a.order || 0) - (b.order || 0));
    return list;
  }
);

const pointsRulesManager = new SubscriptionManager<PointsRules>(
  'settings/points_rules',
  true,
  (snapshot) => (snapshot.exists() ? (snapshot.data() as PointsRules) : DEFAULT_POINTS_RULES)
);

// 2. Real-time Subscription - Employees (Multiplexed)
export function subscribeEmployees(onUpdate: (employees: Employee[]) => void, onError: (err: any) => void) {
  return employeesManager.subscribe(onUpdate, onError);
}

// 3. Real-time Subscription - Tasks (Multiplexed & Scoped by where condition)
export function subscribeTasks(
  onUpdate: (tasks: Task[]) => void, 
  onError: (err: any) => void,
  employeeId?: string
) {
  const mgr = getOrCreateTasksManager(employeeId);
  return mgr.subscribe(onUpdate, onError);
}

// 4. Real-time Subscription - Settings (Multiplexed)
export function subscribeSettings(onUpdate: (settings: any) => void, onError: (err: any) => void) {
  return settingsManager.subscribe(onUpdate, onError);
}

// 4b. Real-time Subscription - Task Types (Multiplexed)
export function subscribeTaskTypes(onUpdate: (taskTypes: DbTaskType[]) => void, onError: (err: any) => void) {
  return taskTypesManager.subscribe(onUpdate, onError);
}

// 4c. Real-time Subscription - Points Rules (Multiplexed)
export function subscribePointsRules(onUpdate: (rules: PointsRules) => void, onError: (err: any) => void) {
  return pointsRulesManager.subscribe(onUpdate, onError);
}

// Synchronous memory cache accessors for employees, users, and tasks
export function getEmployeesCachedSync(): Employee[] {
  return employeesManager.getCached() || [];
}

export function getUsersCachedSync(): SystemUser[] {
  return usersManager.getCached() || [];
}

export function getTasksCachedSync(): Task[] {
  return tasksManager.getCached() || [];
}

// In-memory & fallback cache for subscriber phone lookups
const subscriberPhoneLookupCache = new Map<string, {
  employee?: Employee;
  task?: Task;
  subscriberName?: string;
  subscriberPhone?: string;
  found: boolean;
  timestamp: number;
}>();

/**
 * Searches for a subscriber or employee by phone number.
 * 1. Checks in-memory employees and tasks from SharedDataContext / SubscriptionManager (0 Firestore Reads).
 * 2. If not in memory, checks local negative/positive lookup cache (0 Firestore Reads).
 * 3. Only if completely unknown and full phone, performs a single Firestore fallback read and caches the result forever in memory.
 */
export async function findSubscriberOrEmployeeByPhone(
  phone: string,
  localEmployees?: Employee[],
  localTasks?: Task[]
): Promise<{ employee?: Employee; task?: Task; subscriberName?: string; subscriberPhone?: string } | null> {
  const cleanPhone = (phone || '').replace(/[\s\-\(\)\+]/g, '').trim();
  if (!cleanPhone || cleanPhone.length < 3) return null;

  // 1. Search in localEmployees (Memory / SharedDataContext)
  const emps = localEmployees && localEmployees.length > 0 ? localEmployees : getEmployeesCachedSync();
  const matchedEmp = emps.find(e => {
    const p = (e.phone || '').replace(/[\s\-\(\)\+]/g, '').trim();
    return p && (p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p));
  });

  // 2. Search in localTasks (Memory / SharedDataContext)
  const ts = localTasks && localTasks.length > 0 ? localTasks : getTasksCachedSync();
  const matchedTask = ts.slice().reverse().find(t => {
    const p = (t.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
    return p && (p === cleanPhone || p.endsWith(cleanPhone) || cleanPhone.endsWith(p));
  });

  if (matchedEmp || matchedTask) {
    // Found locally in memory with 0 Firestore Reads!
    diagnostics.logCacheHit('customers', 'findSubscriberOrEmployeeByPhone.inMemory', `phone=${cleanPhone}`);
    const result = {
      employee: matchedEmp,
      task: matchedTask,
      subscriberName: matchedTask?.subscriberName || matchedEmp?.name,
      subscriberPhone: matchedTask?.subscriberPhone || matchedEmp?.phone || cleanPhone
    };
    subscriberPhoneLookupCache.set(cleanPhone, { ...result, found: true, timestamp: Date.now() });
    return result;
  }

  // 3. Check local lookup cache before touching Firestore
  const cachedLookup = subscriberPhoneLookupCache.get(cleanPhone);
  if (cachedLookup) {
    diagnostics.logCacheHit('customers', 'findSubscriberOrEmployeeByPhone.localCache', `phone=${cleanPhone}`);
    if (!cachedLookup.found) return null;
    return {
      employee: cachedLookup.employee,
      task: cachedLookup.task,
      subscriberName: cachedLookup.subscriberName,
      subscriberPhone: cachedLookup.subscriberPhone
    };
  }

  // Avoid network read for partial / short phone inputs (< 8 digits)
  if (cleanPhone.length < 8) {
    return null;
  }

  // 4. Single Firestore fallback (only if not found in memory and never queried before)
  try {
    diagnostics.logRead('employees', 'findSubscriberOrEmployeeByPhone', 1, 'بحث احتياطي لمرة واحدة بالهاتف', `phone=${cleanPhone}`);
    const q = query(collection(db, EMPLOYEES_COLLECTION), where('phone', '==', cleanPhone));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const empData = snap.docs[0].data() as Employee;
      const result = { employee: empData, subscriberName: empData.name, subscriberPhone: empData.phone || cleanPhone };
      subscriberPhoneLookupCache.set(cleanPhone, { ...result, found: true, timestamp: Date.now() });
      return result;
    }

    diagnostics.logRead('tasks', 'findSubscriberOrEmployeeByPhone', 1, 'بحث احتياطي لمرة واحدة بالهاتف', `phone=${cleanPhone}`);
    const tq = query(collection(db, TASKS_COLLECTION), where('subscriberPhone', '==', cleanPhone));
    const tSnap = await getDocs(tq);
    if (!tSnap.empty) {
      const taskData = tSnap.docs[0].data() as Task;
      const result = { task: taskData, subscriberName: taskData.subscriberName, subscriberPhone: taskData.subscriberPhone || cleanPhone };
      subscriberPhoneLookupCache.set(cleanPhone, { ...result, found: true, timestamp: Date.now() });
      return result;
    }

    // Cache negative lookup so subsequent typing/submitting will NOT trigger Firestore
    subscriberPhoneLookupCache.set(cleanPhone, { found: false, timestamp: Date.now() });
    return null;
  } catch (err) {
    console.warn('Fallback subscriber lookup error:', err);
    subscriberPhoneLookupCache.set(cleanPhone, { found: false, timestamp: Date.now() });
    return null;
  }
}


// Save Task Type
export async function saveTaskType(taskType: DbTaskType) {
  const docPath = `task_types/${taskType.id}`;
  try {
    diagnostics.logWrite('task_types', 'saveTaskType', 'dbService.saveTaskType', `id=${taskType.id}`);
    const docRef = doc(db, 'task_types', taskType.id);
    await setDoc(docRef, taskType);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// Delete or Soft Delete Task Type based on usage in existing tasks
export async function deleteTaskType(taskType: DbTaskType, tasks: Task[]) {
  const isUsed = tasks.some(t => t.taskType === taskType.name);
  if (isUsed) {
    // Soft delete / archive: set status to 'disabled'
    await saveTaskType({
      ...taskType,
      status: 'disabled'
    });
  } else {
    // Hard delete
    const docPath = `task_types/${taskType.id}`;
    try {
      diagnostics.logWrite('task_types', 'deleteTaskType', 'dbService.deleteTaskType', `id=${taskType.id}`);
      const docRef = doc(db, 'task_types', taskType.id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  }
}

// Save Points Rules
export async function savePointsRules(rules: PointsRules) {
  const docPath = 'settings/points_rules';
  try {
    diagnostics.logWrite('settings/points_rules', 'savePointsRules', 'dbService.savePointsRules');
    const docRef = doc(db, 'settings', 'points_rules');
    await setDoc(docRef, rules);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}


// 5. Save Employee (Create or Edit)
export async function saveEmployee(employee: Employee) {
  const docPath = `${EMPLOYEES_COLLECTION}/${employee.id}`;
  try {
    diagnostics.logWrite('employees', 'saveEmployee', 'dbService.saveEmployee', `id=${employee.id}`);
    const docRef = doc(db, EMPLOYEES_COLLECTION, employee.id);
    await setDoc(docRef, employee);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// 6. Delete Employee
export async function deleteEmployee(id: string) {
  const docPath = `${EMPLOYEES_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite('employees', 'deleteEmployee', 'dbService.deleteEmployee', `id=${id}`);
    const docRef = doc(db, EMPLOYEES_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// 7. Save Task (Start, Pause, Resume, Finish, Edit)
export async function saveTask(task: Task) {
  const docPath = `${TASKS_COLLECTION}/${task.id}`;
  try {
    diagnostics.logWrite('tasks', 'saveTask', 'dbService.saveTask', `id=${task.id}, status=${task.status}`);
    const docRef = doc(db, TASKS_COLLECTION, task.id);
    await setDoc(docRef, task);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// 8. Delete Task
export async function deleteTask(id: string) {
  const docPath = `${TASKS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite('tasks', 'deleteTask', 'dbService.deleteTask', `id=${id}`);
    const docRef = doc(db, TASKS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// 9. Save Settings (Credentials)
export async function saveSettings(settings: any) {
  const docPath = `${SETTINGS_COLLECTION}/credentials`;
  try {
    diagnostics.logWrite('settings/credentials', 'saveSettings', 'dbService.saveSettings');
    const docRef = doc(db, SETTINGS_COLLECTION, 'credentials');
    await setDoc(docRef, settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Safe localStorage cache helpers
function getLocalCache<T>(key: string, lastSyncKey: string): { data: T | null; isFresh: boolean; lastSync: number | null } {
  try {
    const rawData = localStorage.getItem(key);
    const rawSync = localStorage.getItem(lastSyncKey);
    if (!rawData) return { data: null, isFresh: false, lastSync: null };
    const data = JSON.parse(rawData) as T;
    const lastSync = rawSync ? Number(rawSync) : null;
    const isFresh = lastSync !== null && (Date.now() - lastSync) < CACHE_TTL_MS;
    return { data, isFresh, lastSync };
  } catch (e) {
    console.warn(`Error reading localStorage key ${key}:`, e);
    return { data: null, isFresh: false, lastSync: null };
  }
}

function setLocalCache<T>(key: string, lastSyncKey: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(lastSyncKey, Date.now().toString());
  } catch (e) {
    console.warn(`Error writing to localStorage key ${key}:`, e);
  }
}

const manualPointsManager = new SubscriptionManager<ManualPointsRecord[]>(
  MANUAL_POINTS_COLLECTION,
  false,
  (snapshot) => {
    const list: ManualPointsRecord[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as ManualPointsRecord);
    });
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  },
  'futurex_manual_points_cache'
);

// 9b. Real-time Subscription - Manual Points History (Multiplexed)
export function subscribeManualPoints(onUpdate: (records: ManualPointsRecord[]) => void, onError: (err: any) => void) {
  return manualPointsManager.subscribe(onUpdate, onError);
}

// On-demand cached getter for manual points (Lazy load with 24h cache)
export async function getManualPoints(forceRefresh: boolean = false): Promise<ManualPointsRecord[]> {
  const cacheKey = 'futurex_manual_points_cache';
  const syncKey = 'futurex_manual_points_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<ManualPointsRecord[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(MANUAL_POINTS_COLLECTION, 'getManualPoints (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = MANUAL_POINTS_COLLECTION;
  try {
    const snap = await getDocs(collection(db, MANUAL_POINTS_COLLECTION));
    diagnostics.logRead(MANUAL_POINTS_COLLECTION, 'getManualPoints', snap.size, 'جلب سجل النقاط اليدوي بناءً على طلب واجهة النقاط أو انتهاء صلاحية الكاش');
    const list: ManualPointsRecord[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as ManualPointsRecord);
    });
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<ManualPointsRecord[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getManualPointsCachedSync(): ManualPointsRecord[] {
  const cached = getLocalCache<ManualPointsRecord[]>('futurex_manual_points_cache', 'futurex_manual_points_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(MANUAL_POINTS_COLLECTION, 'getManualPointsCachedSync');
  }
  return cached.data || [];
}

// 9c. Save Manual Point Entry
export async function saveManualPoint(record: ManualPointsRecord) {
  const docPath = `${MANUAL_POINTS_COLLECTION}/${record.id}`;
  try {
    diagnostics.logWrite(MANUAL_POINTS_COLLECTION, 'saveManualPoint', 'dbService.saveManualPoint', `id=${record.id}`);
    const docRef = doc(db, MANUAL_POINTS_COLLECTION, record.id);
    await setDoc(docRef, record);

    // Update local cache
    const current = getManualPointsCachedSync();
    const idx = current.findIndex(p => p.id === record.id);
    const updated = idx >= 0
      ? current.map(p => p.id === record.id ? record : p)
      : [record, ...current];
    updated.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setLocalCache('futurex_manual_points_cache', 'futurex_manual_points_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// 9d. Delete Manual Point Entry
export async function deleteManualPoint(id: string) {
  const docPath = `${MANUAL_POINTS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(MANUAL_POINTS_COLLECTION, 'deleteManualPoint', 'dbService.deleteManualPoint', `id=${id}`);
    const docRef = doc(db, MANUAL_POINTS_COLLECTION, id);
    await deleteDoc(docRef);

    // Update local cache
    const current = getManualPointsCachedSync();
    const updated = current.filter(p => p.id !== id);
    setLocalCache('futurex_manual_points_cache', 'futurex_manual_points_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

const financialAdjustmentsManager = new SubscriptionManager<FinancialAdjustment[]>(
  FINANCIAL_ADJUSTMENTS_COLLECTION,
  false,
  (snapshot) => {
    const list: FinancialAdjustment[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as FinancialAdjustment);
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  },
  'futurex_financial_adjustments_cache'
);

// 9d-2. Real-time Subscription - Financial Adjustments (Multiplexed)
export function subscribeFinancialAdjustments(onUpdate: (records: FinancialAdjustment[]) => void, onError: (err: any) => void) {
  return financialAdjustmentsManager.subscribe(onUpdate, onError);
}

// On-demand cached getter for financial adjustments (Lazy load with 24h cache)
export async function getFinancialAdjustments(forceRefresh: boolean = false): Promise<FinancialAdjustment[]> {
  const cacheKey = 'futurex_financial_adjustments_cache';
  const syncKey = 'futurex_financial_adjustments_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<FinancialAdjustment[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(FINANCIAL_ADJUSTMENTS_COLLECTION, 'getFinancialAdjustments (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = FINANCIAL_ADJUSTMENTS_COLLECTION;
  try {
    const snap = await getDocs(collection(db, FINANCIAL_ADJUSTMENTS_COLLECTION));
    diagnostics.logRead(FINANCIAL_ADJUSTMENTS_COLLECTION, 'getFinancialAdjustments', snap.size, 'جلب التعديلات المالية للراتب بناءً على فتح الواجهة أو انتهاء صلاحية الكاش');
    const list: FinancialAdjustment[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as FinancialAdjustment);
    });
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<FinancialAdjustment[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getFinancialAdjustmentsCachedSync(): FinancialAdjustment[] {
  const cached = getLocalCache<FinancialAdjustment[]>('futurex_financial_adjustments_cache', 'futurex_financial_adjustments_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(FINANCIAL_ADJUSTMENTS_COLLECTION, 'getFinancialAdjustmentsCachedSync');
  }
  return cached.data || [];
}

// 9d-3. Save Financial Adjustment Entry
export async function saveFinancialAdjustment(record: FinancialAdjustment) {
  const docPath = `${FINANCIAL_ADJUSTMENTS_COLLECTION}/${record.id}`;
  try {
    diagnostics.logWrite(FINANCIAL_ADJUSTMENTS_COLLECTION, 'saveFinancialAdjustment', 'dbService.saveFinancialAdjustment', `id=${record.id}`);
    const docRef = doc(db, FINANCIAL_ADJUSTMENTS_COLLECTION, record.id);
    await setDoc(docRef, record);

    // Update local cache
    const current = getFinancialAdjustmentsCachedSync();
    const idx = current.findIndex(f => f.id === record.id);
    const updated = idx >= 0
      ? current.map(f => f.id === record.id ? record : f)
      : [record, ...current];
    updated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setLocalCache('futurex_financial_adjustments_cache', 'futurex_financial_adjustments_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// 9d-4. Delete Financial Adjustment Entry
export async function deleteFinancialAdjustment(id: string) {
  const docPath = `${FINANCIAL_ADJUSTMENTS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(FINANCIAL_ADJUSTMENTS_COLLECTION, 'deleteFinancialAdjustment', 'dbService.deleteFinancialAdjustment', `id=${id}`);
    const docRef = doc(db, FINANCIAL_ADJUSTMENTS_COLLECTION, id);
    await deleteDoc(docRef);

    // Update local cache
    const current = getFinancialAdjustmentsCachedSync();
    const updated = current.filter(f => f.id !== id);
    setLocalCache('futurex_financial_adjustments_cache', 'futurex_financial_adjustments_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

const usersManager = new SubscriptionManager<SystemUser[]>(
  'users',
  false,
  (snapshot) => {
    const list: SystemUser[] = [];
    snapshot.forEach((docSnap: any) => {
      const u = docSnap.data() as any;
      if (u.role === 'admin') {
        u.role = 'manager';
      }
      if (u.role === 'employee') {
        u.role = 'technician';
      }
      if (u.role === 'owner' || u.role === 'supervisor' || u.role === 'manager' || u.role === 'technician' || u.role === 'accountant') {
        list.push(u as SystemUser);
      }
    });
    list.sort((a, b) => a.username.localeCompare(b.username));
    return list;
  },
  'futurex_users_cache'
);

// Direct on-demand fetch of users from Firestore (for login fallback)
export async function getUsersDirect(): Promise<SystemUser[]> {
  try {
    diagnostics.logRead('users', 'getUsersDirect', 1, 'استعلام فوري للحسابات عند تسجيل الدخول');
    const snap = await getDocs(collection(db, 'users'));
    const list: SystemUser[] = [];
    snap.forEach((docSnap: any) => {
      const u = docSnap.data() as any;
      if (u.role === 'admin') u.role = 'manager';
      if (u.role === 'employee') u.role = 'technician';
      list.push(u as SystemUser);
    });
    return list;
  } catch (err) {
    console.warn('getUsersDirect warning:', err);
    return [];
  }
}

// 9e. Real-time Subscription - System Users (Multiplexed)
export function subscribeUsers(onUpdate: (users: SystemUser[]) => void, onError: (err: any) => void) {
  return usersManager.subscribe(onUpdate, onError);
}

// 9f. Save User
export async function saveUser(user: SystemUser) {
  const docPath = `users/${user.id}`;
  try {
    diagnostics.logWrite('users', 'saveUser', 'dbService.saveUser', `id=${user.id}`);
    const docRef = doc(db, 'users', user.id);
    await setDoc(docRef, user);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// Update User Login Metadata
export async function updateUserLoginMetadata(userId: string, lastDevice: string, lastLogin: string, sessionKey: string) {
  try {
    diagnostics.logWrite('users', 'updateUserLoginMetadata', 'dbService.updateUserLoginMetadata', `id=${userId}`);
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, {
      lastDevice,
      lastLogin,
      sessionKey
    }, { merge: true });
  } catch (err) {
    console.error('Error updating user login metadata:', err);
  }
}

// 9g. Delete User
export async function deleteUser(id: string) {
  const docPath = `users/${id}`;
  try {
    diagnostics.logWrite('users', 'deleteUser', 'dbService.deleteUser', `id=${id}`);
    const docRef = doc(db, 'users', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// 10. Update Leaderboard Rankings (Permanent save of Day, Week, Month rankings)
export async function updateLeaderboardRankings(employees: Employee[], tasks: Task[], manualPoints?: ManualPointsRecord[]) {
  // Rankings are calculated purely on-the-fly from tasks and employees cache (0 Firestore Writes & 0 Reads).
  // Kept as an async helper for full backward compatibility without triggering network I/O.
  return Promise.resolve();
}

// 11. Reset to Demo Seed data
export async function resetDatabaseToDemo() {
  try {
    const batch = writeBatch(db);

    // Clear existing employees
    let empSnapshot;
    try {
      empSnapshot = await getDocs(collection(db, EMPLOYEES_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, EMPLOYEES_COLLECTION);
      return;
    }
    empSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Clear existing tasks
    let taskSnapshot;
    try {
      taskSnapshot = await getDocs(collection(db, TASKS_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, TASKS_COLLECTION);
      return;
    }
    taskSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Clear manual points history
    let manualSnapshot;
    try {
      manualSnapshot = await getDocs(collection(db, MANUAL_POINTS_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, MANUAL_POINTS_COLLECTION);
      return;
    }
    manualSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Write new seed employees
    for (const emp of SEED_EMPLOYEES) {
      const empRef = doc(db, EMPLOYEES_COLLECTION, emp.id);
      batch.set(empRef, emp);
    }

    // Write new seed tasks
    for (const task of SEED_TASKS) {
      const taskRef = doc(db, TASKS_COLLECTION, task.id);
      batch.set(taskRef, task);
    }

    // Write default credentials
    const settingsRef = doc(db, SETTINGS_COLLECTION, 'credentials');
    batch.set(settingsRef, {
      adminUsername: 'admin',
      adminPassword: 'admin123',
      viewerUsername: 'viewer',
      viewerPassword: 'viewer123'
    });

    // Clear existing task types in batch
    let taskTypesSnap = await getDocs(collection(db, 'task_types'));
    taskTypesSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Set default task types in batch
    for (const tt of DEFAULT_TASK_TYPES) {
      const ttRef = doc(db, 'task_types', tt.id);
      batch.set(ttRef, tt);
    }

    // Set default points rules in settings collection
    const pointsRulesRef = doc(db, 'settings', 'points_rules');
    batch.set(pointsRulesRef, DEFAULT_POINTS_RULES);

    // Clear existing users
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });
    } catch (err) {
      console.error('Error clearing users in reset:', err);
    }

    // Write default users
    const defaultUsersList: SystemUser[] = [
      { id: 'u-1', username: 'owner', password: 'owner123', role: 'owner', status: 'active' },
      { id: 'u-2', username: 'hi1212', password: '202026', role: 'manager', status: 'active' }
    ];
    for (const u of defaultUsersList) {
      const uRef = doc(db, 'users', u.id);
      batch.set(uRef, u);
    }

    try {
      console.log(`[Firestore Write Log] File: dbService.ts | Function: resetDatabaseToDemo | Collection: multiple | Reason: إعادة ضبط واستعادة البيانات التجريبية بناءً على ضغط زر المستخدم الصريح`);
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'batch/reset');
    }
    
    // Update rankings
    await updateLeaderboardRankings(SEED_EMPLOYEES, SEED_TASKS);
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}

// 12. Wipe all database records completely
export async function wipeDatabase() {
  try {
    const batch = writeBatch(db);

    let empSnapshot;
    try {
      empSnapshot = await getDocs(collection(db, EMPLOYEES_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, EMPLOYEES_COLLECTION);
      return;
    }
    empSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    let taskSnapshot;
    try {
      taskSnapshot = await getDocs(collection(db, TASKS_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, TASKS_COLLECTION);
      return;
    }
    taskSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    let manualSnapshot;
    try {
      manualSnapshot = await getDocs(collection(db, MANUAL_POINTS_COLLECTION));
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, MANUAL_POINTS_COLLECTION);
      return;
    }
    manualSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Clear rankings
    const dayRef = doc(db, LEADERBOARD_COLLECTION, 'day');
    const weekRef = doc(db, LEADERBOARD_COLLECTION, 'week');
    const monthRef = doc(db, LEADERBOARD_COLLECTION, 'month');
    batch.delete(dayRef);
    batch.delete(weekRef);
    batch.delete(monthRef);

    // Clear users & seed default users
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });
    } catch (err) {
      console.error('Error clearing users in wipe:', err);
    }

    const defaultUsersList: SystemUser[] = [
      { id: 'u-1', username: 'owner', password: 'owner123', role: 'owner', status: 'active' },
      { id: 'u-2', username: 'hi1212', password: '202026', role: 'manager', status: 'active' }
    ];
    for (const u of defaultUsersList) {
      const uRef = doc(db, 'users', u.id);
      batch.set(uRef, u);
    }

    try {
      console.log(`[Firestore Write Log] File: dbService.ts | Function: wipeDatabase | Collection: multiple | Reason: تفريغ ومسح جميع البيانات بناءً على ضغط زر المستخدم الصريح`);
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'batch/wipe');
    }
  } catch (error) {
    console.error('Error wiping database:', error);
    throw error;
  }
}

/* ==========================================================================
   Phase 7A - Database Integration Services
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. ATTENDANCE RECORDS (attendance_records)
// --------------------------------------------------------------------------

// Map of scoped attendance subscription managers (e.g. 'all' or specific employeeId)
const attendanceManagersMap = new Map<string, SubscriptionManager<AttendanceRecord[]>>();

export function getOrCreateAttendanceManager(employeeId?: string): SubscriptionManager<AttendanceRecord[]> {
  const key = employeeId ? `emp_${employeeId}` : 'all';
  let mgr = attendanceManagersMap.get(key);
  if (!mgr) {
    mgr = new SubscriptionManager<AttendanceRecord[]>(
      ATTENDANCE_COLLECTION,
      false,
      (snapshot) => {
        const list: AttendanceRecord[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push(docSnap.data() as AttendanceRecord);
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return list;
      },
      key === 'all' ? 'futurex_attendance_records_cache' : `futurex_attendance_cache_${key}`,
      () => {
        if (employeeId) {
          return query(collection(db, ATTENDANCE_COLLECTION), where('employeeId', '==', employeeId), limit(50));
        }
        return query(collection(db, ATTENDANCE_COLLECTION), limit(50));
      },
      employeeId ? `where('employeeId', '==', '${employeeId}'), limit(50)` : 'limit(50)'
    );
    attendanceManagersMap.set(key, mgr);
  }
  return mgr;
}

const attendanceRecordsManager = getOrCreateAttendanceManager();

export function subscribeAttendanceRecords(
  onUpdate: (records: AttendanceRecord[]) => void,
  onError: (err: any) => void,
  employeeId?: string
) {
  const mgr = getOrCreateAttendanceManager(employeeId);
  return mgr.subscribe(onUpdate, onError);
}

export async function getAttendanceRecords(
  forceRefresh: boolean = false, 
  employeeId?: string,
  limitCount: number = 50
): Promise<AttendanceRecord[]> {
  const cacheKey = employeeId ? `futurex_attendance_cache_${employeeId}` : 'futurex_attendance_records_cache';
  const syncKey = employeeId ? `futurex_attendance_sync_${employeeId}` : 'futurex_attendance_records_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<AttendanceRecord[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(ATTENDANCE_COLLECTION, `getAttendanceRecords (Local Cache Hit${employeeId ? ` emp=${employeeId}` : ''})`);
      return cached.data;
    }
  }

  const docPath = ATTENDANCE_COLLECTION;
  try {
    const q = employeeId
      ? query(collection(db, ATTENDANCE_COLLECTION), where('employeeId', '==', employeeId), limit(limitCount))
      : query(collection(db, ATTENDANCE_COLLECTION), limit(limitCount));
    const snap = await getDocs(q as any);
    diagnostics.logRead(ATTENDANCE_COLLECTION, 'getAttendanceRecords', snap.size, `جلب سجلات الحضور بحد أقصى ${limitCount}${employeeId ? ` بشرط المعرف (${employeeId})` : ' (حساب المالك/المدير)'}`);
    const list: AttendanceRecord[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as AttendanceRecord);
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<AttendanceRecord[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getAttendanceRecordsCachedSync(): AttendanceRecord[] {
  const cached = getLocalCache<AttendanceRecord[]>('futurex_attendance_records_cache', 'futurex_attendance_records_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(ATTENDANCE_COLLECTION, 'getAttendanceRecordsCachedSync');
  }
  return cached.data || [];
}

export async function getAttendanceRecordById(id: string): Promise<AttendanceRecord | null> {
  const docPath = `${ATTENDANCE_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(ATTENDANCE_COLLECTION, 'getAttendanceRecordById', 1, 'جلب سجل حضور بالمعرف', `id=${id}`);
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as AttendanceRecord;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    return null;
  }
}

export async function createAttendanceRecord(record: AttendanceRecord): Promise<void> {
  const docPath = `${ATTENDANCE_COLLECTION}/${record.id}`;
  try {
    diagnostics.logWrite(ATTENDANCE_COLLECTION, 'createAttendanceRecord', 'dbService.createAttendanceRecord', `id=${record.id}`);
    const docRef = doc(db, ATTENDANCE_COLLECTION, record.id);
    await setDoc(docRef, record);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function updateAttendanceRecord(id: string, updates: Partial<AttendanceRecord>): Promise<void> {
  const docPath = `${ATTENDANCE_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(ATTENDANCE_COLLECTION, 'updateAttendanceRecord', 'dbService.updateAttendanceRecord', `id=${id}`);
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    await updateDoc(docRef, updates as any);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function softDeleteAttendanceRecord(id: string, deletedBy?: string, reason?: string): Promise<void> {
  const docPath = `${ATTENDANCE_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(ATTENDANCE_COLLECTION, 'softDeleteAttendanceRecord', 'dbService.softDeleteAttendanceRecord', `id=${id}`);
    const docRef = doc(db, ATTENDANCE_COLLECTION, id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || null,
      deletionReason: reason || null,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// --------------------------------------------------------------------------
// 2. OVERTIME RECORDS (overtime_records)
// --------------------------------------------------------------------------

// Map of scoped overtime subscription managers (e.g. 'all' or specific employeeId)
const overtimeManagersMap = new Map<string, SubscriptionManager<OvertimeRecord[]>>();

export function getOrCreateOvertimeManager(employeeId?: string): SubscriptionManager<OvertimeRecord[]> {
  const key = employeeId ? `emp_${employeeId}` : 'all';
  let mgr = overtimeManagersMap.get(key);
  if (!mgr) {
    mgr = new SubscriptionManager<OvertimeRecord[]>(
      OVERTIME_COLLECTION,
      false,
      (snapshot) => {
        const list: OvertimeRecord[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push(docSnap.data() as OvertimeRecord);
        });
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return list;
      },
      key === 'all' ? 'futurex_overtime_records_cache' : `futurex_overtime_cache_${key}`,
      () => {
        if (employeeId) {
          return query(collection(db, OVERTIME_COLLECTION), where('employeeId', '==', employeeId), limit(50));
        }
        return query(collection(db, OVERTIME_COLLECTION), limit(50));
      },
      employeeId ? `where('employeeId', '==', '${employeeId}'), limit(50)` : 'limit(50)'
    );
    overtimeManagersMap.set(key, mgr);
  }
  return mgr;
}

const overtimeRecordsManager = getOrCreateOvertimeManager();

export function subscribeOvertimeRecords(
  onUpdate: (records: OvertimeRecord[]) => void,
  onError: (err: any) => void,
  employeeId?: string
) {
  const mgr = getOrCreateOvertimeManager(employeeId);
  return mgr.subscribe(onUpdate, onError);
}

export async function getOvertimeRecords(forceRefresh: boolean = false): Promise<OvertimeRecord[]> {
  const cacheKey = 'futurex_overtime_records_cache';
  const syncKey = 'futurex_overtime_records_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<OvertimeRecord[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(OVERTIME_COLLECTION, 'getOvertimeRecords (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = OVERTIME_COLLECTION;
  try {
    const snap = await getDocs(collection(db, OVERTIME_COLLECTION));
    diagnostics.logRead(OVERTIME_COLLECTION, 'getOvertimeRecords', snap.size, 'جلب سجلات الإضافي بطلب صريح أو انتهاء الكاش');
    const list: OvertimeRecord[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as OvertimeRecord);
    });
    list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<OvertimeRecord[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getOvertimeRecordsCachedSync(): OvertimeRecord[] {
  const cached = getLocalCache<OvertimeRecord[]>('futurex_overtime_records_cache', 'futurex_overtime_records_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(OVERTIME_COLLECTION, 'getOvertimeRecordsCachedSync');
  }
  return cached.data || [];
}

export async function getOvertimeRecordById(id: string): Promise<OvertimeRecord | null> {
  const docPath = `${OVERTIME_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(OVERTIME_COLLECTION, 'getOvertimeRecordById', 1, 'جلب سجل عمل إضافي بالمعرف', `id=${id}`);
    const docRef = doc(db, OVERTIME_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as OvertimeRecord;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    return null;
  }
}

export async function createOvertimeRecord(record: OvertimeRecord): Promise<void> {
  const docPath = `${OVERTIME_COLLECTION}/${record.id}`;
  try {
    diagnostics.logWrite(OVERTIME_COLLECTION, 'createOvertimeRecord', 'dbService.createOvertimeRecord', `id=${record.id}`);
    const docRef = doc(db, OVERTIME_COLLECTION, record.id);
    await setDoc(docRef, record);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function updateOvertimeRecord(id: string, updates: Partial<OvertimeRecord>): Promise<void> {
  const docPath = `${OVERTIME_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(OVERTIME_COLLECTION, 'updateOvertimeRecord', 'dbService.updateOvertimeRecord', `id=${id}`);
    const docRef = doc(db, OVERTIME_COLLECTION, id);
    await updateDoc(docRef, updates as any);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function softDeleteOvertimeRecord(id: string, deletedBy?: string, reason?: string, force: boolean = true): Promise<void> {
  const docPath = `${OVERTIME_COLLECTION}/${id}`;
  try {
    const record = await getOvertimeRecordById(id);
    if (!record) {
      throw new Error(`Overtime record ${id} not found`);
    }
    if (!force && record.status !== 'pending') {
      throw new Error(`Cannot delete overtime record because status is not pending. Current status: ${record.status}`);
    }
    diagnostics.logWrite(OVERTIME_COLLECTION, 'softDeleteOvertimeRecord', 'dbService.softDeleteOvertimeRecord', `id=${id}`);
    const docRef = doc(db, OVERTIME_COLLECTION, id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || null,
      deletionReason: reason || null,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// --------------------------------------------------------------------------
// 3. LEAVE REQUESTS (leave_requests)
// --------------------------------------------------------------------------

// Map of scoped leave requests subscription managers (e.g. 'all' or specific employeeId)
const leaveRequestsManagersMap = new Map<string, SubscriptionManager<LeaveRequest[]>>();

export function getOrCreateLeaveRequestsManager(employeeId?: string): SubscriptionManager<LeaveRequest[]>{
  const key = employeeId ? `emp_${employeeId}` : 'all';
  let mgr = leaveRequestsManagersMap.get(key);
  if (!mgr) {
    mgr = new SubscriptionManager<LeaveRequest[]>(
      LEAVE_REQUESTS_COLLECTION,
      false,
      (snapshot) => {
        const list: LeaveRequest[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push(docSnap.data() as LeaveRequest);
        });
        list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
        return list;
      },
      key === 'all' ? 'futurex_leave_requests_cache' : `futurex_leave_cache_${key}`,
      () => {
        if (employeeId) {
          return query(collection(db, LEAVE_REQUESTS_COLLECTION), where('employeeId', '==', employeeId), limit(50));
        }
        return query(collection(db, LEAVE_REQUESTS_COLLECTION), limit(50));
      },
      employeeId ? `where('employeeId', '==', '${employeeId}'), limit(50)` : 'limit(50)'
    );
    leaveRequestsManagersMap.set(key, mgr);
  }
  return mgr;
}

const leaveRequestsManager = getOrCreateLeaveRequestsManager();

export function subscribeLeaveRequests(
  onUpdate: (requests: LeaveRequest[]) => void,
  onError: (err: any) => void,
  employeeId?: string
) {
  const mgr = getOrCreateLeaveRequestsManager(employeeId);
  return mgr.subscribe(onUpdate, onError);
}

export async function getLeaveRequests(forceRefresh: boolean = false): Promise<LeaveRequest[]> {
  const cacheKey = 'futurex_leave_requests_cache';
  const syncKey = 'futurex_leave_requests_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<LeaveRequest[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(LEAVE_REQUESTS_COLLECTION, 'getLeaveRequests (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = LEAVE_REQUESTS_COLLECTION;
  try {
    const snap = await getDocs(collection(db, LEAVE_REQUESTS_COLLECTION));
    diagnostics.logRead(LEAVE_REQUESTS_COLLECTION, 'getLeaveRequests', snap.size, 'جلب طلبات الإجازات بطلب صريح أو انتهاء الكاش');
    const list: LeaveRequest[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as LeaveRequest);
    });
    list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<LeaveRequest[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getLeaveRequestsCachedSync(): LeaveRequest[] {
  const cached = getLocalCache<LeaveRequest[]>('futurex_leave_requests_cache', 'futurex_leave_requests_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(LEAVE_REQUESTS_COLLECTION, 'getLeaveRequestsCachedSync');
  }
  return cached.data || [];
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | null> {
  const docPath = `${LEAVE_REQUESTS_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(LEAVE_REQUESTS_COLLECTION, 'getLeaveRequestById', 1, 'جلب طلب إجازة بالمعرف', `id=${id}`);
    const docRef = doc(db, LEAVE_REQUESTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as LeaveRequest;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    return null;
  }
}

/**
 * Automatically syncs AttendanceRecord documents in Firestore for all days in an approved LeaveRequest.
 * Ensures employees with approved leaves immediately have attendance records set to 'leave_paid' or 'leave_unpaid'.
 */
export async function syncApprovedLeaveAttendanceRecords(leaveRequest: LeaveRequest): Promise<void> {
  if (leaveRequest.status !== 'approved') return;

  const { employeeId, employeeName, startDate, endDate, type, reason } = leaveRequest;
  if (!employeeId || !startDate || !endDate) return;

  const leaveStatus = type === 'unpaid' ? 'leave_unpaid' : 'leave_paid';

  const [sYear, sMonth, sDay] = startDate.split('-').map(Number);
  const [eYear, eMonth, eDay] = endDate.split('-').map(Number);
  if (!sYear || !sMonth || !sDay || !eYear || !eMonth || !eDay) return;

  const cur = new Date(sYear, sMonth - 1, sDay, 12, 0, 0);
  const end = new Date(eYear, eMonth - 1, eDay, 12, 0, 0);

  while (cur <= end) {
    const yr = cur.getFullYear();
    const mo = String(cur.getMonth() + 1).padStart(2, '0');
    const da = String(cur.getDate()).padStart(2, '0');
    const dateStr = `${yr}-${mo}-${da}`;

    try {
      const q = query(
        collection(db, ATTENDANCE_COLLECTION),
        where('employeeId', '==', employeeId),
        where('date', '==', dateStr)
      );
      const snap = await getDocs(q);
      let foundActive = false;

      for (const docSnap of snap.docs) {
        const rec = docSnap.data() as AttendanceRecord;
        if (!rec.isDeleted) {
          foundActive = true;
          await updateAttendanceRecord(rec.id, {
            status: leaveStatus,
            isAdjusted: true,
            adjustedBy: 'اعتماد إجازة',
            adjustmentReason: `إجازة معتمدة (${type === 'unpaid' ? 'بدون راتب' : 'مدفوعة الأجر'}): ${reason || ''}`,
            checkInTime: null,
            checkOutTime: null,
            lateMinutes: 0,
            earlyCheckoutMinutes: 0,
            notes: `إجازة معتمدة (${type === 'unpaid' ? 'بدون راتب' : 'مدفوعة الأجر'}): ${reason || ''}`,
          });
        }
      }

      if (!foundActive) {
        const newId = `att_leave_${employeeId}_${dateStr.replace(/-/g, '')}`;
        await setDoc(doc(db, ATTENDANCE_COLLECTION, newId), {
          id: newId,
          employeeId,
          employeeName: employeeName || 'الموظف',
          date: dateStr,
          status: leaveStatus,
          isAdjusted: true,
          adjustedBy: 'اعتماد إجازة',
          adjustmentReason: `إجازة معتمدة (${type === 'unpaid' ? 'بدون راتب' : 'مدفوعة الأجر'}): ${reason || ''}`,
          checkInTime: null,
          checkOutTime: null,
          lateMinutes: 0,
          earlyCheckoutMinutes: 0,
          notes: `إجازة معتمدة (${type === 'unpaid' ? 'بدون راتب' : 'مدفوعة الأجر'}): ${reason || ''}`,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`Error syncing attendance for approved leave on ${dateStr}:`, err);
    }

    cur.setDate(cur.getDate() + 1);
  }
}

export async function createLeaveRequest(request: LeaveRequest): Promise<void> {
  const docPath = `${LEAVE_REQUESTS_COLLECTION}/${request.id}`;
  try {
    diagnostics.logWrite(LEAVE_REQUESTS_COLLECTION, 'createLeaveRequest', 'dbService.createLeaveRequest', `id=${request.id}`);
    const docRef = doc(db, LEAVE_REQUESTS_COLLECTION, request.id);
    await setDoc(docRef, request);
    if (request.status === 'approved') {
      await syncApprovedLeaveAttendanceRecords(request);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function updateLeaveRequest(id: string, updates: Partial<LeaveRequest>): Promise<void> {
  const docPath = `${LEAVE_REQUESTS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(LEAVE_REQUESTS_COLLECTION, 'updateLeaveRequest', 'dbService.updateLeaveRequest', `id=${id}`);
    const docRef = doc(db, LEAVE_REQUESTS_COLLECTION, id);
    await updateDoc(docRef, updates as any);

    if (updates.status === 'approved') {
      const fullReq = await getLeaveRequestById(id);
      if (fullReq) {
        await syncApprovedLeaveAttendanceRecords({ ...fullReq, ...updates, status: 'approved' });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function softDeleteLeaveRequest(id: string, deletedBy?: string, reason?: string): Promise<void> {
  const docPath = `${LEAVE_REQUESTS_COLLECTION}/${id}`;
  try {
    const request = await getLeaveRequestById(id);
    if (!request) {
      throw new Error(`Leave request ${id} not found`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Cannot delete leave request because status is not pending. Current status: ${request.status}`);
    }
    diagnostics.logWrite(LEAVE_REQUESTS_COLLECTION, 'softDeleteLeaveRequest', 'dbService.softDeleteLeaveRequest', `id=${id}`);
    const docRef = doc(db, LEAVE_REQUESTS_COLLECTION, id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || null,
      deletionReason: reason || null,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// --------------------------------------------------------------------------
// 3.5 GRACE REQUESTS (grace_requests - طلبات سماحية التأخير والخروج المبكر)
// --------------------------------------------------------------------------

// Map of scoped grace requests subscription managers (e.g. 'all' or specific employeeId)
const graceRequestsManagersMap = new Map<string, SubscriptionManager<GraceRequest[]>>();

export function getOrCreateGraceRequestsManager(employeeId?: string): SubscriptionManager<GraceRequest[]> {
  const key = employeeId ? `emp_${employeeId}` : 'all';
  let mgr = graceRequestsManagersMap.get(key);
  if (!mgr) {
    mgr = new SubscriptionManager<GraceRequest[]>(
      GRACE_REQUESTS_COLLECTION,
      false,
      (snapshot) => {
        const list: GraceRequest[] = [];
        snapshot.forEach((docSnap: any) => {
          list.push(docSnap.data() as GraceRequest);
        });
        list.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
        return list;
      },
      key === 'all' ? 'futurex_grace_requests_cache' : `futurex_grace_cache_${key}`,
      () => {
        if (employeeId) {
          return query(collection(db, GRACE_REQUESTS_COLLECTION), where('employeeId', '==', employeeId), limit(50));
        }
        return query(collection(db, GRACE_REQUESTS_COLLECTION), limit(50));
      },
      employeeId ? `where('employeeId', '==', '${employeeId}'), limit(50)` : 'limit(50)'
    );
    graceRequestsManagersMap.set(key, mgr);
  }
  return mgr;
}

const graceRequestsManager = getOrCreateGraceRequestsManager();

export function subscribeGraceRequests(
  onUpdate: (requests: GraceRequest[]) => void,
  onError: (err: any) => void,
  employeeId?: string
) {
  const mgr = getOrCreateGraceRequestsManager(employeeId);
  return mgr.subscribe(onUpdate, onError);
}

export async function getGraceRequestById(id: string): Promise<GraceRequest | null> {
  const docPath = `${GRACE_REQUESTS_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(GRACE_REQUESTS_COLLECTION, 'getGraceRequestById', 1, 'جلب طلب سماحية بالمعرف', `id=${id}`);
    const docRef = doc(db, GRACE_REQUESTS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as GraceRequest;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath);
    return null;
  }
}

export async function createGraceRequest(request: GraceRequest): Promise<void> {
  const docPath = `${GRACE_REQUESTS_COLLECTION}/${request.id}`;
  try {
    diagnostics.logWrite(GRACE_REQUESTS_COLLECTION, 'createGraceRequest', 'dbService.createGraceRequest', `id=${request.id}`);
    const docRef = doc(db, GRACE_REQUESTS_COLLECTION, request.id);
    const cleanData = JSON.parse(JSON.stringify(request));
    await setDoc(docRef, cleanData);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
    throw err;
  }
}

export async function updateGraceRequest(id: string, updates: Partial<GraceRequest>): Promise<void> {
  const docPath = `${GRACE_REQUESTS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(GRACE_REQUESTS_COLLECTION, 'updateGraceRequest', 'dbService.updateGraceRequest', `id=${id}`);
    const docRef = doc(db, GRACE_REQUESTS_COLLECTION, id);
    const cleanUpdates = JSON.parse(JSON.stringify(updates));
    await updateDoc(docRef, cleanUpdates);

    // If manager approves grace request, clear the late/early checkout minutes on the attendance record
    if (updates.status === 'approved') {
      const fullReq = await getGraceRequestById(id);
      if (fullReq) {
        const dateStr = fullReq.date;
        const empId = fullReq.employeeId;

        // Query active attendance record for this employee and date
        let attRecord: AttendanceRecord | null = null;
        if (fullReq.attendanceRecordId) {
          attRecord = await getAttendanceRecordById(fullReq.attendanceRecordId);
        }
        if (!attRecord) {
          const q = query(
            collection(db, ATTENDANCE_COLLECTION),
            where('employeeId', '==', empId),
            where('date', '==', dateStr)
          );
          const snap = await getDocs(q);
          for (const d of snap.docs) {
            const r = d.data() as AttendanceRecord;
            if (!r.isDeleted) {
              attRecord = r;
              break;
            }
          }
        }

        // Retrieve official work hours from company settings
        let workStart = '08:00';
        let workEnd = '16:00';
        try {
          const companySetSnap = await getCompanySettings();
          if (companySetSnap?.workStartTime) workStart = companySetSnap.workStartTime;
          if (companySetSnap?.workEndTime) workEnd = companySetSnap.workEndTime;
        } catch (_) {}

        const nowIso = new Date().toISOString();
        const processedBy = updates.processedBy || fullReq.processedBy || 'Manager';

        // Helper to format official time as ISO timestamp
        const formatOfficialIso = (dateString: string, timeString: string) => {
          try {
            return new Date(`${dateString}T${timeString}:00`).toISOString();
          } catch (_) {
            return `${dateString}T${timeString}:00.000Z`;
          }
        };

        const officialStartIso = formatOfficialIso(dateStr, workStart);
        const officialEndIso = formatOfficialIso(dateStr, workEnd);

        if (attRecord) {
          if (fullReq.type === 'late_arrival') {
            await updateAttendanceRecord(attRecord.id, {
              lateMinutes: 0,
              checkInTime: officialStartIso,
              status: 'present',
              isAdjusted: true,
              adjustedBy: processedBy,
              adjustedAt: nowIso,
              adjustmentReason: `موافقة على طلب سماحية تأخير (${fullReq.minutes} دقيقة): ${fullReq.reason}`,
              notes: (attRecord.notes ? `${attRecord.notes} | ` : '') + 'تمت الموافقة على استثناء التأخير وتعديل وقت الحضور إلى الوقت الرسمي وإلغاء الخصم'
            });
          } else if (fullReq.type === 'early_departure') {
            await updateAttendanceRecord(attRecord.id, {
              earlyCheckoutMinutes: 0,
              checkOutTime: officialEndIso,
              status: 'present',
              isAdjusted: true,
              adjustedBy: processedBy,
              adjustedAt: nowIso,
              adjustmentReason: `موافقة على طلب سماحية خروج مبكر (${fullReq.minutes} دقيقة): ${fullReq.reason}`,
              notes: (attRecord.notes ? `${attRecord.notes} | ` : '') + 'تمت الموافقة على استثناء الخروج المبكر وتعديل وقت الخروج إلى الوقت الرسمي وإلغاء الخصم'
            });
          }
        } else {
          // Create attendance record for past day exception
          const newRecordId = `att_grace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newRecord: AttendanceRecord = {
            id: newRecordId,
            employeeId: empId,
            employeeName: fullReq.employeeName,
            date: dateStr,
            checkInTime: officialStartIso,
            checkOutTime: officialEndIso,
            status: 'present',
            lateMinutes: 0,
            earlyCheckoutMinutes: 0,
            isAdjusted: true,
            adjustedBy: processedBy,
            adjustedAt: nowIso,
            adjustmentReason: `موافقة على طلب استثناء ليوم سابق (${fullReq.type === 'late_arrival' ? 'تأخير' : 'خروج مبكر'}): ${fullReq.reason}`,
            notes: 'تمت الموافقة على طلب استثناء وتعديل الأوقات إلى المواعيد الرسمية وإثبات الحضور بالوقت المحدد دون خصم'
          };
          await createAttendanceRecord(newRecord);
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

export async function softDeleteGraceRequest(id: string, deletedBy?: string, reason?: string): Promise<void> {
  const docPath = `${GRACE_REQUESTS_COLLECTION}/${id}`;
  try {
    const request = await getGraceRequestById(id);
    if (!request) {
      throw new Error(`Grace request ${id} not found`);
    }
    if (request.status !== 'pending') {
      throw new Error(`Cannot delete grace request because status is not pending. Current status: ${request.status}`);
    }
    diagnostics.logWrite(GRACE_REQUESTS_COLLECTION, 'softDeleteGraceRequest', 'dbService.softDeleteGraceRequest', `id=${id}`);
    const docRef = doc(db, GRACE_REQUESTS_COLLECTION, id);
    await updateDoc(docRef, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      deletedBy: deletedBy || null,
      deletionReason: reason || null,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// --------------------------------------------------------------------------
// 4. PAYROLL PERIODS (payroll_periods)
// --------------------------------------------------------------------------

const payrollPeriodsManager = new SubscriptionManager<PayrollPeriod[]>(
  PAYROLL_PERIODS_COLLECTION,
  false,
  (snapshot) => {
    const list: PayrollPeriod[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as PayrollPeriod);
    });
    list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    return list;
  },
  'futurex_payroll_periods_cache'
);

export function subscribePayrollPeriods(
  onUpdate: (periods: PayrollPeriod[]) => void,
  onError: (err: any) => void
) {
  return payrollPeriodsManager.subscribe(onUpdate, onError);
}

// On-demand cached getter for payroll periods (Lazy load with 24h cache)
export async function getPayrollPeriods(forceRefresh: boolean = false): Promise<PayrollPeriod[]> {
  const cacheKey = 'futurex_payroll_periods_cache';
  const syncKey = 'futurex_payroll_periods_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<PayrollPeriod[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(PAYROLL_PERIODS_COLLECTION, 'getPayrollPeriods (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = PAYROLL_PERIODS_COLLECTION;
  try {
    const snap = await getDocs(collection(db, PAYROLL_PERIODS_COLLECTION));
    diagnostics.logRead(PAYROLL_PERIODS_COLLECTION, 'getPayrollPeriods', snap.size, 'جلب دورات الرواتب بطلب صريح أو انتهاء الكاش');
    const list: PayrollPeriod[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as PayrollPeriod);
    });
    list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<PayrollPeriod[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getPayrollPeriodsCachedSync(): PayrollPeriod[] {
  const cached = getLocalCache<PayrollPeriod[]>('futurex_payroll_periods_cache', 'futurex_payroll_periods_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(PAYROLL_PERIODS_COLLECTION, 'getPayrollPeriodsCachedSync');
  }
  return cached.data || [];
}

export async function getPayrollPeriodById(id: string): Promise<PayrollPeriod | null> {
  const docPath = `${PAYROLL_PERIODS_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(PAYROLL_PERIODS_COLLECTION, 'getPayrollPeriodById', 1, 'جلب دورة رواتب بالمعرف', `id=${id}`);
    const docRef = doc(db, PAYROLL_PERIODS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PayrollPeriod;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    return null;
  }
}

export async function createPayrollPeriod(period: PayrollPeriod): Promise<void> {
  const docPath = `${PAYROLL_PERIODS_COLLECTION}/${period.id}`;
  try {
    diagnostics.logWrite(PAYROLL_PERIODS_COLLECTION, 'createPayrollPeriod', 'dbService.createPayrollPeriod', `id=${period.id}`);
    const docRef = doc(db, PAYROLL_PERIODS_COLLECTION, period.id);
    await setDoc(docRef, period);

    // Update local cache
    const current = getPayrollPeriodsCachedSync();
    const idx = current.findIndex(p => p.id === period.id);
    const updated = idx >= 0
      ? current.map(p => p.id === period.id ? period : p)
      : [period, ...current];
    updated.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    setLocalCache('futurex_payroll_periods_cache', 'futurex_payroll_periods_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function updatePayrollPeriod(id: string, updates: Partial<PayrollPeriod>): Promise<void> {
  const docPath = `${PAYROLL_PERIODS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(PAYROLL_PERIODS_COLLECTION, 'updatePayrollPeriod', 'dbService.updatePayrollPeriod', `id=${id}`);
    const docRef = doc(db, PAYROLL_PERIODS_COLLECTION, id);
    await updateDoc(docRef, updates as any);

    // Update local cache
    const current = getPayrollPeriodsCachedSync();
    const updated = current.map(p => p.id === id ? { ...p, ...updates } : p);
    setLocalCache('futurex_payroll_periods_cache', 'futurex_payroll_periods_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

// --------------------------------------------------------------------------
// 5. PAYROLL RECORDS (payroll_records)
// --------------------------------------------------------------------------

const payrollRecordsManager = new SubscriptionManager<PayrollRecord[]>(
  PAYROLL_RECORDS_COLLECTION,
  false,
  (snapshot) => {
    const list: PayrollRecord[] = [];
    snapshot.forEach((docSnap: any) => {
      list.push(docSnap.data() as PayrollRecord);
    });
    list.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    return list;
  },
  'futurex_payroll_records_cache'
);

export function subscribePayrollRecords(
  onUpdate: (records: PayrollRecord[]) => void,
  onError: (err: any) => void
) {
  return payrollRecordsManager.subscribe(onUpdate, onError);
}

// On-demand cached getter for payroll records (Lazy load with 24h cache)
export async function getPayrollRecords(forceRefresh: boolean = false): Promise<PayrollRecord[]> {
  const cacheKey = 'futurex_payroll_records_cache';
  const syncKey = 'futurex_payroll_records_last_sync';

  if (!forceRefresh) {
    const cached = getLocalCache<PayrollRecord[]>(cacheKey, syncKey);
    if (cached.data && cached.isFresh) {
      diagnostics.logCacheHit(PAYROLL_RECORDS_COLLECTION, 'getPayrollRecords (Local Cache Hit)');
      return cached.data;
    }
  }

  const docPath = PAYROLL_RECORDS_COLLECTION;
  try {
    const snap = await getDocs(collection(db, PAYROLL_RECORDS_COLLECTION));
    diagnostics.logRead(PAYROLL_RECORDS_COLLECTION, 'getPayrollRecords', snap.size, 'جلب سجلات الرواتب بطلب صريح أو انتهاء الكاش');
    const list: PayrollRecord[] = [];
    snap.forEach((docSnap: any) => {
      list.push(docSnap.data() as PayrollRecord);
    });
    list.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    setLocalCache(cacheKey, syncKey, list);
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<PayrollRecord[]>(cacheKey, syncKey);
    return cached.data || [];
  }
}

export function getPayrollRecordsCachedSync(): PayrollRecord[] {
  const cached = getLocalCache<PayrollRecord[]>('futurex_payroll_records_cache', 'futurex_payroll_records_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(PAYROLL_RECORDS_COLLECTION, 'getPayrollRecordsCachedSync');
  }
  return cached.data || [];
}

export async function getPayrollRecordById(id: string): Promise<PayrollRecord | null> {
  const docPath = `${PAYROLL_RECORDS_COLLECTION}/${id}`;
  try {
    diagnostics.logRead(PAYROLL_RECORDS_COLLECTION, 'getPayrollRecordById', 1, 'جلب سجل راتب بالمعرف', `id=${id}`);
    const docRef = doc(db, PAYROLL_RECORDS_COLLECTION, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as PayrollRecord;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    return null;
  }
}

export async function createPayrollRecord(record: PayrollRecord): Promise<void> {
  const docPath = `${PAYROLL_RECORDS_COLLECTION}/${record.id}`;
  try {
    diagnostics.logWrite(PAYROLL_RECORDS_COLLECTION, 'createPayrollRecord', 'dbService.createPayrollRecord', `id=${record.id}`);
    const docRef = doc(db, PAYROLL_RECORDS_COLLECTION, record.id);
    await setDoc(docRef, record);

    // Update local cache
    const current = getPayrollRecordsCachedSync();
    const idx = current.findIndex(r => r.id === record.id);
    const updated = idx >= 0
      ? current.map(r => r.id === record.id ? record : r)
      : [record, ...current];
    updated.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
    setLocalCache('futurex_payroll_records_cache', 'futurex_payroll_records_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function updatePayrollRecord(id: string, updates: Partial<PayrollRecord>): Promise<void> {
  const docPath = `${PAYROLL_RECORDS_COLLECTION}/${id}`;
  try {
    diagnostics.logWrite(PAYROLL_RECORDS_COLLECTION, 'updatePayrollRecord', 'dbService.updatePayrollRecord', `id=${id}`);
    const docRef = doc(db, PAYROLL_RECORDS_COLLECTION, id);
    await updateDoc(docRef, updates as any);

    // Update local cache
    const current = getPayrollRecordsCachedSync();
    const updated = current.map(r => r.id === id ? { ...r, ...updates } : r);
    setLocalCache('futurex_payroll_records_cache', 'futurex_payroll_records_last_sync', updated);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, docPath);
  }
}

// --------------------------------------------------------------------------
// 6. AUDIT LOGS (audit_logs) - Disabled / Zero Storage
// --------------------------------------------------------------------------

export function subscribeAuditLogs(
  onUpdate: (logs: AuditLogEntry[]) => void,
  onError?: (err: any) => void
) {
  // Audit logging removed completely per request - return empty list
  setTimeout(() => onUpdate([]), 0);
  return () => {};
}

export async function getAuditLogById(id: string): Promise<AuditLogEntry | null> {
  return null;
}

export async function createAuditLog(log: AuditLogEntry): Promise<void> {
  // Audit logging removed completely per request - no writes performed
  return Promise.resolve();
}

export async function updateAuditLog(id: string, updates: Partial<AuditLogEntry>): Promise<void> {
  // Audit logging removed completely per request - no writes performed
  return Promise.resolve();
}

// --------------------------------------------------------------------------
// 7. COMPANY SETTINGS (settings/company)
// --------------------------------------------------------------------------

const companySettingsManager = new SubscriptionManager<CompanySettings | null>(
  `${SETTINGS_COLLECTION}/company`,
  true,
  (snapshot) => (snapshot.exists() ? (snapshot.data() as CompanySettings) : null),
  'futurex_company_settings_cache'
);

export function subscribeCompanySettings(
  onUpdate: (settings: CompanySettings | null) => void,
  onError: (err: any) => void
) {
  return companySettingsManager.subscribe(onUpdate, onError);
}

export function getCompanySettingsCachedSync(): CompanySettings | null {
  const cached = getLocalCache<CompanySettings>('futurex_company_settings_cache', 'futurex_company_settings_last_sync');
  if (cached.data) {
    diagnostics.logCacheHit(`${SETTINGS_COLLECTION}/company`, 'getCompanySettingsCachedSync');
  }
  return cached.data || null;
}

export async function getCompanySettings(): Promise<CompanySettings | null> {
  const cacheKey = 'futurex_company_settings_cache';
  const syncKey = 'futurex_company_settings_last_sync';
  const docPath = `${SETTINGS_COLLECTION}/company`;
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, 'company');
    const docSnap = await getDoc(docRef);
    diagnostics.logRead(SETTINGS_COLLECTION, 'getCompanySettings', 1, 'جلب إعدادات الشركة بطلب صريح أو انتهاء الكاش');
    if (docSnap.exists()) {
      const data = docSnap.data() as CompanySettings;
      setLocalCache(cacheKey, syncKey, data);
      return data;
    }
    return null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, docPath, false);
    const cached = getLocalCache<CompanySettings>(cacheKey, syncKey);
    return cached.data || null;
  }
}

export async function saveCompanySettings(settings: CompanySettings): Promise<void> {
  const docPath = `${SETTINGS_COLLECTION}/company`;
  try {
    diagnostics.logWrite(SETTINGS_COLLECTION, 'saveCompanySettings', 'dbService.saveCompanySettings');
    const docRef = doc(db, SETTINGS_COLLECTION, 'company');
    await setDoc(docRef, settings);
    setLocalCache('futurex_company_settings_cache', 'futurex_company_settings_last_sync', settings);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

// ==========================================
// Inventory & Materials Management Services
// ==========================================

export async function getMaterialItems(force = false): Promise<MaterialItem[]> {
  const cacheKey = 'futurex_material_items_cache';
  const syncKey = 'futurex_material_items_last_sync';
  
  if (!force) {
    const cached = getLocalCache<MaterialItem[]>(cacheKey, syncKey);
    if (cached.data && cached.data.length > 0) {
      return cached.data;
    }
  }

  try {
    const snap = await getDocs(collection(db, MATERIAL_ITEMS_COLLECTION));
    if (snap.empty) {
      // Seed default catalog
      const batch = writeBatch(db);
      for (const item of DEFAULT_MATERIAL_ITEMS) {
        batch.set(doc(db, MATERIAL_ITEMS_COLLECTION, item.id), item);
      }
      await batch.commit();
      setLocalCache(cacheKey, syncKey, DEFAULT_MATERIAL_ITEMS);
      return DEFAULT_MATERIAL_ITEMS;
    }

    const items: MaterialItem[] = [];
    snap.forEach((d) => {
      items.push({ id: d.id, ...(d.data() as any) } as MaterialItem);
    });
    setLocalCache(cacheKey, syncKey, items);
    return items;
  } catch (err) {
    console.warn('Error fetching material items, falling back to defaults:', err);
    return DEFAULT_MATERIAL_ITEMS;
  }
}

export async function saveMaterialItem(item: MaterialItem): Promise<void> {
  try {
    await setDoc(doc(db, MATERIAL_ITEMS_COLLECTION, item.id), item);
    // Invalidate cache
    try {
      localStorage.removeItem('futurex_material_items_last_sync');
    } catch (_) {}
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${MATERIAL_ITEMS_COLLECTION}/${item.id}`);
  }
}

export async function deleteMaterialItem(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, MATERIAL_ITEMS_COLLECTION, id));
    try {
      localStorage.removeItem('futurex_material_items_last_sync');
      localStorage.removeItem('futurex_material_items_cache');
    } catch (_) {}
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${MATERIAL_ITEMS_COLLECTION}/${id}`);
  }
}

export async function adjustWarehouseStock(payload: {
  materialId: string;
  materialName: string;
  unit: string;
  mode: 'add' | 'deduct' | 'set';
  quantity: number;
  reason?: string;
  performedBy: string;
}): Promise<number> {
  const docPath = `${MATERIAL_ITEMS_COLLECTION}/${payload.materialId}`;
  try {
    const matRef = doc(db, MATERIAL_ITEMS_COLLECTION, payload.materialId);
    const snap = await getDoc(matRef);
    let prevQty = 0;
    if (snap.exists()) {
      prevQty = Number(snap.data()?.warehouseStock ?? 0);
    }

    let newQty = prevQty;
    let txnType: 'warehouse_in' | 'warehouse_out' | 'adjustment' = 'warehouse_in';
    const amount = Number(payload.quantity);

    if (payload.mode === 'add') {
      newQty = prevQty + amount;
      txnType = 'warehouse_in';
    } else if (payload.mode === 'deduct') {
      newQty = Math.max(0, prevQty - amount);
      txnType = 'warehouse_out';
    } else {
      newQty = Math.max(0, amount);
      txnType = 'adjustment';
    }

    await updateDoc(matRef, {
      warehouseStock: newQty
    });

    try {
      localStorage.removeItem('futurex_material_items_last_sync');
      localStorage.removeItem('futurex_material_items_cache');
    } catch (_) {}

    // Record warehouse transaction
    const txnId = `txn-wh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txn: MaterialTransaction = {
      id: txnId,
      type: txnType,
      materialId: payload.materialId,
      materialName: payload.materialName,
      unit: payload.unit,
      quantity: Math.abs(newQty - prevQty),
      previousQuantity: prevQty,
      newQuantity: newQty,
      notes: payload.reason || (payload.mode === 'add' ? 'إضافة رصيد للمخزن' : 'سحب كمية من المخزن'),
      performedBy: payload.performedBy,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, MATERIAL_TRANSACTIONS_COLLECTION, txnId), txn);

    return newQty;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
    return 0;
  }
}

export async function getTechnicianInventory(employeeId?: string): Promise<TechnicianStockItem[]> {
  try {
    let q;
    if (employeeId) {
      q = query(collection(db, TECHNICIAN_INVENTORY_COLLECTION), where('employeeId', '==', employeeId));
    } else {
      q = collection(db, TECHNICIAN_INVENTORY_COLLECTION);
    }
    const snap = await getDocs(q);
    const results: TechnicianStockItem[] = [];
    snap.forEach((d) => {
      results.push({ id: d.id, ...(d.data() as any) } as TechnicianStockItem);
    });
    return results;
  } catch (err) {
    console.warn('Error fetching technician inventory:', err);
    return [];
  }
}

export async function supplyMaterialsToTechnician(payload: {
  employeeId: string;
  employeeName: string;
  items: Array<{ materialId: string; materialName: string; unit: string; quantity: number }>;
  notes?: string;
  suppliedBy: string;
}): Promise<void> {
  try {
    for (const item of payload.items) {
      if (item.quantity <= 0) continue;
      const stockDocId = `${payload.employeeId}_${item.materialId}`;
      const stockRef = doc(db, TECHNICIAN_INVENTORY_COLLECTION, stockDocId);
      const stockSnap = await getDoc(stockRef);
      
      let prevQty = 0;
      if (stockSnap.exists()) {
        prevQty = Number(stockSnap.data()?.quantity) || 0;
      }
      const newQty = prevQty + Number(item.quantity);

      const updatedStock: TechnicianStockItem = {
        id: stockDocId,
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        quantity: newQty,
        lastUpdatedAt: new Date().toISOString()
      };
      await setDoc(stockRef, updatedStock);

      // Decrement central warehouse stock if material exists
      try {
        const matRef = doc(db, MATERIAL_ITEMS_COLLECTION, item.materialId);
        const matSnap = await getDoc(matRef);
        if (matSnap.exists()) {
          const currentWh = Number(matSnap.data()?.warehouseStock ?? 0);
          const newWh = Math.max(0, currentWh - Number(item.quantity));
          await updateDoc(matRef, { warehouseStock: newWh });
          try {
            localStorage.removeItem('futurex_material_items_last_sync');
            localStorage.removeItem('futurex_material_items_cache');
          } catch (_) {}
        }
      } catch (whErr) {
        console.warn('Could not update warehouse stock on supply:', whErr);
      }

      // Record transaction
      const txnId = `txn-sup-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const txn: MaterialTransaction = {
        id: txnId,
        type: 'supply',
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        quantity: Number(item.quantity),
        previousQuantity: prevQty,
        newQuantity: newQty,
        notes: payload.notes || '',
        performedBy: payload.suppliedBy,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, MATERIAL_TRANSACTIONS_COLLECTION, txnId), txn);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, TECHNICIAN_INVENTORY_COLLECTION);
  }
}

export async function consumeMaterialsForTask(payload: {
  taskId: string;
  taskType: string;
  employeeId: string;
  employeeName: string;
  subscriberName?: string;
  subscriberPhone?: string;
  items: ConsumedMaterial[];
  performedBy: string;
  notes?: string;
}): Promise<void> {
  try {
    for (const item of payload.items) {
      if (item.quantity <= 0) continue;
      const stockDocId = `${payload.employeeId}_${item.materialId}`;
      const stockRef = doc(db, TECHNICIAN_INVENTORY_COLLECTION, stockDocId);
      const stockSnap = await getDoc(stockRef);

      let prevQty = 0;
      if (stockSnap.exists()) {
        prevQty = Number(stockSnap.data()?.quantity) || 0;
      }
      const newQty = Math.max(0, prevQty - Number(item.quantity));

      const updatedStock: TechnicianStockItem = {
        id: stockDocId,
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        quantity: newQty,
        lastUpdatedAt: new Date().toISOString()
      };
      await setDoc(stockRef, updatedStock);

      // Record consumption transaction
      const txnId = `txn-con-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const txn: MaterialTransaction = {
        id: txnId,
        type: 'consumption',
        employeeId: payload.employeeId,
        employeeName: payload.employeeName,
        materialId: item.materialId,
        materialName: item.materialName,
        unit: item.unit,
        quantity: Number(item.quantity),
        previousQuantity: prevQty,
        newQuantity: newQty,
        taskId: payload.taskId,
        taskType: payload.taskType,
        subscriberName: payload.subscriberName || '',
        subscriberPhone: payload.subscriberPhone || '',
        notes: item.notes || payload.notes || '',
        performedBy: payload.performedBy,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, MATERIAL_TRANSACTIONS_COLLECTION, txnId), txn);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, TECHNICIAN_INVENTORY_COLLECTION);
  }
}

export async function returnMaterialsFromTechnician(payload: {
  employeeId: string;
  employeeName: string;
  materialId: string;
  materialName: string;
  unit: string;
  quantity: number;
  notes?: string;
  returnedTo: string;
}): Promise<void> {
  try {
    const stockDocId = `${payload.employeeId}_${payload.materialId}`;
    const stockRef = doc(db, TECHNICIAN_INVENTORY_COLLECTION, stockDocId);
    const stockSnap = await getDoc(stockRef);

    let prevQty = 0;
    if (stockSnap.exists()) {
      prevQty = Number(stockSnap.data()?.quantity) || 0;
    }
    const newQty = Math.max(0, prevQty - Number(payload.quantity));

    await setDoc(stockRef, {
      id: stockDocId,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      materialId: payload.materialId,
      materialName: payload.materialName,
      unit: payload.unit,
      quantity: newQty,
      lastUpdatedAt: new Date().toISOString()
    });

    const txnId = `txn-ret-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txn: MaterialTransaction = {
      id: txnId,
      type: 'return',
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      materialId: payload.materialId,
      materialName: payload.materialName,
      unit: payload.unit,
      quantity: Number(payload.quantity),
      previousQuantity: prevQty,
      newQuantity: newQty,
      notes: payload.notes || '',
      performedBy: payload.returnedTo,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, MATERIAL_TRANSACTIONS_COLLECTION, txnId), txn);

    // Return to central warehouse stock
    try {
      const matRef = doc(db, MATERIAL_ITEMS_COLLECTION, payload.materialId);
      const matSnap = await getDoc(matRef);
      if (matSnap.exists()) {
        const currentWh = Number(matSnap.data()?.warehouseStock ?? 0);
        const newWh = currentWh + Number(payload.quantity);
        await updateDoc(matRef, { warehouseStock: newWh });
        try {
          localStorage.removeItem('futurex_material_items_last_sync');
          localStorage.removeItem('futurex_material_items_cache');
        } catch (_) {}
      }
    } catch (whErr) {
      console.warn('Could not update warehouse stock on return:', whErr);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, TECHNICIAN_INVENTORY_COLLECTION);
  }
}

export async function adjustTechnicianStock(payload: {
  employeeId: string;
  employeeName: string;
  materialId: string;
  materialName: string;
  unit: string;
  newQuantity: number;
  reason: string;
  adjustedBy: string;
}): Promise<void> {
  try {
    const stockDocId = `${payload.employeeId}_${payload.materialId}`;
    const stockRef = doc(db, TECHNICIAN_INVENTORY_COLLECTION, stockDocId);
    const stockSnap = await getDoc(stockRef);

    let prevQty = 0;
    if (stockSnap.exists()) {
      prevQty = Number(stockSnap.data()?.quantity) || 0;
    }

    await setDoc(stockRef, {
      id: stockDocId,
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      materialId: payload.materialId,
      materialName: payload.materialName,
      unit: payload.unit,
      quantity: Number(payload.newQuantity),
      lastUpdatedAt: new Date().toISOString()
    });

    const txnId = `txn-adj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const txn: MaterialTransaction = {
      id: txnId,
      type: 'adjustment',
      employeeId: payload.employeeId,
      employeeName: payload.employeeName,
      materialId: payload.materialId,
      materialName: payload.materialName,
      unit: payload.unit,
      quantity: Math.abs(Number(payload.newQuantity) - prevQty),
      previousQuantity: prevQty,
      newQuantity: Number(payload.newQuantity),
      notes: payload.reason,
      performedBy: payload.adjustedBy,
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, MATERIAL_TRANSACTIONS_COLLECTION, txnId), txn);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, TECHNICIAN_INVENTORY_COLLECTION);
  }
}

export async function getMaterialTransactions(filter?: {
  employeeId?: string;
  taskId?: string;
  type?: string;
  limitCount?: number;
}): Promise<MaterialTransaction[]> {
  try {
    let q;
    const maxLimit = filter?.limitCount || 50;
    if (filter?.employeeId) {
      q = query(
        collection(db, MATERIAL_TRANSACTIONS_COLLECTION),
        where('employeeId', '==', filter.employeeId),
        limit(maxLimit)
      );
    } else {
      q = query(collection(db, MATERIAL_TRANSACTIONS_COLLECTION), limit(maxLimit));
    }

    const snap = await getDocs(q);
    const txns: MaterialTransaction[] = [];
    snap.forEach((d) => {
      txns.push({ id: d.id, ...(d.data() as any) } as MaterialTransaction);
    });

    // Client-side sort by createdAt desc
    txns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return txns;
  } catch (err) {
    console.warn('Error fetching material transactions:', err);
    return [];
  }
}

