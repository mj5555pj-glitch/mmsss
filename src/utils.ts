import * as XLSX from 'xlsx';
import { Task, TaskType, TASK_POINTS, Employee, DbTaskType, PointsRules, ManualPointsRecord, AttendanceRecord, CompanySettings } from './types';

// Get allowed time limit in minutes for a task type (Maintenance default: 30m, Installation default: 45m)
export function getTaskTimeLimitMinutes(taskType: string, taskTypes?: DbTaskType[]): number {
  if (taskTypes && taskTypes.length > 0) {
    const taskTypeObj = taskTypes.find(t => t.name === taskType || t.id === taskType);
    if (taskTypeObj) {
      if (taskTypeObj.freeMinutes !== undefined && taskTypeObj.freeMinutes > 0) {
        return taskTypeObj.freeMinutes;
      }
      if (taskTypeObj.deductionStartAfter !== undefined && taskTypeObj.deductionStartAfter > 0) {
        return taskTypeObj.deductionStartAfter;
      }
    }
  }
  if (taskType === 'تنصيب') return 45;
  if (taskType === 'صيانة') return 30;
  return 60;
}

// Calculate points for completed task based on duration and type
export function calculateTaskPoints(
  taskType: string,
  durationMinutes: number,
  taskTypes?: DbTaskType[],
  rules?: PointsRules,
  delayApproved?: boolean
): number {
  if (taskTypes) {
    const taskTypeObj = taskTypes.find(t => t.name === taskType || t.id === taskType);
    if (!taskTypeObj) return 0;

    const basePoints = taskTypeObj.points;

    // If supervisor/manager accepted the delay reason, award full base points (no delay deduction)
    if (delayApproved) {
      return Math.round(basePoints);
    }

    let points = basePoints;

    // Check if optional graduated points system is enabled
    if (taskTypeObj.graduatedEnabled) {
      const interval = taskTypeObj.graduatedInterval || 5;
      const pointsPerInterval = taskTypeObj.graduatedPointsPerInterval ?? 3;
      const maxPoints = taskTypeObj.graduatedMaxPoints ?? basePoints;
      
      const startDeduction = taskTypeObj.deductionStartAfter ?? 30;
      const dedInterval = taskTypeObj.deductionInterval || 5;
      const dedPointsPerInterval = taskTypeObj.deductionPointsPerInterval ?? 3;
      const minPoints = taskTypeObj.deductionMinPoints ?? 0;

      if (durationMinutes <= startDeduction) {
        const intervalsCount = Math.floor(durationMinutes / interval);
        let calcPoints = intervalsCount * pointsPerInterval;
        if (calcPoints > maxPoints) {
          calcPoints = maxPoints;
        }
        return Math.round(calcPoints);
      } else {
        const excess = durationMinutes - startDeduction;
        const dedIntervals = Math.floor(excess / dedInterval);
        const totalDeduction = dedIntervals * dedPointsPerInterval;
        let calcPoints = maxPoints - totalDeduction;
        if (calcPoints < minPoints) {
          calcPoints = minPoints;
        }
        return Math.round(calcPoints);
      }
    }

    const delayDeductionPerMinute = taskTypeObj.delayDeductionPerMinute && taskTypeObj.delayDeductionPerMinute !== 0.5 
      ? taskTypeObj.delayDeductionPerMinute 
      : (taskTypeObj.name === 'صيانة' ? 3 : (taskTypeObj.delayDeductionPerMinute ?? rules?.delayDeductionPerMinute ?? 0.5));
    const maxDeduction = taskTypeObj.maxDeduction && taskTypeObj.maxDeduction > 10 ? taskTypeObj.maxDeduction : (rules?.maxDeduction ?? 100);
    const freeMinutes = taskTypeObj.freeMinutes ?? (taskTypeObj.name === 'تنصيب' ? 45 : taskTypeObj.name === 'صيانة' ? 30 : 60);

    // 1. Fast completion bonus
    if (taskTypeObj.fastCompletionBonusEnabled && durationMinutes <= (taskTypeObj.fastCompletionMinutes ?? 15)) {
      points = basePoints + (taskTypeObj.fastCompletionBonusPoints ?? 5);
    } 
    // 2. Standard or Progressive
    else if (durationMinutes <= freeMinutes) {
      if (taskTypeObj.name === 'صيانة' && basePoints === 18 && !taskTypeObj.fastCompletionBonusEnabled) {
        // Legacy progressive logic for maintenance if unchanged
        points = Math.floor(durationMinutes / 5) * 3;
      } else {
        points = basePoints;
      }
    } 
    // 3. Delay deduction (Allows net negative points to deduct from employee's total score)
    else {
      const excess = durationMinutes - freeMinutes;
      const delayDeduction = excess * delayDeductionPerMinute;
      const cappedDeduction = Math.min(maxDeduction, delayDeduction);
      points = basePoints - cappedDeduction;
    }

    return Math.round(points);
  }

  // Fallback to static legacy rules if taskTypes not loaded yet
  if (delayApproved) {
    if (taskType === 'تنصيب') return 20;
    if (taskType === 'صيانة') return 18;
    return TASK_POINTS[taskType as TaskType] ?? 0;
  }

  if (taskType === 'تنصيب') {
    if (durationMinutes <= 15) {
      return 25;
    } else if (durationMinutes <= 45) {
      return 20;
    } else {
      const excess = durationMinutes - 45;
      const deductionBlocks = Math.floor(excess / 10);
      return 20 - deductionBlocks * 5;
    }
  } else if (taskType === 'صيانة') {
    if (durationMinutes <= 30) {
      return Math.floor(durationMinutes / 5) * 3;
    } else {
      const excess = durationMinutes - 30;
      const delayDeduction = excess * 3; // 3 points per minute delay
      return 18 - delayDeduction; // e.g. 7 mins delay = 18 - 21 = -3 points deducted from total
    }
  } else {
    return TASK_POINTS[taskType as TaskType] ?? 0;
  }
}

// Format Date to localized Arabic format
export function formatDate(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format Date to localized Arabic date only (no time) in one clean line with standard numbers
export function formatArabicDateOnly(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    numberingSystem: 'latn',
  });
}

// Format Date to localized Arabic time only (no date) in standard numbers (e.g. 03:50 ص)
export function formatArabicTimeOnly(isoString: string): string {
  if (!isoString) return '-';
  const date = new Date(isoString);
  return date.toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    numberingSystem: 'latn',
  });
}

// Format Date to Input values (e.g. YYYY-MM-DDTHH:MM)
export function toLocalInputString(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
  const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().slice(0, 16);
  return localISOTime;
}

// Format duration between start and end times in Arabic
export function formatDuration(startIso: string, endIso?: string): string {
  if (!endIso) return 'قيد التنفيذ...';
  
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  const diffMs = Math.max(0, end - start);
  
  const diffMins = Math.round(diffMs / (1000 * 60));
  if (diffMins < 1) return 'أقل من دقيقة';
  if (diffMins < 60) return `${diffMins} دقيقة`;
  
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (mins === 0) {
    if (hours === 1) return 'ساعة واحدة';
    if (hours === 2) return 'ساعتان';
    if (hours <= 10) return `${hours} ساعات`;
    return `${hours} ساعة`;
  }
  
  const hoursText = hours === 1 ? 'ساعة' : hours === 2 ? 'ساعتان' : hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`;
  return `${hoursText} و ${mins} دقيقة`;
}

// Check if a date string falls in Today, This Week, or This Month
export function isToday(isoString: string): boolean {
  if (!isoString) return false;
  const date = new Date(isoString);
  const now = new Date();
  
  // To align with Administrative Day (3:00 AM to 2:59:59 AM next day),
  // we subtract 3 hours from both the target date and current time.
  const adminTarget = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const adminNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  
  return adminTarget.getDate() === adminNow.getDate() &&
         adminTarget.getMonth() === adminNow.getMonth() &&
         adminTarget.getFullYear() === adminNow.getFullYear();
}

export function isSameAdminDay(isoString: string, targetDateStr: string): boolean {
  if (!isoString || !targetDateStr) return false;
  const date = new Date(isoString);
  
  // Shift backwards by 3 hours to get the administrative day's calendar date
  const adminTarget = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  
  // targetDateStr is in format "YYYY-MM-DD"
  const [year, month, day] = targetDateStr.split('-').map(Number);
  
  return adminTarget.getFullYear() === year &&
         (adminTarget.getMonth() + 1) === month &&
         adminTarget.getDate() === day;
}

export function isLeaderboardOpen(): boolean {
  const now = new Date();
  const currentHour = now.getHours();
  return currentHour >= 0 && currentHour < 3;
}

export function isThisWeek(isoString: string): boolean {
  const date = new Date(isoString);
  const now = new Date();
  
  // Start of this week (assume Saturday or Sunday as start of Arab week)
  // Let's take Saturday as the start of the week
  const todayDay = now.getDay(); // 0 is Sunday, 6 is Saturday
  const diffToSaturday = todayDay === 6 ? 0 : todayDay + 1; // days since Saturday
  
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - diffToSaturday);
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  
  const dateTime = date.getTime();
  return dateTime >= startOfWeek.getTime() && dateTime < endOfWeek.getTime();
}

/**
 * Returns the start and end Dates for the administrative month containing the reference date.
 * An administrative month starts on day 16 at 03:00:00 AM, and ends on day 16 of the next month at 02:59:59.999 AM.
 */
export function getAdministrativeMonthRange(refDateInput?: Date | string | number): { start: Date; end: Date } {
  const d = refDateInput ? new Date(refDateInput) : new Date();
  
  // Shift back by 3 hours to align administrative day boundaries (03:00 AM) with calendar day boundaries (12:00 AM midnight)
  const shifted = new Date(d.getTime() - 3 * 3600 * 1000);
  
  const year = shifted.getFullYear();
  const month = shifted.getMonth(); // 0-indexed (0 = January)
  const day = shifted.getDate();
  
  let startYear: number;
  let startMonth: number;
  let endYear: number;
  let endMonth: number;
  
  if (day >= 16) {
    // Current administrative month starts on calendar day 16 of this shifted month
    startYear = year;
    startMonth = month;
    
    // Ends on calendar day 15 of next shifted month
    if (month === 11) {
      endYear = year + 1;
      endMonth = 0;
    } else {
      endYear = year;
      endMonth = month + 1;
    }
  } else {
    // Current administrative month starts on calendar day 16 of previous shifted month
    if (month === 0) {
      startYear = year - 1;
      startMonth = 11;
    } else {
      startYear = year;
      startMonth = month - 1;
    }
    
    // Ends on calendar day 15 of this shifted month
    endYear = year;
    endMonth = month;
  }
  
  // Convert shifted-time boundaries back to original times:
  // 1. Start is calendar 16th at 00:00:00 shifted-time => 16th at 03:00:00 AM original time
  const start = new Date(startYear, startMonth, 16, 3, 0, 0, 0);
  
  // 2. End is calendar 15th of endMonth at 23:59:59.999 shifted-time.
  // Adding 3 hours to 23:59:59.999 gives 02:59:59.999 AM of next calendar day (which is the 16th).
  const end = new Date(endYear, endMonth, 16, 2, 59, 59, 999);
  
  return { start, end };
}

export function isThisMonth(isoString: string): boolean {
  if (!isoString) return false;
  const date = new Date(isoString);
  const { start, end } = getAdministrativeMonthRange();
  const dateTime = date.getTime();
  return dateTime >= start.getTime() && dateTime <= end.getTime();
}

// Safe Local Storage Wrapper Functions to prevent iframe SecurityError crashes
export function safeGetLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn("localStorage is not available in this environment", e);
    return null;
  }
}

export function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    console.warn("localStorage is not available in this environment", e);
  }
}

export function safeRemoveLocalStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn("localStorage is not available in this environment", e);
  }
}

export function safeClearLocalStorage(): void {
  try {
    localStorage.clear();
  } catch (e) {
    console.warn("localStorage is not available in this environment", e);
  }
}

// Generate reports filtered by selection & export to professional excel sheet
export function exportTasksToExcel(
  tasks: Task[],
  filterType: 'daily' | 'weekly' | 'monthly' | 'all',
  employees?: Employee[],
  manualPoints?: ManualPointsRecord[]
) {
  // Combine normal field tasks and administrative manual points records
  const combinedRecords: any[] = [
    ...tasks.filter(task => {
      if (task.status !== 'completed') return false;
      const dateStr = task.endTime || task.startTime;
      if (filterType === 'all') return true;
      if (filterType === 'daily') return isToday(dateStr);
      if (filterType === 'weekly') return isThisWeek(dateStr);
      if (filterType === 'monthly') return isThisMonth(dateStr);
      return false;
    }).map(t => ({
      ...t,
      recordTypeLabel: 'مهمة' as const,
      sortDate: t.startTime
    })),
    ...(manualPoints || []).filter(mp => {
      const dateStr = mp.timestamp;
      if (filterType === 'all') return true;
      if (filterType === 'daily') return isToday(dateStr);
      if (filterType === 'weekly') return isThisWeek(dateStr);
      if (filterType === 'monthly') return isThisMonth(dateStr);
      return false;
    }).map(mp => ({
      id: mp.id,
      employeeId: mp.employeeId,
      employeeName: mp.employeeName,
      taskType: mp.type === 'gift' ? '🎁 إضافة نقاط هدية' : '⚠️ خصم نقاط عقوبة',
      startTime: mp.timestamp,
      endTime: mp.timestamp,
      status: 'completed' as const,
      points: mp.type === 'gift' ? mp.points : -mp.points,
      notes: mp.reason,
      recordTypeLabel: mp.type === 'gift' ? 'هدية' as const : 'عقوبة' as const,
      sortDate: mp.timestamp,
      adminName: mp.adminName,
      subscriberName: '-',
      subscriberPhone: '-',
      assignedDate: mp.timestamp,
      totalPausedMs: 0
    }))
  ];

  const labelMap = {
    all: 'الكامل',
    daily: 'اليومي',
    weekly: 'الأسبوعي',
    monthly: 'الشهري'
  };

  // Get all unique employees from system list, or extract from combined records if empty
  const employeeMap = new Map<string, { id: string, name: string, phone: string }>();
  if (employees) {
    employees.forEach(emp => {
      employeeMap.set(emp.id, { id: emp.id, name: emp.name, phone: emp.phone || '-' });
    });
  }
  
  combinedRecords.forEach(record => {
    if (!employeeMap.has(record.employeeId)) {
      employeeMap.set(record.employeeId, { id: record.employeeId, name: record.employeeName, phone: '-' });
    }
  });

  // Setup stats objects for each employee
  const employeeStats: Record<string, {
    id: string;
    name: string;
    totalPoints: number;
    completedTasksCount: number;
    installCount: number;
    maintenanceCount: number;
    withdrawalCount: number;
    portsCount: number;
    clickCount: number;
    deliveryCount: number;
    supportCount: number;
    totalDurationMinutes: number;
    averageDurationMinutes: number;
    tasks: any[];
  }> = {};

  employeeMap.forEach((emp, empId) => {
    employeeStats[empId] = {
      id: empId,
      name: emp.name,
      totalPoints: 0,
      completedTasksCount: 0,
      installCount: 0,
      maintenanceCount: 0,
      withdrawalCount: 0,
      portsCount: 0,
      clickCount: 0,
      deliveryCount: 0,
      supportCount: 0,
      totalDurationMinutes: 0,
      averageDurationMinutes: 0,
      tasks: []
    };
  });

  // Calculate scores and counts per employee from combined records
  combinedRecords.forEach(record => {
    const stats = employeeStats[record.employeeId];
    if (!stats) return;

    if (record.recordTypeLabel === 'مهمة') {
      stats.completedTasksCount += 1;
      stats.totalPoints += record.points;
      
      // Track Task Type counts
      if (record.taskType === TaskType.Installation) stats.installCount += 1;
      else if (record.taskType === TaskType.Maintenance) stats.maintenanceCount += 1;
      else if (record.taskType === TaskType.Collection) stats.withdrawalCount += 1;
      else if (record.taskType === TaskType.Ports) stats.portsCount += 1;
      else if (record.taskType === TaskType.Click) stats.clickCount += 1;
      else if (record.taskType === TaskType.Delivery) stats.deliveryCount += 1;
      else if (record.taskType === TaskType.Support) stats.supportCount += 1;

      // Duration calculation
      const start = new Date(record.startTime).getTime();
      const end = record.endTime ? new Date(record.endTime).getTime() : start;
      const activeMs = (end - start) - (record.totalPausedMs || 0);
      const mins = Math.max(0, Math.round(activeMs / 60000));
      stats.totalDurationMinutes += mins;
    } else {
      // It's a gift or penalty administrative action
      stats.totalPoints += record.points; // points will be positive for gift, negative for penalty
    }
    stats.tasks.push(record);
  });

  // Calculate averages
  employeeMap.forEach((emp, empId) => {
    const stats = employeeStats[empId];
    if (stats && stats.completedTasksCount > 0) {
      stats.averageDurationMinutes = Math.round(stats.totalDurationMinutes / stats.completedTasksCount);
    }
  });

  // Sort employees by Points descending, with tie-breaker by task count
  const sortedEmployees = Object.values(employeeStats).sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.completedTasksCount - a.completedTasksCount;
  });

  // Sort each employee's tasks in chronological order (earliest to latest)
  sortedEmployees.forEach(emp => {
    emp.tasks.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  });

  // Prepare 2D Array for SheetJS
  const worksheetData: any[][] = [];

  // Sheet Headers
  worksheetData.push([`تقرير الأداء والتقييم المتكامل - المخطط ${labelMap[filterType]}`]);
  worksheetData.push([`تاريخ التصدير: ${new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]);
  worksheetData.push([]); // Spacer row

  // Loop through and write each ranked employee card block
  sortedEmployees.forEach((emp, index) => {
    const rankNum = index + 1;

    // Employee main metrics header
    worksheetData.push([
      "الترتيب (المرتبة)",
      "اسم الموظف الفني",
      "إجمالي نقاط التقييم",
      "المهام المكتملة",
      "عدد التنصيب",
      "عدد الصيانة",
      "عدد السحب",
      "عدد المنافذ",
      "عدد الكلك",
      "عدد الدلفري",
      "عدد الدعم",
      "متوسط مدة المهمة"
    ]);

    // Employee values row
    worksheetData.push([
      `المركز #${rankNum}`,
      emp.name,
      `${emp.totalPoints} نقطة`,
      `${emp.completedTasksCount} مهمة`,
      emp.installCount,
      emp.maintenanceCount,
      emp.withdrawalCount,
      emp.portsCount,
      emp.clickCount,
      emp.deliveryCount,
      emp.supportCount,
      emp.completedTasksCount > 0 ? `${emp.averageDurationMinutes} دقيقة` : '-'
    ]);

    // Subscriber task logs title
    worksheetData.push([
      "",
      `تفاصيل وسجلات العمليات المنجزة للموظف (${emp.name}) بالترتيب الزمني:`
    ]);

    // Task details headers with the newly requested Record Type (نوع السجل) column
    worksheetData.push([
      "", // spacing indent column
      "رقم العملية",
      "نوع السجل", // <-- Requested New Column!
      "اسم المشترك / التفاصيل",
      "رقم الهاتف",
      "نوع العملية",
      "تاريخ التكليف",
      "توقيت البدء",
      "توقيت الانتهاء",
      "مدة العمل الفعلي",
      "مدة التوقف المؤقت",
      "النقاط المستحقة",
      "الحالة"
    ]);

    // Task details records
    if (emp.tasks.length === 0) {
      worksheetData.push([
        "",
        "-",
        "-",
        "لا توجد عمليات مسجلة ومكتملة لهذا الموظف خلال الفترة المحددة",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-",
        "-"
      ]);
    } else {
      emp.tasks.forEach((task, tIndex) => {
        const isFieldTask = task.recordTypeLabel === 'مهمة';
        const start = new Date(task.startTime).getTime();
        const end = task.endTime ? new Date(task.endTime).getTime() : start;
        const activeMs = (end - start) - (task.totalPausedMs || 0);
        const activeMins = Math.max(0, Math.round(activeMs / 60000));
        
        const activeDurationText = !isFieldTask
          ? 'إجراء إداري'
          : (activeMins < 1 ? 'أقل من دقيقة' : `${activeMins} دقيقة`);
        
        const pauseMins = task.totalPausedMs ? Math.max(1, Math.round(task.totalPausedMs / 60000)) : 0;
        const pauseDurationText = !isFieldTask
          ? '-'
          : (pauseMins > 0 ? `${pauseMins} دقيقة` : '0 دقيقة');

        worksheetData.push([
          "", // Indent
          tIndex + 1,
          task.recordTypeLabel, // "مهمة" or "هدية" or "عقوبة"
          task.subscriberName || task.notes || '-',
          task.subscriberPhone || '-',
          task.taskType,
          formatDate(task.assignedDate || task.startTime),
          formatDate(task.startTime),
          isFieldTask && task.endTime ? formatDate(task.endTime) : '-',
          activeDurationText,
          pauseDurationText,
          task.points >= 0 ? `+${task.points} ن` : `${task.points} ن`,
          'مكتمل'
        ]);
      });
    }

    // Spacer block
    worksheetData.push([]);
    worksheetData.push([]);
  });

  // Calculate high quality analytics for Grand Summary
  const dailyScores: Record<string, number> = {};
  const weeklyScores: Record<string, number> = {};
  const monthlyScores: Record<string, number> = {};
  const employeeIdToName: Record<string, string> = {};

  combinedRecords.forEach(record => {
    const empId = record.employeeId;
    employeeIdToName[empId] = record.employeeName;
    
    // Group Daily YYYY-MM-DD
    const dateStr = record.startTime.split('T')[0];
    const dailyKey = `${empId}_${dateStr}`;
    dailyScores[dailyKey] = (dailyScores[dailyKey] || 0) + record.points;
    
    // Group Weekly YYYY-MM-DD start of week
    const d = new Date(record.startTime);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));
    const weekStr = startOfWeek.toISOString().split('T')[0];
    const weeklyKey = `${empId}_${weekStr}`;
    weeklyScores[weeklyKey] = (weeklyScores[weeklyKey] || 0) + record.points;
    
    // Group Monthly YYYY-MM
    const monthStr = record.startTime.substring(0, 7);
    const monthlyKey = `${empId}_${monthStr}`;
    monthlyScores[monthlyKey] = (monthlyScores[monthlyKey] || 0) + record.points;
  });

  let bestDailyScore = 0;
  let bestDailyEmployee = 'لا يوجد';
  let bestDailyDate = '-';
  Object.entries(dailyScores).forEach(([key, score]) => {
    if (score > bestDailyScore) {
      bestDailyScore = score;
      const [empId, date] = key.split('_');
      bestDailyEmployee = employeeIdToName[empId] || 'موظف مجهول';
      bestDailyDate = date;
    }
  });

  let bestWeeklyScore = 0;
  let bestWeeklyEmployee = 'لا يوجد';
  let bestWeeklyDetails = '-';
  Object.entries(weeklyScores).forEach(([key, score]) => {
    if (score > bestWeeklyScore) {
      bestWeeklyScore = score;
      const [empId, weekStart] = key.split('_');
      bestWeeklyEmployee = employeeIdToName[empId] || 'موظف مجهول';
      bestWeeklyDetails = `الأسبوع من ${weekStart}`;
    }
  });

  let bestMonthlyScore = 0;
  let bestMonthlyEmployee = 'لا يوجد';
  let bestMonthlyDetails = '-';
  Object.entries(monthlyScores).forEach(([key, score]) => {
    if (score > bestMonthlyScore) {
      bestMonthlyScore = score;
      const [empId, month] = key.split('_');
      bestMonthlyEmployee = employeeIdToName[empId] || 'موظف مجهول';
      bestMonthlyDetails = `شهر ${month}`;
    }
  });

  // Build grand summary section rows
  worksheetData.push(["========================================================================================="]);
  worksheetData.push(["ملخص تقرير الأداء الميداني العام والتقييم المتكامل للفترة"]);
  worksheetData.push(["========================================================================================="]);
  worksheetData.push(["إجمالي عدد الكوادر والموظفين بالتقرير", sortedEmployees.length]);
  worksheetData.push(["إجمالي عدد العمليات والمهام المكتملة والمكافآت", combinedRecords.length]);
  worksheetData.push(["إجمالي صافي نقاط التقييم الموزعة", combinedRecords.reduce((s, t) => s + t.points, 0)]);

  const topEmpObj = sortedEmployees[0];
  if (topEmpObj && topEmpObj.totalPoints > 0) {
    worksheetData.push(["أفضل موظف أداءً وصاحب الصدارة", `${topEmpObj.name} (بمجموع ${topEmpObj.totalPoints} نقطة)`]);
  } else {
    worksheetData.push(["أفضل موظف أداءً وصاحب الصدارة", "لا يوجد"]);
  }

  worksheetData.push(["أفضل نتيجة نقاط يومية مسجلة لموظف", bestDailyScore > 0 ? `${bestDailyEmployee} - ${bestDailyScore} نقطة بتاريخ ${bestDailyDate}` : "لا يوجد"]);
  worksheetData.push(["أفضل نتيجة نقاط أسبوعية مسجلة لموظف", bestWeeklyScore > 0 ? `${bestWeeklyEmployee} - ${bestWeeklyScore} نقطة (${bestWeeklyDetails})` : "لا يوجد"]);
  worksheetData.push(["أفضل نتيجة نقاط شهرية مسجلة لموظف", bestMonthlyScore > 0 ? `${bestMonthlyEmployee} - ${bestMonthlyScore} نقطة (${bestMonthlyDetails})` : "لا يوجد"]);
  worksheetData.push(["========================================================================================="]);

  // Convert 2D Array to SheetJS Worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  // Configure RTL for arabic display in Excel
  if (!worksheet['!views']) worksheet['!views'] = [];
  worksheet['!views'].push({ RTL: true });

  // Align Title and Subtitle across 13 columns
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } }
  ];

  // Set highly professional, readable column widths (13 columns)
  const maxProps = [15, 25, 18, 25, 20, 20, 15, 25, 25, 25, 20, 20, 15];
  worksheet['!cols'] = maxProps.map(width => ({ wch: width }));

  // Create workbook & write file
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `تقرير الأداء ${labelMap[filterType]}`);

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `FutureX_Report_${filterType}_${dateStr}.xlsx`);
}

// Format milliseconds to HH:MM:SS
export function formatMsToHMS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export function isTechnicianEmployee(emp: { role?: string; employeeType?: string; name?: string; status?: string } | null | undefined): boolean {
  if (!emp) return false;

  if (emp.status === 'suspended' || emp.status === 'terminated') {
    return false;
  }

  const roleStr = (emp.role || '').toString().trim().toLowerCase();
  const typeStr = (emp.employeeType || '').toString().trim().toLowerCase();

  const excludedRoles = [
    'manager', 'owner', 'supervisor', 'accountant', 'viewer', 'administrative',
    'مدير', 'مالك', 'مشرف', 'محاسب', 'مراقب', 'إداري', 'اداري'
  ];

  if (excludedRoles.some(ex => roleStr.includes(ex) || typeStr.includes(ex))) {
    return false;
  }

  const isRoleTech = roleStr === 'technician' || roleStr === 'فني' || roleStr.includes('tech') || roleStr.includes('صيانة') || roleStr.includes('تنصيب') || roleStr.includes('ميدان') || roleStr.includes('برج') || roleStr.includes('عامل');
  const isTypeTech = typeStr === 'technician' || typeStr === 'فني' || typeStr.includes('tech') || typeStr.includes('ميدان');

  if (isRoleTech || isTypeTech) {
    return true;
  }

  // If role is undefined, empty, 'employee', 'موظف', or generic, treat as technician if not in excluded roles
  if (!emp.role || !emp.employeeType || roleStr === 'employee' || roleStr === 'موظف' || roleStr === 'user') {
    return true;
  }

  return true;
}

/**
 * Calculates the effective work date string (YYYY-MM-DD).
 * The work day rolls over at 03:00 AM. Before 03:00 AM,
 * current time belongs to the previous calendar day's work shift.
 */
export function getEffectiveWorkDateStr(now: Date = new Date()): string {
  const d = new Date(now);
  if (d.getHours() < 3) {
    d.setDate(d.getDate() - 1);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function canAssignTaskToTechnician(
  employeeId: string,
  employees: Employee[],
  _attendanceRecords?: AttendanceRecord[],
  _companySettings?: CompanySettings | null
): { allowed: boolean; errorMessage?: string } {
  // Check employee status
  const emp = employees.find((e) => e.id === employeeId);
  if (emp && (emp.status === 'suspended' || emp.status === 'terminated')) {
    return {
      allowed: false,
      errorMessage: 'الموظف معطل أو منتهي خدماته.',
    };
  }

  // Check role: Only technicians can receive tasks
  if (emp && !isTechnicianEmployee(emp)) {
    return {
      allowed: false,
      errorMessage: 'لا يمكن إرسال أو إسناد المهام إلا للموظفين المصنفين بوظيفة (فني). الموظفون الإداريون والمدراء لا تسند لهم مهام.',
    };
  }

  return { allowed: true };
}

// Interfaces and helpers for Subscribers Database Export
export interface SubscriberRecordExportItem {
  subscriberKey: string;
  phone: string;
  name: string;
  tasks: Task[];
  latestTaskTime: number;
}

export interface SubscriberExportFilterOptions {
  daysOption: 'all' | '1' | '2' | '3' | '7' | '14' | '30' | 'custom_days' | 'custom_range';
  customDaysCount?: number;
  startDate?: string;
  endDate?: string;
  statusFilter: 'all' | 'pending' | 'rejected' | 'completed' | 'active';
  employeeFilter?: string;
  taskTypeFilter?: string;
}

/**
 * Filter subscriber records and their tasks by selected days/dates and status
 */
export function filterSubscriberTasksByExportOptions(
  allSubscribers: SubscriberRecordExportItem[],
  options: SubscriberExportFilterOptions
): {
  filteredSubscribers: SubscriberRecordExportItem[];
  filterLabel: string;
  daysLabel: string;
  statusLabel: string;
  totalFilteredTasks: number;
  statusCounts: { pending: number; rejected: number; completed: number; active: number };
} {
  const now = new Date();
  let minTime = 0;
  let maxTime = Infinity;
  let daysLabel = 'كافة الأوقات السابقة';

  if (options.daysOption === '1') {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    minTime = todayStart;
    daysLabel = 'سجل اليوم الحالي';
  } else if (options.daysOption === '2') {
    minTime = now.getTime() - (2 * 24 * 60 * 60 * 1000);
    daysLabel = 'سجل آخر يومين (48 ساعة)';
  } else if (options.daysOption === '3') {
    minTime = now.getTime() - (3 * 24 * 60 * 60 * 1000);
    daysLabel = 'سجل آخر 3 أيام';
  } else if (options.daysOption === '7') {
    minTime = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    daysLabel = 'سجل آخر 7 أيام';
  } else if (options.daysOption === '14') {
    minTime = now.getTime() - (14 * 24 * 60 * 60 * 1000);
    daysLabel = 'سجل آخر 14 يوم';
  } else if (options.daysOption === '30') {
    minTime = now.getTime() - (30 * 24 * 60 * 60 * 1000);
    daysLabel = 'سجل آخر 30 يوم';
  } else if (options.daysOption === 'custom_days' && options.customDaysCount && options.customDaysCount > 0) {
    minTime = now.getTime() - (options.customDaysCount * 24 * 60 * 60 * 1000);
    daysLabel = `سجل آخر ${options.customDaysCount} يوم`;
  } else if (options.daysOption === 'custom_range' && options.startDate) {
    minTime = new Date(`${options.startDate}T00:00:00`).getTime();
    if (options.endDate) {
      maxTime = new Date(`${options.endDate}T23:59:59`).getTime();
      daysLabel = `النطاق من ${options.startDate} إلى ${options.endDate}`;
    } else {
      daysLabel = `منذ تاريخ ${options.startDate}`;
    }
  }

  let statusLabel = 'جميع الحالات (الكل)';
  if (options.statusFilter === 'pending') statusLabel = 'محتمل فقط (قيد الانتظار)';
  else if (options.statusFilter === 'rejected') statusLabel = 'مرفوض فقط (اعتذار)';
  else if (options.statusFilter === 'completed') statusLabel = 'مكتمل فقط';
  else if (options.statusFilter === 'active') statusLabel = 'جاري الآن فقط';

  let taskTypeLabel = 'كافة أنواع المهام';
  if (options.taskTypeFilter && options.taskTypeFilter !== 'all') {
    taskTypeLabel = `نوع المهمة: ${options.taskTypeFilter}`;
  }

  const filterLabel = `الفترة الزمنية: ${daysLabel} | فلترة الحالة: ${statusLabel} | ${taskTypeLabel}`;

  const statusCounts = { pending: 0, rejected: 0, completed: 0, active: 0 };
  let totalFilteredTasks = 0;

  const resultSubscribers: SubscriberRecordExportItem[] = [];

  allSubscribers.forEach(sub => {
    const matchingTasks = sub.tasks.filter(t => {
      const taskTime = new Date(t.startTime || t.assignedDate || Date.now()).getTime();
      if (taskTime < minTime || taskTime > maxTime) return false;

      if (options.statusFilter !== 'all' && t.status !== options.statusFilter) {
        return false;
      }

      if (options.employeeFilter && options.employeeFilter !== 'all' && t.employeeId !== options.employeeFilter) {
        return false;
      }

      if (options.taskTypeFilter && options.taskTypeFilter !== 'all') {
        const targetType = options.taskTypeFilter.trim().toLowerCase();
        const taskTypeStr = (t.taskType || '').trim().toLowerCase();
        if (!taskTypeStr.includes(targetType) && !targetType.includes(taskTypeStr)) {
          return false;
        }
      }

      return true;
    });

    if (matchingTasks.length > 0) {
      matchingTasks.forEach(t => {
        if (t.status === 'pending') statusCounts.pending++;
        else if (t.status === 'rejected') statusCounts.rejected++;
        else if (t.status === 'completed') statusCounts.completed++;
        else if (t.status === 'active') statusCounts.active++;
        totalFilteredTasks++;
      });

      const sortedTasks = [...matchingTasks].sort((a, b) => 
        new Date(a.startTime || a.assignedDate || 0).getTime() - new Date(b.startTime || b.assignedDate || 0).getTime()
      );

      const latestTime = new Date(sortedTasks[sortedTasks.length - 1].startTime || sortedTasks[sortedTasks.length - 1].assignedDate || 0).getTime();

      resultSubscribers.push({
        subscriberKey: sub.subscriberKey,
        phone: sub.phone,
        name: sub.name,
        tasks: sortedTasks,
        latestTaskTime: latestTime
      });
    }
  });

  resultSubscribers.sort((a, b) => b.latestTaskTime - a.latestTaskTime);

  return {
    filteredSubscribers: resultSubscribers,
    filterLabel,
    daysLabel,
    statusLabel,
    totalFilteredTasks,
    statusCounts
  };
}

/**
 * Export Subscribers Database to Excel (.xlsx) file
 */
export function exportSubscribersToExcel(
  allSubscribers: SubscriberRecordExportItem[],
  options: SubscriberExportFilterOptions
) {
  const { filteredSubscribers, filterLabel, daysLabel, statusLabel, totalFilteredTasks, statusCounts } = 
    filterSubscriberTasksByExportOptions(allSubscribers, options);

  const workbook = XLSX.utils.book_new();

  // Helper status text translator
  const translateStatus = (st: string) => {
    switch (st) {
      case 'pending': return '⏳ محتمل (قيد الانتظار)';
      case 'rejected': return '🔴 مرفوض (اعتذار)';
      case 'completed': return '🔵 مكتمل';
      case 'active': return '🟢 جاري الآن';
      default: return st || 'غير محدد';
    }
  };

  // --- Sheet 1: ملخص المشتركين ---
  const summarySheetData: any[][] = [];
  summarySheetData.push(['تقرير قاعدة بيانات المشتركين - FutureX']);
  summarySheetData.push([`النطاق المحدد: ${daysLabel}`]);
  summarySheetData.push([`فلتر الحالة: ${statusLabel}`]);
  summarySheetData.push([`تاريخ التصدير: ${new Date().toLocaleDateString('ar-IQ', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]);
  summarySheetData.push([]);
  
  // Statistical Overview
  summarySheetData.push([
    'إجمالي المشتركين المطابقين',
    'إجمالي سجلات الفتح',
    'محتمل (قيد الانتظار)',
    'مرفوض (اعتذار)',
    'مكتمل',
    'جاري الان'
  ]);
  summarySheetData.push([
    filteredSubscribers.length,
    totalFilteredTasks,
    statusCounts.pending,
    statusCounts.rejected,
    statusCounts.completed,
    statusCounts.active
  ]);
  summarySheetData.push([]);

  // Subscribers Summary Table Header
  summarySheetData.push([
    'ت',
    'اسم المشترك',
    'رقم الهاتف',
    'عدد التكليفات في النطاق',
    'أحدث نوع مهمة',
    'أحدث حالة للمهمة',
    'سبب الرفض / الاعتذار (إن وجد)',
    'الفني المسؤول عن أحدث مهمة',
    'تاريخ أحدث فتح'
  ]);

  filteredSubscribers.forEach((sub, idx) => {
    const latestTask = sub.tasks[sub.tasks.length - 1];
    const latestRejection = latestTask?.rejectionReason || latestTask?.previousRejectionReason || latestTask?.reopenRequestReason || '-';
    summarySheetData.push([
      idx + 1,
      sub.name,
      sub.phone || 'غير مسجل',
      sub.tasks.length,
      latestTask?.taskType || '-',
      translateStatus(latestTask?.status || ''),
      latestRejection,
      latestTask?.employeeName || '-',
      latestTask ? new Date(latestTask.startTime || latestTask.assignedDate || 0).toLocaleString('ar-IQ') : '-'
    ]);
  });

  const summaryWorksheet = XLSX.utils.aoa_to_sheet(summarySheetData);
  summaryWorksheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 18 },
    { wch: 22 },
    { wch: 18 },
    { wch: 24 },
    { wch: 35 },
    { wch: 24 },
    { wch: 26 }
  ];
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'ملخص المشتركين');

  // --- Sheet 2: تفاصيل سجلات الفتح والتكليفات ---
  const detailSheetData: any[][] = [];
  detailSheetData.push(['سجل تفاصيل فتح التكليفات للمشتركين - FutureX']);
  detailSheetData.push([filterLabel]);
  detailSheetData.push([]);

  detailSheetData.push([
    'ت',
    'اسم المشترك',
    'رقم الهاتف',
    'الفتح رقم',
    'الفني المسؤول',
    'نوع المهمة',
    'حالة المهمة',
    'سبب الرفض / الاعتذار (إن وجد)',
    'تاريخ ووقت الإرسال',
    'تاريخ ووقت الإنجاز / الرفض',
    'الملاحظات وتفاصيل العمل'
  ]);

  let globalDetailRowIdx = 1;
  filteredSubscribers.forEach(sub => {
    sub.tasks.forEach((task, tIdx) => {
      const taskRejection = task.rejectionReason || task.previousRejectionReason || task.reopenRequestReason || '-';
      detailSheetData.push([
        globalDetailRowIdx++,
        sub.name,
        sub.phone || 'غير مسجل',
        `الفتح رقم (${tIdx + 1})`,
        task.employeeName || '-',
        task.taskType || '-',
        translateStatus(task.status),
        taskRejection,
        task.startTime ? new Date(task.startTime).toLocaleString('ar-IQ') : (task.assignedDate ? new Date(task.assignedDate).toLocaleString('ar-IQ') : '-'),
        task.endTime ? new Date(task.endTime).toLocaleString('ar-IQ') : (task.rejectedAt ? new Date(task.rejectedAt).toLocaleString('ar-IQ') : '-'),
        task.notes || task.operationDetails || '-'
      ]);
    });
  });

  const detailWorksheet = XLSX.utils.aoa_to_sheet(detailSheetData);
  detailWorksheet['!cols'] = [
    { wch: 6 },
    { wch: 26 },
    { wch: 18 },
    { wch: 15 },
    { wch: 22 },
    { wch: 16 },
    { wch: 22 },
    { wch: 38 },
    { wch: 24 },
    { wch: 24 },
    { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(workbook, detailWorksheet, 'تفاصيل سجلات الفتح');

  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `قاعدة_بيانات_المشتركين_${options.statusFilter}_${dateStr}.xlsx`);
}

/**
 * Export / Print Subscribers Database to PDF
 */
export function exportSubscribersToPDF(
  allSubscribers: SubscriberRecordExportItem[],
  options: SubscriberExportFilterOptions
) {
  const { filteredSubscribers, filterLabel, daysLabel, statusLabel, totalFilteredTasks, statusCounts } = 
    filterSubscriberTasksByExportOptions(allSubscribers, options);

  const translateStatus = (st: string) => {
    switch (st) {
      case 'pending': return '⏳ محتمل (قيد الانتظار)';
      case 'rejected': return '🔴 مرفوض (اعتذار)';
      case 'completed': return '🔵 مكتمل';
      case 'active': return '🟢 جاري الآن';
      default: return st || 'غير محدد';
    }
  };

  const getStatusBadgeStyle = (st: string) => {
    switch (st) {
      case 'pending': return 'background:#fef3c7; color:#92400e; border:1px solid #fde68a;';
      case 'rejected': return 'background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;';
      case 'completed': return 'background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe;';
      case 'active': return 'background:#dcfce7; color:#166534; border:1px solid #86efac;';
      default: return 'background:#f1f5f9; color:#475569;';
    }
  };

  const formattedExportDate = new Date().toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const printHtml = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>تقرير قاعدة بيانات المشتركين - FutureX</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap');
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: 'Tajawal', sans-serif;
        }

        body {
          background-color: #ffffff;
          color: #0f172a;
          padding: 24px;
          font-size: 13px;
          line-height: 1.5;
        }

        .header-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 16px;
          border-bottom: 3px solid #1e3a8a;
          margin-bottom: 20px;
        }

        .logo-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-box {
          width: 48px;
          height: 48px;
          background: #1e3a8a;
          color: #ffffff;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          font-size: 20px;
        }

        .title-text h1 {
          font-size: 20px;
          font-weight: 900;
          color: #0f172a;
        }

        .title-text p {
          font-size: 12px;
          color: #64748b;
          font-weight: 700;
        }

        .meta-info {
          text-align: left;
          font-size: 11px;
          color: #475569;
          font-weight: 700;
        }

        .filter-banner {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .filter-pill {
          background: #1e3a8a;
          color: #ffffff;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 900;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 10px;
          text-align: center;
        }

        .stat-card .num {
          font-size: 18px;
          font-weight: 900;
          color: #1e3a8a;
        }

        .stat-card .label {
          font-size: 10px;
          color: #475569;
          font-weight: 700;
          margin-top: 2px;
        }

        .subscriber-card {
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          margin-bottom: 16px;
          overflow: hidden;
          page-break-inside: avoid;
        }

        .subscriber-header {
          background: #f8fafc;
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sub-name {
          font-size: 15px;
          font-weight: 900;
          color: #0f172a;
        }

        .sub-phone {
          font-family: monospace;
          font-size: 13px;
          font-weight: 800;
          color: #1e3a8a;
          direction: ltr;
        }

        .task-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .task-table th {
          background: #f1f5f9;
          color: #334155;
          font-weight: 800;
          text-align: right;
          padding: 8px 10px;
          border-bottom: 1px solid #cbd5e1;
        }

        .task-table td {
          padding: 8px 10px;
          border-bottom: 1px solid #f1f5f9;
          color: #1e293b;
        }

        .status-badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 10px;
        }

        .footer {
          margin-top: 30px;
          padding-top: 12px;
          border-top: 1px dashed #cbd5e1;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
        }

        @media print {
          body {
            padding: 0;
          }
          .subscriber-card {
            page-break-inside: avoid;
          }
        }
      </style>
    </head>
    <body>
      <div class="header-container">
        <div class="logo-title">
          <div class="logo-box">FX</div>
          <div class="title-text">
            <h1>تقرير قاعدة بيانات المشتركين</h1>
            <p>نظام إدارة وتتبع صيانة وتنصيب المشتركين - FutureX</p>
          </div>
        </div>
        <div class="meta-info">
          <div>تاريخ التصدير: ${formattedExportDate}</div>
          <div>تم التصدير بواسطة الإدارة</div>
        </div>
      </div>

      <div class="filter-banner">
        <div>
          <span style="font-weight:900; color:#334155;">شروط التقرير والتصفية:</span>
          <span style="color:#0f172a; font-weight:800; margin-right:6px;">${filterLabel}</span>
        </div>
        <div class="filter-pill">${daysLabel}</div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="num">${filteredSubscribers.length}</div>
          <div class="label">إجمالي المشتركين</div>
        </div>
        <div class="stat-card">
          <div class="num">${totalFilteredTasks}</div>
          <div class="label">إجمالي سجلات الفتح</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:#d97706;">${statusCounts.pending}</div>
          <div class="label">محتمل (قيد الانتظار)</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:#dc2626;">${statusCounts.rejected}</div>
          <div class="label">مرفوض (اعتذار)</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:#2563eb;">${statusCounts.completed}</div>
          <div class="label">مكتمل</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:#16a34a;">${statusCounts.active}</div>
          <div class="label">جاري الآن</div>
        </div>
      </div>

      ${filteredSubscribers.length === 0 ? `
        <div style="text-align:center; padding:40px; background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; font-weight:800; color:#64748b;">
          لا توجد سجلات مشتركين مطابقة للفترة المحددة (${daysLabel}) وحالة التصفية المختارة.
        </div>
      ` : `
        <div class="subscribers-list">
          ${filteredSubscribers.map((sub, sIdx) => `
            <div class="subscriber-card">
              <div class="subscriber-header">
                <div>
                  <span style="color:#64748b; font-weight:800; margin-left:6px;">#${sIdx + 1}</span>
                  <span class="sub-name">${sub.name}</span>
                </div>
                <div style="display:flex; align-items:center; gap:12px;">
                  <span style="font-size:11px; font-weight:800; color:#475569;">عدد الفتحات: <strong style="color:#1e3a8a;">${sub.tasks.length}</strong></span>
                  <span class="sub-phone">${sub.phone || 'بدون هاتف'}</span>
                </div>
              </div>

              <table class="task-table">
                <thead>
                  <tr>
                    <th style="width:70px;">الفتح</th>
                    <th style="width:130px;">الفني المسؤول</th>
                    <th style="width:100px;">نوع المهمة</th>
                    <th style="width:120px;">الحالة</th>
                    <th style="width:140px;">تاريخ ووقت الإرسال</th>
                    <th>الملاحظات / سبب الرفض</th>
                  </tr>
                </thead>
                <tbody>
                  ${sub.tasks.map((task, tIdx) => `
                    <tr>
                      <td style="font-weight:800; color:#1e3a8a;">#${tIdx + 1}</td>
                      <td style="font-weight:800; color:#0f172a;">${task.employeeName || '-'}</td>
                      <td style="font-weight:700;">${task.taskType || '-'}</td>
                      <td>
                        <span class="status-badge" style="${getStatusBadgeStyle(task.status)}">
                          ${translateStatus(task.status)}
                        </span>
                      </td>
                      <td style="direction:ltr; text-align:right; font-family:monospace; font-weight:700;">
                        ${task.startTime ? new Date(task.startTime).toLocaleString('ar-IQ') : (task.assignedDate ? new Date(task.assignedDate).toLocaleString('ar-IQ') : '-')}
                      </td>
                      <td style="font-size:10px; color:#334155;">
                        ${(task.rejectionReason || task.previousRejectionReason || task.reopenRequestReason) ? `<div style="margin-bottom:2px;"><strong style="color:#dc2626;">سبب الرفض / الاعتذار:</strong> ${task.rejectionReason || task.previousRejectionReason || task.reopenRequestReason}</div>` : ''}
                        ${task.notes ? `<div><strong>الملاحظات:</strong> ${task.notes}</div>` : ''}
                        ${!task.notes && !task.rejectionReason && !task.previousRejectionReason && !task.reopenRequestReason ? '-' : ''}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `).join('')}
        </div>
      `}

      <div class="footer">
        <div>FutureX CRM System &copy; ${new Date().getFullYear()}</div>
        <div>صفحة التقرير الصادرة من قاعدة بيانات المشتركين</div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHtml);
    printWindow.document.close();
  } else {
    alert('يرجى السماح بفتح النوافذ المنبثقة لطباعة/تصدير تقرير PDF');
  }
}

/**
 * Normalizes any date representation (e.g., "31", "يوم 31", "31/7", "31/07/2026", "31-07-2026", "2026-7-31", "2026-07-31T...")
 * into a clean standard ISO short date string YYYY-MM-DD.
 */
export function normalizeDateString(input: string | undefined | null): string {
  if (!input) return '';
  let str = input.toString().trim();
  if (!str) return '';

  // 0. Convert Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩) to standard ASCII digits (0123456789)
  str = str.replace(/[٠-٩]/g, (d) => (d.charCodeAt(0) - 1632).toString());

  // Remove Arabic/English day prefix words like "يوم", "يوم ", "day"
  str = str.replace(/يوم/g, '').replace(/day/i, '').trim();

  str = str.split('T')[0].trim();
  if (!str) return '';

  // 1. YYYY-MM-DD or YYYY-M-D or YYYY/MM/DD or YYYY/M/D
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(str)) {
    const parts = str.split(/[-/]/);
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. DD/MM/YYYY or D/M/YYYY or DD-MM-YYYY or D-M-YYYY
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(str)) {
    const parts = str.split(/[-/]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = parts[2];
    return `${y}-${m}-${d}`;
  }

  // 3. DD/MM or D/M (e.g. "31/7" or "31/07")
  if (/^\d{1,2}[-/]\d{1,2}$/.test(str)) {
    const parts = str.split(/[-/]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    const y = new Date().getFullYear();
    return `${y}-${m}-${d}`;
  }

  // 4. Single or double digit day number, e.g. "31" or "16"
  if (/^\d{1,2}$/.test(str)) {
    const day = parseInt(str, 10);
    if (day >= 1 && day <= 31) {
      const now = new Date();
      let y = now.getFullYear();
      let m = now.getMonth() + 1; // 1-indexed

      // If specified day is greater than current day of month (e.g. today is Aug 11, user types 31),
      // day 31 refers to previous month (July = 7)
      if (day > now.getDate()) {
        m = m - 1;
        if (m < 1) {
          m = 12;
          y = y - 1;
        }
      }
      const mStr = String(m).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      return `${y}-${mStr}-${dStr}`;
    }
  }

  // 5. JS Date fallback for strings like "July 31, 2026"
  if (isNaN(Number(str))) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  return str;
}

/**
 * Returns localized Arabic label for a payroll period range
 * Example: "دورة 16 آب - 15 أيلول 2026"
 */
export function getPayrollCycleLabel(startDateStr: string, endDateStr: string): string {
  if (!startDateStr || !endDateStr) return '-';
  try {
    const sDate = new Date(startDateStr);
    const eDate = new Date(endDateStr);

    const sDay = sDate.getDate();
    const eDay = eDate.getDate();
    const sMonth = sDate.toLocaleDateString('ar-EG', { month: 'long' });
    const eMonth = eDate.toLocaleDateString('ar-EG', { month: 'long' });
    const eYear = eDate.getFullYear();

    if (sMonth === eMonth) {
      return `دورة ${sDay} إلى ${eDay} ${eMonth} ${eYear}`;
    }
    return `دورة ${sDay} ${sMonth} إلى ${eDay} ${eMonth} ${eYear}`;
  } catch {
    return `${startDateStr} إلى ${endDateStr}`;
  }
}

/**
 * Calculates the exact payroll cycle (periodId, startDate, endDate, label) for any given date
 */
export function getPayrollCycleRangeForDate(
  dateStr: string,
  startDay: number = 16,
  endDay: number = 15
): { id: string; startDate: string; endDate: string; label: string } {
  let targetDate = new Date();
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }

  const curDay = targetDate.getDate();
  let startM = targetDate.getMonth(); // 0-indexed
  let startY = targetDate.getFullYear();

  if (startDay === 1) {
    // Normal calendar month cycle
    const lastDayOfMonth = new Date(startY, startM + 1, 0).getDate();
    const sDateStr = `${startY}-${String(startM + 1).padStart(2, '0')}-01`;
    const eDateStr = `${startY}-${String(startM + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
    const pId = `${startY}-${String(startM + 1).padStart(2, '0')}`;
    return {
      id: pId,
      startDate: sDateStr,
      endDate: eDateStr,
      label: getPayrollCycleLabel(sDateStr, eDateStr)
    };
  }

  // Cross-month cycle (e.g. 16th of previous month to 15th of current month)
  if (curDay < startDay) {
    startM -= 1;
    if (startM < 0) {
      startM = 11;
      startY -= 1;
    }
  }

  const endM = startM === 11 ? 0 : startM + 1;
  const endY = startM === 11 ? startY + 1 : startY;

  const startDate = `${startY}-${String(startM + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
  const endDate = `${endY}-${String(endM + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  const id = `${endY}-${String(endM + 1).padStart(2, '0')}`;

  return {
    id,
    startDate,
    endDate,
    label: getPayrollCycleLabel(startDate, endDate)
  };
}

/**
 * Generates the list of recent payroll cycles (e.g. past 12 cycles + current)
 */
export function generateRecentPayrollCycles(
  count: number = 12,
  startDay: number = 16,
  endDay: number = 15
): Array<{ id: string; startDate: string; endDate: string; label: string }> {
  const cycles: Array<{ id: string; startDate: string; endDate: string; label: string }> = [];
  const now = new Date();

  // Current cycle reference point
  const currentCycle = getPayrollCycleRangeForDate(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    startDay,
    endDay
  );

  const [refYStr, refMStr] = currentCycle.id.split('-');
  let refY = parseInt(refYStr, 10);
  let refM = parseInt(refMStr, 10);

  for (let i = 0; i < count; i++) {
    let m = refM - i;
    let y = refY;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }

    if (startDay === 1) {
      const lastDayOfMonth = new Date(y, m, 0).getDate();
      const sDateStr = `${y}-${String(m).padStart(2, '0')}-01`;
      const eDateStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
      const pId = `${y}-${String(m).padStart(2, '0')}`;
      cycles.push({
        id: pId,
        startDate: sDateStr,
        endDate: eDateStr,
        label: getPayrollCycleLabel(sDateStr, eDateStr)
      });
    } else {
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      const sDateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
      const eDateStr = `${y}-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
      const pId = `${y}-${String(m).padStart(2, '0')}`;
      cycles.push({
        id: pId,
        startDate: sDateStr,
        endDate: eDateStr,
        label: getPayrollCycleLabel(sDateStr, eDateStr)
      });
    }
  }

  return cycles;
}

