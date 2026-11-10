import { Employee, Task, TaskType, TASK_POINTS } from './types';

// Seed employees (less than 10, realistic Arabic names)
export const SEED_EMPLOYEES: Employee[] = [
  {
    id: 'emp-1',
    name: 'أحمد العتيبي',
    phone: '0501234567',
    joinedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'emp-2',
    name: 'محمد الدوسري',
    phone: '0502345678',
    joinedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'emp-3',
    name: 'سارة الجابري',
    phone: '0503456789',
    joinedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'emp-4',
    name: 'عبد الرحمن الحربي',
    phone: '0504567890',
    joinedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'emp-5',
    name: 'علي الشمري',
    phone: '0505678901',
    joinedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  }
];

// Helper to construct dates relative to now
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();

// Seed tasks completed across different periods to populate leaderboards
export const SEED_TASKS: Task[] = [
  // Today's tasks (Day Leaderboard)
  {
    id: 'task-1',
    employeeId: 'emp-1',
    employeeName: 'أحمد العتيبي',
    taskType: TaskType.Installation, // 20 pts
    startTime: hoursAgo(6),
    endTime: hoursAgo(4.5),
    status: 'completed',
    points: TASK_POINTS[TaskType.Installation],
    notes: 'تنصيب شبكة إنترنت سريعة لموقع فرع النخيل',
  },
  {
    id: 'task-2',
    employeeId: 'emp-3',
    employeeName: 'سارة الجابري',
    taskType: TaskType.Maintenance, // 18 pts
    startTime: hoursAgo(5),
    endTime: hoursAgo(4),
    status: 'completed',
    points: TASK_POINTS[TaskType.Maintenance],
    notes: 'صيانة وتحديث النظام الأساسي بنجاح',
  },
  {
    id: 'task-3',
    employeeId: 'emp-4',
    employeeName: 'عبد الرحمن الحربي',
    taskType: TaskType.Collection, // 14 pts
    startTime: hoursAgo(3),
    endTime: hoursAgo(2.5),
    status: 'completed',
    points: TASK_POINTS[TaskType.Collection],
    notes: 'سحب مبالغ وأجهزة تالفة من العميل',
  },
  {
    id: 'task-4',
    employeeId: 'emp-1',
    employeeName: 'أحمد العتيبي',
    taskType: TaskType.Ports, // 10 pts
    startTime: hoursAgo(2),
    endTime: hoursAgo(1),
    status: 'completed',
    points: TASK_POINTS[TaskType.Ports],
    notes: 'فتح منافذ جديدة للمشتركين',
  },
  
  // Weekly tasks (Week Leaderboard)
  {
    id: 'task-5',
    employeeId: 'emp-2',
    employeeName: 'محمد الدوسري',
    taskType: TaskType.Installation, // 20 pts
    startTime: daysAgo(2),
    endTime: daysAgo(1.9),
    status: 'completed',
    points: TASK_POINTS[TaskType.Installation],
    notes: 'تنصيب أجهزة سيرفر إضافية',
  },
  {
    id: 'task-6',
    employeeId: 'emp-3',
    employeeName: 'سارة الجابري',
    taskType: TaskType.Click, // 8 pts
    startTime: daysAgo(3),
    endTime: daysAgo(2.95),
    status: 'completed',
    points: TASK_POINTS[TaskType.Click],
    notes: 'تفعيل خيارات الدفع بنظام كلك',
  },
  {
    id: 'task-7',
    employeeId: 'emp-5',
    employeeName: 'علي الشمري',
    taskType: TaskType.Delivery, // 5 pts
    startTime: daysAgo(4),
    endTime: daysAgo(3.9),
    status: 'completed',
    points: TASK_POINTS[TaskType.Delivery],
    notes: 'توصيل عتاد الصيانة الطارئة للموقع',
  },
  {
    id: 'task-8',
    employeeId: 'emp-2',
    employeeName: 'محمد الدوسري',
    taskType: TaskType.Maintenance, // 18 pts
    startTime: daysAgo(5),
    endTime: daysAgo(4.8),
    status: 'completed',
    points: TASK_POINTS[TaskType.Maintenance],
    notes: 'صيانة دورية للمنافذ الإلكترونية',
  },

  // Monthly tasks (Month Leaderboard)
  {
    id: 'task-9',
    employeeId: 'emp-4',
    employeeName: 'عبد الرحمن الحربي',
    taskType: TaskType.Installation, // 20 pts
    startTime: daysAgo(12),
    endTime: daysAgo(11.8),
    status: 'completed',
    points: TASK_POINTS[TaskType.Installation],
    notes: 'تنصيب كابينات اتصالات خارجية',
  },
  {
    id: 'task-10',
    employeeId: 'emp-5',
    employeeName: 'علي الشمري',
    taskType: TaskType.Support, // 4 pts
    startTime: daysAgo(18),
    endTime: daysAgo(17.9),
    status: 'completed',
    points: TASK_POINTS[TaskType.Support],
    notes: 'تقديم دعم فني هاتفي لحل مشكلة الاتصال',
  },
  {
    id: 'task-11',
    employeeId: 'emp-2',
    employeeName: 'محمد الدوسري',
    taskType: TaskType.Installation, // 20 pts
    startTime: daysAgo(22),
    endTime: daysAgo(21.7),
    status: 'completed',
    points: TASK_POINTS[TaskType.Installation],
    notes: 'أعمال تركيب وتمديد كابلات فايبر',
  }
];

// LocalStorage Keys
const EMPLOYEES_KEY = 'futurex_employees_v1';
const TASKS_KEY = 'futurex_tasks_v1';

export function loadEmployees(): Employee[] {
  try {
    const data = localStorage.getItem(EMPLOYEES_KEY);
    if (!data) {
      try {
        localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(SEED_EMPLOYEES));
      } catch (e) {
        console.warn('Failed to save SEED_EMPLOYEES to localStorage:', e);
      }
      return SEED_EMPLOYEES;
    }
    return JSON.parse(data);
  } catch (e) {
    console.warn('Failed to load employees from localStorage:', e);
    return SEED_EMPLOYEES;
  }
}

export function saveEmployees(employees: Employee[]) {
  try {
    localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
  } catch (e) {
    console.warn('Failed to save employees to localStorage:', e);
  }
}

export function loadTasks(): Task[] {
  try {
    const data = localStorage.getItem(TASKS_KEY);
    if (!data) {
      try {
        localStorage.setItem(TASKS_KEY, JSON.stringify(SEED_TASKS));
      } catch (e) {
        console.warn('Failed to save SEED_TASKS to localStorage:', e);
      }
      return SEED_TASKS;
    }
    return JSON.parse(data);
  } catch (e) {
    console.warn('Failed to load tasks from localStorage:', e);
    return SEED_TASKS;
  }
}

export function saveTasks(tasks: Task[]) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch (e) {
    console.warn('Failed to save tasks to localStorage:', e);
  }
}
