import React, { useState, useEffect, useMemo } from 'react';
import { Play, CheckCircle2, Clock, Calendar, PlusCircle, AlertCircle, Trash2, Pencil, Search, Star, MapPin, User, Tag, ArrowUpDown, ShieldAlert, Check, ChevronDown, Phone, History, RotateCcw, X, FileText, AlertTriangle, Plus, Send } from 'lucide-react';
import { Employee, Task, TaskType, TASK_POINTS, DbTaskType, PointsRules, AttendanceRecord, CompanySettings } from '../types';
import { toLocalInputString, formatDuration, formatMsToHMS, formatArabicDateOnly, formatArabicTimeOnly, calculateTaskPoints, isTechnicianEmployee, canAssignTaskToTechnician } from '../utils';
import { subscribeCompanySettings, subscribeAttendanceRecords, findSubscriberOrEmployeeByPhone } from '../lib/dbService';
import { motion, AnimatePresence } from 'motion/react';

interface TaskRegistrationProps {
  employees: Employee[];
  activeTasks: Task[];
  allTasks?: Task[];
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  onStartTask: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string,
    parentTaskId?: string
  ) => void;
  onCompleteTask: (id: string, endTime: string, delayReason?: string, operationDetails?: string) => void;
  onPauseTask: (id: string, reason: string) => void;
  onResumeTask: (id: string) => void;
  onCancelActiveTask: (id: string) => void;
  onRegisterCompletedTask?: (
    employeeId: string,
    taskType: string,
    startTime: string,
    endTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => void;
  userRole: 'owner' | 'manager' | 'technician' | 'admin' | 'viewer';
  onEditActiveTask?: (updatedTask: Task) => void;
  hideActiveTasksList?: boolean;
  initialEmployeeId?: string;
}

export default function TaskRegistration({
  employees,
  activeTasks,
  allTasks,
  taskTypes,
  pointsRules,
  onStartTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onCancelActiveTask,
  onRegisterCompletedTask,
  userRole,
  onEditActiveTask,
  hideActiveTasksList = false,
  initialEmployeeId,
}: TaskRegistrationProps) {
  // Input states
  const [employeeId, setEmployeeId] = useState(initialEmployeeId || '');
  const [taskType, setTaskType] = useState<string>('تنصيب');
  const [subscriberName, setSubscriberName] = useState('');
  const [subscriberPhone, setSubscriberPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showTaskTypeDropdown, setShowTaskTypeDropdown] = useState(false);
  const [supportTaskId, setSupportTaskId] = useState('');

  // Attendance and Settings subscriptions for task assignment rules
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);

  useEffect(() => {
    const unsubSettings = subscribeCompanySettings((sets) => {
      if (sets) setCompanySettings(sets);
    }, () => {});
    const unsubAttendance = subscribeAttendanceRecords((recs) => {
      setAttendanceRecords(recs);
    }, () => {});

    return () => {
      unsubSettings();
      unsubAttendance();
    };
  }, []);

  // Search and Sort states for Active Tasks
  const [activeSearch, setActiveSearch] = useState('');
  const [activeSort, setActiveSort] = useState<'technician' | 'taskType' | 'newest' | 'oldest' | 'duration'>('newest');

  const setTfTypeAndClean = (name: string) => {
    setTaskType(name);
    setSupportTaskId('');
    setError('');
  };

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Active task edit states
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editTaskType, setEditTaskType] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubscriberName, setEditSubscriberName] = useState('');
  const [editSubscriberPhone, setEditSubscriberPhone] = useState('');
  const [editPoints, setEditPoints] = useState(0);

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

  const handleEditTaskTypeChange = (newType: string) => {
    setEditTaskType(newType);
    const matched = taskTypes.find(t => t.name === newType || t.id === newType);
    if (matched) {
      setEditPoints(matched.points);
    }
  };

  const handleSaveActiveTaskEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    const matchedEmployee = employees.find(emp => emp.id === editEmployeeId);
    if (!matchedEmployee) return;

    const updatedTask: Task = {
      ...editingTask,
      employeeId: editEmployeeId,
      employeeName: matchedEmployee.name,
      taskType: editTaskType,
      startTime: new Date(editStartTime).toISOString(),
      notes: editNotes,
      subscriberName: editSubscriberName,
      subscriberPhone: editSubscriberPhone,
      points: editPoints,
    };

    if (onEditActiveTask) {
      onEditActiveTask(updatedTask);
    }
    setEditingTask(null);
    setSuccess('تم تحديث المهمة الجارية بنجاح! ✏️');
    // Auto clear success
    setTimeout(() => setSuccess(''), 3000);
  };

  // Pause states
  const [showPauseDialog, setShowPauseDialog] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseError, setPauseError] = useState('');

  // Previous completed task dialog states
  const [showCompletedDialog, setShowCompletedDialog] = useState(false);
  const [completedEmployeeId, setCompletedEmployeeId] = useState('');
  const [completedTaskType, setCompletedTaskType] = useState<string>('تنصيب');
  const [completedDate, setCompletedDate] = useState('');
  const [completedStartTime, setCompletedStartTime] = useState('');
  const [completedEndTime, setCompletedEndTime] = useState('');
  const [completedDialogError, setCompletedDialogError] = useState('');

  // Confirmation Dialog States
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [startConfirmTime, setStartConfirmTime] = useState('');
  const [showPastConfirm, setShowPastConfirm] = useState(false);

  const handleConfirmPause = () => {
    if (!pauseReason.trim()) {
      setPauseError('سبب التوقف مطلوب.');
      return;
    }
    if (showPauseDialog) {
      onPauseTask(showPauseDialog, pauseReason.trim());
      setShowPauseDialog(null);
      setPauseReason('');
      setPauseError('');
    }
  };

  // Filter employees list to only show Technicians (Field Workers) with fallback
  const technicianEmployees = useMemo(() => {
    const filtered = employees.filter(isTechnicianEmployee);
    if (filtered.length === 0) {
      return employees.filter(e => e.status !== 'suspended' && e.status !== 'terminated');
    }
    return filtered;
  }, [employees]);

  // Reset employeeId to empty when employees prop changes unless initialEmployeeId is provided
  useEffect(() => {
    if (initialEmployeeId) {
      setEmployeeId(initialEmployeeId);
    } else {
      setEmployeeId('');
    }
    setError('');
    setSuccess('');
  }, [employees, initialEmployeeId]);

  // Live timer tick for active tasks
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000); // refresh every 1s
    return () => clearInterval(timer);
  }, []);

  // Fallback match from cached lookup
  const [fallbackMatch, setFallbackMatch] = useState<{ employee?: Employee; task?: Task; subscriberName?: string; subscriberPhone?: string } | null>(null);

  // Phone lookup match for existing tasks & employees (0 Firestore Reads for local cache)
  const matchedPhoneTask = useMemo(() => {
    const raw = (subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
    if (!raw || raw.length < 3) return null;
    const taskList = allTasks || activeTasks || [];

    // 1. Find all tasks matching subscriberPhone from local state (0 Reads) and sort by recency
    const matchingTasks = taskList.filter(t => {
      const p = (t.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      return p && (p === raw || p.endsWith(raw) || raw.endsWith(p));
    });

    if (matchingTasks.length > 0) {
      // Sort to get the most recent task (by postponedAt, startTime, or assignedDate)
      matchingTasks.sort((a, b) => {
        const timeA = new Date(a.postponedAt || a.startTime || a.assignedDate || 0).getTime();
        const timeB = new Date(b.postponedAt || b.startTime || b.assignedDate || 0).getTime();
        return timeB - timeA;
      });
      return matchingTasks[0];
    }

    // 2. Search local employees by phone (Memory / SharedDataContext - 0 Reads)
    const matchedEmp = employees.find(emp => {
      const p = (emp.phone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      return p && (p === raw || p.endsWith(raw) || raw.endsWith(p));
    });
    if (matchedEmp) {
      return {
        id: `emp-match-${matchedEmp.id}`,
        employeeId: matchedEmp.id,
        employeeName: matchedEmp.name,
        subscriberName: matchedEmp.name,
        subscriberPhone: matchedEmp.phone || raw,
        taskType: 'تنصيب',
        startTime: matchedEmp.joinedAt || new Date().toISOString(),
        status: 'completed' as const,
        points: 0
      };
    }

    // 3. Fallback match if found from single fallback cache
    if (fallbackMatch?.task) return fallbackMatch.task;
    if (fallbackMatch?.employee) {
      return {
        id: `emp-fallback-${fallbackMatch.employee.id}`,
        employeeId: fallbackMatch.employee.id,
        employeeName: fallbackMatch.employee.name,
        subscriberName: fallbackMatch.employee.name,
        subscriberPhone: fallbackMatch.employee.phone || raw,
        taskType: 'تنصيب',
        startTime: fallbackMatch.employee.joinedAt || new Date().toISOString(),
        status: 'completed' as const,
        points: 0
      };
    }

    return null;
  }, [subscriberPhone, allTasks, activeTasks, employees, fallbackMatch]);

  // If phone has 5+ digits and no local match, trigger single cached fallback
  useEffect(() => {
    const raw = (subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
    if (!raw || raw.length < 5) {
      setFallbackMatch(null);
      return;
    }

    let isCurrent = true;
    findSubscriberOrEmployeeByPhone(subscriberPhone, employees, allTasks || activeTasks || []).then(result => {
      if (isCurrent && result) {
        setFallbackMatch(result);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [subscriberPhone, employees, allTasks, activeTasks]);

  // Auto-fill subscriber name when matched task is found by phone number
  useEffect(() => {
    if (matchedPhoneTask?.subscriberName && !subscriberName) {
      setSubscriberName(matchedPhoneTask.subscriberName);
    }
  }, [matchedPhoneTask]);

  // Existing task modal states
  const [showExistingModal, setShowExistingModal] = useState<Task | null>(null);
  const [resendTechId, setResendTechId] = useState('');
  const [resendTaskType, setResendTaskType] = useState<string>('تنصيب');
  const [resendNotes, setResendNotes] = useState('');
  const [resendError, setResendError] = useState('');

  // Dedicated modal for adding a new task for the matched subscriber
  const [quickTaskSubscriber, setQuickTaskSubscriber] = useState<{ name: string; phone: string } | null>(null);
  const [quickTechId, setQuickTechId] = useState('');
  const [quickTaskType, setQuickTaskType] = useState('تنصيب');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickError, setQuickError] = useState('');
  const [quickSuccess, setQuickSuccess] = useState('');
  const [isSubmittingQuickTask, setIsSubmittingQuickTask] = useState(false);

  // All historical task openings for the subscriber phone number
  const allSubscriberTasks = useMemo(() => {
    const raw = (subscriberPhone || showExistingModal?.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
    if (!raw || raw.length < 3) return showExistingModal ? [showExistingModal] : [];
    const taskList = allTasks || activeTasks || [];
    const matched = taskList.filter(t => {
      const p = (t.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      return p && p === raw;
    }).sort((a, b) => new Date(a.startTime || a.assignedDate || 0).getTime() - new Date(b.startTime || b.assignedDate || 0).getTime());
    return matched.length > 0 ? matched : (showExistingModal ? [showExistingModal] : []);
  }, [subscriberPhone, showExistingModal, allTasks, activeTasks]);

  const handleStartActiveTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    // If an existing task with the same phone number was found, prompt old task modal
    if (matchedPhoneTask) {
      setResendTechId(employeeId || matchedPhoneTask.employeeId);
      setResendNotes(notes || matchedPhoneTask.notes || '');
      setResendTaskType(taskType || matchedPhoneTask.taskType || 'تنصيب');
      setShowExistingModal(matchedPhoneTask);
      return;
    }

    if (!employeeId) {
      setError('يرجى تحديد الموظف أولاً.');
      return;
    }

    const checkResult = canAssignTaskToTechnician(employeeId, employees, attendanceRecords, companySettings);
    if (!checkResult.allowed) {
      setError(checkResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      return;
    }

    if (taskType === 'دعم') {
      const supportableCount = activeTasks.filter(t => t.status === 'active' && t.taskType !== 'دعم' && t.taskType !== 'tt-7').length;
      if (supportableCount === 0) {
        setError('عذراً، لا توجد مهام جارية حالياً ليتم دعمها.');
        return;
      }
      if (!supportTaskId) {
        setError('يرجى اختيار المهمة الجارية المراد دعمها أولاً.');
        return;
      }
    }

    // Freeze the starting time for the confirmation display
    setStartConfirmTime(new Date().toISOString());
    setShowStartConfirm(true);
  };

  const handleConfirmQuickTask = (e: React.FormEvent) => {
    e.preventDefault();
    setQuickError('');
    setQuickSuccess('');

    if (!quickTechId) {
      setQuickError('يرجى تحديد الفني المكلف بالمهمة.');
      return;
    }

    const quickCheckResult = canAssignTaskToTechnician(quickTechId, employees, attendanceRecords, companySettings);
    if (!quickCheckResult.allowed) {
      setQuickError(quickCheckResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      return;
    }
    if (!quickTaskType) {
      setQuickError('يرجى تحديد نوع المهمة الجديدة.');
      return;
    }

    setIsSubmittingQuickTask(true);
    try {
      const nowIso = new Date().toISOString();
      onStartTask(
        quickTechId,
        quickTaskType,
        nowIso,
        quickNotes,
        quickTaskSubscriber?.name || subscriberName || '',
        quickTaskSubscriber?.phone || subscriberPhone || '',
        nowIso
      );

      setQuickSuccess('✅ تم إسناد وتوجيه المهمة الجديدة للمشترك بنجاح!');
      setSuccess(`✅ تم إسناد المهمة الجديدة للمشترك (${quickTaskSubscriber?.name || ''}) وتوجيهها للفني بنجاح.`);

      // Reset main inputs
      setSubscriberName('');
      setSubscriberPhone('');
      setNotes('');
      setEmployeeId('');

      setTimeout(() => {
        setQuickTaskSubscriber(null);
        setQuickSuccess('');
        setIsSubmittingQuickTask(false);
      }, 1200);
    } catch (err) {
      console.error(err);
      setQuickError('حدث خطأ أثناء إضافة المهمة.');
      setIsSubmittingQuickTask(false);
    }
  };

  const handleConfirmResendFromExistingModal = () => {
    if (!showExistingModal) return;
    if (!resendTechId) {
      setResendError('يرجى اختيار الفني المراد إعادة إرسال المهمة له');
      return;
    }

    const resendCheckResult = canAssignTaskToTechnician(resendTechId, employees, attendanceRecords, companySettings);
    if (!resendCheckResult.allowed) {
      setResendError(resendCheckResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      return;
    }

    const targetEmp = employees.find(e => e.id === resendTechId);
    if (!targetEmp) {
      setResendError('الفني المحدد غير موجود');
      return;
    }

    const isPostponed = showExistingModal.status === 'postponed';
    const nowIso = new Date().toISOString();
    const origLogs = showExistingModal.editLogs || [];
    
    // First technician name & date added originally
    const firstTechName = origLogs[0]?.changes?.match(/الفني الأول: (.*)/)?.[1] || showExistingModal.employeeName;
    const originalAddedDate = showExistingModal.startTime || showExistingModal.assignedDate || nowIso;

    // Summarize old task details for history record
    const oldStatusLabel = 
      showExistingModal.status === 'completed' ? 'مكتملة' :
      showExistingModal.status === 'rejected' ? 'مرفوضة' :
      showExistingModal.status === 'active' ? 'جارية' :
      showExistingModal.status === 'postponed' ? 'مؤجلة' :
      showExistingModal.status === 'paused' ? 'موقوفة' : 'قيد الانتظار';

    const oldTechName = showExistingModal.employeeName;
    const oldNotes = showExistingModal.notes || 'لا يوجد';
    const oldRejection = showExistingModal.rejectionReason || showExistingModal.previousRejectionReason || '';
    const oldType = showExistingModal.taskType;
    const newType = resendTaskType || oldType;

    const isTypeChanged = oldType !== newType;
    const typeChangeNotice = isTypeChanged 
      ? `[تم تحويل نوع المهمة من (${oldType}) إلى (${newType})] ` 
      : '';

    const nextReopenCount = isPostponed 
      ? (showExistingModal.reopenCount || 1)
      : ((allSubscriberTasks?.length || 1) + 1);

    const newLog = {
      id: `log-${Date.now()}`,
      editedBy: 'الإدارة',
      editedAt: nowIso,
      changes: isPostponed
        ? `${typeChangeNotice}إعادة إرسال واستئناف المهمة المؤجلة وتكليف الفني: ${targetEmp.name} (الفني السابق: ${oldTechName || 'غير محدد'})${showExistingModal.postponeReason ? ` | سبب التأجيل السابق: ${showExistingModal.postponeReason}` : ''}`
        : `${typeChangeNotice}إعادة فتح المهمة للمرة (${nextReopenCount}) وتوجيهها للفني الجديد: ${targetEmp.name} (بتاريخ ${new Date(nowIso).toLocaleString('ar-IQ')}). [السجل السابق: الفني: ${oldTechName}, النوع: ${oldType}, الحالة: ${oldStatusLabel}${oldRejection ? `, سبب الرفض بواسطة (${showExistingModal.rejectedByTechName || oldTechName}): ${oldRejection}` : ''}, الملاحظات: ${oldNotes}]`,
      reason: isPostponed
        ? `استئناف وإعادة تكليف المهمة المؤجلة بناءً على البحث برقم الهاتف (${showExistingModal.subscriberPhone}).`
        : (isTypeChanged 
          ? `تحويل نوع المهمة من (${oldType}) إلى (${newType}) وإعادة فتحها للمرة (${nextReopenCount}) بناءً على البحث برقم الهاتف (${showExistingModal.subscriberPhone}).`
          : `إعادة فتح المهمة للمرة (${nextReopenCount}) بناءً على البحث برقم الهاتف (${showExistingModal.subscriberPhone}) وتسجيلها بوقت جديد.`)
    };

    const initialCreationLog = origLogs.length === 0 ? [{
      id: `log-orig-${Date.now()}`,
      editedBy: 'النظام',
      editedAt: originalAddedDate,
      changes: `تاريخ إضافة المهمة لأول مرة: ${new Date(originalAddedDate).toLocaleString('ar-IQ')} (الفني الأول: ${oldTechName}, النوع الأصلي: ${oldType})`
    }] : [];

    // Calculate default points for new task type
    const selectedTypeObj = taskTypes.find(t => t.name === newType);
    const standardPoints = selectedTypeObj?.points ?? calculateTaskPoints(newType, 0, taskTypes, pointsRules);

    // If it's a postponed task, keep the existing ID so its status transitions from 'postponed' -> 'pending' and it disappears from postponed list immediately!
    const targetTaskId = isPostponed 
      ? showExistingModal.id 
      : `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const clonedTask: Task = {
      ...showExistingModal,
      id: targetTaskId,
      reopenCount: nextReopenCount,
      taskType: newType,
      employeeId: targetEmp.id,
      employeeName: targetEmp.name,
      status: 'pending',
      assignedDate: nowIso,
      startTime: nowIso,
      sentAt: nowIso,
      acceptedAt: undefined,
      completedAt: undefined,
      rejectedAt: undefined,
      endTime: undefined,
      durationMinutes: 0,
      activeWorkTimeMs: 0,
      totalPausedTimeMs: 0,
      pausedAt: undefined,
      isPaused: false,
      // Clear postponed state so it leaves postponed list immediately
      postponedAt: undefined,
      postponeReason: undefined,
      postponedByTechName: undefined,
      previousPostponeReason: showExistingModal.previousPostponeReason || showExistingModal.postponeReason,
      points: standardPoints,
      pointsDeducted: undefined,
      deductionReason: undefined,
      previousRejectionReason: showExistingModal.previousRejectionReason || showExistingModal.rejectionReason,
      rejectionReason: undefined,
      notes: resendNotes || showExistingModal.notes,
      subscriberName: subscriberName || showExistingModal.subscriberName,
      subscriberPhone: subscriberPhone || showExistingModal.subscriberPhone,
      editLogs: [...initialCreationLog, ...origLogs, newLog]
    };

    if (onEditActiveTask) {
      onEditActiveTask(clonedTask);
    }

    setShowExistingModal(null);
    setEmployeeId('');
    setSubscriberName('');
    setSubscriberPhone('');
    setNotes('');
    setSupportTaskId('');
    setResendTechId('');
    setResendNotes('');
    setResendError('');
    setSuccess(isPostponed 
      ? `✅ تم استئناف وإعادة تكليف المهمة المؤجلة وتوجيهها للفني (${targetEmp.name}) وإزالتها من قائمة المهام المؤجلة بنجاح!`
      : `✅ تم إعادة فتح المهمة وتحويلها إلى (${newType}) وتوجيهها للفني (${targetEmp.name}) بوقت جديد وحفظ السجل القديم بنجاح!`
    );

    setTimeout(() => setSuccess(''), 4000);
  };

  const handleForceNewTask = () => {
    setShowExistingModal(null);
    if (!employeeId) {
      setError('يرجى تحديد الموظف أولاً.');
      return;
    }
    const forceCheckResult = canAssignTaskToTechnician(employeeId, employees, attendanceRecords, companySettings);
    if (!forceCheckResult.allowed) {
      setError(forceCheckResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      return;
    }
    setStartConfirmTime(new Date().toISOString());
    setShowStartConfirm(true);
  };

  const handleConfirmStartTask = () => {
    const confirmCheckResult = canAssignTaskToTechnician(employeeId, employees, attendanceRecords, companySettings);
    if (!confirmCheckResult.allowed) {
      setError(confirmCheckResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      setShowStartConfirm(false);
      return;
    }

    onStartTask(
      employeeId,
      taskType,
      startConfirmTime || new Date().toISOString(),
      notes,
      subscriberName,
      subscriberPhone,
      undefined,
      taskType === 'دعم' ? supportTaskId : undefined
    );

    setEmployeeId(''); // reset selection
    setSubscriberName('');
    setSubscriberPhone('');
    setNotes('');
    setSupportTaskId(''); // reset support selection
    setSuccess('✅ تم إرسال المهمة بنجاح إلى الفني وبانتظار الموافقة.');
    setShowStartConfirm(false);
    
    // Auto clear success
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleOpenCompletedDialog = () => {
    setError('');
    setSuccess('');

    if (matchedPhoneTask) {
      setResendTechId(employeeId || matchedPhoneTask.employeeId);
      setResendNotes(notes || matchedPhoneTask.notes || '');
      setShowExistingModal(matchedPhoneTask);
      return;
    }

    setCompletedEmployeeId(employeeId); // Pre-fill with the selected employee if any
    setCompletedTaskType(taskType); // Pre-fill with the selected task type
    
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setCompletedDate(`${yyyy}-${mm}-${dd}`);
    setCompletedStartTime('08:00');
    setCompletedEndTime('09:00');
    setCompletedDialogError('');
    setShowCompletedDialog(true);
  };

  const handleSaveCompletedTask = (e: React.FormEvent) => {
    e.preventDefault();
    setCompletedDialogError('');

    if (!completedEmployeeId) {
      setCompletedDialogError('يرجى تحديد الموظف أولاً.');
      return;
    }

    const completedCheckResult = canAssignTaskToTechnician(completedEmployeeId, employees, attendanceRecords, companySettings);
    if (!completedCheckResult.allowed) {
      setCompletedDialogError(completedCheckResult.errorMessage || 'لا يمكن إسناد مهمة لهذا الفني قبل تسجيل بصمة الحضور.');
      return;
    }

    if (!completedDate || !completedStartTime || !completedEndTime) {
      setCompletedDialogError('يرجى ملء جميع حقول التاريخ والوقت.');
      return;
    }

    // Create start and end date objects
    const startDateTime = new Date(`${completedDate}T${completedStartTime}`);
    let endDateTime = new Date(`${completedDate}T${completedEndTime}`);

    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      setCompletedDialogError('صيغة التاريخ أو الوقت غير صالحة.');
      return;
    }

    if (endDateTime <= startDateTime) {
      // Crossing midnight
      const nextDay = new Date(startDateTime);
      nextDay.setDate(nextDay.getDate() + 1);
      const year = nextDay.getFullYear();
      const month = String(nextDay.getMonth() + 1).padStart(2, '0');
      const day = String(nextDay.getDate()).padStart(2, '0');
      endDateTime = new Date(`${year}-${month}-${day}T${completedEndTime}`);
    }

    // Show confirmation dialog instead of registering directly
    setShowPastConfirm(true);
  };

  const handleConfirmSaveCompletedTask = () => {
    const startDateTime = new Date(`${completedDate}T${completedStartTime}`);
    let endDateTime = new Date(`${completedDate}T${completedEndTime}`);

    if (endDateTime <= startDateTime) {
      // Crossing midnight
      const nextDay = new Date(startDateTime);
      nextDay.setDate(nextDay.getDate() + 1);
      const year = nextDay.getFullYear();
      const month = String(nextDay.getMonth() + 1).padStart(2, '0');
      const day = String(nextDay.getDate()).padStart(2, '0');
      endDateTime = new Date(`${year}-${month}-${day}T${completedEndTime}`);
    }

    if (onRegisterCompletedTask) {
      onRegisterCompletedTask(
        completedEmployeeId,
        completedTaskType,
        startDateTime.toISOString(),
        endDateTime.toISOString()
      );
    }

    setShowPastConfirm(false);
    setShowCompletedDialog(false);
    setEmployeeId(''); // Reset main selector back to empty
    setSuccess('✅ تم تسجيل المهمة بنجاح.');
    setTimeout(() => setSuccess(''), 3000);
  };

  // 1. Filter and sort active tasks dynamically
  const filteredActiveTasks = useMemo(() => {
    let result = activeTasks.filter(t => !t.parentTaskId);
    if (activeSearch.trim()) {
      const q = activeSearch.toLowerCase();
      result = result.filter(task => 
        (task.employeeName || '').toLowerCase().includes(q) ||
        (task.taskType || '').toLowerCase().includes(q) ||
        (task.notes || '').toLowerCase().includes(q) ||
        (task.subscriberName || '').toLowerCase().includes(q) ||
        (task.subscriberPhone || '').toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
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
      if (activeSort === 'duration') {
        const getActiveMs = (t: Task) => {
          const now = Date.now();
          const start = new Date(t.startTime).getTime();
          const isPaused = t.status === 'paused';
          const currentPauseMs = (isPaused && t.pausedAt) ? (now - new Date(t.pausedAt).getTime()) : 0;
          const totalPauseMs = (t.totalPausedMs || 0) + currentPauseMs;
          return (now - start) - totalPauseMs;
        };
        return getActiveMs(b) - getActiveMs(a);
      }
      return 0;
    });

    return result;
  }, [activeTasks, activeSearch, activeSort, tick]);

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

  return (
    <div className="max-w-2xl mx-auto space-y-6 md:space-y-8" dir="rtl">
      {/* Task Creation & Registration Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between">
        <div>
          {/* Header */}
          <div className="border-b border-slate-100 pb-5 mb-5">
            <h2 className="text-lg font-black text-slate-800">إسناد وتسجيل المهام</h2>
            <p className="text-xs text-slate-500 mt-0.5">ابدأ مهمة ميدانية فورية أو سجل مهمة منجزة سابقاً</p>
          </div>

          {/* Feedback messages */}
          {error && (
            <div className="mb-4 bg-red-50 text-red-700 text-xs p-3.5 rounded-xl border border-red-100 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}
          {success && (
            <div className="mb-4 bg-emerald-50 text-emerald-800 text-xs p-3.5 rounded-xl border border-emerald-100 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="font-bold">{success}</span>
            </div>
          )}

          {technicianEmployees.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs font-bold leading-relaxed">
              يرجى إضافة أو تفعيل موظفين بدرجة (فني / Technician) أولاً لتتمكن من إسناد المهام.
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1. Employee Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الفني *</label>
                <select
                  value={employeeId}
                  onChange={(e) => {
                    setEmployeeId(e.target.value);
                    setError('');
                  }}
                  className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                >
                  <option value="">اختر الفني</option>
                  {technicianEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Task Type Trigger Box */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع المهمة والنقاط *</label>
                {(() => {
                  const matchedType = taskTypes.find(t => t.name === taskType);
                  return (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowTaskTypeDropdown(!showTaskTypeDropdown)}
                        className="w-full p-3.5 rounded-xl border border-slate-200 hover:border-blue-500 bg-white flex items-center justify-between text-right cursor-pointer transition-all shadow-2xs group"
                      >
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-xs"
                            style={{ backgroundColor: matchedType?.color || '#3b82f6' }}
                          >
                            <Tag className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <span className="font-extrabold text-slate-800 text-xs block">{taskType || 'اختر المهمة'}</span>
                            <span className="text-[10px] text-slate-400 font-medium">
                              +{matchedType?.points || 0} نقطة أساسية
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 text-blue-600 font-bold text-xs bg-blue-50 px-2.5 py-1 rounded-lg group-hover:bg-blue-100 transition-colors">
                          <span>اختر نوع المهمة</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${showTaskTypeDropdown ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {/* Task Type Dropdown Selection */}
                      {showTaskTypeDropdown && (
                        <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-fade-in max-h-60 overflow-y-auto shadow-sm">
                          <div className="text-[11px] font-black text-slate-500 px-1 mb-1">اختر المهمة المطلوب إسنادها:</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {taskTypes.filter(t => t.status === 'active' || (!t.status && !t.isArchived)).map((tt) => {
                              const isSelected = taskType === tt.name;
                              return (
                                <button
                                  key={tt.id}
                                  type="button"
                                  onClick={() => {
                                    setTfTypeAndClean(tt.name);
                                    setShowTaskTypeDropdown(false);
                                  }}
                                  className={`p-2.5 rounded-xl border text-xs font-bold text-right transition-all flex items-center justify-between cursor-pointer ${
                                    isSelected
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
                                  }`}
                                >
                                  <span className="truncate">{tt.name}</span>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    +{tt.points} ن
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Support selection dropdown if taskType === 'دعم' */}
                {taskType === 'دعم' && (
                  <div className="mt-3.5 space-y-1.5 animate-fade-in">
                    <label className="block text-xs font-black text-slate-700 mb-1">👷 اختيار المهمة الجارية المراد دعمها *</label>
                    {activeTasks.filter(t => t.status === 'active' && t.taskType !== 'دعم' && t.taskType !== 'tt-7').length === 0 ? (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-bold leading-normal">
                        ⚠️ لا توجد مهام جارية حالياً لتقديم الدعم لها. يجب بدء مهمة رئيسية أولاً!
                      </div>
                    ) : (
                      <select
                        value={supportTaskId}
                        onChange={(e) => setSupportTaskId(e.target.value)}
                        className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                      >
                        <option value="">-- اختر المهمة الجارية --</option>
                        {activeTasks
                          .filter(t => t.status === 'active' && t.taskType !== 'دعم' && t.taskType !== 'tt-7')
                          .map(task => (
                            <option key={task.id} value={task.id}>
                              {task.employeeName} - {task.taskType} {task.notes ? ` - ${task.notes}` : ''}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Subscriber Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المشترك</label>
                <input
                  type="text"
                  value={subscriberName}
                  onChange={(e) => setSubscriberName(e.target.value)}
                  placeholder="أدخل اسم المشترك (اختياري)..."
                  className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold"
                />
              </div>

              {/* 4. Phone Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">رقم الهاتف</label>
                <input
                  type="tel"
                  value={subscriberPhone}
                  onChange={(e) => setSubscriberPhone(e.target.value)}
                  placeholder="أدخل رقم الهاتف للبحث أو التسجيل..."
                  className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-mono font-bold"
                />
                {matchedPhoneTask && (
                  <div className={`mt-3 p-3.5 rounded-2xl shadow-2xs space-y-2.5 border ${
                    matchedPhoneTask.status === 'postponed'
                      ? 'bg-purple-50/90 border-purple-300 ring-2 ring-purple-400/20'
                      : 'bg-amber-50 border-amber-300/90'
                  }`}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <span className="text-base shrink-0">
                          {matchedPhoneTask.status === 'postponed' ? '🟣' : '👤'}
                        </span>
                        <div>
                          <div className={`font-black text-xs ${
                            matchedPhoneTask.status === 'postponed' ? 'text-purple-950 flex items-center gap-1.5' : 'text-amber-950'
                          }`}>
                            <span>
                              {matchedPhoneTask.status === 'postponed'
                                ? '⚠️ تنبيه: المهمة السابقة لهذا المشترك مؤجلة!'
                                : 'تم العثور على مشترك مسجل بهذا الرقم!'}
                            </span>
                          </div>
                          <div className={`text-[11px] font-extrabold mt-0.5 ${
                            matchedPhoneTask.status === 'postponed' ? 'text-purple-900' : 'text-amber-900'
                          }`}>
                            اسم المشترك: <span className="text-blue-900 font-black">{matchedPhoneTask.subscriberName || subscriberName || 'غير مسجل'}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`font-black text-[10px] px-2.5 py-0.5 rounded-lg border shrink-0 ${
                        matchedPhoneTask.status === 'postponed'
                          ? 'bg-purple-200 text-purple-950 border-purple-300'
                          : 'bg-amber-200/90 text-amber-950 border-amber-300'
                      }`}>
                        {matchedPhoneTask.status === 'postponed' ? 'مهمة مؤجلة ⏳' : `مشترك سابق (${allSubscriberTasks.length} فتحات)`}
                      </span>
                    </div>

                    {/* Postponed Task Detailed Box */}
                    {matchedPhoneTask.status === 'postponed' ? (
                      <div className="bg-white/95 p-3 rounded-xl border border-purple-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between pb-1.5 border-b border-purple-100">
                          <span className="font-bold text-slate-600">نوع المهمة المؤجلة:</span>
                          <span className="font-black text-purple-900 bg-purple-100/70 px-2.5 py-0.5 rounded-md border border-purple-200">
                            {matchedPhoneTask.taskType}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-600">الفني الذي قام بالتأجيل:</span>
                          <span className="font-black text-slate-800">
                            👤 {matchedPhoneTask.postponedByTechName || matchedPhoneTask.employeeName || 'غير محدد'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-600 flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                            تاريخ وتوقيت التأجيل:
                          </span>
                          <span className="font-mono font-bold text-purple-950 bg-purple-50 px-2 py-0.5 rounded border border-purple-100 text-[11px]">
                            {matchedPhoneTask.postponedAt ? new Date(matchedPhoneTask.postponedAt).toLocaleString('ar-IQ') : formatArabicDateOnly(matchedPhoneTask.startTime)}
                          </span>
                        </div>

                        <div className="bg-purple-50/80 p-2.5 rounded-lg border border-purple-200/80 text-xs">
                          <span className="font-bold text-purple-900 block mb-0.5">سبب التأجيل المذكور من الفني:</span>
                          <p className="font-black text-purple-950">
                            {matchedPhoneTask.postponeReason || 'لم يحدد الفني سبباً للتأجيل'}
                          </p>
                        </div>

                        {matchedPhoneTask.notes && (
                          <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="font-bold text-slate-700">الموقع / الملاحظات: </span>
                            {matchedPhoneTask.notes}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-700 bg-white/90 p-2.5 rounded-xl border border-amber-200/60 flex items-center justify-between font-bold">
                        <span>آخر مهمة: {matchedPhoneTask.taskType} ({matchedPhoneTask.employeeName})</span>
                        <span className="font-mono text-[10px]">
                          {matchedPhoneTask.status === 'completed' ? '🔵 مكتملة' :
                           matchedPhoneTask.status === 'active' ? '🟢 جارية' :
                           matchedPhoneTask.status === 'rejected' ? '🔴 مرفوضة' :
                           matchedPhoneTask.status === 'paused' ? '⏸️ موقوفة' :
                           matchedPhoneTask.status === 'postponed' ? '🟣 مؤجلة' : '⏳ قيد الانتظار'}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons for Subscriber */}
                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                      {matchedPhoneTask.status === 'postponed' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setResendTechId(employeeId || matchedPhoneTask.employeeId);
                              setResendNotes(notes || matchedPhoneTask.notes || '');
                              setResendTaskType(taskType || matchedPhoneTask.taskType || 'تنصيب');
                              setShowExistingModal(matchedPhoneTask);
                            }}
                            className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 hover:scale-102 active:scale-98"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>إعادة تكليف / استئناف المهمة المؤجلة</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setQuickTaskSubscriber({
                                name: matchedPhoneTask.subscriberName || subscriberName || 'مشترك مسجل',
                                phone: matchedPhoneTask.subscriberPhone || subscriberPhone || ''
                              });
                              setQuickTechId(employeeId || matchedPhoneTask.employeeId || (employees[0]?.id || ''));
                              setQuickTaskType(taskType || taskTypes[0]?.name || 'تنصيب');
                              setQuickNotes(notes || '');
                              setQuickError('');
                              setQuickSuccess('');
                            }}
                            className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5 text-slate-600" />
                            <span>مهمة جديدة</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickTaskSubscriber({
                                name: matchedPhoneTask.subscriberName || subscriberName || 'مشترك مسجل',
                                phone: matchedPhoneTask.subscriberPhone || subscriberPhone || ''
                              });
                              setQuickTechId(employeeId || matchedPhoneTask.employeeId || (employees[0]?.id || ''));
                              setQuickTaskType(taskType || taskTypes[0]?.name || 'تنصيب');
                              setQuickNotes(notes || '');
                              setQuickError('');
                              setQuickSuccess('');
                            }}
                            className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 text-white font-black px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 hover:scale-102 active:scale-98"
                          >
                            <Plus className="w-4 h-4" />
                            <span>إضافة مهمة لهذا المشترك</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setResendTechId(employeeId || matchedPhoneTask.employeeId);
                              setResendNotes(notes || matchedPhoneTask.notes || '');
                              setResendTaskType(taskType || matchedPhoneTask.taskType || 'تنصيب');
                              setShowExistingModal(matchedPhoneTask);
                            }}
                            className="w-full sm:w-auto bg-amber-200/90 hover:bg-amber-300 text-amber-950 font-black px-3 py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shrink-0"
                          >
                            <History className="w-3.5 h-3.5 text-amber-900" />
                            <span>عرض السجل والتفاصيل</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Notes / Location */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">الملاحظة / الموقع</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أدخل تفاصيل الموقع أو الملاحظات للفني..."
                  rows={2}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleStartActiveTask()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="text-base">🟢</span>
                  <span>بدء مهمة الآن</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCompletedDialog}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span className="text-base">🔵</span>
                  <span>إضافة مهمة سابقة</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {!hideActiveTasksList && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        {/* Title and Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              إدارة ومراقبة المهام الجارية
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">متابعة الفنيين في الميدان واحتساب نقاط الأداء في الوقت الفعلي</p>
          </div>
          <span className="bg-blue-50 text-blue-700 text-xs font-black px-3 py-1.5 rounded-full border border-blue-200/60 w-fit">
            {activeTasks.length} مهام جارية بالكامل
          </span>
        </div>

        {/* Statistics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50 border border-slate-100/80 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">🟢 مهام جارية الآن</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-slate-800">{activeStats.runningCount}</span>
              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md">نشطة</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100/80 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">👤 فنيون في الميدان</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-slate-800">{activeStats.workingTechs}</span>
              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded-md">فني</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100/80 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">🟠 مهام متوقفة</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-black text-slate-800">{activeStats.pausedCount}</span>
              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded-md">مؤقتاً</span>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100/80 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-[11px] font-bold text-slate-500">⏱️ متوسط مدة التنفيذ</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-sm font-black text-slate-800 truncate">{activeStats.averageDurationText}</span>
              <span className="text-[10px] text-slate-500 font-bold">للمهمة</span>
            </div>
          </div>
        </div>

        {/* Search and Filter Controls */}
        {activeTasks.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 bg-slate-50/50 p-3 rounded-2xl border border-slate-100">
            {/* Quick Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={activeSearch}
                onChange={(e) => setActiveSearch(e.target.value)}
                placeholder="بحث سريع باسم الفني أو نوع المهمة..."
                className="w-full text-xs pr-10 pl-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
              />
            </div>

            {/* Sorting Dropdown */}
            <div className="flex items-center gap-2 min-w-[160px]">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={activeSort}
                onChange={(e) => setActiveSort(e.target.value as any)}
                className="w-full text-xs px-2.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none text-slate-700 font-bold cursor-pointer"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
                <option value="technician">اسم الفني</option>
                <option value="taskType">نوع المهمة</option>
                <option value="duration">الوقت المستغرق (الأطول)</option>
              </select>
            </div>
          </div>
        )}

        {/* List of active tasks */}
        {activeTasks.length === 0 ? (
          <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-100">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3 animate-spin" style={{ animationDuration: '8s' }} />
            <h4 className="font-bold text-slate-700 text-xs">لا يوجد مهام قيد التنفيذ حالياً</h4>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              عند خروج موظف لأداء عمل ميداني، قم باختياره وتحديد نوع المهمة ثم انقر على "بدء مهمة الآن".
            </p>
          </div>
        ) : filteredActiveTasks.length === 0 ? (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-slate-100">
            <h4 className="font-bold text-slate-700 text-xs">لم نجد نتائج مطابقة لبحثك</h4>
            <p className="text-[11px] text-slate-400 mt-1">تأكد من كتابة الاسم بشكل صحيح أو جرب كلمة بحث أخرى.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredActiveTasks.map((task) => {
              const nowTime = Date.now();
              const start = new Date(task.startTime).getTime();
              const isCompleted = task.status === 'completed';
              const endTimeMs = (isCompleted && task.endTime) ? new Date(task.endTime).getTime() : nowTime;
              
              // Calculate live pause times
              const currentPauseMs = (task.status === 'paused' && task.pausedAt)
                ? (nowTime - new Date(task.pausedAt).getTime())
                : 0;
              const totalPauseTimeMs = (task.totalPausedMs || 0) + currentPauseMs;
              const activeWorkTimeMs = Math.max(0, (endTimeMs - start) - totalPauseTimeMs);

              const isPaused = task.status === 'paused';
              const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
              const livePoints = calculateTaskPoints(task.taskType, durationMinutes, taskTypes, pointsRules);

              return (
                <div
                  key={task.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-4 flex flex-col justify-between hover:border-blue-200 hover:shadow-xs transition-all relative overflow-hidden"
                >
                  {/* Status Indicator colored line at top */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${isPaused ? 'bg-amber-500' : 'bg-blue-600 animate-pulse'}`} />

                  {/* Card Main Area */}
                  <div className="space-y-4">
                    {/* Header: Avatar, Name, Status indicator */}
                    <div className="flex items-start justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs border border-slate-200">
                          {task.employeeName ? task.employeeName.charAt(0) : 'ف'}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            {task.employeeName}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-medium">الرمز الميداني: #{task.employeeId.slice(-4)}</span>
                        </div>
                      </div>

                      {/* Status Tag */}
                      <span
                        className={`text-[10px] font-black px-2.5 py-1 rounded-md flex items-center gap-1.5 ${
                          isPaused
                            ? 'bg-amber-50 text-amber-800 border border-amber-200/50'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200/50'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-ping'}`} />
                        {isPaused ? 'موقوف مؤقتاً' : 'جارية الآن'}
                      </span>
                    </div>

                    {/* Task Type and Notes */}
                    <div className="flex items-center justify-between gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[11px] font-black text-slate-700">{task.taskType}</span>
                      </div>
                      {task.status !== 'rejected' && (
                        <span className="text-[10px] bg-blue-600 text-white font-extrabold px-2 py-0.5 rounded-md">
                          {task.status === 'completed' 
                            ? task.points 
                            : (taskTypes.find(t => t.name === task.taskType)?.points ?? task.points)}
                        </span>
                      )}
                    </div>

                    {/* Metadata Fields List */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-slate-600 text-xs">
                      {/* Location (الموقع) */}
                      <div className="col-span-2 flex items-start gap-1.5 bg-blue-50/30 p-2 rounded-xl border border-blue-100/30">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <div className="leading-tight">
                          <span className="text-[10px] text-slate-400 block font-bold">الموقع الميداني / التفاصيل</span>
                          <span className="text-[11px] font-bold text-slate-800">
                            {task.notes || 'غير محدد'}
                          </span>
                        </div>
                      </div>

                      {/* Start Time / Send Time */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <span className="text-[9px] text-slate-400 block">{task.status === 'pending' ? 'وقت الإرسال' : 'وقت البداية'}</span>
                          <span className="font-mono text-[10px] font-black text-slate-700">
                            {formatArabicTimeOnly(task.sentAt || task.startTime)}
                          </span>
                        </div>
                      </div>

                      {/* Live Points (النقاط الحالية) */}
                      <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <div>
                          <span className="text-[9px] text-slate-400 block">النقاط الحالية</span>
                          <span className="text-[11px] font-black text-blue-700">
                            {livePoints}
                          </span>
                        </div>
                      </div>

                      {/* Active Work Time (الوقت الفعلي) */}
                      <div className="flex items-center gap-1.5">
                        <Clock className={`w-3.5 h-3.5 ${task.status === 'completed' ? 'text-blue-600' : isPaused ? 'text-amber-600' : 'text-emerald-600 animate-pulse'} shrink-0`} />
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block">
                            {task.status === 'completed' ? 'الوقت المستغرق' : isPaused ? 'موقوف عند' : 'عداد الوقت الجاري ⏱️'}
                          </span>
                          <span className={`text-[11px] font-black ${
                            task.status === 'completed' ? 'text-blue-800 font-bold' : isPaused ? 'text-amber-800 font-mono' : 'text-emerald-700 font-mono'
                          }`}>
                            {task.status === 'completed' 
                              ? (durationMinutes === 0 ? 'أقل من دقيقة' : `${durationMinutes} دقيقة`) 
                              : formatMsToHMS(activeWorkTimeMs)}
                          </span>
                        </div>
                      </div>

                      {/* Pause Duration (وقت التوقف) */}
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <div>
                          <span className="text-[9px] text-slate-400 block">الوقت الموقوف الإجمالي</span>
                          <span className="font-mono text-[10px] font-black text-red-600">
                            {formatMsToHMS(totalPauseTimeMs)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Subscriber fields if available */}
                    {(task.subscriberName || task.subscriberPhone) && (
                      <div className="text-[10px] bg-slate-50 p-2 rounded-xl border border-slate-100 flex justify-between">
                        {task.subscriberName && (
                          <span className="truncate max-w-[110px]">👤 المشترك: <span className="font-bold">{task.subscriberName}</span></span>
                        )}
                        {task.subscriberPhone && (
                          <span>📞 هاتف: <span className="font-mono font-bold">{task.subscriberPhone}</span></span>
                        )}
                      </div>
                    )}

                    {/* Pause Reason (if paused) */}
                    {isPaused && task.pauseReason && (
                      <div className="text-[10px] bg-red-50 text-red-800 p-2.5 rounded-xl border border-red-100/50">
                        <span className="font-extrabold block mb-0.5">سبب التوقف المؤقت:</span>
                        <p className="font-medium leading-normal">{task.pauseReason}</p>
                      </div>
                    )}

                    {/* Supporters list if any */}
                    {(() => {
                      const supporters = activeTasks.filter(t => t.parentTaskId === task.id);
                      if (supporters.length > 0) {
                        return (
                          <div className="text-[11px] bg-blue-50/40 p-2.5 rounded-xl border border-blue-100/30 mt-2">
                            <span className="font-extrabold text-blue-800 flex items-center gap-1">🤝 الداعمون لهذه المهمة:</span>
                            <ul className="list-disc list-inside mr-1 text-slate-700 font-extrabold space-y-0.5 mt-1">
                              {supporters.map(sup => (
                                <li key={sup.id}>
                                  {sup.employeeName}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Buttons controls row inside the card */}
                  <div className="grid grid-cols-2 lg:flex lg:flex-row lg:items-center gap-2 w-full pt-3.5 border-t border-slate-100 mt-4">
                    {/* Button 1: Complete (إكمال) */}
                    {(userRole === 'admin' || userRole === 'owner') && (
                      <button
                        type="button"
                        onClick={() => onCompleteTask(task.id, new Date().toISOString(), undefined, 'تم إكمال المهمة وتوثيقها بواسطة الإدارة')}
                        className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[13px] px-3 rounded-[10px] flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full"
                      >
                        <CheckCircle2 className="w-[14px] h-[14px] shrink-0" />
                        <span>إكمال</span>
                      </button>
                    )}

                    {/* Button 2: Pause / Resume (إيقاف) */}
                    {(userRole === 'admin' || userRole === 'owner') && (!isPaused ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPauseReason('');
                          setPauseError('');
                          setShowPauseDialog(task.id);
                        }}
                        className="h-9 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-[13px] px-3 rounded-[10px] flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full"
                      >
                        <Clock className="w-[14px] h-[14px] shrink-0" />
                        <span>إيقاف</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onResumeTask(task.id)}
                        className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13px] px-3 rounded-[10px] flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full"
                      >
                        <Play className="w-[14px] h-[14px] shrink-0 fill-white" />
                        <span>استئناف</span>
                      </button>
                    ))}

                    {/* Button 3: Edit (تعديل) */}
                    {(userRole === 'admin' || userRole === 'owner') && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(task)}
                        className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[13px] px-3 rounded-[10px] flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full"
                      >
                        <Pencil className="w-[14px] h-[14px] shrink-0" />
                        <span>تعديل</span>
                      </button>
                    )}

                    {/* Button 4: Delete (حذف) */}
                    {(userRole === 'admin' || userRole === 'owner') && (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(task.id)}
                        className="h-9 bg-red-600 hover:bg-red-700 text-white font-semibold text-[13px] px-3 rounded-[10px] flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer w-full"
                      >
                        <Trash2 className="w-[14px] h-[14px] shrink-0" />
                        <span>حذف</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Delete Record Prompt dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-center"
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
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 resize-none font-medium"
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

      {/* Completed Task Dialog Modal */}
      <AnimatePresence>
        {showCompletedDialog && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-6 text-right"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <h3 className="font-extrabold text-slate-800 text-base">🔵 إضافة مهمة سابقة</h3>
                <button
                  type="button"
                  onClick={() => setShowCompletedDialog(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {completedDialogError && (
                <div className="mb-4 bg-red-50 text-red-700 text-xs p-3.5 rounded-xl border border-red-100 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="font-medium">{completedDialogError}</span>
                </div>
              )}

              <form onSubmit={handleSaveCompletedTask} className="space-y-4">
                {/* 1. Employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الموظف *</label>
                  <select
                    required
                    value={completedEmployeeId}
                    onChange={(e) => setCompletedEmployeeId(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                  >
                    <option value="">-- اختر الفني --</option>
                    {technicianEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Task Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع المهمة *</label>
                  <select
                    required
                    value={completedTaskType}
                    onChange={(e) => setCompletedTaskType(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                  >
                    {taskTypes.filter(t => t.status === 'active' || (!t.status && !t.isArchived)).map((tt) => (
                      <option key={tt.id} value={tt.name}>
                        {tt.name} (+{tt.points} ن)
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Task Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ المهمة *</label>
                  <div className="relative">
                    <input
                      type="date"
                      required
                      value={completedDate}
                      onChange={(e) => setCompletedDate(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-bold"
                    />
                  </div>
                </div>

                {/* 4. Start Time & Finish Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت البدء *</label>
                    <input
                      type="time"
                      required
                      value={completedStartTime}
                      onChange={(e) => setCompletedStartTime(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت الانتهاء *</label>
                    <input
                      type="time"
                      required
                      value={completedEndTime}
                      onChange={(e) => setCompletedEndTime(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="mt-6 flex gap-3 pt-3 border-t border-slate-50">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>حفظ المهمة واحتساب النقاط</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCompletedDialog(false)}
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

      {/* Edit Active Task Dialog Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden p-6 text-right"
              dir="rtl"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <span>✏️ تعديل المهمة الجارية</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveActiveTaskEdit} className="space-y-4">
                {/* 1. Employee */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الفني الميداني *</label>
                  <select
                    required
                    value={editEmployeeId}
                    onChange={(e) => setEditEmployeeId(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                  >
                    {technicianEmployees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Task Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع المهمة *</label>
                  <select
                    required
                    value={editTaskType}
                    onChange={(e) => handleEditTaskTypeChange(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white cursor-pointer font-bold"
                  >
                    {taskTypes.filter(t => t.status === 'active' || (!t.status && !t.isArchived) || t.name === editTaskType).map((tt) => (
                      <option key={tt.id} value={tt.name}>
                        {tt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Start Time */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت البداية *</label>
                  <input
                    type="datetime-local"
                    required
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>

                {/* 4. Subscriber Name & Phone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المشترك (اختياري)</label>
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
                    <span className="text-[10px] text-slate-400 font-bold">(تعديل قواعد الاحتساب)</span>
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

      {/* 1. Start Task Confirm Dialog */}
      <AnimatePresence>
        {showStartConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 text-right border border-slate-100"
              dir="rtl"
            >
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              </div>
              
              <h3 className="font-black text-slate-800 text-lg text-center mb-1">📋 تأكيد إرسال المهمة</h3>
              <p className="text-xs text-slate-500 text-center leading-relaxed mb-5">
                هل أنت متأكد من إرسال هذه المهمة؟
              </p>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 space-y-3.5 mb-6">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">👤 الفني:</span>
                  <span className="text-slate-800 font-black text-sm">
                    {employees.find(emp => emp.id === employeeId)?.name || 'غير محدد'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">🔧 نوع المهمة:</span>
                  <span className="text-slate-800 font-black text-sm">{taskType}</span>
                </div>
                {taskType === 'دعم' && supportTaskId && (() => {
                  const parentTask = activeTasks.find(t => t.id === supportTaskId);
                  return parentTask ? (
                    <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50 animate-fade-in">
                      <span className="text-slate-500 font-bold">👷 المهمة المدعومة:</span>
                      <span className="text-slate-800 font-black text-sm">
                        {parentTask.employeeName} - {parentTask.taskType}
                      </span>
                    </div>
                  ) : null;
                })()}
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">⭐ النقاط:</span>
                  <span className="text-emerald-600 font-black text-sm">
                    {(() => {
                      if (taskType === 'دعم' && supportTaskId) {
                        const parentTask = activeTasks.find(t => t.id === supportTaskId);
                        if (parentTask) {
                          return taskTypes.find(t => t.name === parentTask.taskType)?.points ?? parentTask.points;
                        }
                      }
                      return taskTypes.find(t => t.name === taskType)?.points ?? 0;
                    })()} نقطة
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-bold">⏰ وقت البدء:</span>
                  <span className="text-slate-800 font-mono font-bold text-sm">
                    {formatArabicTimeOnly(startConfirmTime)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmStartTask}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-100"
                >
                  <span>✅ نعم، ابدأ المهمة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowStartConfirm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>❌ إلغاء</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Past Task Confirm Dialog */}
      <AnimatePresence>
        {showPastConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden p-6 text-right border border-slate-100"
              dir="rtl"
            >
              <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <ShieldAlert className="w-8 h-8 animate-pulse" />
              </div>
              
              <h3 className="font-black text-slate-800 text-lg text-center mb-1">📋 تأكيد تسجيل المهمة السابقة</h3>
              <p className="text-xs text-slate-500 text-center leading-relaxed mb-5">
                هل تريد تسجيل هذه المهمة لهذا الفني؟
              </p>

              <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 space-y-3.5 mb-6">
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">👤 الفني:</span>
                  <span className="text-slate-800 font-black text-sm">
                    {employees.find(emp => emp.id === completedEmployeeId)?.name || 'غير محدد'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">🔧 نوع المهمة:</span>
                  <span className="text-slate-800 font-black text-sm">{completedTaskType}</span>
                </div>
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-100/50">
                  <span className="text-slate-500 font-bold">⭐ النقاط:</span>
                  <span className="text-blue-600 font-black text-sm">
                    {taskTypes.find(t => t.name === completedTaskType)?.points ?? 0} نقطة
                  </span>
                </div>
                <div className="flex justify-between items-start text-xs">
                  <span className="text-slate-500 font-bold shrink-0">📅 التاريخ والوقت:</span>
                  <span className="text-slate-800 font-bold text-left leading-tight text-sm">
                    <div>{completedDate}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1 bg-slate-200/50 px-2 py-0.5 rounded-md inline-block">
                      {completedStartTime} - {completedEndTime}
                    </div>
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmSaveCompletedTask}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-100"
                >
                  <span>✅ تسجيل المهمة</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPastConfirm(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>❌ إلغاء</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Add Task to Existing Subscriber Modal */}
      <AnimatePresence>
        {quickTaskSubscriber && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 text-right my-8"
              dir="rtl"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-lg shrink-0">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <span>إضافة مهمة جديدة للمشترك</span>
                    </h3>
                    <p className="text-xs text-blue-700 font-bold mt-0.5">
                      المشترك: <span className="text-slate-900 font-black">{quickTaskSubscriber.name || 'غير محدد'}</span> | الهاتف: <span className="font-mono text-slate-900">{quickTaskSubscriber.phone}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickTaskSubscriber(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleConfirmQuickTask} className="space-y-4">
                {/* Subscriber Name & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-150">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">اسم المشترك</label>
                    <input
                      type="text"
                      value={quickTaskSubscriber.name}
                      onChange={(e) => setQuickTaskSubscriber(prev => prev ? { ...prev, name: e.target.value } : null)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-700 outline-none text-slate-800 bg-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">رقم الهاتف</label>
                    <input
                      type="text"
                      value={quickTaskSubscriber.phone}
                      onChange={(e) => setQuickTaskSubscriber(prev => prev ? { ...prev, phone: e.target.value } : null)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:border-blue-700 outline-none text-slate-800 bg-white font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Technician Selection */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>تحديد الفني المكلف بالمهمة *</span>
                  </label>
                  <select
                    required
                    value={quickTechId}
                    onChange={(e) => {
                      setQuickTechId(e.target.value);
                      setQuickError('');
                    }}
                    className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold cursor-pointer"
                  >
                    <option value="" disabled>-- اختر الفني المكلف --</option>
                    {technicianEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Task Type Selection */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-blue-600" />
                    <span>نوع المهمة الجديدة *</span>
                  </label>
                  <select
                    required
                    value={quickTaskType}
                    onChange={(e) => setQuickTaskType(e.target.value)}
                    className="w-full text-xs px-3.5 py-3 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold cursor-pointer"
                  >
                    {taskTypes.filter(t => t.status === 'active' || (!t.status && !t.isArchived)).map((tt) => (
                      <option key={tt.id} value={tt.name}>
                        {tt.name} ({tt.points} نقطة)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Notes / Location */}
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span>الملاحظات أو الموقع</span>
                  </label>
                  <textarea
                    rows={2}
                    value={quickNotes}
                    onChange={(e) => setQuickNotes(e.target.value)}
                    placeholder="أدخل أي ملاحظات إضافية للمهمة أو موقع المشترك..."
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 bg-white font-bold resize-none"
                  />
                </div>

                {/* Error / Success feedback */}
                {quickError && (
                  <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold">
                    {quickError}
                  </div>
                )}

                {quickSuccess && (
                  <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>{quickSuccess}</span>
                  </div>
                )}

                {/* Buttons */}
                <div className="flex gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={isSubmittingQuickTask}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black text-xs py-3.5 rounded-2xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{isSubmittingQuickTask ? 'جاري الإضافة...' : 'إسناد المهمة وبدء التنفيذ'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQuickTaskSubscriber(null)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold px-4 py-3.5 rounded-2xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Existing Task Found via Phone Search Modal */}
      <AnimatePresence>
        {showExistingModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl border border-slate-100 space-y-4 text-right my-8"
              dir="rtl"
            >
              {/* Header */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <span>مهمة سابقة مسجلة بنفس رقم الهاتف</span>
                    </h3>
                    <p className="text-xs text-amber-700 font-bold mt-0.5">
                      رقم الهاتف: <span className="font-mono text-slate-900">{showExistingModal.subscriberPhone}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowExistingModal(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Notice Banner */}
              <div className={`p-3 rounded-2xl border text-xs font-bold flex items-start gap-2 ${
                showExistingModal.status === 'postponed'
                  ? 'bg-purple-50 border-purple-200 text-purple-950'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}>
                {showExistingModal.status === 'postponed' ? (
                  <Calendar className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  {showExistingModal.status === 'postponed'
                    ? 'عثر النظام على مهمة مؤجلة مسجلة سابقاً بهذا الرقم. يمكنك مراجعة سبب وتاريخ التأجيل وإعادة فتحها وتوجيهها لفني جديد أو لنفس الفني لإكمالها.'
                    : 'عثر النظام على مهمة مسجلة سابقاً بنفس رقم الهاتف. يمكنك فتح تفاصيلها وإعادة إرسالها إلى فني جديد مع الحفاظ الكامل على تاريخ الإضافة والفني الأول.'}
                </div>
              </div>

              {/* Task Details Card */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">رقم المهمة:</span>
                  <span className="font-mono font-black text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md">
                    #{showExistingModal.id}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">نوع المهمة:</span>
                  <span className="font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                    {showExistingModal.taskType}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">اسم المشترك:</span>
                  <span className="font-black text-slate-800">{showExistingModal.subscriberName || 'غير محدد'}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">تاريخ إضافة المهمة لأول مرة:</span>
                  <span className="font-bold text-slate-800 dir-ltr font-mono bg-amber-50 text-amber-900 px-2 py-0.5 rounded-md border border-amber-100">
                    {new Date(showExistingModal.startTime || showExistingModal.assignedDate || Date.now()).toLocaleString('ar-IQ', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">الفني الأول (الأصلي):</span>
                  <span className="font-black text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-100">
                    👤 {showExistingModal.editLogs?.[0]?.changes?.match(/الفني الأول: (.*)/)?.[1] || showExistingModal.employeeName}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-500">الحالة الحالية:</span>
                  <span className={`font-black px-2.5 py-0.5 rounded-lg border text-[11px] ${
                    showExistingModal.status === 'completed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    showExistingModal.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    showExistingModal.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                    showExistingModal.status === 'paused' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    showExistingModal.status === 'postponed' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {
                      showExistingModal.status === 'completed' ? '🔵 مكتملة' :
                      showExistingModal.status === 'active' ? '🟢 جارية' :
                      showExistingModal.status === 'rejected' ? '🔴 مرفوضة' :
                      showExistingModal.status === 'paused' ? '⏸️ موقوفة' :
                      showExistingModal.status === 'postponed' ? '🟣 مؤجلة' : '⏳ قيد الانتظار'
                    }
                  </span>
                </div>

                {/* Postponement Details */}
                {showExistingModal.status === 'postponed' && (
                  <div className="pt-2 border-t border-purple-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-900 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-purple-600" />
                        تاريخ وتوقيت التأجيل:
                      </span>
                      <span className="font-mono font-bold text-purple-950 bg-purple-100/70 px-2 py-0.5 rounded-md border border-purple-200">
                        {showExistingModal.postponedAt ? new Date(showExistingModal.postponedAt).toLocaleString('ar-IQ') : '-'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="font-bold text-purple-900">الفني الذي قام بالتأجيل:</span>
                      <span className="font-bold text-purple-950">
                        👤 {showExistingModal.postponedByTechName || showExistingModal.employeeName}
                      </span>
                    </div>

                    <div className="bg-purple-50 text-purple-950 p-2.5 rounded-xl border border-purple-200 text-xs">
                      <span className="font-bold text-purple-900 block mb-0.5">سبب التأجيل المذكور من الفني:</span>
                      <p className="font-black">{showExistingModal.postponeReason || 'لم يحدد الفني سبباً للتأجيل'}</p>
                    </div>
                  </div>
                )}

                {(showExistingModal.rejectionReason || showExistingModal.previousRejectionReason) && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="font-bold text-red-700 block mb-1">
                      🚨 سبب الرفض بواسطة الفني ({showExistingModal.rejectedByTechName || showExistingModal.employeeName}):
                    </span>
                    <div className="bg-red-50 text-red-900 font-bold p-2.5 rounded-xl border border-red-200/80 text-xs">
                      {showExistingModal.rejectionReason || showExistingModal.previousRejectionReason}
                    </div>
                  </div>
                )}

                {showExistingModal.notes && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <span className="font-bold text-slate-600 block mb-1">الملاحظات والموقع:</span>
                    <div className="bg-white text-slate-800 font-medium p-2.5 rounded-xl border border-slate-200 text-xs leading-relaxed">
                      {showExistingModal.notes}
                    </div>
                  </div>
                )}
              </div>

              {/* Comprehensive Subscriber Openings Database & History Timeline */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-blue-600" />
                    <span>سجل مرات فتح وتوجيه المهمة لهذا المشترك</span>
                  </label>
                  <span className="text-[10px] font-black text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    عدد مرات الفتح: {allSubscriberTasks.length} مرات
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 max-h-48 overflow-y-auto space-y-2.5 text-[11px] dir-rtl">
                  {allSubscriberTasks.map((taskItem, index) => (
                    <div key={taskItem.id} className="p-3 rounded-xl bg-white border border-slate-200 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between text-slate-500 font-bold text-[10px] pb-1 border-b border-slate-100">
                        <span className="text-blue-800 font-black bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          المرة رقم ({index + 1})
                        </span>
                        <span dir="ltr" className="font-mono text-slate-600">
                          {new Date(taskItem.startTime || taskItem.assignedDate || Date.now()).toLocaleString('ar-IQ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 text-slate-700 font-bold">
                        <div>
                          <span className="text-slate-400 font-semibold block text-[10px]">الفني المسند إليه:</span>
                          <span className="text-emerald-800 font-black">👤 {taskItem.employeeName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold block text-[10px]">نوع المهمة:</span>
                          <span className="text-blue-900 font-black">{taskItem.taskType}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400 font-semibold">حالة هذه المهمة:</span>
                        <span className={`px-2 py-0.5 rounded-md border ${
                          taskItem.status === 'completed' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                          taskItem.status === 'active' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                          taskItem.status === 'rejected' ? 'bg-red-50 text-red-800 border-red-200' :
                          taskItem.status === 'postponed' ? 'bg-purple-50 text-purple-800 border-purple-200' :
                          taskItem.status === 'paused' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {
                            taskItem.status === 'completed' ? '🔵 مكتملة' :
                            taskItem.status === 'active' ? '🟢 جارية' :
                            taskItem.status === 'rejected' ? '🔴 مرفوضة' :
                            taskItem.status === 'postponed' ? '🟣 مؤجلة' :
                            taskItem.status === 'paused' ? '⏸️ موقوفة' : '⏳ قيد الانتظار'
                          }
                        </span>
                      </div>

                      {/* Postponed Task history note */}
                      {taskItem.status === 'postponed' && (
                        <div className="bg-purple-50 p-2 rounded-lg border border-purple-200 text-[10px] space-y-1 font-bold text-purple-950">
                          <div className="flex items-center justify-between">
                            <span className="text-purple-800">⏳ تاريخ التأجيل: {taskItem.postponedAt ? new Date(taskItem.postponedAt).toLocaleString('ar-IQ') : '-'}</span>
                            <span className="text-purple-900">👤 بواسطة: {taskItem.postponedByTechName || taskItem.employeeName}</span>
                          </div>
                          <p className="text-purple-900 font-extrabold bg-white/70 p-1.5 rounded border border-purple-100">
                            سبب التأجيل: {taskItem.postponeReason || 'لم يحدد الفني سبباً'}
                          </p>
                        </div>
                      )}

                      {/* Rejection reason with technician attribution */}
                      {(taskItem.rejectionReason || taskItem.previousRejectionReason) && (
                        <div className="bg-red-50/80 p-2 rounded-lg border border-red-100 text-[10px] font-bold text-red-900">
                          <span className="text-red-700 font-black block mb-0.5">
                            🚨 سبب الاعتذار/الرفض (بواسطة الفني: {taskItem.rejectedByTechName || taskItem.employeeName}):
                          </span>
                          <span>{taskItem.rejectionReason || taskItem.previousRejectionReason}</span>
                        </div>
                      )}

                      {/* Employee Completion Details */}
                      {(taskItem.operationDetails || (taskItem.status === 'completed' && taskItem.notes && taskItem.notes.includes('معلومات العملية'))) && (
                        <div className="bg-emerald-50/90 p-2 rounded-lg border border-emerald-200 text-[10px] font-bold text-emerald-950">
                          <span className="text-emerald-800 font-black block mb-0.5">
                            📝 تفاصيل ومعلومات الإنجاز (المكتوبة من الموظف/الفني):
                          </span>
                          <span>{taskItem.operationDetails || taskItem.notes}</span>
                        </div>
                      )}

                      {taskItem.delayReason && (
                        <div className="bg-amber-50 p-2 rounded-lg border border-amber-200 text-[10px] font-bold text-amber-900">
                          <span className="text-amber-800 font-black block mb-0.5">⏱️ سبب التأخير المذكور من الفني:</span>
                          <span>{taskItem.delayReason}</span>
                        </div>
                      )}

                      {taskItem.notes && !taskItem.notes.includes('معلومات العملية') && (
                        <div className="text-slate-500 font-medium text-[10px] bg-slate-50 p-1.5 rounded border border-slate-100">
                          الملاحظات: {taskItem.notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Re-send Action Form */}
              <div className={`p-4 rounded-2xl border space-y-3 ${
                showExistingModal.status === 'postponed'
                  ? 'bg-purple-50/80 border-purple-200'
                  : 'bg-blue-50/70 border-blue-100'
              }`}>
                <h4 className={`font-black text-xs flex items-center justify-between ${
                  showExistingModal.status === 'postponed' ? 'text-purple-950' : 'text-blue-950'
                }`}>
                  <span className="flex items-center gap-1.5">
                    <RotateCcw className={`w-4 h-4 ${
                      showExistingModal.status === 'postponed' ? 'text-purple-600' : 'text-blue-600'
                    }`} />
                    <span>
                      {showExistingModal.status === 'postponed'
                        ? 'إعادة تكليف واستئناف المهمة المؤجلة للفني'
                        : 'إعادة فتح وتحويل المهمة وتوجيهها للفني'}
                    </span>
                  </span>
                  {showExistingModal.taskType !== resendTaskType && (
                    <span className="text-[10px] bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-full font-black border border-amber-300 animate-pulse">
                      تحويل: {showExistingModal.taskType} 👈 {resendTaskType}
                    </span>
                  )}
                </h4>

                {/* Task Type Dropdown (allows converting e.g. Installation to Maintenance) */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
                    <span>نوع المهمة الجديد (يمكنك تحويل النوع) <span className="text-red-500">*</span></span>
                    <span className="text-[10px] text-slate-500 font-bold">النوع السابق: {showExistingModal.taskType}</span>
                  </label>
                  <select
                    value={resendTaskType}
                    onChange={(e) => setResendTaskType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {taskTypes.filter(t => t.status === 'active' || (!t.status && !t.isArchived) || t.name === showExistingModal?.taskType).map((tt) => (
                      <option key={tt.id} value={tt.name}>
                        {tt.name} ({tt.points} نقطة)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    تحديد الفني المكلف <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={resendTechId}
                    onChange={(e) => {
                      setResendTechId(e.target.value);
                      setResendError('');
                    }}
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    <option value="" disabled>-- اختر الفني --</option>
                    {technicianEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">
                    ملاحظات أو توجيهات إضافية عند إعادة الإرسال
                  </label>
                  <textarea
                    rows={2}
                    value={resendNotes}
                    onChange={(e) => setResendNotes(e.target.value)}
                    placeholder="أي ملاحظات جديدة للفني..."
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                  />
                </div>

                {resendError && (
                  <p className="text-xs font-bold text-red-600 bg-red-50 p-2 rounded-xl border border-red-200">
                    {resendError}
                  </p>
                )}
              </div>

              {/* Modal buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleConfirmResendFromExistingModal}
                  className={`w-full sm:flex-1 text-white text-xs font-black py-3 rounded-2xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 hover:scale-101 active:scale-99 ${
                    showExistingModal.status === 'postponed'
                      ? 'bg-purple-600 hover:bg-purple-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>
                    {showExistingModal.status === 'postponed'
                      ? 'استئناف وإعادة تكليف المهمة المؤجلة للفني'
                      : `تحويل وإعادة فتح المهمة للفني (المرة رقم ${allSubscriberTasks.length + 1})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleForceNewTask}
                  className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3.5 py-3 rounded-2xl transition-colors cursor-pointer shrink-0"
                  title="تجاهل وجود المهمة القديمة وإنشاء مهمة جديدة منفصلة"
                >
                  <span>➕ إنشاء جديدة</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowExistingModal(null)}
                  className="w-full sm:w-auto bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold px-3.5 py-3 rounded-2xl transition-colors cursor-pointer shrink-0"
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

