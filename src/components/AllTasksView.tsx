import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Database, 
  Clock, 
  User, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  PauseCircle, 
  ChevronDown, 
  ChevronUp,
  History, 
  Calendar, 
  Filter,
  ShieldAlert,
  Plus,
  Send,
  X,
  Check,
  Pencil,
  Trash2,
  Tag,
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  ClipboardCheck,
  Package,
  Boxes,
  Banknote
} from 'lucide-react';
import { Task, Employee, DbTaskType } from '../types';
import { 
  getTaskTimeLimitMinutes, 
  exportSubscribersToExcel, 
  exportSubscribersToPDF, 
  SubscriberExportFilterOptions,
  filterSubscriberTasksByExportOptions
} from '../utils';
import CopyPhoneButton from './CopyPhoneButton';

interface SubscriberRecord {
  subscriberKey: string;
  phone: string;
  name: string;
  tasks: Task[];
  latestTaskTime: number;
}

interface AllTasksViewProps {
  tasks: Task[];
  employees: Employee[];
  taskTypes?: DbTaskType[];
  userRole?: 'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant' | string;
  onStartTask?: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => Promise<void> | void;
  onEditTaskHistory?: (task: Task) => void;
  onDeleteTaskHistory?: (taskId: string) => void;
  onEditSubscriber?: (oldTasks: Task[], newName: string, newPhone: string) => Promise<void> | void;
  onDeleteSubscriber?: (tasksToDelete: Task[]) => Promise<void> | void;
  onApproveReopenTask?: (taskId: string) => void;
  onRejectReopenTask?: (taskId: string, reason?: string) => void;
  onApproveDelayReason?: (taskId: string) => void;
  onRejectDelayReason?: (taskId: string) => void;
}

export default function AllTasksView({
  tasks,
  employees,
  taskTypes = [],
  userRole = 'owner',
  onStartTask,
  onEditTaskHistory,
  onDeleteTaskHistory,
  onEditSubscriber,
  onDeleteSubscriber,
  onApproveReopenTask,
  onRejectReopenTask,
  onApproveDelayReason,
  onRejectDelayReason
}: AllTasksViewProps) {
  if (userRole === 'technician') {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-xs text-center max-w-md mx-auto space-y-4" dir="rtl">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-lg">غير متاح للحساب الفني</h3>
        <p className="text-xs text-slate-500 leading-relaxed">
          قاعدة بيانات المشتركين متاحة فقط لإدارة النظام (المالك والمدير).
        </p>
      </div>
    );
  }

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // Available task type names list for quick search & filter
  const availableTaskTypeNames = useMemo(() => {
    const defaultTypes = ['صيانة', 'تنصيب', 'دعم'];
    const fromProps = (taskTypes || []).map(tt => tt.name).filter(Boolean);
    const fromTasks = (tasks || []).map(t => t.taskType).filter(Boolean);
    const set = new Set([...defaultTypes, ...fromProps, ...fromTasks]);
    // Filter out unwanted legacy defaults if present in older tasks
    const unwanted = new Set(['سحب كبل', 'إعادة تفعيل', 'تبديل راوتر', 'قطع خدمة']);
    return Array.from(set).filter(type => !unwanted.has(type));
  }, [taskTypes, tasks]);
  
  // Track expanded subscriber history cards - HIDDEN BY DEFAULT (empty object means isExpanded = false)
  const [expandedSubscribers, setExpandedSubscribers] = useState<Record<string, boolean>>({});

  // Track expanded individual task details within subscriber log
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTasks(prev => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  // Modal for adding a new task directly for a subscriber
  const [newTaskSubscriber, setNewTaskSubscriber] = useState<{ name: string; phone: string } | null>(null);
  const [newTaskTechId, setNewTaskTechId] = useState('');
  const [newTaskType, setNewTaskType] = useState('تنصيب');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [newTaskError, setNewTaskError] = useState('');
  const [newTaskSuccess, setNewTaskSuccess] = useState('');
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Edit Subscriber Modal State
  const [editingSubscriber, setEditingSubscriber] = useState<SubscriberRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Delete Subscriber Modal State
  const [deletingSubscriber, setDeletingSubscriber] = useState<SubscriberRecord | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  // Subscribers Database Export Modal State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportDaysOption, setExportDaysOption] = useState<SubscriberExportFilterOptions['daysOption']>('all');
  const [exportCustomDaysCount, setExportCustomDaysCount] = useState<number>(3);
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportStatusFilter, setExportStatusFilter] = useState<SubscriberExportFilterOptions['statusFilter']>('all');
  const [exportTaskTypeFilter, setExportTaskTypeFilter] = useState<string>('all');
  const [exportEmployeeFilter, setExportEmployeeFilter] = useState<string>('all');

  // Preview statistics calculation inside export modal
  const exportPreviewData = useMemo(() => {
    if (!showExportModal) return null;

    const allGroups: Record<string, Task[]> = {};
    (tasks || []).forEach(t => {
      const cleanPhone = (t.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      const cleanName = (t.subscriberName || '').trim();
      const key = cleanPhone || cleanName || `sub-${t.id}`;
      if (!allGroups[key]) allGroups[key] = [];
      allGroups[key].push(t);
    });

    const allSubs = Object.keys(allGroups).map(key => {
      const subTasks = allGroups[key].sort((a, b) => 
        new Date(a.startTime || a.assignedDate || 0).getTime() - new Date(b.startTime || b.assignedDate || 0).getTime()
      );
      const name = subTasks.find(t => t.subscriberName?.trim())?.subscriberName || 'مشترك بدون اسم';
      const phone = subTasks.find(t => t.subscriberPhone?.trim())?.subscriberPhone || '';
      const latestTime = new Date(subTasks[subTasks.length - 1].startTime || subTasks[subTasks.length - 1].assignedDate || 0).getTime();
      return { subscriberKey: key, phone, name, tasks: subTasks, latestTaskTime: latestTime };
    });

    const options: SubscriberExportFilterOptions = {
      daysOption: exportDaysOption,
      customDaysCount: exportCustomDaysCount,
      startDate: exportStartDate,
      endDate: exportEndDate,
      statusFilter: exportStatusFilter,
      taskTypeFilter: exportTaskTypeFilter,
      employeeFilter: exportEmployeeFilter
    };

    return {
      allSubs,
      options,
      stats: filterSubscriberTasksByExportOptions(allSubs, options)
    };
  }, [
    showExportModal,
    tasks,
    exportDaysOption,
    exportCustomDaysCount,
    exportStartDate,
    exportEndDate,
    exportStatusFilter,
    exportTaskTypeFilter,
    exportEmployeeFilter
  ]);

  const handleExportExcel = () => {
    if (!exportPreviewData) return;
    exportSubscribersToExcel(exportPreviewData.allSubs, exportPreviewData.options);
  };

  const handleExportPDF = () => {
    if (!exportPreviewData) return;
    exportSubscribersToPDF(exportPreviewData.allSubs, exportPreviewData.options);
  };

  // Handlers for Edit Subscriber
  const handleOpenEditModal = (sub: SubscriberRecord) => {
    setEditingSubscriber(sub);
    setEditName(sub.name);
    setEditPhone(sub.phone);
    setEditError('');
  };

  const handleConfirmEditSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubscriber) return;
    if (!editName.trim()) {
      setEditError('يرجى إدخال اسم المشترك');
      return;
    }

    setIsSubmittingEdit(true);
    setEditError('');
    try {
      if (onEditSubscriber) {
        await onEditSubscriber(editingSubscriber.tasks, editName.trim(), editPhone.trim());
      }
      setEditingSubscriber(null);
    } catch (err) {
      console.error(err);
      setEditError('حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handlers for Delete Subscriber
  const handleOpenDeleteModal = (sub: SubscriberRecord) => {
    setDeletingSubscriber(sub);
  };

  const handleConfirmDeleteSubscriber = async () => {
    if (!deletingSubscriber) return;
    setIsSubmittingDelete(true);
    try {
      if (onDeleteSubscriber) {
        await onDeleteSubscriber(deletingSubscriber.tasks);
      }
      setDeletingSubscriber(null);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  // Group tasks by Subscriber (Phone / Name) and process filtering
  const subscriberRecords = useMemo(() => {
    const groups: Record<string, Task[]> = {};

    tasks.forEach(t => {
      const cleanPhone = (t.subscriberPhone || '').replace(/[\s\-\(\)\+]/g, '').trim();
      const cleanName = (t.subscriberName || '').trim();
      // Group key preference: phone if present, otherwise clean name or 'unknown'
      const key = cleanPhone || cleanName || `sub-${t.id}`;

      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(t);
    });

    // Convert to SubscriberRecord list
    const records: SubscriberRecord[] = Object.keys(groups).map(key => {
      const subTasks = groups[key].sort((a, b) => {
        const timeA = new Date(a.startTime || a.assignedDate || 0).getTime();
        const timeB = new Date(b.startTime || b.assignedDate || 0).getTime();
        return timeA - timeB; // Chronological order: 1st opening to latest
      });

      const latestTask = subTasks[subTasks.length - 1];
      const name = subTasks.find(t => t.subscriberName?.trim())?.subscriberName || 'مشترك بدون اسم';
      const phone = subTasks.find(t => t.subscriberPhone?.trim())?.subscriberPhone || '';
      const latestTime = new Date(latestTask.startTime || latestTask.assignedDate || 0).getTime();

      return {
        subscriberKey: key,
        phone,
        name,
        tasks: subTasks,
        latestTaskTime: latestTime
      };
    });

    // Apply search and dropdown filters
    const q = searchQuery.toLowerCase().trim();
    let filtered = records.filter(rec => {
      // Search Query filter (phone, subscriber name, technician name, notes, task type)
      if (q) {
        const matchPhone = rec.phone.toLowerCase().includes(q);
        const matchName = rec.name.toLowerCase().includes(q);
        const matchTaskInfo = rec.tasks.some(t => 
          (t.employeeName || '').toLowerCase().includes(q) ||
          (t.taskType || '').toLowerCase().includes(q) ||
          (t.notes || '').toLowerCase().includes(q) ||
          (t.rejectionReason || '').toLowerCase().includes(q)
        );
        if (!matchPhone && !matchName && !matchTaskInfo) return false;
      }

      // Status Filter: Filter based on the status of the LATEST task (last opened record) for the subscriber
      if (statusFilter !== 'all') {
        const latestTask = rec.tasks[rec.tasks.length - 1];
        if (!latestTask || latestTask.status !== statusFilter) return false;
      }

      // Employee Filter
      if (employeeFilter !== 'all') {
        const hasEmp = rec.tasks.some(t => t.employeeId === employeeFilter);
        if (!hasEmp) return false;
      }

      // Task Type Filter
      if (taskTypeFilter !== 'all') {
        const hasTaskType = rec.tasks.some(t => (t.taskType || '').trim().toLowerCase() === taskTypeFilter.trim().toLowerCase());
        if (!hasTaskType) return false;
      }

      return true;
    });

    // Sort subscribers by latest activity time (newest subscriber activity first)
    filtered.sort((a, b) => b.latestTaskTime - a.latestTaskTime);

    return filtered;
  }, [tasks, searchQuery, statusFilter, employeeFilter, taskTypeFilter]);

  // Paginated visible subscribers (10 at a time)
  const visibleSubscribers = useMemo(() => {
    return subscriberRecords.slice(0, visibleCount);
  }, [subscriberRecords, visibleCount]);

  const hasMore = visibleCount < subscriberRecords.length;

  const handleShowMore = () => {
    setVisibleCount(prev => prev + 10);
  };

  const toggleExpand = (key: string) => {
    setExpandedSubscribers(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Open modal to add a new task for this subscriber
  const handleOpenNewTaskModal = (sub: SubscriberRecord) => {
    setNewTaskSubscriber({ name: sub.name, phone: sub.phone });
    setNewTaskTechId(employees[0]?.id || '');
    setNewTaskType(taskTypes[0]?.name || 'تنصيب');
    setNewTaskNotes('');
    setNewTaskError('');
    setNewTaskSuccess('');
  };

  // Create new task submit handler
  const handleCreateNewTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onStartTask) return;

    if (!newTaskTechId) {
      setNewTaskError('الرجاء اختيار الفني المكلف بالمهمة');
      return;
    }
    if (!newTaskType) {
      setNewTaskError('الرجاء اختيار نوع المهمة الجديدة');
      return;
    }

    setIsSubmittingTask(true);
    setNewTaskError('');

    try {
      const nowIso = new Date().toISOString();
      await onStartTask(
        newTaskTechId,
        newTaskType,
        nowIso,
        newTaskNotes,
        newTaskSubscriber?.name || '',
        newTaskSubscriber?.phone || '',
        nowIso
      );

      setNewTaskSuccess('تم إسناد المهمة الجديدة بنجاح وتحويلها للفني!');
      setTimeout(() => {
        setNewTaskSubscriber(null);
        setNewTaskSuccess('');
      }, 1200);
    } catch (err) {
      console.error(err);
      setNewTaskError('حدث خطأ أثناء إضافة المهمة الجديدة، الرجاء المحاولة مرة أخرى.');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Fallback default task types list if DB task types is empty
  const defaultTaskTypesList = ['تنصيب', 'صيانة', 'دعم'];

  const pendingReopenRequests = useMemo(() => {
    return (tasks || []).filter(t => t.reopenRequested && t.reopenRequestStatus === 'pending');
  }, [tasks]);

  const pendingDelayTasks = useMemo(() => {
    return (tasks || []).filter(t => t.delayReason && t.delayStatus === 'pending');
  }, [tasks]);

  return (
    <div className="space-y-6 dir-rtl text-right font-sans">
      {/* Delay Reason Approvals Banner for Owner/Supervisor/Manager */}
      {pendingDelayTasks.length > 0 && (userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager' || userRole === 'admin') && (
        <div className="bg-gradient-to-r from-amber-900 via-orange-900 to-amber-950 text-white p-5 rounded-3xl shadow-lg border border-amber-700/60 space-y-3" dir="rtl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-300 animate-pulse" />
              <h3 className="font-black text-sm md:text-base text-amber-100">
                طلبات قبول أسباب التأخير للمهام ({pendingDelayTasks.length})
              </h3>
            </div>
            <span className="bg-amber-800/90 text-amber-200 text-xs px-3 py-1 rounded-xl font-bold border border-amber-700 shadow-2xs">
              قرار المشرف والمالك لإلغاء أو إبقاء الخصم
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingDelayTasks.map(delayTask => {
              const limit = getTaskTimeLimitMinutes(delayTask.taskType, taskTypes);
              const durationMs = (delayTask.endTime && delayTask.startTime)
                ? (new Date(delayTask.endTime).getTime() - new Date(delayTask.startTime).getTime() - (delayTask.totalPausedMs || 0))
                : 0;
              const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
              const overtimeMinutes = Math.max(0, durationMinutes - limit);

              return (
                <div key={delayTask.id} className="bg-amber-950/90 border border-amber-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                  <div className="space-y-1.5 text-xs flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-sm">{delayTask.taskType}</span>
                      <span className="text-[10px] text-amber-300 font-bold bg-amber-900 px-2.5 py-0.5 rounded-md border border-amber-800">
                        الفني: {delayTask.employeeName}
                      </span>
                      {overtimeMinutes > 0 && (
                        <span className="text-[10px] text-red-200 font-bold bg-red-900/90 px-2.5 py-0.5 rounded-md">
                          تأخير: {overtimeMinutes} دقيقة (المستغرق: {durationMinutes} د من {limit} د)
                        </span>
                      )}
                    </div>
                    {delayTask.subscriberName && (
                      <p className="text-amber-200">المشترك: <strong className="text-white font-black">{delayTask.subscriberName}</strong></p>
                    )}
                    <p className="text-amber-100 text-xs bg-amber-900/80 p-2.5 rounded-xl border border-amber-800/80 font-bold">
                      💬 <strong>سبب التأخير المرفق:</strong> {delayTask.delayReason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveDelayReason && onApproveDelayReason(delayTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>قبول السبب (إلغاء الخصم)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectDelayReason && onRejectDelayReason(delayTask.id)}
                      className="bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 text-white p-5 rounded-3xl shadow-lg border border-purple-700/60 space-y-3" dir="rtl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-purple-300 animate-spin-slow" />
              <h3 className="font-black text-sm md:text-base text-purple-100">
                طلبات إعادة إرسال المهمة (في انتظار القبول) ({pendingReopenRequests.length})
              </h3>
            </div>
            <span className="bg-purple-800/90 text-purple-200 text-xs px-3 py-1 rounded-xl font-bold border border-purple-700 shadow-2xs">
              بانتظار موافقة المشرف والمالك
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingReopenRequests.map(reqTask => {
              const empName = reqTask.employeeName || employees.find(e => e.id === reqTask.employeeId)?.name || 'فني غير محدد';
              const requestedType = reqTask.reopenRequestTaskType || reqTask.taskType;
              return (
                <div key={reqTask.id} className="bg-purple-950/90 border border-purple-800 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-amber-300 text-sm">نوع المهمة الجديدة: {requestedType}</span>
                      <span className="text-[10px] text-purple-200 font-bold bg-purple-900/90 px-2.5 py-0.5 rounded-md border border-purple-700">
                        الفني: {empName}
                      </span>
                    </div>
                    {reqTask.subscriberName && (
                      <p className="text-purple-200">المشترك: <strong className="text-white font-black">{reqTask.subscriberName}</strong> {reqTask.subscriberPhone ? `(${reqTask.subscriberPhone})` : ''}</p>
                    )}
                    <p className="text-purple-100 text-xs bg-purple-900/70 p-2.5 rounded-xl border border-purple-800/80 font-medium">
                      💬 <strong>سبب الطلب والملاحظة:</strong> {reqTask.reopenRequestReason || 'طلب إعادة فتح المهمة للتوجه للمشترك'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onApproveReopenTask && onApproveReopenTask(reqTask.id)}
                      className="bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-4 h-4" />
                      <span>الموافقة وإرسال كمهمة جديدة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectReopenTask && onRejectReopenTask(reqTask.id)}
                      className="bg-red-600 hover:bg-red-700 active:scale-98 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
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

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -left-10 -bottom-10 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-6 h-6 text-blue-400" />
              <h2 className="text-xl md:text-2xl font-black">قاعدة بيانات المشتركين والمهام</h2>
            </div>
            <p className="text-xs md:text-sm text-slate-300 font-medium">
              البحث عن المشتركين برقم الهاتف أو الاسم، إضافة مهمة جديدة مباشرة للمشترك، واستعراض سجل جميع التكليفات.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs md:text-sm px-4 py-2.5 rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer border border-emerald-500/30 active:scale-95"
            >
              <Download className="w-4.5 h-4.5 text-emerald-100" />
              <span>تصدير ملف اكسل / PDF للمشتركين</span>
            </button>

            <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/10 text-xs font-black flex items-center gap-2">
              <span className="text-slate-300">إجمالي المشتركين:</span>
              <span className="text-amber-400 text-base font-black">{subscriberRecords.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Inputs */}
      <div className="bg-white rounded-3xl p-4 md:p-5 border border-slate-100 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Phone / Name Search Bar */}
          <div className="md:col-span-6 relative">
            <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(10); // Reset pagination to 10 on new search
              }}
              placeholder="ابحث برقم الهاتف أو اسم المشترك..."
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-11 pl-4 py-3 text-xs md:text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setVisibleCount(10);
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700 bg-slate-200/60 px-2 py-0.5 rounded-md"
              >
                مسح
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="md:col-span-3 relative">
            <Filter className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setVisibleCount(10);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-10 pl-3 py-3 text-xs font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 appearance-none cursor-pointer"
            >
              <option value="all">كافة الحالات</option>
              <option value="active">🟢 جارية الان</option>
              <option value="pending">⏳ قيد الانتظار</option>
              <option value="postponed">🟣 مؤجلة</option>
              <option value="completed">🔵 مكتملة</option>
              <option value="rejected">🔴 مرفوضة / اعتذار</option>
            </select>
          </div>

          {/* Employee Filter */}
          <div className="md:col-span-3 relative">
            <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={employeeFilter}
              onChange={(e) => {
                setEmployeeFilter(e.target.value);
                setVisibleCount(10);
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pr-10 pl-3 py-3 text-xs font-extrabold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 appearance-none cursor-pointer"
            >
              <option value="all">كافة الفنيين</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Task Type Choice Buttons (Pills / Chips) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 scrollbar-none border-t border-slate-100">
          <span className="text-[11px] font-extrabold text-slate-500 shrink-0 flex items-center gap-1 ml-1">
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            بحث عن نوع المهمة:
          </span>
          <button
            type="button"
            onClick={() => { setTaskTypeFilter('all'); setVisibleCount(10); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 border cursor-pointer ${
              taskTypeFilter === 'all'
                ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            الكل
          </button>
          {availableTaskTypeNames.map(typeName => (
            <button
              key={typeName}
              type="button"
              onClick={() => { setTaskTypeFilter(typeName); setVisibleCount(10); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 border cursor-pointer ${
                taskTypeFilter === typeName
                  ? 'bg-blue-700 text-white border-blue-700 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {typeName}
            </button>
          ))}
        </div>

        {/* Search Results Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1 pt-1 border-t border-slate-100">
          <span>
            عرض <strong className="text-blue-700 font-black">{Math.min(visibleCount, subscriberRecords.length)}</strong> من أصل <strong className="text-slate-800 font-black">{subscriberRecords.length}</strong> مشترك
          </span>
          {(searchQuery || statusFilter !== 'all' || employeeFilter !== 'all' || taskTypeFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setEmployeeFilter('all');
                setTaskTypeFilter('all');
                setVisibleCount(10);
              }}
              className="text-blue-600 hover:text-blue-800 font-black hover:underline cursor-pointer"
            >
              إعادة ضبط الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Subscribers Cards Grid */}
      {visibleSubscribers.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="font-extrabold text-slate-800 text-base">لم يتم العثور على أي مشترك مطابقة للبحث</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            جرّب البحث برقم هاتف أخر أو اسم المشترك.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleSubscribers.map((sub) => {
            // CRITICAL: Default state is HIDDEN (false). Clicking arrow toggles visibility
            const isExpanded = Boolean(expandedSubscribers[sub.subscriberKey]);

            return (
              <div 
                key={sub.subscriberKey}
                className="bg-white rounded-3xl border border-slate-150 shadow-xs hover:shadow-md transition-all overflow-hidden"
              >
                {/* Subscriber Main Card Header: STRICTLY Name & Phone ONLY */}
                <div className="p-5 bg-gradient-to-r from-slate-50 via-white to-blue-50/30 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white font-black flex items-center justify-center text-base shadow-xs shrink-0">
                        👤
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-base md:text-lg">
                          {sub.name}
                        </h3>

                        {sub.phone ? (
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="text-xs font-bold text-slate-500">📞 الهاتف:</span>
                            <span className="font-mono text-xs font-black text-blue-900 dir-ltr">{sub.phone}</span>
                            <CopyPhoneButton phone={sub.phone} showText={false} />
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-slate-400">لا يوجد رقم هاتف مسجل</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons: 1. Add New Task, 2. Edit Subscriber, 3. Delete Subscriber, 4. Toggle History Arrow Button */}
                  <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                    {/* Add New Task Button */}
                    {onStartTask && (
                      <button
                        type="button"
                        onClick={() => handleOpenNewTaskModal(sub)}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-black px-3.5 py-2 rounded-xl text-xs transition-all cursor-pointer shadow-xs flex items-center gap-1.5 hover:scale-102 active:scale-98"
                      >
                        <Plus className="w-4 h-4" />
                        <span>إضافة مهمة جديدة</span>
                      </button>
                    )}

                    {/* Edit Subscriber Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(sub)}
                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 font-extrabold px-3 py-2 rounded-xl text-xs border border-amber-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
                      title="تعديل بيانات المشترك"
                    >
                      <Pencil className="w-3.5 h-3.5 text-amber-600" />
                      <span>تعديل</span>
                    </button>

                    {/* Delete Subscriber Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(sub)}
                      className="bg-red-50 hover:bg-red-100 text-red-600 font-extrabold px-3 py-2 rounded-xl text-xs border border-red-200 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
                      title="حذف المشترك وجميع سجلاته"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      <span>حذف</span>
                    </button>

                    {/* Toggle History Button with Arrow (Hidden by default, click to show) */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(sub.subscriberKey)}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-black px-3.5 py-2 rounded-xl text-xs border border-slate-300/80 flex items-center gap-2 transition-all cursor-pointer shadow-2xs hover:scale-102 active:scale-98"
                      title={isExpanded ? 'إخفاء تفاصيل السجل' : 'عرض تفاصيل السجل'}
                    >
                      <History className="w-3.5 h-3.5 text-slate-700" />
                      <span>سجل الفتح: ({sub.tasks.length} مرات)</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-900" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-900" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Subscriber History Details Section (Shown ONLY when toggled open) */}
                {isExpanded && (
                  <div className="p-4 md:p-5 bg-slate-50/70 space-y-3 animate-fadeIn">
                    <div className="flex items-center justify-between text-xs font-black text-slate-700 pb-1 border-b border-slate-200/60">
                      <span className="flex items-center gap-1.5">
                        <History className="w-4 h-4 text-blue-600" />
                        <span>سجل المهام والتكليفات بالكامل لهذا المشترك:</span>
                      </span>
                      <span className="text-[11px] text-slate-400 font-bold">
                        مرتبة من الأقدم إلى الأحدث
                      </span>
                    </div>

                    <div className="space-y-3">
                      {sub.tasks.map((task, idx) => {
                        const isTaskExpanded = Boolean(expandedTasks[task.id]);

                        return (
                          <div 
                            key={task.id} 
                            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all hover:border-blue-300"
                          >
                            {/* Summary Bar - Always visible when opening log is open */}
                            <div 
                              onClick={() => toggleTaskExpand(task.id)}
                              className="p-3.5 bg-white hover:bg-slate-50/80 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                            >
                              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                                <span className="font-black text-blue-900 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-100 text-xs shrink-0">
                                  الفتح رقم ({idx + 1})
                                </span>

                                {/* 1. اسم الموظف / الفني */}
                                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                                  <span className="text-slate-400 text-[11px]">الفني:</span>
                                  <span className="text-emerald-800 font-black">👤 {task.employeeName}</span>
                                </div>

                                <span className="hidden sm:inline text-slate-300">•</span>

                                {/* 2. نوع المهمة */}
                                <div className="flex items-center gap-1 text-xs font-bold text-slate-800">
                                  <span className="text-slate-400 text-[11px]">نوع المهمة:</span>
                                  <span className="text-blue-900 font-black">{task.taskType}</span>
                                </div>

                                <span className="hidden sm:inline text-slate-300">•</span>

                                {/* 3. تاريخ ووقت إرسال المهمة */}
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="text-slate-400 text-[11px]">وقت وتاريخ الإرسال:</span>
                                  <span dir="ltr" className="font-mono text-slate-800 font-bold text-[11px]">
                                    {new Date(task.sentAt || task.startTime || task.assignedDate || Date.now()).toLocaleString('ar-IQ')}
                                  </span>
                                </div>

                                {/* 4. تحصيل أموال المشترك */}
                                {task.status === 'completed' && (
                                  <div className="flex items-center gap-1">
                                    {task.paymentStatus === 'collected' || (task.collectedAmount && task.collectedAmount > 0) ? (
                                      <span className="bg-emerald-50 text-emerald-800 border border-emerald-200/90 px-2 py-0.5 rounded-lg text-[10.5px] font-mono font-black shadow-2xs flex items-center gap-1">
                                        <span>💰</span>
                                        <span>{Number(task.collectedAmount || 0).toLocaleString('ar-EG')} د.ع</span>
                                      </span>
                                    ) : (
                                      <span className="bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg text-[10.5px] font-bold flex items-center gap-1">
                                        <span>🆓</span>
                                        <span>مجاناً</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Toggle Arrow / Button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleTaskExpand(task.id);
                                }}
                                className="text-xs font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 shrink-0 self-end sm:self-center bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition-all cursor-pointer"
                              >
                                <span>{isTaskExpanded ? 'إخفاء التفاصيل' : 'عرض كافة التفاصيل'}</span>
                                {isTaskExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {/* Full Task Details - Rendered ONLY when expanded */}
                            {isTaskExpanded && (
                              <div className="p-4 bg-slate-50/70 space-y-3 border-t border-slate-100 animate-fadeIn">
                                {/* Task Details: Type, Technician, Points, Status */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-bold text-xs">
                                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-400 text-[10px] block mb-0.5">نوع المهمة والنقاط:</span>
                                    <span className="text-blue-900 font-black text-sm">{task.taskType} ({task.points} نقطة)</span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                                    <span className="text-slate-400 text-[10px] block mb-0.5">الفني المسند إليه:</span>
                                    <span className="text-emerald-800 font-black text-sm">👤 {task.employeeName}</span>
                                  </div>

                                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex flex-col justify-center">
                                    <span className="text-slate-400 text-[10px] block mb-0.5">حالة المهمة الحالية:</span>
                                    <span className={`inline-flex items-center gap-1 font-black px-2.5 py-0.5 rounded-lg border text-[11px] w-fit ${
                                      task.status === 'completed' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                                      task.status === 'active' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 animate-pulse' :
                                      task.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                                      task.status === 'paused' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                      'bg-slate-100 text-slate-700 border-slate-200'
                                    }`}>
                                      {task.status === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                                      {task.status === 'active' && <Clock className="w-3 h-3" />}
                                      {task.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                      {task.status === 'paused' && <PauseCircle className="w-3 h-3" />}
                                      {task.status === 'postponed' && <Calendar className="w-3 h-3" />}
                                      <span>
                                        {task.status === 'completed' ? '🔵 مكتملة' :
                                         task.status === 'active' ? '🟢 جارية الان' :
                                         task.status === 'rejected' ? '🔴 مرفوضة / اعتذار' :
                                         task.status === 'paused' ? '⏸️ متوقفة مؤقتاً' :
                                         task.status === 'postponed' ? '🟣 مؤجلة' : '⏳ قيد الانتظار'}
                                      </span>
                                    </span>
                                  </div>
                                </div>

                                {/* Postponement time and reason if postponed */}
                                {task.status === 'postponed' && (
                                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-200 text-xs space-y-1.5">
                                    <div className="font-black text-purple-800 flex items-center gap-1.5">
                                      <Calendar className="w-4 h-4 text-purple-600 shrink-0" />
                                      <span>
                                        ⏳ تاريخ وتوقيت التأجيل: {task.postponedAt ? `${new Date(task.postponedAt).toLocaleString('ar-IQ')}` : 'سابقاً'}
                                      </span>
                                    </div>
                                    <p className="font-bold text-purple-950 bg-white/80 p-2 rounded-lg border border-purple-100">
                                      سبب التأجيل: {task.postponeReason || 'لم يحدد الفني سبباً للتأجيل'}
                                    </p>
                                  </div>
                                )}

                                {/* Completion time if completed */}
                                {task.endTime && (
                                  <div className="text-[11px] font-bold text-blue-900 bg-blue-50/80 p-2.5 rounded-xl border border-blue-200 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                    <span>وقت الإنجاز:</span>
                                    <span className="font-mono font-black">{new Date(task.endTime).toLocaleString('ar-IQ')}</span>
                                  </div>
                                )}

                                {/* Payment Collection info if completed */}
                                {task.status === 'completed' && (task.paymentStatus || task.collectedAmount !== undefined) && (
                                  <div className={`p-3 rounded-2xl border text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs ${
                                    task.paymentStatus === 'collected' || (task.collectedAmount && task.collectedAmount > 0)
                                      ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                                      : 'bg-blue-50/70 border-blue-200 text-blue-900'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                        task.paymentStatus === 'collected' || (task.collectedAmount && task.collectedAmount > 0)
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-blue-200/80 text-blue-800'
                                      }`}>
                                        <Banknote className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <span className="font-black block">تحصيل أجور ومبالغ من المشترك:</span>
                                        {task.paymentNotes ? (
                                          <span className="text-[11px] text-slate-600 font-medium block">
                                            السبب / الملاحظات: {task.paymentNotes}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] text-slate-500 font-medium block">
                                            {task.paymentStatus === 'collected' ? 'تم استلام المبلغ نقداً من المشترك' : 'خدمة مجانية ضمن الاشتراك بدون أي أجور'}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <div>
                                      {task.paymentStatus === 'collected' || (task.collectedAmount && task.collectedAmount > 0) ? (
                                        <span className="bg-emerald-600 text-white text-xs px-3 py-1 rounded-xl font-mono font-black shadow-2xs inline-block">
                                          💰 تم التحصيل: {Number(task.collectedAmount || 0).toLocaleString('ar-EG')} د.ع
                                        </span>
                                      ) : (
                                        <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1 rounded-xl font-black inline-block">
                                          🆓 خدمة مجانية (بدون تحصيل)
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Rejection Reason with Tech Attribution if rejected */}
                                {(task.rejectionReason || task.previousRejectionReason) && (
                                  <div className="bg-red-50 p-3 rounded-xl border border-red-200/90 text-xs space-y-1">
                                    <div className="font-black text-red-800 flex items-center gap-1.5">
                                      <ShieldAlert className="w-4 h-4 text-red-600 shrink-0" />
                                      <span>
                                        🚨 سبب اعتذار/رفض الفني ({task.rejectedByTechName || task.employeeName}):
                                      </span>
                                    </div>
                                    <p className="font-extrabold text-red-950 bg-white/80 p-2 rounded-lg border border-red-100">
                                      {task.rejectionReason || task.previousRejectionReason}
                                    </p>
                                  </div>
                                )}

                                {/* Employee / Technician Completion Details */}
                                {(task.operationDetails || task.status === 'completed' || task.delayReason) && (
                                  <div className="bg-emerald-50/90 p-3.5 rounded-2xl border border-emerald-200/90 space-y-2 text-xs shadow-2xs">
                                    <div className="font-black text-emerald-950 flex items-center justify-between">
                                      <div className="flex items-center gap-1.5">
                                        <ClipboardCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <span>📝 معلومات وتفاصيل الإنجاز المكتوبة من الموظف:</span>
                                      </div>
                                      <span className="bg-emerald-200/80 text-emerald-900 text-[10px] px-2 py-0.5 rounded-md font-extrabold">
                                        إنجاز الفني: {task.employeeName}
                                      </span>
                                    </div>

                                    {task.operationDetails ? (
                                      <div className="bg-white p-3 rounded-xl border border-emerald-200 text-slate-800 font-bold whitespace-pre-wrap leading-relaxed shadow-2xs">
                                        {task.operationDetails}
                                      </div>
                                    ) : (task.notes && task.notes.includes('معلومات العملية')) ? (
                                      <div className="bg-white p-3 rounded-xl border border-emerald-200 text-slate-800 font-bold whitespace-pre-wrap leading-relaxed shadow-2xs">
                                        {task.notes}
                                      </div>
                                    ) : task.status === 'completed' ? (
                                      <div className="bg-white/80 p-2.5 rounded-xl border border-emerald-100 text-slate-600 font-semibold text-[11px] italic">
                                        تم تعليم المهمة كمكتملة بواسطة الفني (لم تُدخل ملاحظات عملية إضافية عند الإنجاز).
                                      </div>
                                    ) : null}

                                    {/* Delay Reason if recorded */}
                                    {task.delayReason && (
                                      <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/90 text-amber-950 font-bold text-[11px] flex flex-col gap-0.5 mt-1">
                                        <span className="text-amber-800 font-black flex items-center gap-1">
                                          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                          <span>سبب التأخير المكتوب من الفني:</span>
                                        </span>
                                        <span className="bg-white/80 p-2 rounded-lg border border-amber-100 text-slate-800 font-bold">
                                          {task.delayReason}
                                        </span>
                                      </div>
                                    )}

                                    {/* Consumed Materials for Subscriber */}
                                    {task.consumedMaterials && task.consumedMaterials.length > 0 && (
                                      <div className="bg-blue-50/90 p-3 rounded-xl border border-blue-200/90 text-blue-950 font-bold text-[11px] space-y-1.5 mt-1.5">
                                        <span className="text-blue-900 font-black flex items-center gap-1.5">
                                          <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                          <span>📦 المواد والمستلزمات المصروفة لهذا المشترك:</span>
                                        </span>
                                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                                          {task.consumedMaterials.map((mat, idx) => (
                                            <span
                                              key={idx}
                                              className="bg-white px-2.5 py-1 rounded-lg border border-blue-200 text-slate-800 font-extrabold text-[11px] shadow-2xs flex items-center gap-1"
                                            >
                                              <span className="text-blue-700">{mat.materialName}:</span>
                                              <span className="font-mono text-emerald-700">{mat.quantity} {mat.unit}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Notes */}
                                {task.notes && !task.notes.includes('معلومات العملية') && (
                                  <div className="text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 text-xs font-medium">
                                    <strong className="font-black text-slate-800">📝 الملاحظات العامة: </strong>
                                    {task.notes}
                                  </div>
                                )}

                                {/* Edit option for owner */}
                                {userRole === 'owner' && onEditTaskHistory && (
                                  <div className="text-left pt-1">
                                    <button
                                      type="button"
                                      onClick={() => onEditTaskHistory(task)}
                                      className="text-slate-500 hover:text-slate-900 font-bold text-[11px] hover:underline cursor-pointer"
                                    >
                                      تعديل سريعة للسجل
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Show More / Load More Button (10 subscribers pagination) */}
      {hasMore && (
        <div className="text-center pt-4 pb-8">
          <button
            type="button"
            onClick={handleShowMore}
            className="bg-blue-700 hover:bg-blue-800 text-white font-black px-8 py-3.5 rounded-2xl text-xs md:text-sm shadow-md transition-all hover:scale-102 active:scale-98 cursor-pointer inline-flex items-center gap-2"
          >
            <span>إظهار المزيد (10 مشتركين إضافيين)</span>
            <ChevronDown className="w-4 h-4 animate-bounce" />
          </button>
          <div className="text-[11px] text-slate-400 font-bold mt-2">
            يُعرض حالياً {visibleCount} من إجمالي {subscriberRecords.length} مشترك
          </div>
        </div>
      )}

      {/* Add New Task Modal for Subscriber */}
      {newTaskSubscriber && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden dir-rtl">
            {/* Modal Header */}
            <div className="bg-blue-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-300" />
                <div>
                  <h3 className="font-black text-sm md:text-base">
                    إضافة وتوجيه مهمة جديدة للمشترك
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    المشترك: {newTaskSubscriber.name} ({newTaskSubscriber.phone || 'بدون رقم هاتف'})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNewTaskSubscriber(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-black transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleCreateNewTask} className="p-5 space-y-4 text-xs">
              {newTaskError && (
                <div className="p-3 bg-red-50 text-red-900 border border-red-200 rounded-2xl font-bold">
                  ⚠️ {newTaskError}
                </div>
              )}

              {newTaskSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-2xl font-black flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{newTaskSuccess}</span>
                </div>
              )}

              {/* Prefilled Subscriber Info */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-0.5">اسم المشترك:</label>
                  <input
                    type="text"
                    value={newTaskSubscriber.name}
                    onChange={(e) => setNewTaskSubscriber({ ...newTaskSubscriber, name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-black text-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-0.5">رقم هاتف المشترك:</label>
                  <input
                    type="text"
                    value={newTaskSubscriber.phone}
                    onChange={(e) => setNewTaskSubscriber({ ...newTaskSubscriber, phone: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-black text-slate-800 text-xs dir-ltr"
                  />
                </div>
              </div>

              {/* Task Type Select */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-800">
                  حدد نوع المهمة الجديدة:
                </label>
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-black text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                >
                  {taskTypes.length > 0 ? (
                    taskTypes.map((type) => (
                      <option key={type.id} value={type.name}>
                        {type.name} ({type.points} نقطة)
                      </option>
                    ))
                  ) : (
                    defaultTaskTypesList.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Assignee Technician Select */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-800">
                  الفني المكلف بالمهمة:
                </label>
                <select
                  value={newTaskTechId}
                  onChange={(e) => setNewTaskTechId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-black text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                >
                  <option value="">-- اختر الفني --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Optional Notes */}
              <div className="space-y-1">
                <label className="block text-xs font-black text-slate-800">
                  ملاحظات أو تعليمات إضافية للفني (اختياري):
                </label>
                <textarea
                  value={newTaskNotes}
                  onChange={(e) => setNewTaskNotes(e.target.value)}
                  placeholder="مثال: يرجى التواصل مع المشترك قبل الحضور بساعة..."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-3 font-bold text-slate-800 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSubmittingTask}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-3 rounded-2xl transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmittingTask ? 'جاري إسناد المهمة...' : 'إسناد وإرسال المهمة للفني'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewTaskSubscriber(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-3 rounded-2xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Subscriber Modal */}
      {editingSubscriber && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-black text-sm md:text-base">تعديل بيانات المشترك</h3>
                  <p className="text-[11px] text-slate-300">تحديث الاسم أو رقم الهاتف لكافة السجلات</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSubscriber(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-black transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditSubscriber} className="p-6 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl font-bold">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  اسم المشترك *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="أدخل اسم المشترك الجديد..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  رقم هاتف المشترك
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="أدخل رقم الهاتف..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none transition-all font-mono font-bold dir-ltr text-right"
                />
              </div>

              <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-medium leading-relaxed">
                💡 ملحوظة: سيتم تحديث الاسم ورقم الهاتف الجديدين في جميع سجلات المهام الخاصة بهذا المشترك ({editingSubscriber.tasks.length} سجل).
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="flex-1 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white text-xs font-black py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmittingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSubscriber(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Subscriber Confirmation Modal */}
      {deletingSubscriber && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" dir="rtl">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-red-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-100" />
                </div>
                <div>
                  <h3 className="font-black text-sm md:text-base">تأكيد حذف المشترك</h3>
                  <p className="text-[11px] text-red-200">إزالة المشترك وجميع سجلاته نهائياً</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingSubscriber(null)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-black transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 p-4 rounded-2xl border border-red-200/80 space-y-2">
                <p className="text-xs font-bold text-red-950 leading-relaxed">
                  هل أنت تأكيد من حذف المشترك <strong className="text-red-700 font-black">"{deletingSubscriber.name}"</strong>
                  {deletingSubscriber.phone ? ` برقم (${deletingSubscriber.phone})` : ''}؟
                </p>
                <p className="text-[11px] text-red-700 leading-relaxed">
                  ⚠️ سيتم حذف إجمالي <strong className="font-black">{deletingSubscriber.tasks.length} مهمة/عملية</strong> مسجلة بهذا المشترك نهائياً من قاعدة البيانات، ولن يمكن استعادتها بعد ذلك.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingDelete}
                  onClick={handleConfirmDeleteSubscriber}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white text-xs font-black py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isSubmittingDelete ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingSubscriber(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subscribers Database Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 z-50 animate-fadeIn" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center border border-white/20">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-200" />
                </div>
                <div>
                  <h3 className="font-black text-base md:text-lg">تصدير قاعدة بيانات المشتركين</h3>
                  <p className="text-xs text-emerald-200">تصفية السجلات بالأيام، نوع المهمة، وحالة التكليف ثم التصدير</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl text-xs font-black transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Filters */}
            <div className="p-5 md:p-6 overflow-y-auto space-y-5">
              {/* Filter Section 1: Period & Days Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>1. تحديد الأيام / النطاق الزمني:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'كافة الأوقات' },
                    { id: '1', label: 'سجل اليوم الحالي (1)' },
                    { id: '2', label: 'سجل آخر يومين (48س)' },
                    { id: '3', label: 'سجل آخر 3 أيام' },
                    { id: '7', label: 'سجل آخر 7 أيام' },
                    { id: '14', label: 'سجل آخر 14 يوم' },
                    { id: '30', label: 'سجل آخر 30 يوم (شهر)' },
                    { id: 'custom_days', label: 'عدد أيام مخصص' },
                    { id: 'custom_range', label: 'نطاق تواريخ مخصص' }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setExportDaysOption(opt.id as any)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all border cursor-pointer text-center ${
                        exportDaysOption === opt.id
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Custom Days Input */}
                {exportDaysOption === 'custom_days' && (
                  <div className="pt-2 flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <span className="text-xs font-black text-slate-700 shrink-0">حدد عدد الأيام السابقة:</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={exportCustomDaysCount}
                      onChange={(e) => setExportCustomDaysCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-28 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-slate-500">يوم من تاريخ اليوم</span>
                  </div>
                )}

                {/* Custom Date Range Inputs */}
                {exportDaysOption === 'custom_range' && (
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">من تاريخ:</label>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-600 block mb-1">إلى تاريخ:</label>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Filter Section 2: Task Status Selection */}
              <div className="space-y-2">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-emerald-600" />
                  <span>2. تحديد حالة المهمة / التكليف:</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: 'all', label: 'الكل (جميع الحالات)' },
                    { id: 'pending', label: '⏳ محتمل فقط (انتظار)' },
                    { id: 'rejected', label: '🔴 مرفوض فقط (اعتذار)' },
                    { id: 'completed', label: '🔵 مكتمل فقط' },
                    { id: 'active', label: '🟢 جاري الآن فقط' }
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setExportStatusFilter(st.id as any)}
                      className={`px-3 py-2.5 rounded-xl text-xs font-extrabold transition-all border cursor-pointer text-center ${
                        exportStatusFilter === st.id
                          ? 'bg-teal-700 text-white border-teal-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter Section 3: Task Type Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-emerald-600" />
                    <span>3. نوع المهمة:</span>
                  </label>
                  <select
                    value={exportTaskTypeFilter}
                    onChange={(e) => setExportTaskTypeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">كافة أنواع المهام (الكل)</option>
                    <option value="صيانة">🔧 صيانة فقط</option>
                    <option value="تنصيب">📦 تنصيب / تركيب فقط</option>
                    <option value="دعم">🎧 دعم فني فقط</option>
                    {availableTaskTypeNames.filter(t => !['صيانة', 'تنصيب', 'دعم'].includes(t)).map(tName => (
                      <option key={tName} value={tName}>{tName}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-emerald-600" />
                    <span>4. الفني المسؤول (اختياري):</span>
                  </label>
                  <select
                    value={exportEmployeeFilter}
                    onChange={(e) => setExportEmployeeFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="all">كافة الفنيين</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Matched Data Preview Stats Box */}
              {exportPreviewData && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs font-black text-emerald-950">
                    <span>📊 معاينة نتائج التصفية للتصدير:</span>
                    <span className="bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-full text-[11px]">
                      {exportPreviewData.stats.daysLabel}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-lg font-black text-emerald-700">
                        {exportPreviewData.stats.filteredSubscribers.length}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600">مشترك مطابق</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-lg font-black text-blue-700">
                        {exportPreviewData.stats.totalFilteredTasks}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600">سجل فتح / تكليف</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-lg font-black text-amber-700">
                        {exportPreviewData.stats.statusCounts.pending}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600">محتمل (انتظار)</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-emerald-100 text-center">
                      <div className="text-lg font-black text-red-700">
                        {exportPreviewData.stats.statusCounts.rejected}
                      </div>
                      <div className="text-[10px] font-bold text-slate-600">مرفوض (اعتذار)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Export Buttons */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row gap-3 shrink-0">
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs md:text-sm py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-5 h-5" />
                <span>تصدير إلى Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black text-xs md:text-sm py-3 px-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-5 h-5" />
                <span>تصدير / طباعة PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs py-3 px-5 rounded-xl transition-colors cursor-pointer"
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
