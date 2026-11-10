import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  AlertCircle, 
  Trash2, 
  Pencil, 
  Search, 
  Star, 
  MapPin, 
  User, 
  Tag, 
  ArrowUpDown, 
  ShieldAlert, 
  Check, 
  X,
  ChevronDown,
  History,
  RefreshCw,
  Send,
  Banknote
} from 'lucide-react';
import { Employee, Task, DbTaskType, PointsRules, ConsumedMaterial } from '../types';
import { formatMsToHMS, formatArabicTimeOnly, formatArabicDateOnly, calculateTaskPoints, toLocalInputString, getTaskTimeLimitMinutes } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

// Helper to resolve standard task type emojis
const getEmojiForTaskType = (name: string): string => {
  const normName = name.trim();
  if (normName.includes('تنصيب')) return '🛠️';
  if (normName.includes('صيانة')) return '🔧';
  if (normName.includes('سحب')) return '📦';
  if (normName.includes('تنظيف')) return '🧹';
  if (normName.includes('أعمدة') || normName.includes('اعمدة')) return '🪜';
  if (normName.includes('دعم')) return '🧰';
  if (normName.includes('كلك')) return '⚡';
  if (normName.includes('حفري') || normName.includes('حفر')) return '🕳️';
  if (normName.includes('منفذ') || normName.includes('منافذ')) return '🔌';
  if (normName.includes('توصيل') || normName.includes('دلفري')) return '🛵';
  return '📋';
};

import TaskRegistration from './TaskRegistration';

interface ActiveTasksViewProps {
  employees: Employee[];
  activeTasks: Task[];
  allTasks?: Task[];
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  onStartTask?: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string,
    parentTaskId?: string
  ) => void;
  onCompleteTask: (
    id: string, 
    endTime: string, 
    delayReason?: string, 
    operationDetails?: string,
    consumedMaterials?: ConsumedMaterial[],
    paymentInfo?: {
      paymentStatus: 'collected' | 'free';
      collectedAmount?: number;
      paymentNotes?: string;
    }
  ) => void;
  onPauseTask: (id: string, reason: string) => void;
  onResumeTask: (id: string) => void;
  onCancelActiveTask: (id: string) => void;
  userRole: 'owner' | 'supervisor' | 'manager' | 'technician' | 'admin' | 'viewer';
  onEditActiveTask?: (updatedTask: Task) => void;
  onAcceptTask?: (id: string) => void;
  onRejectTask?: (id: string, reason: string) => void;
  onApproveReopenTask?: (taskId: string) => void;
  onRejectReopenTask?: (taskId: string, reason?: string) => void;
  onApproveDelayReason?: (taskId: string) => void;
  onRejectDelayReason?: (taskId: string) => void;
  onApprovePauseTask?: (taskId: string) => void;
  onRejectPauseTask?: (taskId: string, reason?: string) => void;
  onPostponeTask?: (taskId: string, reason: string) => void;
}

export default function ActiveTasksView({
  employees,
  activeTasks,
  allTasks = [],
  taskTypes,
  pointsRules,
  onStartTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onCancelActiveTask,
  userRole,
  onEditActiveTask,
  onAcceptTask,
  onRejectTask,
  onApproveReopenTask,
  onRejectReopenTask,
  onApproveDelayReason,
  onRejectDelayReason,
  onApprovePauseTask,
  onRejectPauseTask,
  onPostponeTask,
}: ActiveTasksViewProps) {
  // Main sub-section state: 'list' (قسم المهام والبحث) vs 'send' (قسم إرسال المهام)
  const [activeSection, setActiveSection] = useState<'list' | 'send'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'paused'>('all');

  // Sort states for Active Tasks
  const [activeSort, setActiveSort] = useState<'technician' | 'taskType' | 'newest' | 'oldest' | 'duration'>('newest');

  // Pagination state: limit displayed tasks (starts with 10)
  const [visibleTasksCount, setVisibleTasksCount] = useState<number>(10);

  // Reset pagination when search, status filter or sort option changes
  useEffect(() => {
    setVisibleTasksCount(10);
  }, [statusFilter, searchQuery, activeSort]);

  // Count only running (active) tasks grouped by taskType
  const taskTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    // Initialize all existing task types from settings to 0
    taskTypes.forEach(tt => {
      counts[tt.name] = 0;
    });

    // Accumulate only running (active) tasks
    activeTasks.forEach(task => {
      if (task.status === 'active') {
        const name = task.taskType;
        if (counts[name] !== undefined) {
          counts[name]++;
        } else {
          counts[name] = 1;
        }
      }
    });

    return counts;
  }, [activeTasks, taskTypes]);

  // Calculate total number of active running tasks
  const totalActiveRunningCount = useMemo(() => {
    return Object.keys(taskTypeCounts).reduce((acc: number, key: string) => acc + (taskTypeCounts[key] || 0), 0);
  }, [taskTypeCounts]);

  const [tick, setTick] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPauseDialog, setShowPauseDialog] = useState<string | null>(null);
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [completionOperationDetails, setCompletionOperationDetails] = useState('');

  // Subscriber payment collection states
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'collected'>('free');
  const [collectedAmount, setCollectedAmount] = useState<number | ''>('');
  const [paymentNotes, setPaymentNotes] = useState('');
  
  const [pauseReason, setPauseReason] = useState('');
  const [pauseError, setPauseError] = useState('');

  // Rejection modal state for pending tasks
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  // Resend task state
  const [resendingTask, setResendingTask] = useState<Task | null>(null);
  const [resendTechId, setResendTechId] = useState<string>('');
  const [resendTaskType, setResendTaskType] = useState<string>('');
  const [resendNotes, setResendNotes] = useState<string>('');
  const [resendError, setResendError] = useState<string>('');

  const handleOpenResendModal = (task: Task) => {
    setResendingTask(task);
    setResendTechId(employees[0]?.id || '');
    setResendTaskType(task.taskType || '');
    setResendNotes(task.notes || '');
    setResendError('');
  };

  const handleConfirmResend = () => {
    if (!resendingTask) return;
    if (!resendTechId) {
      setResendError('يرجى اختيار الفني لإعادة إرسال المهمة له');
      return;
    }

    const selectedEmp = employees.find(e => e.id === resendTechId);
    if (!selectedEmp) {
      setResendError('الفني المحدد غير موجود');
      return;
    }

    const nowIso = new Date().toISOString();
    const clonedTaskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const oldType = resendingTask.taskType;
    const newType = resendTaskType || oldType;
    const isTypeChanged = oldType !== newType;
    const selectedTypeObj = taskTypes.find(t => t.name === newType);
    const standardPoints = selectedTypeObj?.points ?? calculateTaskPoints(newType, 0, taskTypes, pointsRules);

    const typeChangeText = isTypeChanged 
      ? `[تم تحويل نوع المهمة من (${oldType}) إلى (${newType})] ` 
      : '';

    const isPostponed = resendingTask.status === 'postponed';
    // For postponed tasks, maintain the original task ID so its status updates to pending and it disappears from the postponed list!
    const targetTaskId = isPostponed ? resendingTask.id : clonedTaskId;

    const resendLogText = isPostponed
      ? `${typeChangeText}إعادة إرسال المهمة المؤجلة وتكليف الفني: ${selectedEmp.name} (الفني السابق: ${resendingTask.employeeName || 'غير محدد'})${resendingTask.postponeReason ? ` | سبب التأجيل السابق: ${resendingTask.postponeReason}` : ''}`
      : `${typeChangeText}إعادة فتح واستنساخ المهمة بوقت جديد وإرسالها إلى الفني: ${selectedEmp.name} (الفني السابق: ${resendingTask.employeeName})`;

    const updatedTask: Task = {
      ...resendingTask,
      id: targetTaskId,
      taskType: newType,
      points: standardPoints,
      employeeId: selectedEmp.id,
      employeeName: selectedEmp.name,
      status: 'pending',
      startTime: nowIso,
      sentAt: nowIso,
      assignedDate: nowIso,
      acceptedAt: undefined,
      completedAt: undefined,
      rejectedAt: undefined,
      endTime: undefined,
      durationMinutes: 0,
      activeWorkTimeMs: 0,
      totalPausedTimeMs: 0,
      pausedAt: undefined,
      isPaused: false,
      // Clear postponed states completely so it exits postponed list immediately
      postponedAt: undefined,
      postponeReason: undefined,
      postponedByTechName: undefined,
      previousPostponeReason: resendingTask.previousPostponeReason || resendingTask.postponeReason,
      previousRejectionReason: resendingTask.previousRejectionReason || resendingTask.rejectionReason,
      rejectionReason: undefined,
      notes: resendNotes,
      editLogs: [
        ...(resendingTask.editLogs || []),
        {
          id: `log-${Date.now()}`,
          editedBy: 'الإدارة',
          editedAt: nowIso,
          changes: resendLogText
        }
      ]
    };

    if (onEditActiveTask) {
      onEditActiveTask(updatedTask);
    }

    setResendingTask(null);
    setResendTechId('');
    setResendNotes('');
    setResendError('');
  };

  // Active task completion modal delay reason state
  const [completionDelayReason, setCompletionDelayReason] = useState('');
  const [completionDelayError, setCompletionDelayError] = useState('');

  // Active task edit states
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubscriberName, setEditSubscriberName] = useState('');
  const [editSubscriberPhone, setEditSubscriberPhone] = useState('');
  const [editPoints, setEditPoints] = useState(0);

  // Live timer tick for active tasks
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000); // refresh every 1s
    return () => clearInterval(timer);
  }, []);

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setEditEmployeeId(task.employeeId);
    setEditTaskType(task.taskType);
    setEditStartTime(toLocalInputString(new Date(task.startTime)));
    setEditNotes(task.notes || '');
    setEditSubscriberName(task.subscriberName || '');
    setEditSubscriberPhone(task.subscriberPhone || '');
    setEditPoints(task.points);
  };

  const handleConfirmPause = () => {
    if (!pauseReason.trim()) {
      setPauseError('سبب التوقف مطلوب ومهم لتوثيق العمل.');
      return;
    }
    if (showPauseDialog) {
      onPauseTask(showPauseDialog, pauseReason);
      setShowPauseDialog(null);
      setPauseReason('');
      setPauseError('');
    }
  };

  const handleSaveActiveTaskEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask || !onEditActiveTask) return;

    const empName = employees.find(emp => emp.id === editEmployeeId)?.name || editingTask.employeeName;

    const changesList: string[] = [];
    if (editingTask.employeeId !== editEmployeeId) {
      changesList.push(`نقل المهمة من الفني (${editingTask.employeeName}) إلى الفني (${empName})`);
    }
    if (editingTask.taskType !== editTaskType) {
      changesList.push(`تغيير نوع المهمة من (${editingTask.taskType}) إلى (${editTaskType})`);
    }

    const nowIso = new Date().toISOString();
    const existingEditLogs = editingTask.editLogs || [];
    const newLogEntry = changesList.length > 0 ? {
      id: `edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      editedBy: 'الإدارة',
      editedAt: nowIso,
      changes: changesList.join(' | ')
    } : null;

    const updated: Task = {
      ...editingTask,
      employeeId: editEmployeeId,
      employeeName: empName,
      taskType: editTaskType,
      startTime: editStartTime ? new Date(editStartTime).toISOString() : editingTask.startTime,
      notes: editNotes,
      subscriberName: editSubscriberName,
      subscriberPhone: editSubscriberPhone,
      points: editPoints,
      editLogs: newLogEntry ? [newLogEntry, ...existingEditLogs] : existingEditLogs
    };

    onEditActiveTask(updated);
    setEditingTask(null);
  };

  // Filter and sort tasks dynamically for Operational Tasks section (Active, Postponed, Paused, Pending only)
  const searchedAndFilteredTasks = useMemo(() => {
    let list: Task[] = [];

    // Filter to strictly keep operational tasks: active, paused, and pending (NO completed, rejected, or postponed)
    const combinedMap = new Map<string, Task>();
    (allTasks || []).forEach(t => combinedMap.set(t.id, t));
    activeTasks.forEach(t => combinedMap.set(t.id, t));

    const operationalTasks = Array.from(combinedMap.values()).filter(
      t => !t.parentTaskId && t.status !== 'completed' && t.status !== 'rejected' && t.status !== 'postponed'
    );

    if (statusFilter === 'all') {
      list = operationalTasks;
    } else if (statusFilter === 'active') {
      list = operationalTasks.filter(t => t.status === 'active');
    } else if (statusFilter === 'paused') {
      list = operationalTasks.filter(t => t.status === 'paused');
    } else if (statusFilter === 'pending') {
      list = operationalTasks.filter(t => t.status === 'pending');
    } else {
      list = operationalTasks;
    }

    // Apply search query across technician name, subscriber name, phone, notes, task type, postpone reason
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(t => {
        const empName = (t.employeeName || '').toLowerCase();
        const subName = (t.subscriberName || '').toLowerCase();
        const subPhone = (t.subscriberPhone || '').toLowerCase();
        const taskTypeStr = (t.taskType || '').toLowerCase();
        const notesStr = (t.notes || '').toLowerCase();
        const postReason = (t.postponeReason || '').toLowerCase();

        return empName.includes(q) ||
               subName.includes(q) ||
               subPhone.includes(q) ||
               taskTypeStr.includes(q) ||
               notesStr.includes(q) ||
               postReason.includes(q);
      });
    }

    // Apply sorting
    list.sort((a, b) => {
      if (activeSort === 'technician') {
        return (a.employeeName || '').localeCompare(b.employeeName || '');
      }
      if (activeSort === 'taskType') {
        return (a.taskType || '').localeCompare(b.taskType || '');
      }
      if (activeSort === 'newest') {
        return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
      }
      if (activeSort === 'oldest') {
        return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      }
      return 0;
    });

    return list;
  }, [allTasks, activeTasks, statusFilter, searchQuery, activeSort]);

  // Paginated list for display (showing 10 tasks initially, plus 10 per 'show more' click)
  const displayedTasks = useMemo(() => {
    return searchedAndFilteredTasks.slice(0, visibleTasksCount);
  }, [searchedAndFilteredTasks, visibleTasksCount]);

  // 2. Statistics for active tasks
  const activeStats = useMemo(() => {
    const totalCount = activeTasks.length;
    const runningCount = activeTasks.filter(t => t.status === 'active').length;
    const pausedCount = activeTasks.filter(t => t.status === 'paused').length;
    const workingTechs = new Set(activeTasks.map(t => t.employeeId)).size;
    
    // Average elapsed duration of active work in minutes
    let totalActiveMs = 0;
    const now = Date.now();
    activeTasks.forEach(t => {
      const start = new Date(t.startTime).getTime();
      const isPaused = t.status === 'paused';
      const currentPauseMs = (isPaused && t.pausedAt) ? (now - new Date(t.pausedAt).getTime()) : 0;
      const totalPauseMs = (t.totalPausedMs || 0) + currentPauseMs;
      totalActiveMs += Math.max(0, (now - start) - totalPauseMs);
    });
    
    const avgMinutes = totalCount > 0 ? Math.round((totalActiveMs / totalCount) / 60000) : 0;
    
    let averageDurationText = '0 دقيقة';
    if (avgMinutes > 0) {
      if (avgMinutes < 60) {
        averageDurationText = `${avgMinutes} دقيقة`;
      } else {
        const hrs = Math.floor(avgMinutes / 60);
        const mins = avgMinutes % 60;
        averageDurationText = `${hrs} س و ${mins} د`;
      }
    }
    
    return {
      runningCount,
      workingTechs,
      pausedCount,
      averageDurationText,
    };
  }, [activeTasks, tick]);

  const pendingReopenRequests = useMemo(() => {
    return (allTasks || []).filter(t => t.reopenRequested && t.reopenRequestStatus === 'pending');
  }, [allTasks]);

  const pendingPauseTasks = useMemo(() => {
    return (allTasks || []).filter(t => t.pauseRequested && t.pauseRequestStatus === 'pending');
  }, [allTasks]);

  const pendingDelayTasks = useMemo(() => {
    return (allTasks || []).filter(t => t.delayReason && t.delayStatus === 'pending');
  }, [allTasks]);

  const pendingApprovalsTasks = useMemo(() => {
    const activePending = activeTasks.filter(t => t.status === 'pending' && !t.parentTaskId);
    const reopenPending = (allTasks || []).filter(t => t.reopenRequested && t.reopenRequestStatus === 'pending' && !t.parentTaskId);
    const delayPending = (allTasks || []).filter(t => t.delayReason && t.delayStatus === 'pending' && !t.parentTaskId);
    const map = new Map<string, Task>();
    activePending.forEach(t => map.set(t.id, t));
    reopenPending.forEach(t => map.set(t.id, t));
    delayPending.forEach(t => map.set(t.id, t));
    return Array.from(map.values());
  }, [allTasks, activeTasks]);

  const postponedTasks = useMemo(() => {
    return (allTasks || []).filter(t => t.status === 'postponed' && !t.parentTaskId);
  }, [allTasks]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">
      {/* Delay Reason Approvals Banner for Owner/Supervisor/Manager */}
      {pendingDelayTasks.length > 0 && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') && (
        <div className="bg-gradient-to-r from-amber-900 to-orange-950 text-white p-5 rounded-3xl shadow-md border border-amber-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-300 animate-pulse" />
              <h3 className="font-black text-sm text-amber-100">
                طلبات قبول أسباب التأخير للمهام ({pendingDelayTasks.length})
              </h3>
            </div>
            <span className="bg-amber-800/80 text-amber-200 text-xs px-3 py-1 rounded-xl font-bold border border-amber-700">
              قرار المشرف / المدير لإلغاء أو إبقاء الخصم
            </span>
          </div>

          <div className="space-y-2">
            {pendingDelayTasks.map(delayTask => {
              const limit = getTaskTimeLimitMinutes(delayTask.taskType, taskTypes);
              const durationMs = (delayTask.endTime && delayTask.startTime)
                ? (new Date(delayTask.endTime).getTime() - new Date(delayTask.startTime).getTime() - (delayTask.totalPausedMs || 0))
                : 0;
              const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
              const overtimeMinutes = Math.max(0, durationMinutes - limit);

              return (
                <div key={delayTask.id} className="bg-amber-950/80 border border-amber-800/80 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-sm">{delayTask.taskType}</span>
                      <span className="text-[10px] text-amber-300 font-bold bg-amber-900 px-2 py-0.5 rounded-md border border-amber-800">
                        الفني: {delayTask.employeeName}
                      </span>
                      {overtimeMinutes > 0 && (
                        <span className="text-[10px] text-red-200 font-bold bg-red-900/80 px-2 py-0.5 rounded-md">
                          تأخير: {overtimeMinutes} دقيقة (المستغرق: {durationMinutes} د من {limit} د)
                        </span>
                      )}
                    </div>
                    {delayTask.subscriberName && (
                      <p className="text-amber-200">المشترك: <strong className="text-white">{delayTask.subscriberName}</strong></p>
                    )}
                    <p className="text-amber-100 text-xs bg-amber-900/70 p-2.5 rounded-xl border border-amber-800/60 font-bold">
                      💬 <strong>سبب التأخير المرفق:</strong> {delayTask.delayReason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveDelayReason && onApproveDelayReason(delayTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>قبول السبب (إلغاء الخصم)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectDelayReason && onRejectDelayReason(delayTask.id)}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>رفض السبب (تطبيق الخصم)</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Reopen Requests Banner for Owner/Supervisor */}
      {pendingReopenRequests.length > 0 && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') && (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-5 rounded-3xl shadow-md border border-purple-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-300 animate-spin-slow" />
              <h3 className="font-black text-sm text-purple-100">
                طلبات إعادة إرسال المهام من الفنيين ({pendingReopenRequests.length})
              </h3>
            </div>
            <span className="bg-purple-800/80 text-purple-200 text-xs px-3 py-1 rounded-xl font-bold border border-purple-700">
              بانتظار موافقة المشرف والمالك
            </span>
          </div>

          <div className="space-y-2">
            {pendingReopenRequests.map(reqTask => {
              const empName = reqTask.employeeName || employees.find(e => e.id === reqTask.employeeId)?.name || 'فني غير محدد';
              return (
                <div key={reqTask.id} className="bg-purple-950/80 border border-purple-800/80 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-white text-sm">{reqTask.taskType}</span>
                      <span className="text-[10px] text-purple-300 font-bold bg-purple-900 px-2 py-0.5 rounded-md border border-purple-800">
                        الفني: {empName}
                      </span>
                    </div>
                    {reqTask.subscriberName && (
                      <p className="text-purple-200">المشترك: <strong className="text-white">{reqTask.subscriberName}</strong> {reqTask.subscriberPhone ? `(${reqTask.subscriberPhone})` : ''}</p>
                    )}
                    <p className="text-purple-200 text-[11px] bg-purple-900/60 p-2 rounded-lg border border-purple-800/50">
                      💬 <strong>سبب الطلب:</strong> {reqTask.reopenRequestReason || 'طلب إعادة فتح المهمة للتوجه للمشترك'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveReopenTask && onApproveReopenTask(reqTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>الموافقة وإعادة الإرسال</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectReopenTask && onRejectReopenTask(reqTask.id)}
                      className="bg-red-600/80 hover:bg-red-600 text-white font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>رفض الطلب</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Pause Requests Banner for Owner/Supervisor/Manager */}
      {pendingPauseTasks.length > 0 && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') && (
        <div className="bg-gradient-to-r from-rose-900 to-pink-950 text-white p-5 rounded-3xl shadow-md border border-rose-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-rose-300 animate-pulse" />
              <h3 className="font-black text-sm text-rose-100">
                طلبات إيقاف المهام مؤقتاً من الفنيين ({pendingPauseTasks.length})
              </h3>
            </div>
            <span className="bg-rose-800/80 text-rose-200 text-xs px-3 py-1 rounded-xl font-bold border border-rose-700">
              يتطلب قرار المشرف أو المالك
            </span>
          </div>

          <div className="space-y-2">
            {pendingPauseTasks.map(pauseTask => {
              const empName = pauseTask.employeeName || employees.find(e => e.id === pauseTask.employeeId)?.name || 'فني غير محدد';
              return (
                <div key={pauseTask.id} className="bg-rose-950/80 border border-rose-800/80 p-3.5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1 text-xs flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-sm">{pauseTask.taskType}</span>
                      <span className="text-[10px] text-rose-300 font-bold bg-rose-900 px-2 py-0.5 rounded-md border border-rose-800">
                        الفني: {empName}
                      </span>
                    </div>
                    {pauseTask.subscriberName && (
                      <p className="text-rose-200">المشترك: <strong className="text-white">{pauseTask.subscriberName}</strong> {pauseTask.subscriberPhone ? `(${pauseTask.subscriberPhone})` : ''}</p>
                    )}
                    <p className="text-rose-100 text-xs bg-rose-900/70 p-2.5 rounded-xl border border-rose-800/60 font-bold">
                      💬 <strong>سبب الإيقاف المؤقت المطلوب:</strong> {pauseTask.pauseRequestReason || 'بدون سبب'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApprovePauseTask && onApprovePauseTask(pauseTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>موافقة على الإيقاف</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt('سبب رفض الإيقاف المؤقت:') || '';
                        if (onRejectPauseTask) onRejectPauseTask(pauseTask.id, reason);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      <span>رفض الإيقاف</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header and statistics card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse"></span>
              إدارة ومراقبة المهام الجارية
            </h1>
            <p className="text-xs text-slate-500 mt-1">متابعة الفنيين النشطين في الميدان حالياً واحتساب نقاط الأداء المباشرة</p>
          </div>
          <span className="bg-blue-50 text-blue-700 text-xs font-black px-4 py-2 rounded-full border border-blue-200/60 w-fit shrink-0">
            {activeTasks.length} مهام جارية بالكامل
          </span>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">🟢 مهام جارية الآن</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-slate-800">{activeStats.runningCount}</span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md">نشطة</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">👤 فنيون في الميدان</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-slate-800">{activeStats.workingTechs}</span>
              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md">فني</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">🟠 مهام متوقفة</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-slate-800">{activeStats.pausedCount}</span>
              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-md">مؤقتاً</span>
            </div>
          </div>
          <div 
            onClick={() => setStatusFilter('pending')}
            className={`bg-slate-50 border border-slate-100 p-4 rounded-2xl flex flex-col justify-between cursor-pointer transition-all hover:bg-purple-50/70 hover:border-purple-200/80 ${statusFilter === 'pending' ? 'ring-2 ring-purple-500 bg-purple-50/80 border-purple-300' : ''}`}
          >
            <span className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span>⏳ المهام في انتظار القبول</span>
              </span>
              {pendingApprovalsTasks.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-purple-600 animate-ping"></span>
              )}
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-2xl font-black text-purple-700">{pendingApprovalsTasks.length}</span>
              <span className="text-[10px] text-purple-700 font-bold bg-purple-100 px-2 py-0.5 rounded-md">
                {pendingApprovalsTasks.length > 0 ? 'بانتظار الموافقة' : 'لا يوجد'}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION: Tasks List & Search */}
        <div className="space-y-6">
          {/* Search Bar & Status Filters */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث عن مهمة باسم الفني، المشترك، الهاتف، نوع المهمة، الموقع أو سبب الرفض..."
                  className="w-full text-xs pr-10 pl-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-bold bg-slate-50/50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    مسح
                  </button>
                )}
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-black text-slate-500 ml-1">تصفية حسب الحالة:</span>
                {[
                  { id: 'all', label: 'الكل (النشطة)' },
                  { id: 'active', label: '🟢 جارية الآن' },
                  { id: 'paused', label: '🟠 متوقفة' },
                  { id: 'pending', label: '🟡 بانتظار القبول' },
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      statusFilter === st.id
                        ? 'bg-blue-700 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Tasks */}
            {searchedAndFilteredTasks.length === 0 ? (
              <div className="text-center py-16 text-slate-400 bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs">
                <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h4 className="font-extrabold text-slate-700 text-sm">لا توجد نتائج تطابق خيارات البحث والتصفية</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  جرب تغيير نص البحث أو اختيار حالة تصفية أخرى.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {displayedTasks.map((task) => {
                  const isCompleted = task.status === 'completed';
                  const isPaused = task.status === 'paused';
                  const isPending = task.status === 'pending';
                  const isRejected = task.status === 'rejected';
                  const isPostponed = task.status === 'postponed';

                  const nowTime = Date.now();
                  const start = new Date(task.startTime).getTime();
                  const endTimeMs = (isCompleted && task.endTime) ? new Date(task.endTime).getTime() : nowTime;
                  const currentPauseMs = (isPaused && task.pausedAt)
                    ? (nowTime - new Date(task.pausedAt).getTime())
                    : 0;
                  const totalPauseTimeMs = (task.totalPausedMs || 0) + currentPauseMs;
                  const activeWorkTimeMs = Math.max(0, (endTimeMs - start) - totalPauseTimeMs);

                  const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
                  const livePoints = calculateTaskPoints(task.taskType, durationMinutes, taskTypes, pointsRules);

                  return (
                    <div
                      key={task.id}
                      className={`bg-white border rounded-2xl p-4 flex flex-col justify-between hover:shadow-sm transition-all relative overflow-hidden ${
                        isRejected
                          ? 'border-red-300 bg-red-50/10'
                          : isPending
                          ? 'border-amber-300 bg-amber-50/10'
                          : isPostponed
                          ? 'border-purple-300 bg-purple-50/10'
                          : 'border-slate-200/80'
                      }`}
                    >
                      {/* Top Accent Bar */}
                      <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                        isRejected ? 'bg-red-500' :
                        isPending ? 'bg-amber-500' :
                        isPaused ? 'bg-amber-500' :
                        isPostponed ? 'bg-purple-600' :
                        isCompleted ? 'bg-blue-600' :
                        'bg-emerald-500 animate-pulse'
                      }`} />

                      <div className="space-y-3.5 pt-1">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs border border-slate-200">
                              {task.employeeName ? task.employeeName.charAt(0) : 'ف'}
                            </div>
                            <div>
                              <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1">
                                <User className="w-3.5 h-3.5 text-slate-400" />
                                {task.employeeName}
                              </h4>
                              <span className="text-[10px] text-slate-400 font-medium">الرمز: #{task.employeeId.slice(-4)}</span>
                            </div>
                          </div>

                          {/* Status Badge */}
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                            isRejected ? 'bg-red-100 text-red-800 border border-red-200' :
                            isPending ? 'bg-amber-100 text-amber-900 border border-amber-200' :
                            isPaused ? 'bg-amber-50 text-amber-800 border border-amber-200/50' :
                            isPostponed ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            isCompleted ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            'bg-emerald-50 text-emerald-800 border border-emerald-200/50'
                          }`}>
                            {isRejected ? '🔴 مرفوضة' :
                             isPending ? '🟡 بانتظار موافقة الفني' :
                             isPaused ? '🟠 متوقفة' :
                             isPostponed ? '⏳ مؤجلة من الفني' :
                             isCompleted ? '🔵 مكتملة' :
                             '🟢 جارية الان'}
                          </span>
                        </div>

                        {/* Task Type */}
                        <div className="flex items-center justify-between gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-[11px] font-black text-slate-700">{task.taskType}</span>
                          </div>
                          {!isRejected && (
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                              isCompleted ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                            }`}>
                              {isCompleted 
                                ? task.points 
                                : (taskTypes.find(t => t.name === task.taskType)?.points ?? task.points)}
                            </span>
                          )}
                        </div>

                        {/* Send Time if Pending */}
                        {isPending && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50/90 border border-amber-200/80 p-2.5 rounded-xl font-bold shadow-2xs">
                            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>وقت إرسال المهمة للفني:</span>
                            <span className="font-mono text-amber-950 font-black">{formatArabicTimeOnly(task.sentAt || task.startTime)}</span>
                            <span className="text-[10px] text-amber-700/80 font-medium">({formatArabicDateOnly(task.sentAt || task.startTime)})</span>
                          </div>
                        )}

                        {/* If completed and points differ from original (e.g. split or time deduction), show detail */}
                        {isCompleted && task.originalPoints !== undefined && task.originalPoints !== task.points && (
                          <div className="text-[10px] font-bold text-slate-600 bg-emerald-50/60 p-2 rounded-xl border border-emerald-100/80 flex items-center justify-between">
                            <span>إجمالي نقاط المهمة: {task.originalPoints}</span>
                            <span className="text-emerald-700 font-black">نقاط الفني المكتسبة: {task.points}</span>
                          </div>
                        )}

                        {/* Task Duration / Live Timer Display */}
                        {!isPending && !isRejected && (
                          <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                            isCompleted 
                              ? 'bg-blue-50/80 border-blue-200/80 text-blue-950' 
                              : isPaused 
                              ? 'bg-amber-50/80 border-amber-200/80 text-amber-950' 
                              : 'bg-emerald-50/80 border-emerald-200/80 text-emerald-950'
                          }`}>
                            <div className="flex items-center gap-1.5 font-extrabold text-[11px]">
                              <Clock className={`w-3.5 h-3.5 ${
                                isCompleted ? 'text-blue-600' : isPaused ? 'text-amber-600' : 'text-emerald-600 animate-pulse'
                              }`} />
                              <span>
                                {isCompleted 
                                  ? '⏱️ الوقت المستغرق:' 
                                  : isPaused 
                                  ? '⏸️ الوقت موقوف عند:' 
                                  : '⏱️ عداد الوقت الجاري:'}
                              </span>
                            </div>
                            <div className="text-left font-mono font-black text-xs">
                              {isCompleted ? (
                                <span className="text-blue-900 bg-white px-2.5 py-1 rounded-lg border border-blue-200/80 shadow-2xs block font-bold text-xs">
                                  {durationMinutes === 0 ? 'أقل من دقيقة' : `${durationMinutes} دقيقة`}
                                </span>
                              ) : (
                                <span className={`px-2.5 py-1 rounded-lg border bg-white shadow-2xs block ${
                                  isPaused ? 'text-amber-900 border-amber-200/80' : 'text-emerald-800 border-emerald-200/80 font-black tracking-wider animate-pulse'
                                }`}>
                                  {formatMsToHMS(activeWorkTimeMs)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Send Time & Start Time details for Active / Paused / Completed tasks */}
                        {!isPending && !isRejected && (
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[10.5px] text-slate-500 font-medium bg-slate-50/90 p-2 px-2.5 rounded-xl border border-slate-150">
                            <div className="flex items-center gap-1">
                              <Send className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <span>وقت الإرسال:</span>
                              <strong className="text-slate-800 font-mono font-black">{formatArabicTimeOnly(task.sentAt || task.assignedDate || task.startTime)}</strong>
                              <span className="text-[9.5px] text-slate-400">({formatArabicDateOnly(task.sentAt || task.assignedDate || task.startTime)})</span>
                            </div>
                            <div className="flex items-center gap-1 border-r border-slate-200 pr-2">
                              <Play className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>بدء التنفيذ:</span>
                              <strong className="text-slate-800 font-mono font-black">{formatArabicTimeOnly(task.startTime)}</strong>
                            </div>
                          </div>
                        )}

                        {/* Subscriber Name & Phone */}
                        {(task.subscriberName || task.subscriberPhone) && (
                          <div className="bg-blue-50/40 p-2.5 rounded-xl border border-blue-100/50 text-xs space-y-1">
                            {task.subscriberName && (
                              <div><span className="font-bold text-slate-500">👤 المشترك:</span> <span className="font-extrabold text-slate-800">{task.subscriberName}</span></div>
                            )}
                            {task.subscriberPhone && (
                              <div><span className="font-bold text-slate-500">📞 الهاتف:</span> <span className="font-mono font-extrabold text-blue-700">{task.subscriberPhone}</span></div>
                            )}
                          </div>
                        )}

                        {/* Notes / Location */}
                        {task.notes && (
                          <div className="flex items-start gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-150 text-xs">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold block">الملاحظة / الموقع:</span>
                              <span className="font-bold text-slate-800">{task.notes}</span>
                            </div>
                          </div>
                        )}

                        {/* Rejection Reason Alert if Rejected */}
                        {isRejected && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs">
                            <div className="font-black text-red-700 flex items-center gap-1">
                              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                              <span>⚠️ سبب الرفض بواسطة الفني ({task.rejectedByTechName || task.employeeName}):</span>
                            </div>
                            <p className="font-bold text-red-900 bg-white/80 p-2 rounded-lg border border-red-100">
                              {task.rejectionReason || 'لم يذكر الفني سبباً للرفض'}
                            </p>
                            {task.rejectedAt && (
                              <div className="text-[10px] font-bold text-red-600">
                                توقيت الرفض: {formatArabicTimeOnly(task.rejectedAt)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Postponed Alert and Reason if Postponed */}
                        {isPostponed && (
                          <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-1.5 text-xs">
                            <div className="font-black text-purple-800 flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
                              <span>⏳ المهمة مؤجلة من الفني ({task.postponedByTechName || task.employeeName}):</span>
                            </div>
                            <p className="font-bold text-purple-950 bg-white/85 p-2 rounded-lg border border-purple-200">
                              {task.postponeReason || 'لم يحدد الفني سبباً للتأجيل'}
                            </p>
                            {task.postponedAt && (
                              <div className="text-[10px] font-bold text-purple-600">
                                تاريخ وتوقيت التأجيل: {formatArabicTimeOnly(task.postponedAt)} - {formatArabicDateOnly(task.postponedAt)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Previous Rejection Reason if task was re-sent */}
                        {task.previousRejectionReason && !isRejected && !isPostponed && (
                          <div className="p-2.5 bg-amber-50/80 border border-amber-200/80 rounded-xl space-y-1 text-xs">
                            <div className="font-bold text-amber-800 flex items-center gap-1 text-[11px]">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>⚠️ سبب الرفض السابق:</span>
                            </div>
                            <p className="font-semibold text-amber-950 text-[11px] bg-white/80 p-2 rounded-lg border border-amber-100">
                              {task.previousRejectionReason}
                            </p>
                          </div>
                        )}

                        {/* Edit Logs History for re-opened / edited tasks */}
                        {task.editLogs && task.editLogs.length > 0 && (
                          <div className="p-2.5 bg-blue-50/70 border border-blue-200/60 rounded-xl space-y-1.5 text-xs text-right dir-rtl">
                            <div className="font-black text-blue-900 flex items-center justify-between text-[11px]">
                              <span className="flex items-center gap-1">
                                <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                <span>📝 سجل المهمة والتعديلات السابقة ({task.editLogs.length})</span>
                              </span>
                              <span className="text-[9.5px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full border border-blue-200">
                                معاد فتحها
                              </span>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto text-[10.5px]">
                              {task.editLogs.map((log) => (
                                <div key={log.id} className="p-2 bg-white rounded-lg border border-blue-100 space-y-0.5">
                                  <div className="flex items-center justify-between text-slate-400 font-bold text-[9px]">
                                    <span className="text-blue-800 font-extrabold">{log.editedBy || 'الإدارة'}</span>
                                    <span dir="ltr" className="font-mono">{new Date(log.editedAt).toLocaleString('ar-IQ')}</span>
                                  </div>
                                  <div className="font-bold text-slate-700 leading-snug">{log.changes}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action buttons for Postponed Tasks: Resend/Reassign, Edit, Delete */}
                        {isPostponed && (userRole === 'admin' || userRole === 'owner' || userRole === 'manager' || userRole === 'supervisor') && (
                          <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleOpenResendModal(task)}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs hover:scale-101 active:scale-99"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>إعادة إرسال المهمة وتكليف الفني</span>
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(task)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>تعديل المهمة</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(task.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>حذف المهمة</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons for Rejected Tasks: Resend, Edit, Delete */}
                        {isRejected && (userRole === 'admin' || userRole === 'owner' || userRole === 'manager') && (
                          <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleOpenResendModal(task)}
                              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs hover:scale-101 active:scale-99"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>إعادة إرسال المهمة وتحديد الفني</span>
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(task)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>تعديل المهمة</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(task.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>حذف المهمة</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons if Pending */}
                        {isPending && (
                          <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                            {/* Management Actions: Edit & Delete */}
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(task)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>تعديل المهمة</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(task.id)}
                                className="bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>حذف المهمة</span>
                              </button>
                            </div>

                            {/* Accept / Reject Decisions */}
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => onAcceptTask && onAcceptTask(task.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>قبول المهمة</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRejectingTaskId(task.id);
                                  setRejectionReason('');
                                  setRejectionError('');
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                <span>رفض المهمة</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Action buttons if Active/Paused */}
                        {(task.status === 'active' || task.status === 'paused') && (
                          <div className="pt-2 flex flex-col gap-2 border-t border-slate-100">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setConfirmCompleteTask(task);
                                  setCompletionOperationDetails(task.operationDetails || '');
                                  setCompletionDelayReason(task.delayReason || '');
                                  setCompletionDelayError('');
                                  setPaymentStatus(task.paymentStatus === 'collected' ? 'collected' : 'free');
                                  setCollectedAmount(task.collectedAmount && task.collectedAmount > 0 ? task.collectedAmount : '');
                                  setPaymentNotes(task.paymentNotes || '');
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>إنهاء المهمة</span>
                              </button>
                              {task.status === 'active' ? (
                                <button
                                  type="button"
                                  onClick={() => setShowPauseDialog(task.id)}
                                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer"
                                >
                                  إيقاف مؤقت
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onResumeTask(task.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer"
                                >
                                  استئناف
                                </button>
                              )}
                            </div>

                            {/* Management action button: Edit task, reassign technician, change type */}
                            {(userRole === 'owner' || userRole === 'manager' || userRole === 'supervisor' || userRole === 'admin') && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(task)}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 w-full"
                              >
                                <Pencil className="w-3.5 h-3.5 text-slate-500" />
                                <span>تعديل المهمة (نقل إلى فني / تغيير نوع المهمة)</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show More Pagination Button */}
              {searchedAndFilteredTasks.length > visibleTasksCount && (
                <div className="flex flex-col items-center justify-center pt-6 pb-2">
                  <button
                    type="button"
                    onClick={() => setVisibleTasksCount(prev => prev + 10)}
                    className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-black px-6 py-3 rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2 hover:scale-102 active:scale-98"
                  >
                    <ChevronDown className="w-4 h-4" />
                    <span>إظهار المزيد من المهام (تُعرض {displayedTasks.length} من {searchedAndFilteredTasks.length})</span>
                  </button>
                </div>
              )}

              {searchedAndFilteredTasks.length > 10 && visibleTasksCount >= searchedAndFilteredTasks.length && (
                <p className="text-center text-[11px] font-bold text-slate-400 pt-4">
                  تم عرض جميع المهام ({searchedAndFilteredTasks.length} مهمة)
                </p>
              )}
            </>
            )}
          </div>
        </div>

      {/* Delete Record Prompt dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-center animate-fade-in"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">هل أنت متأكد من حذف هذه المهمة؟</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                سيتم إزالة هذه المهمة النشطة نهائياً ولن يتم تسجيلها في سجلات العمل المنجز.
              </p>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onCancelActiveTask(showDeleteConfirm);
                    setShowDeleteConfirm(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  نعم، حذف المهمة
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Complete Task Confirmation Dialog */}
      <AnimatePresence>
        {confirmCompleteTask && (() => {
          const nowTime = Date.now();
          const start = new Date(confirmCompleteTask.startTime).getTime();
          const currentPauseMs = (confirmCompleteTask.status === 'paused' && confirmCompleteTask.pausedAt)
            ? (nowTime - new Date(confirmCompleteTask.pausedAt).getTime())
            : 0;
          const totalPauseTimeMs = (confirmCompleteTask.totalPausedMs || 0) + currentPauseMs;
          const activeWorkTimeMs = (nowTime - start) - totalPauseTimeMs;

          const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
          const limitMinutes = getTaskTimeLimitMinutes(confirmCompleteTask.taskType, taskTypes);
          const isOverdue = durationMinutes > limitMinutes;
          const livePoints = calculateTaskPoints(confirmCompleteTask.taskType, durationMinutes, taskTypes, pointsRules);
          const supporters = activeTasks.filter(t => t.parentTaskId === confirmCompleteTask.id);

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 text-right border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto"
                dir="rtl"
              >
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                  <CheckCircle2 className="w-8 h-8 animate-pulse text-emerald-600" />
                </div>

                <div className="text-center">
                  <h3 className="font-black text-slate-800 text-lg mb-1">⚠️ تأكيد إنهاء المهمة</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    يرجى مراجعة ملخص المهمة قبل التأكيد النهائي.
                  </p>
                </div>

                {isOverdue && (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 space-y-1.5 text-right">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تنبيه: تم تجاوز الوقت المسموح للمهمة ({limitMinutes} دقيقة)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900/90 font-medium">
                      المستغرق: {durationMinutes} دقيقة. يجب كتابة سبب التأخير ليتم إرساله للمشرف والمالك. عند قبول السبب من قبل المسؤولين لن يتم خصم النقاط.
                    </p>
                  </div>
                )}

                <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">👷 الفني:</span>
                    <span className="text-slate-800 font-black text-[13px]">
                      {confirmCompleteTask.employeeName}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">🏷️ نوع المهمة:</span>
                    <span className="text-slate-800 font-black text-[13px]">{confirmCompleteTask.taskType}</span>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">📍 الموقع:</span>
                    <span className="text-slate-800 font-bold text-[12px]">
                      {confirmCompleteTask.notes || 'غير محدد'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">⏰ وقت البدء:</span>
                    <span className="text-slate-800 font-mono font-bold text-xs">
                      {formatArabicTimeOnly(confirmCompleteTask.startTime)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">⌛ مدة التنفيذ:</span>
                    <span className="text-emerald-700 font-mono font-bold text-xs">
                      {formatMsToHMS(activeWorkTimeMs)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                    <span className="text-slate-500 font-bold flex items-center gap-1">⭐ النقاط المتوقعة:</span>
                    <span className="text-blue-700 font-black text-sm">
                      {livePoints}
                    </span>
                  </div>

                  <div className="flex justify-between items-start text-xs">
                    <span className="text-slate-500 font-bold flex items-center gap-1">🤝 الداعمون:</span>
                    <span className="text-slate-800 font-bold text-left max-w-[200px]">
                      {supporters.length > 0 
                        ? supporters.map(sup => sup.employeeName).join('، ') 
                        : 'لا يوجد داعمون.'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5">
                    معلومات العملية وتفاصيل الإنجاز <span className="text-red-500">* (إجباري)</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={completionOperationDetails}
                    onChange={(e) => {
                      setCompletionOperationDetails(e.target.value);
                      setCompletionDelayError('');
                    }}
                    placeholder="اكتب تفاصيل العملية والتنفيذ الميداني..."
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 font-medium"
                  ></textarea>
                </div>

                {/* Subscriber Payment Collection (تحصيل أموال من المشترك أو مجاناً) */}
                <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-black text-slate-900 block">تحصيل أجور / مبالغ من المشترك</span>
                      <span className="text-[11px] text-slate-500 font-medium">حدد ما إذا تم استلام أجور نقدية من المشترك أو تمت الخدمة مجاناً</span>
                    </div>
                  </div>

                  {/* Radio Options: Free vs Collected */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentStatus('free');
                        setCollectedAmount('');
                        setPaymentNotes('');
                        setCompletionDelayError('');
                      }}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex items-start gap-2.5 ${
                        paymentStatus === 'free'
                          ? 'bg-blue-50/90 border-blue-400 text-blue-950 shadow-2xs ring-2 ring-blue-200'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                        paymentStatus === 'free' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                      }`}>
                        {paymentStatus === 'free' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <span className="text-xs font-black block">مجاناً (بدون تحصيل)</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">ضمن الاشتراك / صيانة دورية</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPaymentStatus('collected');
                        setCompletionDelayError('');
                      }}
                      className={`p-3 rounded-2xl border text-right transition-all cursor-pointer flex items-start gap-2.5 ${
                        paymentStatus === 'collected'
                          ? 'bg-emerald-50/90 border-emerald-400 text-emerald-950 shadow-2xs ring-2 ring-emerald-200'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                        paymentStatus === 'collected' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                      }`}>
                        {paymentStatus === 'collected' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div>
                        <span className="text-xs font-black block">تحصيل أجور نقدية</span>
                        <span className="text-[10px] text-slate-500 font-medium block mt-0.5">استلام مبالغ من المشترك</span>
                      </div>
                    </button>
                  </div>

                  {/* Amount Input & Quick Chips (if collected) */}
                  {paymentStatus === 'collected' && (
                    <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 space-y-3 mt-2 shadow-2xs">
                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                          <span>المبلغ المحصل من المشترك <span className="text-red-500">*</span></span>
                          {collectedAmount !== '' && Number(collectedAmount) > 0 && (
                            <span className="text-[11px] font-mono font-black text-emerald-700">
                              {Number(collectedAmount).toLocaleString('ar-EG')} د.ع
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="250"
                            step="250"
                            required
                            value={collectedAmount}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                              setCollectedAmount(val);
                              setCompletionDelayError('');
                            }}
                            placeholder="أدخل المبلغ المحصل... مثال: 15000"
                            className="w-full text-sm p-2.5 pr-3 pl-16 rounded-xl border border-slate-300 font-mono font-black text-emerald-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">
                            د.ع
                          </span>
                        </div>
                      </div>

                      {/* Quick Amount Presets */}
                      <div>
                        <span className="text-[10.5px] font-bold text-slate-400 block mb-1.5">مبالغ شائعة سريعة:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {[5000, 10000, 15000, 20000, 25000, 30000, 50000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => {
                                setCollectedAmount(amt);
                                setCompletionDelayError('');
                              }}
                              className={`px-2.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer border ${
                                collectedAmount === amt
                                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                  : 'bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 border-slate-200'
                              }`}
                            >
                              {amt.toLocaleString('ar-EG')} د.ع
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-1">
                          ملاحظات أو سبب التحصيل (اختياري)
                        </label>
                        <input
                          type="text"
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                          placeholder="مثال: أجور تمديد كابل خارجي، استبدال راوتر جديد..."
                          className="w-full text-xs p-2.5 rounded-xl border border-slate-200 outline-none focus:border-emerald-500 font-medium text-slate-800"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {isOverdue && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      سبب التأخير بالتفصيل (إجباري عند التأخير) *
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={completionDelayReason}
                      onChange={(e) => {
                        setCompletionDelayReason(e.target.value);
                        setCompletionDelayError('');
                      }}
                      placeholder="اكتب سبب التأخير بالتفصيل ليتم رفعه للمسؤولين..."
                      className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-slate-800 font-medium"
                    ></textarea>
                  </div>
                )}

                {completionDelayError && (
                  <p className="text-[11px] font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100 text-center">
                    ⚠️ {completionDelayError}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!completionOperationDetails.trim()) {
                        setCompletionDelayError('يرجى كتابة معلومات العملية (تفاصيل التنفيذ والإنجاز) أولاً.');
                        return;
                      }
                      if (paymentStatus === 'collected') {
                        const parsed = Number(collectedAmount);
                        if (!parsed || parsed <= 0) {
                          setCompletionDelayError('يرجى إدخال المبلغ المحصل من المشترك بالدينار، أو اختيار خيار (مجاناً).');
                          return;
                        }
                      }
                      if (isOverdue && !completionDelayReason.trim()) {
                        setCompletionDelayError('يرجى كتابة سبب التأخير لتأكيد إكمال المهمة وإرساله للمسؤولين.');
                        return;
                      }

                      const paymentInfo = {
                        paymentStatus,
                        collectedAmount: paymentStatus === 'collected' ? Math.max(0, Number(collectedAmount) || 0) : 0,
                        paymentNotes: paymentNotes.trim() || undefined
                      };

                      onCompleteTask(
                        confirmCompleteTask.id, 
                        new Date().toISOString(), 
                        completionDelayReason.trim() || undefined,
                        completionOperationDetails.trim(),
                        undefined,
                        paymentInfo
                      );
                      setConfirmCompleteTask(null);
                      setCompletionOperationDetails('');
                      setCompletionDelayReason('');
                      setCompletionDelayError('');
                      setPaymentStatus('free');
                      setCollectedAmount('');
                      setPaymentNotes('');
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                  >
                    <span>✅ نعم، إنهاء المهمة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCompleteTask(null);
                      setCompletionOperationDetails('');
                      setCompletionDelayReason('');
                      setCompletionDelayError('');
                      setPaymentStatus('free');
                      setCollectedAmount('');
                      setPaymentNotes('');
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                  >
                    <span>❌ إلغاء</span>
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Pause Task Dialog Modal */}
      <AnimatePresence>
        {showPauseDialog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-right"
              dir="rtl"
            >
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base text-center">إيقاف مؤقت للمهمة</h3>
              <p className="text-xs text-slate-500 mt-2 text-center leading-relaxed">
                يرجى إدخال سبب الإيقاف المؤقت للمتابعة. (مطلوب)
              </p>

              <div className="mt-4">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">سبب التوقف</label>
                <textarea
                  required
                  value={pauseReason}
                  onChange={(e) => {
                    setPauseReason(e.target.value);
                    if (e.target.value.trim()) setPauseError('');
                  }}
                  placeholder="مثال: استراحة غداء، انتظار وصول العميل، نقص مواد..."
                  rows={3}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 resize-none font-medium font-sans"
                />
                {pauseError && (
                  <p className="text-red-500 text-[10px] font-bold mt-1">{pauseError}</p>
                )}
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmPause}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  حفظ وإيقاف مؤقت
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPauseDialog(null);
                    setPauseReason('');
                    setPauseError('');
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Active Task Dialog Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
              dir="rtl"
            >
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-150 p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-800 text-sm flex items-center gap-1.5">
                    <Pencil className="w-4 h-4 text-blue-600" />
                    <span>تعديل تفاصيل المهمة الجارية</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">قم بتعديل بيانات المهمة التي يتم تنفيذها حالياً في الميدان</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="w-8 h-8 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveActiveTaskEdit} className="p-5 space-y-4">
                {/* 1. Employee Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الموظف الفني *</label>
                  <select
                    required
                    value={editEmployeeId}
                    onChange={(e) => setEditEmployeeId(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold cursor-pointer"
                  >
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                {/* 2. Task Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع المهمة الميدانية *</label>
                  <select
                    required
                    value={editTaskType}
                    onChange={(e) => {
                      setEditTaskType(e.target.value);
                      const standardPoints = taskTypes.find(t => t.name === e.target.value)?.points ?? 0;
                      setEditPoints(standardPoints);
                    }}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold cursor-pointer"
                  >
                    {(() => {
                      const activeTypes = (taskTypes || []).filter(t => t.status === 'active' || (!t.status && !t.isArchived));
                      const isCurrentArchived = editTaskType && !activeTypes.some(t => t.name === editTaskType);
                      const listToRender = isCurrentArchived
                        ? [...activeTypes, { id: 'archived_curr', name: editTaskType, points: editPoints || 0, icon: '📋' }]
                        : activeTypes;
                      return listToRender.map(type => (
                        <option key={type.id || type.name} value={type.name}>{type.name} (+{type.points} ن)</option>
                      ));
                    })()}
                  </select>
                </div>

                {/* 3. Start Time Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ ووقت البداية الميدانية *</label>
                  <input
                    type="datetime-local"
                    required
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono text-left font-bold"
                  />
                </div>

                {/* 4. Subscriber Name & Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم العميل المشترك (اختياري)</label>
                    <input
                      type="text"
                      value={editSubscriberName}
                      onChange={(e) => setEditSubscriberName(e.target.value)}
                      placeholder="مثال: أحمد محمد"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الهاتف (اختياري)</label>
                    <input
                      type="text"
                      value={editSubscriberPhone}
                      onChange={(e) => setEditSubscriberPhone(e.target.value)}
                      placeholder="مثال: 05xxxxxxx"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono text-left"
                    />
                  </div>
                </div>

                {/* 5. Location / Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الموقع والملاحظات</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="أدخل تفاصيل الموقع أو أي ملاحظات أخرى للمهمة"
                    rows={2}
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium resize-none"
                  />
                </div>

                {/* 6. Points / Rules */}
                <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/60">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-black text-blue-800">النقاط الأساسية للمهمة</label>
                  </div>
                  <input
                    type="number"
                    required
                    min="0"
                    value={editPoints}
                    onChange={(e) => setEditPoints(Number(e.target.value))}
                    className="w-full mt-1.5 text-xs px-3.5 py-2 rounded-xl border border-blue-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono text-left font-bold"
                  />
                  <p className="text-[9px] text-blue-600 mt-1.5 leading-relaxed">
                    💡 يتم احتساب النقاط النهائية تلقائياً بناءً على قوانين نوع المهمة عند إكمالها (التأخير، سرعة الإنجاز، أوقات التوقف...).
                  </p>
                </div>

                {/* Submit / Cancel Buttons */}
                <div className="mt-6 flex gap-3 pt-3 border-t border-slate-150">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ التعديلات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingTask(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-3 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reject Task Dialog with Mandatory Reason */}
      <AnimatePresence>
        {rejectingTaskId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-right"
              dir="rtl"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base text-center">الاعتذار عن المهمة الميدانية</h3>
              <p className="text-xs text-slate-500 mt-1 text-center leading-relaxed">
                يرجى كتابة سبب تعذر قبول أو تنفيذ هذه المهمة لتسجيله وإبلاغ الإدارة.
              </p>

              <div className="mt-4 space-y-2">
                <label className="block text-xs font-bold text-slate-700">سبب الرفض (إجباري) *</label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    if (e.target.value.trim()) setRejectionError('');
                  }}
                  placeholder="اكتب سبب الاعتذار والتفاصيل هنا..."
                  rows={3}
                  className={`w-full text-xs p-3 rounded-xl border outline-none transition-all resize-none ${
                    rejectionError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100'
                  }`}
                />
                {rejectionError && (
                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                    <span>⚠️</span> {rejectionError}
                  </p>
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!rejectionReason.trim()) {
                      setRejectionError('سبب الرفض إجباري ومطلوب لتوثيق الاعتذار عن المهمة.');
                      return;
                    }
                    if (onRejectTask && rejectingTaskId) {
                      onRejectTask(rejectingTaskId, rejectionReason.trim());
                      setRejectingTaskId(null);
                      setRejectionReason('');
                      setRejectionError('');
                    }
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  تأكيد الرفض
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejectingTaskId(null);
                    setRejectionReason('');
                    setRejectionError('');
                  }}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Resend Rejected Task Modal */}
      <AnimatePresence>
        {resendingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 text-right"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">إعادة إرسال المهمة</h3>
                    <p className="text-xs text-slate-400 font-medium">تحديد الفني الجديد وإعادة الإرسال</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setResendingTask(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Task Summary */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-150 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">نوع المهمة:</span>
                  <span className="font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    {resendingTask.taskType}
                  </span>
                </div>

                {resendingTask.subscriberName && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-500">المشترك:</span>
                    <span className="font-extrabold text-slate-800">{resendingTask.subscriberName}</span>
                  </div>
                )}

                {resendingTask.subscriberPhone && (
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-500">رقم الهاتف:</span>
                    <span className="font-mono font-bold text-slate-700">{resendingTask.subscriberPhone}</span>
                  </div>
                )}

                {/* Preserve First/Previous Rejection Reason */}
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="font-black text-red-700 block mb-1 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>سبب الرفض بواسطة الفني ({resendingTask.rejectedByTechName || resendingTask.employeeName}):</span>
                  </span>
                  <div className="bg-red-50 text-red-900 font-bold p-2.5 rounded-xl border border-red-200/70 text-xs">
                    {resendingTask.rejectionReason || resendingTask.previousRejectionReason || 'لم يذكر الفني سبباً للرفض'}
                  </div>
                </div>
              </div>

              {/* Form fields */}
              <div className="space-y-3">
                {/* Task Type Dropdown */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>تغيير / تحديد نوع المهمة <span className="text-red-500">*</span></span>
                    {resendingTask.taskType !== resendTaskType && (
                      <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-black border border-amber-300">
                        تحويل إلى: {resendTaskType}
                      </span>
                    )}
                  </label>
                  <select
                    value={resendTaskType}
                    onChange={(e) => setResendTaskType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {taskTypes.map((tt) => (
                      <option key={tt.id} value={tt.name}>
                        {tt.name} ({tt.points} نقطة)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    تحديد الفني المراد إرسال المهمة له <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={resendTechId}
                    onChange={(e) => setResendTechId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>-- اختر الفني --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    تفاصيل / ملاحظات المهمة (يمكنك تعديل الملاحظات)
                  </label>
                  <textarea
                    rows={2}
                    value={resendNotes}
                    onChange={(e) => setResendNotes(e.target.value)}
                    placeholder="أي ملاحظات أو توجيهات للفني الجديد..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                {resendError && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 p-2 rounded-xl border border-red-100">
                    {resendError}
                  </p>
                )}
              </div>

              {/* Modal buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleConfirmResend}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 hover:scale-101 active:scale-99"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>إعادة إرسال المهمة للفني</span>
                </button>
                <button
                  type="button"
                  onClick={() => setResendingTask(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
