import React, { useState, useEffect, useMemo } from 'react';
import { Task, Employee, TaskType, ManualPointsRecord, DbTaskType } from '../types';
import { formatArabicTimeOnly, formatArabicDateOnly, formatMsToHMS, isToday, isThisWeek, formatDuration, getTaskTimeLimitMinutes } from '../utils';
import { Clock, User, MapPin, Phone, Calendar, Info, X, ChevronRight, ChevronDown, Award, CheckCircle2, Star, Target, Users, Pencil, Trash2, ShieldAlert, Play, Pause, History, Lock, XCircle, RefreshCw, Send, AlertCircle, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CopyPhoneButton from './CopyPhoneButton';

interface ViewerTasksViewProps {
  employees: Employee[];
  activeTasks: Task[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  taskTypes?: DbTaskType[];
  selectedEmployeeId: string;
  onSelectEmployee: (id: string) => void;
  activeTab: 'tasks' | 'achievements';
  userRole?: 'owner' | 'manager' | 'technician';
  onDeleteManualPoint?: (id: string) => void;
  onEditManualPoint?: (id: string, points: number, reason: string) => void;
  onAcceptTask?: (id: string) => void;
  onRejectTask?: (id: string, reason: string) => void;
  onPauseTask?: (id: string, reason: string) => void;
  onResumeTask?: (id: string) => void;
  onCompleteTask?: (
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
  ) => void;
  onRequestReopenTask?: (id: string, reason: string, taskType?: string) => void;
  onApproveReopenTask?: (id: string) => void;
  onRejectReopenTask?: (id: string, reason?: string) => void;
}

export default function ViewerTasksView({
  employees,
  activeTasks,
  tasks,
  manualPoints,
  taskTypes,
  selectedEmployeeId,
  onSelectEmployee,
  activeTab,
  userRole = 'technician',
  onDeleteManualPoint,
  onEditManualPoint,
  onAcceptTask,
  onRejectTask,
  onPauseTask,
  onResumeTask,
  onCompleteTask,
  onRequestReopenTask,
  onApproveReopenTask,
  onRejectReopenTask,
}: ViewerTasksViewProps) {
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [showDeleteManualConfirm, setShowDeleteManualConfirm] = useState<string | null>(null);
  const [editingManualPoint, setEditingManualPoint] = useState<any | null>(null);
  const [editManualPointsValue, setEditManualPointsValue] = useState(0);
  const [editManualReason, setEditManualReason] = useState('');

  // Rejection modal state for technician
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  // Complete confirmation modal state for technician
  const [confirmCompleteTask, setConfirmCompleteTask] = useState<Task | null>(null);
  const [completionOperationDetails, setCompletionOperationDetails] = useState('');
  const [completionDelayReason, setCompletionDelayReason] = useState('');
  const [completionDelayError, setCompletionDelayError] = useState('');

  // Pause modal state for technician
  const [showPauseDialog, setShowPauseDialog] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState('');
  const [pauseError, setPauseError] = useState('');

  // Reopen request modal state for technician
  const [reopenModalTaskId, setReopenModalTaskId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenTaskType, setReopenTaskType] = useState('صيانة');
  const [reopenError, setReopenError] = useState('');

  // Search query for tasks in "My Tasks" page
  const [searchQuery, setSearchQuery] = useState('');

  const handleConfirmReopenRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setReopenError('يرجى كتابة سبب طلب إعادة الإرسال.');
      return;
    }
    if (!reopenTaskType.trim()) {
      setReopenError('يرجى اختيار نوع المهمة الجديدة.');
      return;
    }
    if (reopenModalTaskId && onRequestReopenTask) {
      onRequestReopenTask(reopenModalTaskId, reopenReason.trim(), reopenTaskType.trim());
    }
    setReopenModalTaskId(null);
    setReopenReason('');
    setReopenError('');
  };

  // Pagination states for task lists (10 tasks per page)
  const [visibleActiveCount, setVisibleActiveCount] = useState<number>(10);
  const [visibleCompletedCount, setVisibleCompletedCount] = useState<number>(10);

  // Reset pagination when selected employee changes
  useEffect(() => {
    setVisibleActiveCount(10);
    setVisibleCompletedCount(10);
  }, [selectedEmployeeId]);

  // Live elapsed time tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Retrieve selected employee object
  const currentEmployee = useMemo(() => {
    return employees.find(emp => emp.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  // Filter tasks belonging specifically to the selected employee
  const employeeActiveTasks = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return activeTasks.filter(task => task.employeeId === selectedEmployeeId);
  }, [activeTasks, selectedEmployeeId]);

  const employeeArchivedTasks = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return tasks.filter(task => task.employeeId === selectedEmployeeId && (task.status === 'completed' || task.status === 'rejected'));
  }, [tasks, selectedEmployeeId]);

  const employeeCompletedTasks = useMemo(() => {
    if (!selectedEmployeeId) return [];
    return tasks.filter(task => task.employeeId === selectedEmployeeId && task.status === 'completed');
  }, [tasks, selectedEmployeeId]);

  const employeeManualPoints = useMemo(() => {
    if (!selectedEmployeeId || !manualPoints) return [];
    return manualPoints.filter(mp => mp.employeeId === selectedEmployeeId);
  }, [manualPoints, selectedEmployeeId]);

  // Combined Archived (Completed + Rejected) tasks & Manual entries
  const combinedCompletedAndManual = useMemo(() => {
    const items: (Task & { isManual?: boolean; type?: 'gift' | 'penalty'; adminName?: string; timestamp?: string })[] = [
      ...employeeArchivedTasks.map(t => ({ ...t, isManual: false })),
      ...(employeeManualPoints || []).map(mp => ({
        id: mp.id,
        employeeId: mp.employeeId,
        employeeName: mp.employeeName,
        taskType: mp.type === 'gift' ? '🎁 إضافة نقاط هدية' : '⚠️ خصم نقاط عقوبة',
        startTime: mp.timestamp,
        endTime: mp.timestamp,
        status: 'completed' as const,
        points: mp.type === 'gift' ? mp.points : -mp.points,
        notes: mp.reason,
        isManual: true,
        type: mp.type,
        adminName: mp.adminName,
        timestamp: mp.timestamp
      }))
    ];

    return items.sort((a, b) => new Date(b.rejectedAt || b.endTime || b.startTime).getTime() - new Date(a.rejectedAt || a.startTime).getTime());
  }, [employeeArchivedTasks, employeeManualPoints]);

  // Filtered active tasks based on search query (name or phone)
  const filteredActiveTasks = useMemo(() => {
    if (!searchQuery.trim()) return employeeActiveTasks;
    const q = searchQuery.toLowerCase().trim();
    return employeeActiveTasks.filter(task =>
      (task.subscriberName && task.subscriberName.toLowerCase().includes(q)) ||
      (task.subscriberPhone && task.subscriberPhone.includes(q)) ||
      (task.taskType && task.taskType.toLowerCase().includes(q)) ||
      (task.notes && task.notes.toLowerCase().includes(q))
    );
  }, [employeeActiveTasks, searchQuery]);

  // Filtered completed & manual entries based on search query
  const filteredCompletedAndManual = useMemo(() => {
    if (!searchQuery.trim()) return combinedCompletedAndManual;
    const q = searchQuery.toLowerCase().trim();
    return combinedCompletedAndManual.filter(item =>
      (item.subscriberName && item.subscriberName.toLowerCase().includes(q)) ||
      (item.subscriberPhone && item.subscriberPhone.includes(q)) ||
      (item.taskType && item.taskType.toLowerCase().includes(q)) ||
      (item.notes && item.notes.toLowerCase().includes(q))
    );
  }, [combinedCompletedAndManual, searchQuery]);

  // Calculations for achievements
  const totalCompletedCount = employeeCompletedTasks.length;

  const { totalGainedPoints, totalDeductedPoints, netPoints } = useMemo(() => {
    let gained = employeeCompletedTasks.reduce((sum, task) => sum + Math.max(0, task.points), 0);
    let deducted = employeeCompletedTasks.reduce((sum, task) => sum + Math.abs(Math.min(0, task.points)), 0);

    employeeManualPoints.forEach(mp => {
      if (mp.type === 'gift') {
        gained += mp.points;
      } else {
        deducted += mp.points;
      }
    });

    return {
      totalGainedPoints: gained,
      totalDeductedPoints: deducted,
      netPoints: gained - deducted
    };
  }, [employeeCompletedTasks, employeeManualPoints]);

  // Today achievements
  const todayItems = useMemo(() => {
    return combinedCompletedAndManual.filter(item => {
      const dateStr = item.startTime;
      return isToday(dateStr);
    });
  }, [combinedCompletedAndManual]);

  const todayPoints = useMemo(() => {
    return todayItems.reduce((sum, item) => sum + item.points, 0);
  }, [todayItems]);

  // Weekly achievements
  const weekItems = useMemo(() => {
    return combinedCompletedAndManual.filter(item => {
      const dateStr = item.startTime;
      return isThisWeek(dateStr);
    });
  }, [combinedCompletedAndManual]);

  const weekPoints = useMemo(() => {
    return weekItems.reduce((sum, item) => sum + item.points, 0);
  }, [weekItems]);

  return (
    <div className="max-w-md mx-auto space-y-5" dir="rtl">
      
      {/* Technician Selection Section - Compact style */}
      {userRole !== 'technician' && (
        <div className="bg-white border border-slate-100 rounded-2xl p-3 shadow-xs space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-blue-700" />
            اختر اسم الفني الميداني
          </label>
          
          <div className="relative">
            <select
              value={selectedEmployeeId}
              onChange={(e) => onSelectEmployee(e.target.value)}
              className="w-full bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2.5 text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 cursor-pointer transition-all appearance-none"
            >
              <option value="" disabled>-- اختر اسمك للبدء --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[9px]">
              ▼
            </div>
          </div>
        </div>
      )}

      {/* Conditionally render content if employee is selected */}
      {!selectedEmployeeId || !currentEmployee ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <User className="w-5 h-5" />
          </div>
          <h4 className="font-bold text-slate-700 text-sm">الرجاء اختيار الفني الميداني</h4>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
            الرجاء اختيار اسمك من القائمة المنسدلة أعلاه لعرض مهامك الميدانية الجارية وتتبع إنجازاتك ونقاطك.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Welcome Card for Selected Technician */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-5 text-white shadow-xs flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-[10px] bg-white/20 text-white font-black px-2 py-0.5 rounded-md">
                الملف الشخصي المختار
              </span>
              <h3 className="font-black text-base">{currentEmployee.name}</h3>
              <p className="text-[10px] text-blue-100/90 font-medium">بوابة المتابعة الميدانية المباشرة</p>
            </div>
            <div className="bg-white/10 px-3.5 py-2 rounded-2xl border border-white/10 text-center shrink-0 flex flex-col items-center justify-center">
              <span className="text-[9px] block text-blue-200 font-bold">الهاتف</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-xs font-black font-mono tracking-wide">{currentEmployee.phone || '-'}</span>
                {currentEmployee.phone && (
                  <CopyPhoneButton phone={currentEmployee.phone} showText={false} btnClassName="bg-white/20 text-white hover:bg-white/30 border-white/20 p-1" />
                )}
              </div>
            </div>
          </div>

          {activeTab === 'tasks' ? (
            <div className="space-y-5">
              {/* Search Card for Tasks (By Subscriber Name or Phone Number) */}
              <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs space-y-2">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                  <Search className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>البحث عن مهمة (بواسطة الاسم أو رقم الهاتف)</span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setVisibleActiveCount(10);
                      setVisibleCompletedCount(10);
                    }}
                    placeholder="ابحث عن مهمة بواسطة اسم المشترك أو رقم الهاتف..."
                    className="w-full pr-3 pl-8 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400 font-bold"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute left-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Section: Active Tasks - Only for Owner and Manager */}
              {userRole !== 'technician' && (
                <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-black text-slate-500 tracking-wider flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    المهام الجارية حالياً
                  </h2>
                  <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-100">
                    {filteredActiveTasks.length} جارية
                  </span>
                </div>

                {filteredActiveTasks.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
                    <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Clock className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-600 text-xs">
                      {searchQuery ? 'لا توجد مهام جارية مطابقة للبحث' : 'لا توجد مهام جارية حالياً'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                      {searchQuery ? 'جرب البحث بكلمة أو رقم هاتف آخر' : 'لا توجد مهام جارية للمشرف حالياً. عندما يتم إسناد مهمة جديدة لك، ستظهر هنا فوراً.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredActiveTasks.slice(0, visibleActiveCount).map(task => {
                      const isPaused = task.status === 'paused';
                      const isPending = task.status === 'pending';
                      
                      // Calculate live durations
                      const start = new Date(task.startTime).getTime();
                      const now = Date.now();
                      const isCompleted = task.status === 'completed';
                      const endTimeMs = (isCompleted && task.endTime) 
                        ? new Date(task.endTime).getTime() 
                        : (isPaused ? new Date(task.pausedAt || now).getTime() : now);
                      const totalPaused = task.totalPausedMs || 0;
                      const currentPause = (isPaused && task.pausedAt) 
                        ? (now - new Date(task.pausedAt).getTime()) 
                        : 0;
                      const activeWorkTimeMs = Math.max(0, endTimeMs - start - totalPaused);
                      const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));

                      return (
                        <motion.div
                          key={task.id}
                          whileTap={{ scale: 0.98 }}
                          className={`bg-white border rounded-2xl p-4 space-y-3 transition-all relative overflow-hidden ${
                            isPending ? 'border-amber-300 shadow-sm' : 'border-slate-150 hover:border-blue-200'
                          }`}
                        >
                          {/* Status accent line */}
                          <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${
                            isPending ? 'bg-amber-400 animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}></div>

                          <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setSelectedTask(task)}>
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">
                                  {task.taskType}
                                </span>
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                  isPending ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                                  isPaused ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                  'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                }`}>
                                  {isPending ? '🟡 مهمة جديدة - بانتظار موافقتك' : isPaused ? 'متوقفة مؤقتاً' : 'جارية'}
                                </span>
                              </div>

                              {task.subscriberName && (
                                <p className="text-[11px] text-slate-600 flex items-center gap-1 font-bold">
                                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>المشترك: {task.subscriberName}</span>
                                </p>
                              )}

                              {task.subscriberPhone && (
                                isPending ? (
                                  <div className="text-[11px] text-amber-900 bg-amber-100/80 p-1.5 px-2.5 rounded-lg border border-amber-200/90 max-w-xs flex items-center gap-1.5 font-bold shadow-2xs">
                                    <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                    <span>🔒 يظهر رقم هاتف المشترك فور قبولك المهمة</span>
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-slate-600 flex items-center justify-between font-bold bg-slate-50 p-1.5 px-2 rounded-lg border border-slate-100" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1">
                                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="font-mono text-blue-700">{task.subscriberPhone}</span>
                                    </div>
                                    <CopyPhoneButton phone={task.subscriberPhone} showText={false} />
                                  </div>
                                )
                              )}

                              {task.notes && (
                                <p className="text-[11px] text-slate-500 flex items-center gap-1 font-medium truncate max-w-[240px]">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span>الموقع: {task.notes}</span>
                                </p>
                              )}

                              {task.previousRejectionReason && (
                                <div className="p-2 bg-amber-50 border border-amber-200/80 rounded-lg text-[10.5px] text-amber-900 font-bold space-y-0.5">
                                  <span className="block text-amber-700 text-[9.5px]">⚠️ سبب الرفض السابق:</span>
                                  <p>{task.previousRejectionReason}</p>
                                </div>
                              )}

                              {isPaused && task.pauseReason && (
                                <div className="p-2 bg-amber-50 border border-amber-200/60 rounded-lg text-[10.5px] text-amber-800 font-semibold">
                                  <span>⏸️ سبب التوقف: {task.pauseReason}</span>
                                </div>
                              )}

                              {task.editLogs && task.editLogs.length > 0 && (
                                <div className="p-1.5 bg-blue-50/90 border border-blue-200/70 rounded-lg text-[10px] text-blue-900 font-black flex items-center gap-1">
                                  <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span>مهمة معاد فتحها ({task.editLogs.length} سجلات)</span>
                                </div>
                              )}

                              <p className="text-[10px] text-slate-400 font-medium">
                                تم إرسالها: {formatArabicTimeOnly(task.sentAt || task.startTime)} - {formatArabicDateOnly(task.sentAt || task.startTime)}
                              </p>
                            </div>

                            {!isPending && (
                              <div className="text-left flex flex-col items-end gap-1 shrink-0 pl-1">
                                <p className="text-[8.5px] text-slate-500 font-bold flex items-center gap-1">
                                  {task.status === 'completed' ? 'الوقت المستغرق' : isPaused ? 'موقوف عند' : 'عداد الوقت الجاري ⏱️'}
                                </p>
                                <p className={`text-xs font-black px-2 py-0.5 rounded-md ${
                                  task.status === 'completed' 
                                    ? 'text-blue-800 bg-blue-50 border border-blue-100 font-sans font-extrabold' 
                                    : isPaused 
                                    ? 'text-amber-800 bg-amber-50 border border-amber-100 font-mono' 
                                    : 'text-emerald-800 bg-emerald-50 border border-emerald-100 font-mono animate-pulse'
                                }`}>
                                  {task.status === 'completed' 
                                    ? (durationMinutes === 0 ? 'أقل من دقيقة' : `${durationMinutes} دقيقة`)
                                    : formatMsToHMS(activeWorkTimeMs)}
                                </p>
                                <ChevronRight className="w-4 h-4 text-slate-300 transform rotate-180 mt-0.5" />
                              </div>
                            )}
                          </div>

                          {/* Accept / Reject Buttons for Pending Tasks */}
                          {isPending && (
                            <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onAcceptTask) onAcceptTask(task.id);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>قبول المهمة</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectingTaskId(task.id);
                                  setRejectionReason('');
                                  setRejectionError('');
                                }}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs font-black py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                              >
                                <ShieldAlert className="w-4 h-4" />
                                <span>رفض المهمة</span>
                              </button>
                            </div>
                          )}

                          {/* Action controls for Active/Paused Tasks */}
                          {(task.status === 'active' || task.status === 'paused') && (
                            <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmCompleteTask(task);
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>إنهاء المهمة</span>
                              </button>
                              {task.status === 'active' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPauseDialog(task.id);
                                    setPauseReason('');
                                    setPauseError('');
                                  }}
                                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                                >
                                  <Pause className="w-3.5 h-3.5" />
                                  <span>إيقاف مؤقت</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (onResumeTask) onResumeTask(task.id);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                                >
                                  <Play className="w-3.5 h-3.5" />
                                  <span>استئناف العمل</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRejectingTaskId(task.id);
                                  setRejectionReason('');
                                  setRejectionError('');
                                }}
                                className="col-span-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/80 text-xs font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-2xs"
                              >
                                <XCircle className="w-3.5 h-3.5 text-red-600" />
                                <span>إلغاء المهمة واعتذار (يتطلب كتابة السبب)</span>
                              </button>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                    {filteredActiveTasks.length > visibleActiveCount && (
                      <div className="pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => setVisibleActiveCount(prev => prev + 10)}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200/80 shadow-xs"
                        >
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                          <span>إظهار المزيد من المهام الجارية ({filteredActiveTasks.length - visibleActiveCount} متبقية)</span>
                        </button>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                          عرض {visibleActiveCount} من أصل {filteredActiveTasks.length} مهمة جارية
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              )}

              {/* Section: Completed Tasks & Admin Operations */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-xs font-black text-slate-500 tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    {userRole === 'technician' ? 'المهام المنجزة وسجل العمليات' : 'سجل المهام والعمليات الإدارية'}
                  </h2>
                  <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-slate-200">
                    {filteredCompletedAndManual.length} عملية مكتملة
                  </span>
                </div>

                {filteredCompletedAndManual.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-3xl border border-slate-100 p-6 shadow-xs">
                    <div className="w-12 h-12 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-3">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-600 text-xs">
                      {searchQuery ? 'لا توجد نتائج مطابقة للبحث' : 'لا يوجد مهام مكتملة بعد'}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                      {searchQuery ? 'جرب البحث بكلمة أو رقم هاتف آخر' : 'السجلات تظهر أن هذا الفني لم يكمل أي مهام ميدانية أو عمليات إدارية حتى الآن.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCompletedAndManual.slice(0, visibleCompletedCount).map(item => {
                      const isManual = !!item.isManual;
                      if (isManual) {
                        const isGift = item.type === 'gift';
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedTask(item)}
                            className={`border rounded-2xl p-4 flex flex-col gap-3 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden ${
                              isGift ? 'bg-emerald-50/10 border-emerald-100' : 'bg-rose-50/10 border-rose-100'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                  isGift
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border-rose-200'
                                }`}>
                                  {isGift ? '🎁 هدية' : '⚠️ عقوبة'}
                                </span>
                                <span className="text-xs font-black text-slate-800">
                                  {isGift ? 'إضافة نقاط هدية' : 'خصم نقاط عقوبة'}
                                </span>
                              </div>
                              <span className={`text-xs font-black px-2.5 py-1 rounded-full border ${
                                isGift
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                  : 'bg-rose-100 text-rose-900 border-rose-200'
                              }`}>
                                {isGift ? `+${item.points}` : item.points} ن
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded border border-slate-100">
                              <div className="font-bold text-slate-700">السبب:</div>
                              <p className="mt-0.5 leading-relaxed font-semibold text-slate-800">{item.notes}</p>
                              <div className="text-[10px] text-slate-400 mt-1.5 font-medium">
                                بواسطة المشرف: {item.adminName || 'المدير'}
                              </div>
                            </div>

                            <div className="text-[10px] text-slate-400 font-medium flex items-center justify-between">
                              <span>التاريخ: {formatArabicDateOnly(item.startTime)} - {formatArabicTimeOnly(item.startTime)}</span>
                              <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold">إجراء إداري</span>
                            </div>
                          </div>
                        );
                      }

                      if (item.status === 'rejected') {
                        return (
                          <div
                            key={item.id}
                            onClick={() => setSelectedTask(item)}
                            className="bg-red-50/20 border border-red-200/80 rounded-2xl p-4 flex flex-col gap-2 hover:border-red-300 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800">{item.taskType}</span>
                                <span className="bg-red-100 text-red-800 border border-red-200 text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                                  🔴 مهمة مرفوضة (مؤرشفة)
                                </span>
                              </div>
                            </div>

                            {item.subscriberName && (
                              <p className="text-[11px] text-slate-600 flex items-center gap-1 font-bold">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>المشترك: {item.subscriberName}</span>
                              </p>
                            )}

                            {item.rejectionReason && (
                              <div className="text-[11px] text-red-800 bg-red-100/60 p-2.5 rounded-xl font-bold border border-red-200/50">
                                <span className="block text-[10px] text-red-600 font-extrabold mb-0.5">سبب اعتذار/رفض الفني:</span>
                                <p className="text-slate-800">{item.rejectionReason}</p>
                              </div>
                            )}

                            <p className="text-[10px] text-slate-400 font-medium">
                              تاريخ الرفض: {formatArabicDateOnly(item.rejectedAt || item.startTime)} - {formatArabicTimeOnly(item.rejectedAt || item.startTime)}
                            </p>

                            {/* Re-send request button for rejected task */}
                            {userRole === 'technician' && (
                              <div className="pt-2 border-t border-red-100" onClick={e => e.stopPropagation()}>
                                {item.reopenRequested && item.reopenRequestStatus === 'pending' ? (
                                  <div className="bg-purple-50 border border-purple-200 p-2 rounded-xl text-[11px] text-purple-900 font-bold flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-purple-600 animate-spin-slow shrink-0" />
                                    <span>⏳ جاري مراجعة طلب إعادة إرسال المهمة المرفوضة</span>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReopenModalTaskId(item.id);
                                      setReopenTaskType(item.taskType || 'صيانة');
                                      setReopenReason('');
                                      setReopenError('');
                                    }}
                                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                                    <span>🔄 طلب إعادة إرسال هذه المهمة المرفوضة لي</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedTask(item)}
                          className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between gap-3 hover:border-slate-200 hover:shadow-xs transition-all cursor-pointer relative overflow-hidden"
                        >
                          <div className="flex-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-slate-800">{item.taskType}</span>
                              <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded">
                                مهمة مكتملة
                              </span>
                            </div>

                            {item.subscriberName && (
                              <p className="text-[11px] text-slate-600 flex items-center gap-1 font-bold">
                                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>المشترك: {item.subscriberName}</span>
                              </p>
                            )}

                            <p className="text-[10px] text-slate-400 font-medium">
                              الانتهاء: {formatArabicTimeOnly(item.endTime || '')} - {formatArabicDateOnly(item.endTime || '')}
                            </p>

                            {item.reopenRequested && item.reopenRequestStatus === 'pending' && (
                              <div className="mt-2 bg-purple-50 border border-purple-200 p-2.5 rounded-xl text-xs space-y-2" onClick={e => e.stopPropagation()}>
                                <p className="font-black text-purple-900 flex items-center gap-1.5">
                                  <span>🔄 طلب الفني إعادة إرسال المهمة له</span>
                                </p>
                                {item.reopenRequestReason && (
                                  <p className="text-[11px] text-purple-800 font-medium bg-purple-100/60 p-1.5 rounded-lg">
                                    السبب: {item.reopenRequestReason}
                                  </p>
                                )}
                                {(userRole === 'owner' || userRole === 'manager') && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => onApproveReopenTask && onApproveReopenTask(item.id)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                                    >
                                      الموافقة وإعادة الإرسال
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRejectReopenTask && onRejectReopenTask(item.id)}
                                      className="bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                    >
                                      رفض الطلب
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {userRole === 'technician' && !item.reopenRequested && (
                              <div className="mt-2 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReopenModalTaskId(item.id);
                                    setReopenTaskType(item.taskType || 'صيانة');
                                    setReopenReason('');
                                    setReopenError('');
                                  }}
                                  className="w-full bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold py-1.5 px-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <RefreshCw className="w-3.5 h-3.5 text-blue-700" />
                                  <span>🔄 طلب إعادة إرسال هذه المهمة لي</span>
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="text-left flex flex-col items-end gap-1.5 shrink-0 pl-1">
                            <span className="bg-blue-50 text-blue-800 text-[10px] font-black px-2 py-0.5 rounded-md border border-blue-100">
                              {item.points}
                            </span>
                            <p className="text-[10px] text-slate-500 font-mono font-medium">
                              {formatDuration(item.startTime, item.endTime)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {combinedCompletedAndManual.length > visibleCompletedCount && (
                      <div className="pt-2 text-center">
                        <button
                          type="button"
                          onClick={() => setVisibleCompletedCount(prev => prev + 10)}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs py-3 px-4 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200/80 shadow-xs"
                        >
                          <ChevronDown className="w-4 h-4 text-slate-500" />
                          <span>إظهار المزيد ({combinedCompletedAndManual.length - visibleCompletedCount} متبقية)</span>
                        </button>
                        <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                          عرض {visibleCompletedCount} من أصل {combinedCompletedAndManual.length} مهمة وعملية
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Tab: Achievements */
            <div className="space-y-5">
              {/* Achievements Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between space-y-3">
                  <div className="w-9 h-9 bg-blue-50 text-blue-700 rounded-xl flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-400 font-bold block">المهام الميدانية</span>
                    <span className="text-lg font-black text-slate-800 font-mono">{totalCompletedCount}</span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">مهمة مكتملة</span>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between space-y-3">
                  <div className="w-9 h-9 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[9.5px] text-slate-400 font-bold block">صافي النقاط</span>
                    <span className="text-lg font-black text-amber-600 font-mono">{netPoints}</span>
                    <span className="text-[9px] text-slate-400 block mt-0.5">نقطة رصيد إجمالي</span>
                  </div>
                </div>
              </div>

              {/* Extra Gained vs Deducted detailed bar */}
              <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs flex items-center justify-between gap-4">
                <div className="flex-1 text-center">
                  <span className="text-[9px] text-slate-400 font-bold block mb-0.5">إجمالي النقاط المكتسبة</span>
                  <span className="text-sm font-black text-emerald-600 font-mono">+{totalGainedPoints} ن</span>
                </div>
                <div className="w-px h-8 bg-slate-100"></div>
                <div className="flex-1 text-center">
                  <span className="text-[9px] text-slate-400 font-bold block mb-0.5">إجمالي النقاط المحسومة</span>
                  <span className="text-sm font-black text-rose-600 font-mono">-{totalDeductedPoints} ن</span>
                </div>
              </div>

              {/* Record of Daily & Weekly Achievements */}
              <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-black text-slate-800 text-xs flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-blue-700" />
                    سجل الإنجازات اليومية والأسبوعية
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">احصائيات ومكافآت الأداء الميداني للفني المختار</p>
                </div>

                {/* Daily Card */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                      إنجازات اليوم
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      todayPoints >= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        : 'bg-rose-50 text-rose-700 border-rose-100'
                    }`}>
                      {todayPoints >= 0 ? `+${todayPoints}` : todayPoints} نقطة اليوم
                    </span>
                  </div>

                  {todayItems.length === 0 ? (
                    <p className="text-[10.5px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                      لا توجد إنجازات مسجلة اليوم بعد. أنجز المهام لكسب النقاط والتميز!
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {todayItems.map(item => {
                        const isManual = !!item.isManual;
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 text-xs">
                            <div>
                              <span className="font-bold text-slate-800">{item.taskType}</span>
                              {isManual ? (
                                <span className="text-slate-400 text-[10px] block font-medium mt-0.5">سبب: {item.notes} (إداري)</span>
                              ) : (
                                item.subscriberName && (
                                  <span className="text-slate-400 text-[10px] block font-medium mt-0.5">المشترك: {item.subscriberName}</span>
                                )
                              )}
                            </div>
                            <span className={`font-mono font-black ${item.points >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.points >= 0 ? `+${item.points}` : item.points} ن
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Weekly Card */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-700 flex items-center gap-1">
                      <Award className="w-3.5 h-3.5 text-blue-600" />
                      إنجازات هذا الأسبوع
                    </span>
                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                      weekPoints >= 0
                        ? 'bg-blue-50 text-blue-700 border-blue-100'
                        : 'bg-rose-50 text-rose-700 border-rose-100'
                    }`}>
                      {weekPoints >= 0 ? `+${weekPoints}` : weekPoints} نقطة هذا الأسبوع
                    </span>
                  </div>

                  {weekItems.length === 0 ? (
                    <p className="text-[10.5px] text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-100/50">
                      لا توجد إنجازات مسجلة هذا الأسبوع بعد.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {weekItems.map(item => {
                        const isManual = !!item.isManual;
                        return (
                          <div key={item.id} className="flex items-center justify-between bg-slate-50/50 p-2.5 rounded-xl border border-slate-100 text-xs">
                            <div>
                              <span className="font-bold text-slate-800">{item.taskType}</span>
                              <span className="text-slate-400 text-[9.5px] block font-medium mt-0.5">
                                {isManual ? `سبب: ${item.notes} (إداري)` : formatArabicDateOnly(item.endTime || '')}
                              </span>
                            </div>
                            <span className={`font-mono font-black ${item.points >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.points >= 0 ? `+${item.points}` : item.points} ن
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Task Details Interactive Dialog Modal */}
      <AnimatePresence>
        {selectedTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-3xl shadow-xl overflow-hidden p-6 text-right relative"
              dir="rtl"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                className="absolute left-4 top-4 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-lg font-bold p-1 bg-slate-50 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4.5 h-4.5" />
              </button>

              <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50 text-blue-700`}>
                  <Clock className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">تفاصيل المهمة</h3>
                  <p className="text-[10px] text-slate-500">تفاصيل وسجلات المهمة المحددة</p>
                </div>
              </div>

              <div className="space-y-3.5 max-h-[60vh] overflow-y-auto pr-1">
                {selectedTask.isManual ? (
                  <>
                    {/* Administrative Action Header */}
                    <div className={`p-4 rounded-xl border ${
                      selectedTask.type === 'gift' ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'
                    }`}>
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">نوع الإجراء الإداري</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                          selectedTask.type === 'gift'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-rose-100 text-rose-800 border-rose-200'
                        }`}>
                          {selectedTask.type === 'gift' ? '🎁 هدية إدارية' : '⚠️ عقوبة إدارية'}
                        </span>
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/85">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">السبب / التفاصيل</span>
                      <span className="text-xs font-bold text-slate-800 leading-relaxed block">
                        {selectedTask.notes}
                      </span>
                    </div>

                    {/* Manager Name */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/85">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">اسم المدير المسؤول</span>
                      <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {selectedTask.adminName || 'المدير العام'}
                      </span>
                    </div>

                    {/* Date & Time */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/85">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">التاريخ والوقت</span>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatArabicDateOnly(selectedTask.startTime)} - {formatArabicTimeOnly(selectedTask.startTime)}
                      </span>
                    </div>

                    {/* Dynamic Point Badge */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                      selectedTask.type === 'gift' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50/50 border-rose-100'
                    }`}>
                      <div>
                        <span className="text-[10px] text-slate-500 font-bold block">الحالة</span>
                        <span className="text-xs font-bold text-slate-800 mt-0.5 block">
                          {selectedTask.type === 'gift' ? 'إضافة رصيد إيجابي' : 'خصم من رصيد الفني'}
                        </span>
                      </div>
                      <div className="text-left border-r border-slate-200/50 pr-4">
                        <span className="text-[10px] text-slate-400 font-bold block">قيمة التعديل</span>
                        <span className={`text-sm font-black font-mono mt-0.5 block ${
                          selectedTask.type === 'gift' ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {selectedTask.type === 'gift' ? `+${selectedTask.points}` : selectedTask.points} ن
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Task Name / Type */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">نوع المهمة الميدانية</span>
                      <span className="text-xs font-black text-slate-800">{selectedTask.taskType}</span>
                    </div>

                    {/* Status */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">الحالة</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          selectedTask.status === 'completed'
                            ? 'bg-blue-600'
                            : selectedTask.status === 'paused'
                            ? 'bg-amber-500'
                            : 'bg-emerald-500 animate-pulse'
                        }`}></span>
                        <span className="text-xs font-bold text-slate-800">
                          {selectedTask.status === 'completed'
                            ? 'مكتملة ومنجزة'
                            : selectedTask.status === 'paused'
                            ? 'متوقفة مؤقتاً'
                            : 'جارية وقيد التنفيذ'}
                        </span>
                      </div>
                    </div>

                    {/* Subscriber Name */}
                    {selectedTask.subscriberName && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                        <span className="text-[10px] text-slate-400 font-bold block mb-0.5">اسم المشترك</span>
                        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {selectedTask.subscriberName}
                        </span>
                      </div>
                    )}

                    {/* Subscriber Phone */}
                    {selectedTask.subscriberPhone && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block mb-0.5">هاتف الاتصال</span>
                          <span className="text-xs font-bold text-blue-700 font-mono flex items-center gap-1.5" dir="ltr">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {selectedTask.subscriberPhone}
                          </span>
                        </div>
                        <CopyPhoneButton phone={selectedTask.subscriberPhone} showText={false} />
                      </div>
                    )}

                    {/* Pause Reason if paused */}
                    {selectedTask.status === 'paused' && selectedTask.pauseReason && (
                      <div className="bg-amber-50 p-3 rounded-xl border border-amber-200/60">
                        <span className="text-[10px] text-amber-700 font-bold block mb-0.5">سبب التوقف المؤقت</span>
                        <span className="text-xs font-bold text-amber-900 leading-relaxed block">
                          ⏸️ {selectedTask.pauseReason}
                        </span>
                      </div>
                    )}

                    {/* Location / Notes */}
                    {selectedTask.notes && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                        <span className="text-[10px] text-slate-400 font-bold block mb-0.5">موقع وتفاصيل المهمة</span>
                        <span className="text-xs font-bold text-slate-700 leading-relaxed block">
                          {selectedTask.notes}
                        </span>
                      </div>
                    )}

                    {/* Current Rejection Reason if rejected */}
                    {selectedTask.rejectionReason && (
                      <div className="bg-red-50 p-3 rounded-xl border border-red-200 space-y-1">
                        <span className="text-[10px] text-red-700 font-extrabold block">
                          🚨 سبب الاعتذار/الرفض (بواسطة الفني: {selectedTask.rejectedByTechName || selectedTask.employeeName}):
                        </span>
                        <span className="text-xs font-bold text-red-950 block bg-white/80 p-2 rounded-lg border border-red-100">
                          {selectedTask.rejectionReason}
                        </span>
                      </div>
                    )}

                    {/* Previous Rejection Reason if task was re-sent */}
                    {selectedTask.previousRejectionReason && (
                      <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-200/80 space-y-1">
                        <span className="text-[10px] text-amber-800 font-extrabold block">
                          ⚠️ سبب الرفض السابق (بواسطة الفني):
                        </span>
                        <span className="text-xs font-bold text-amber-950 leading-relaxed block bg-white/70 p-2 rounded-lg border border-amber-100">
                          {selectedTask.previousRejectionReason}
                        </span>
                      </div>
                    )}

                    {/* Task History / Edit Logs for re-opened or edited tasks */}
                    {selectedTask.editLogs && selectedTask.editLogs.length > 0 && (
                      <div className="bg-blue-50/50 p-3.5 rounded-2xl border border-blue-200/70 space-y-2 text-right dir-rtl">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            <History className="w-4 h-4 text-blue-600" />
                            <span>سجل المهمة والتعديلات السابقة ({selectedTask.editLogs.length})</span>
                          </span>
                          <span className="text-[10px] font-black text-blue-800 bg-blue-100 px-2.5 py-0.5 rounded-full border border-blue-200">
                            مهمة معاد فتحها
                          </span>
                        </div>
                        <div className="space-y-2 max-h-48 overflow-y-auto text-[11px] dir-rtl pr-0.5">
                          {selectedTask.editLogs.map((log) => (
                            <div key={log.id} className="p-2.5 rounded-xl bg-white border border-blue-100 space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between text-slate-400 font-bold text-[10px]">
                                <span className="text-blue-800 font-extrabold">{log.editedBy || 'الإدارة'}</span>
                                <span dir="ltr" className="font-mono text-slate-500">{new Date(log.editedAt).toLocaleString('ar-IQ')}</span>
                              </div>
                              <div className="font-bold text-slate-800 leading-relaxed">{log.changes}</div>
                              {log.reason && (
                                <div className="text-slate-500 font-medium text-[10px]">السبب: {log.reason}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Support Details & Points Split Box */}
                    {(() => {
                      const isSupportTask = selectedTask.taskType === 'دعم' || !!selectedTask.parentTaskId;
                      const parent = isSupportTask ? tasks.find(t => t.id === selectedTask.parentTaskId) : null;
                      const primaryName = isSupportTask ? (parent ? parent.employeeName : '-') : selectedTask.employeeName;
                      const sups = isSupportTask
                        ? (parent ? tasks.filter(t => t.parentTaskId === parent.id && t.status === 'completed') : [])
                        : tasks.filter(t => t.parentTaskId === selectedTask.id && t.status === 'completed');

                      if (sups.length === 0) return null;

                      const totalPointsVal = selectedTask.originalPoints || (parent ? parent.originalPoints : null) || (selectedTask.points * (1 + sups.length));

                      return (
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-right">
                          <span className="text-[10px] text-blue-700 font-bold block mb-1">🤝 تفاصيل الدعم وتوزيع النقاط</span>
                          <div className="space-y-1 text-xs text-slate-700">
                            <div><span className="font-semibold text-slate-900">الفني الأساسي:</span> {primaryName}</div>
                            <div>
                              <span className="font-semibold text-slate-900">الداعمون:</span>
                              <div className="mr-2 space-y-0.5">
                                {sups.map(s => <div key={s.id} className="text-slate-600">• {s.employeeName}</div>)}
                              </div>
                            </div>
                            <div className="mt-2 pt-2 border-t border-blue-100 font-bold text-slate-900">
                              إجمالي نقاط المهمة: <span className="font-mono text-blue-700">{totalPointsVal}</span> نقطة
                            </div>
                            <div className="mt-2 text-[11px] bg-white p-2.5 rounded-lg border border-blue-100 space-y-1">
                              <div className="font-semibold text-blue-800">توزيع النقاط بالتساوي:</div>
                              <div className="flex justify-between items-center bg-blue-50/20 p-1 px-2 rounded">
                                <span className="text-slate-800">- {primaryName} (الأساسي):</span>
                                <span className="font-mono font-bold text-blue-700">{selectedTask.points} ن</span>
                              </div>
                              {sups.map(s => (
                                <div key={s.id} className="flex justify-between items-center bg-blue-50/20 p-1 px-2 rounded">
                                  <span className="text-slate-800">- {s.employeeName}:</span>
                                  <span className="font-mono font-bold text-blue-700">{s.points} ن</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Sent & Start Time Details */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">توقيت إرسال المهمة</span>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatArabicDateOnly(selectedTask.sentAt || selectedTask.startTime)} - {formatArabicTimeOnly(selectedTask.sentAt || selectedTask.startTime)}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                      <span className="text-[10px] text-slate-400 font-bold block mb-0.5">توقيت البدء</span>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatArabicDateOnly(selectedTask.startTime)} - {formatArabicTimeOnly(selectedTask.startTime)}
                      </span>
                    </div>

                    {/* End Time Details if completed */}
                    {selectedTask.status === 'completed' && selectedTask.endTime && (
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100/80">
                        <span className="text-[10px] text-slate-400 font-bold block mb-0.5">توقيت الانتهاء</span>
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {formatArabicDateOnly(selectedTask.endTime)} - {formatArabicTimeOnly(selectedTask.endTime)}
                        </span>
                      </div>
                    )}

                    {/* Live elapsed timer / total duration inside details */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                      selectedTask.status === 'completed'
                        ? 'bg-blue-50/60 border-blue-100'
                        : selectedTask.status === 'paused'
                        ? 'bg-amber-50/60 border-amber-100'
                        : 'bg-emerald-50/60 border-emerald-100'
                    }`}>
                      <div>
                        <span className={`text-[10px] font-bold block ${
                          selectedTask.status === 'completed' ? 'text-blue-700' : selectedTask.status === 'paused' ? 'text-amber-700' : 'text-emerald-700'
                        }`}>
                          {selectedTask.status === 'completed' 
                            ? '⏱️ الوقت المستغرق' 
                            : selectedTask.status === 'paused' 
                            ? '⏸️ الوقت موقوف عند' 
                            : '⏱️ عداد الوقت الميداني الجاري'}
                        </span>
                        <span className={`text-sm font-black font-mono mt-0.5 block ${
                          selectedTask.status === 'completed' ? 'text-blue-900' : selectedTask.status === 'paused' ? 'text-amber-900' : 'text-emerald-800'
                        }`}>
                          {(() => {
                            const isPaused = selectedTask.status === 'paused';
                            const isCompleted = selectedTask.status === 'completed';
                            const start = new Date(selectedTask.startTime).getTime();
                            const end = isCompleted && selectedTask.endTime ? new Date(selectedTask.endTime).getTime() : Date.now();
                            const totalPaused = selectedTask.totalPausedMs || 0;
                            const currentPause = (isPaused && selectedTask.pausedAt) ? (Date.now() - new Date(selectedTask.pausedAt).getTime()) : 0;
                            const activeWorkTimeMs = Math.max(0, (isCompleted ? end - start : Date.now() - start) - totalPaused - currentPause);
                            
                            if (isCompleted) {
                              const durationMins = Math.max(0, Math.round(activeWorkTimeMs / 60000));
                              return durationMins === 0 ? 'أقل من دقيقة' : `${durationMins} دقيقة`;
                            }
                            return formatMsToHMS(activeWorkTimeMs);
                          })()}
                        </span>
                      </div>
                      {selectedTask.status !== 'rejected' && (
                        <div className="text-left border-r border-emerald-200/50 pr-4">
                          <span className="text-[10px] text-slate-400 font-bold block">النقاط المستحقة</span>
                          <span className="text-xs font-black text-blue-700 font-mono mt-0.5 block">
                            {selectedTask.points}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 mt-5">
                {/* Technician Action Controls for Active / Paused tasks */}
                {(selectedTask.status === 'active' || selectedTask.status === 'paused') && (
                  <div className="grid grid-cols-2 gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmCompleteTask(selectedTask);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إنهاء المهمة</span>
                    </button>
                    {selectedTask.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPauseDialog(selectedTask.id);
                          setPauseReason('');
                          setPauseError('');
                        }}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-black py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <Pause className="w-4 h-4" />
                        <span>إيقاف مؤقت</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (onResumeTask) onResumeTask(selectedTask.id);
                          setSelectedTask(null);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-black py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                      >
                        <Play className="w-4 h-4" />
                        <span>استئناف العمل</span>
                      </button>
                    )}
                  </div>
                )}

                {(userRole === 'owner' || userRole === 'manager') && selectedTask.isManual && (
                  <div className="flex gap-2 w-full">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingManualPoint(selectedTask);
                        setEditManualPointsValue(Math.abs(selectedTask.points));
                        setEditManualReason(selectedTask.notes || '');
                      }}
                      className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-extrabold py-3 rounded-xl border border-blue-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteManualConfirm(selectedTask.id)}
                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-extrabold py-3 rounded-xl border border-red-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => setSelectedTask(null)}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-extrabold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>إغلاق النافذة</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Manual Point Prompt dialog */}
      <AnimatePresence>
        {showDeleteManualConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base" dir="rtl">هل أنت متأكد من حذف هذه العملية؟</h3>
              
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium text-right flex items-start gap-2" dir="rtl">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="leading-relaxed">
                  هل أنت متأكد من حذف هذه العملية؟ سيتم التراجع عن تأثيرها على نقاط الفني.
                </p>
              </div>

              <div className="mt-5 flex gap-3" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteManualPoint) {
                      onDeleteManualPoint(showDeleteManualConfirm);
                    }
                    setShowDeleteManualConfirm(null);
                    setSelectedTask(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  حذف
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteManualConfirm(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Manual Point Modal */}
      <AnimatePresence>
        {editingManualPoint && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-800 p-5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-blue-400" />
                  <h3 className="font-extrabold text-sm" dir="rtl">
                    تعديل {editingManualPoint.type === 'gift' ? 'الهدية' : 'العقوبة'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingManualPoint(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-right" dir="rtl">
                {/* Points */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">عدد النقاط *</label>
                  <input
                    type="number"
                    min="1"
                    value={editManualPointsValue}
                    onChange={(e) => setEditManualPointsValue(Number(e.target.value))}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-center font-bold"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">السبب *</label>
                  <textarea
                    value={editManualReason}
                    onChange={(e) => setEditManualReason(e.target.value)}
                    placeholder="اكتب سبب التعديل..."
                    rows={3}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium resize-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    if (onEditManualPoint && editingManualPoint) {
                      onEditManualPoint(editingManualPoint.id, editManualPointsValue, editManualReason);
                    }
                    setEditingManualPoint(null);
                    setSelectedTask(null);
                  }}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingManualPoint(null)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold py-3 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Reject Task Dialog for Technician with Mandatory Reason */}
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
                      if (selectedTask?.id === rejectingTaskId) {
                        setSelectedTask(null);
                      }
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

      {/* Pause Task Dialog for Technician with Mandatory Reason */}
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
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
                <Pause className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base text-center">إيقاف المهمة مؤقتاً</h3>
              <p className="text-xs text-slate-500 mt-1 text-center leading-relaxed">
                يرجى إدخال سبب التوقف المؤقت (مثل: استراحة، شراء قطع، انتظار المشترك) لتوثيقه بالنظام.
              </p>

              <div className="mt-4 space-y-2">
                <label className="block text-xs font-bold text-slate-700">سبب الإيقاف المؤقت (إجباري) *</label>
                <textarea
                  value={pauseReason}
                  onChange={(e) => {
                    setPauseReason(e.target.value);
                    if (e.target.value.trim()) setPauseError('');
                  }}
                  placeholder="اكتب سبب التوقف هنا..."
                  rows={3}
                  className={`w-full text-xs p-3 rounded-xl border outline-none transition-all resize-none ${
                    pauseError ? 'border-red-500 ring-2 ring-red-100' : 'border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100'
                  }`}
                />
                {pauseError && (
                  <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                    <span>⚠️</span> {pauseError}
                  </p>
                )}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!pauseReason.trim()) {
                      setPauseError('سبب الإيقاف المؤقت إجباري ومطلوب لتوثيق توقف المهمة.');
                      return;
                    }
                    if (onPauseTask && showPauseDialog) {
                      onPauseTask(showPauseDialog, pauseReason.trim());
                      setShowPauseDialog(null);
                      setPauseReason('');
                      setPauseError('');
                      if (selectedTask?.id === showPauseDialog) {
                        setSelectedTask(null);
                      }
                    }
                  }}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  تأكيد الإيقاف المؤقت
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

      {/* Complete Task Confirmation Dialog */}
      <AnimatePresence>
        {confirmCompleteTask && (() => {
          const nowTime = Date.now();
          const start = new Date(confirmCompleteTask.startTime).getTime();
          const currentPauseMs = (confirmCompleteTask.status === 'paused' && confirmCompleteTask.pausedAt)
            ? (nowTime - new Date(confirmCompleteTask.pausedAt).getTime())
            : 0;
          const totalPauseTimeMs = (confirmCompleteTask.totalPausedMs || 0) + currentPauseMs;
          const activeWorkTimeMs = Math.max(0, (nowTime - start) - totalPauseTimeMs);
          const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
          const limitMinutes = getTaskTimeLimitMinutes(confirmCompleteTask.taskType, taskTypes);
          const isOverdue = durationMinutes > limitMinutes;

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-right space-y-4"
                dir="rtl"
              >
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                
                <div className="text-center space-y-1">
                  <h3 className="font-extrabold text-slate-800 text-base">إنهاء المهمة وتسجيل النقاط</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    هل أنت متأكد من إنجاز مهمة <span className="font-bold text-slate-800">({confirmCompleteTask.taskType})</span>؟
                  </p>
                </div>

                {isOverdue && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-2">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-800">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>تنبيه: لقد تجاوزت الوقت المسموح للمهمة ({limitMinutes} دقيقة)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900/90 font-medium">
                      المستغرق: {durationMinutes} دقيقة. يجب كتابة سبب التأخير ليتم إرساله للمشرف والمالك، وعند قبوله لن يتم خصم النقاط.
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1">
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

                {isOverdue && (
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
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
                      placeholder="اكتب سبب التأخير بالتفصيل ليتم رفعه للإدارة..."
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-slate-800 font-medium"
                    ></textarea>
                  </div>
                )}

                {completionDelayError && (
                  <p className="text-[11px] font-bold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">
                    ⚠️ {completionDelayError}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (!completionOperationDetails.trim()) {
                        setCompletionDelayError('يرجى كتابة معلومات العملية (تفاصيل التنفيذ والإنجاز) أولاً.');
                        return;
                      }
                      if (isOverdue && !completionDelayReason.trim()) {
                        setCompletionDelayError('يرجى كتابة سبب التأخير لتأكيد إكمال المهمة وإرساله للمسؤولين.');
                        return;
                      }
                      if (onCompleteTask && confirmCompleteTask) {
                        onCompleteTask(
                          confirmCompleteTask.id, 
                          new Date().toISOString(), 
                          completionDelayReason.trim() || undefined,
                          completionOperationDetails.trim()
                        );
                        setConfirmCompleteTask(null);
                        setCompletionOperationDetails('');
                        setCompletionDelayReason('');
                        setCompletionDelayError('');
                        if (selectedTask?.id === confirmCompleteTask.id) {
                          setSelectedTask(null);
                        }
                      }
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>تأكيد الإنجاز</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmCompleteTask(null);
                      setCompletionOperationDetails('');
                      setCompletionDelayReason('');
                      setCompletionDelayError('');
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Re-send Task Modal Sheet for Technician */}
      <AnimatePresence>
        {reopenModalTaskId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="bg-blue-700 p-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-blue-200" />
                  <h3 className="font-extrabold text-sm">طلب إعادة إرسال المهمة من المشرف والمالك</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setReopenModalTaskId(null)}
                  className="p-1 hover:bg-blue-600 rounded-lg text-blue-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmReopenRequest} className="p-6 space-y-4">
                {reopenError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{reopenError}</span>
                  </div>
                )}

                {/* Choose New Task Type */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    تحديد نوع المهمة الجديدة *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(taskTypes && taskTypes.length > 0
                      ? taskTypes.map(t => t.name)
                      : ['صيانة', 'سحب', 'كلك', 'دلفري', 'منافذ', 'تنصيب', 'دعم']
                    ).map(typeName => (
                      <button
                        key={typeName}
                        type="button"
                        onClick={() => setReopenTaskType(typeName)}
                        className={`py-2 px-2 rounded-xl text-xs font-black transition-all border cursor-pointer text-center ${
                          reopenTaskType === typeName
                            ? 'bg-blue-700 text-white border-blue-700 shadow-xs ring-2 ring-blue-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {typeName}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    سبب طلب إعادة فتح المهمة وملاحظات المهمة الجديدة *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="اكتب سبب إعادة الفتح مع الملاحظات الخاصة بالمهمة الجديدة..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800"
                  ></textarea>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال الطلب للمشرف والمالك</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReopenModalTaskId(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
