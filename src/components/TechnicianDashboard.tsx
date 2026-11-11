import React, { useState, useEffect } from 'react';
import { 
  User, CheckCircle2, Clock, MapPin, Phone, AlertCircle, Inbox, 
  Award, Play, Pause, X, ChevronDown, Check, History, ChevronRight, RefreshCw, Search, Send,
  Lock, XCircle, Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, Task, ManualPointsRecord, DbTaskType, TaskType } from '../types';
import { isToday, formatArabicTimeOnly, formatArabicDateOnly, formatMsToHMS, getTaskTimeLimitMinutes } from '../utils';
import CopyPhoneButton from './CopyPhoneButton';
import TechnicianPointsCard from './TechnicianPointsCard';

interface TechnicianDashboardProps {
  employee: Employee | undefined;
  tasks: Task[];
  manualPoints: ManualPointsRecord[];
  allEmployees: Employee[];
  taskTypes?: DbTaskType[];
  onAcceptTask?: (taskId: string) => void;
  onRejectTask?: (taskId: string, reason: string) => void;
  onCompleteTask?: (taskId: string, endTime: string, delayReason?: string, operationDetails?: string) => void;
  onPauseTask?: (taskId: string, reason: string) => void;
  onResumeTask?: (taskId: string) => void;
  onRequestReopenTask?: (taskId: string, reason: string, newTaskType?: string) => void;
  onPostponeTask?: (taskId: string, reason: string) => void;
}

export default function TechnicianDashboard({
  employee,
  tasks,
  manualPoints,
  allEmployees = [],
  taskTypes,
  onAcceptTask,
  onRejectTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onRequestReopenTask,
  onPostponeTask
}: TechnicianDashboardProps) {
  // Task Completion Modal state
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completionOperationDetails, setCompletionOperationDetails] = useState<string>('');
  const [completionDelayReason, setCompletionDelayReason] = useState<string>('');
  const [completionDelayError, setCompletionDelayError] = useState<string>('');

  // Rejection Modal state
  const [rejectingTaskId, setRejectingTaskId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [rejectionError, setRejectionError] = useState<string>('');

  // Pause Modal state
  const [pausingTaskId, setPausingTaskId] = useState<string | null>(null);
  const [pauseReason, setPauseReason] = useState<string>('');

  // Postpone Modal state
  const [postponingTaskId, setPostponingTaskId] = useState<string | null>(null);
  const [postponeReason, setPostponeReason] = useState<string>('');
  const [postponeError, setPostponeError] = useState<string>('');

  // Re-send Request Modal state
  const [reopenModalTaskId, setReopenModalTaskId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopenTaskType, setReopenTaskType] = useState<string>('صيانة');
  const [reopenError, setReopenError] = useState<string>('');

  // Archive Search & Pagination
  const [archiveSearchQuery, setArchiveSearchQuery] = useState<string>('');
  const [visibleArchiveCount, setVisibleArchiveCount] = useState<number>(5);

  // Live timer tick for running tasks
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!employee) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4" dir="rtl">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-lg">لم يتم العثور على حساب الموظف</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          حسابك غير مرتبط بملف موظف نشط في النظام حالياً. يرجى مراجعة المسؤول لربط حسابك.
        </p>
      </div>
    );
  }

  // 1. Pending Tasks (بانتظار القبول)
  const myPendingTasks = tasks.filter(t => t.status === 'pending' && t.employeeId === employee.id);

  // 2. Today's Points calculation (نقاط اليوم)
  const myCompletedTasks = tasks.filter(t => t.status === 'completed' && t.employeeId === employee.id);
  const myCompletedTasksToday = myCompletedTasks.filter(t => isToday(t.endTime || t.startTime || ''));
  const tasksPointsTodaySum = myCompletedTasksToday.reduce((sum, t) => sum + (t.points || 0), 0);

  const myManualPoints = manualPoints.filter(mp => mp.employeeId === employee.id);
  const giftsTodaySum = myManualPoints
    .filter(mp => mp.type === 'gift' && isToday(mp.timestamp))
    .reduce((sum, mp) => sum + mp.points, 0);

  const penaltiesTodaySum = myManualPoints
    .filter(mp => mp.type === 'penalty' && isToday(mp.timestamp))
    .reduce((sum, mp) => sum + mp.points, 0);

  const netPointsToday = Math.max(0, tasksPointsTodaySum + giftsTodaySum - penaltiesTodaySum);

  const myActiveTasks = tasks.filter(t => (t.status === 'active' || t.status === 'paused') && t.employeeId === employee.id);
  const hasActiveOrPausedTasks = myActiveTasks.length > 0;

  // 4. All Completed & Rejected Tasks Archive for reopen request
  const allCompletedTasks = tasks.filter(t => t.employeeId === employee.id && (t.status === 'completed' || t.status === 'rejected'));
  const filteredCompletedTasks = allCompletedTasks.filter(task => {
    if (!archiveSearchQuery.trim()) return true;
    const query = archiveSearchQuery.toLowerCase().trim();
    return (
      (task.subscriberName && task.subscriberName.toLowerCase().includes(query)) ||
      (task.subscriberPhone && task.subscriberPhone.includes(query)) ||
      (task.taskType && task.taskType.toLowerCase().includes(query)) ||
      (task.notes && task.notes.toLowerCase().includes(query))
    );
  });

  const selectedReopenTask = reopenModalTaskId ? tasks.find(t => t.id === reopenModalTaskId) : null;

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

  const handleInitiateCompleteTask = (task: Task) => {
    setCompletingTask(task);
    setCompletionOperationDetails(task.operationDetails || '');
    setCompletionDelayReason(task.delayReason || '');
    setCompletionDelayError('');
  };

  const handleConfirmCompletionDelay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    if (!completionOperationDetails.trim()) {
      setCompletionDelayError('يرجى كتابة معلومات العملية (تفاصيل التنفيذ والإنجاز) أولاً. هذا الحقل إجباري.');
      return;
    }

    const start = new Date(completingTask.startTime).getTime();
    const now = Date.now();
    const totalPaused = completingTask.totalPausedMs || 0;
    const currentPause = (completingTask.status === 'paused' && completingTask.pausedAt) ? (now - new Date(completingTask.pausedAt).getTime()) : 0;
    const activeWorkTimeMs = Math.max(0, now - start - totalPaused - currentPause);
    const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
    const limitMinutes = getTaskTimeLimitMinutes(completingTask.taskType, taskTypes);
    const isOverdue = durationMinutes > limitMinutes;

    if (isOverdue && !completionDelayReason.trim()) {
      setCompletionDelayError('لقد تجاوزت الوقت المحدد للمهمة. يرجى كتابة سبب التأخير أيضاً لتأكيد إكمال المهمة.');
      return;
    }

    if (onCompleteTask) {
      onCompleteTask(
        completingTask.id, 
        new Date().toISOString(), 
        completionDelayReason.trim() || undefined,
        completionOperationDetails.trim()
      );
    }
    setCompletingTask(null);
    setCompletionOperationDetails('');
    setCompletionDelayReason('');
    setCompletionDelayError('');
  };

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectionReason.trim()) {
      setRejectionError('يرجى كتابة سبب الاعتذار/الرفض أولاً.');
      return;
    }
    if (rejectingTaskId && onRejectTask) {
      onRejectTask(rejectingTaskId, rejectionReason.trim());
    }
    setRejectingTaskId(null);
    setRejectionReason('');
    setRejectionError('');
  };

  const handleConfirmPause = (e: React.FormEvent) => {
    e.preventDefault();
    if (pausingTaskId && onPauseTask) {
      onPauseTask(pausingTaskId, pauseReason.trim() || 'إيقاف مؤقت من الفني');
    }
    setPausingTaskId(null);
    setPauseReason('');
  };

  const handleConfirmPostpone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postponeReason.trim()) {
      setPostponeError('يرجى تحديد أو كتابة سبب تأجيل المهمة.');
      return;
    }
    if (postponingTaskId && onPostponeTask) {
      onPostponeTask(postponingTaskId, postponeReason.trim());
    }
    setPostponingTaskId(null);
    setPostponeReason('');
    setPostponeError('');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* ======================================================== */}
      {/* 1. SECTION 1: MY TASKS (مهامي: Pending, Active, Points, History) */}
      {/* ======================================================== */}

      {/* A. Pending Tasks Card */}
      {myPendingTasks.length > 0 && (
        <div className="bg-white rounded-3xl border-2 border-amber-200/80 p-5 md:p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold shrink-0">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>في انتظار المهام (بانتظار القبول)</span>
                  <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                    {myPendingTasks.length} جديد
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  المهام المرفوعة لك من قبل الإدارة وبانتظار موافقتك لبدئها
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {myPendingTasks.map(task => (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-amber-50/40 border border-amber-300/80 rounded-2xl p-4 shadow-xs space-y-3 relative overflow-hidden"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 bg-amber-100 text-amber-900 px-2.5 py-0.5 rounded-lg border border-amber-200">
                        {task.taskType}
                      </span>
                      <span className="text-[10px] font-black bg-amber-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                        🟡 مهمة جديدة
                      </span>
                    </div>

                    {task.subscriberName && (
                      <p className="text-xs text-slate-700 font-bold flex items-center gap-1.5 pt-1">
                        <User className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>المشترك: <strong className="text-slate-900">{task.subscriberName}</strong></span>
                      </p>
                    )}

                    {task.subscriberPhone && (
                      <div className="text-xs text-amber-900 bg-amber-100/80 p-2 px-3 rounded-xl border border-amber-200/90 max-w-sm flex items-center gap-2 font-bold shadow-2xs">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>🔒 يظهر رقم هاتف المشترك فور قبولك المهمة</span>
                      </div>
                    )}

                    {task.notes && (
                      <p className="text-xs text-slate-600 flex items-center gap-1.5 font-medium pt-0.5">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>الموقع / التفاصيل: {task.notes}</span>
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 text-xs text-amber-900 bg-amber-50/90 border border-amber-200/80 p-2 rounded-xl font-bold mt-1.5 shadow-2xs">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>وقت إرسال المهمة:</span>
                      <span className="font-mono text-amber-950 font-black">{formatArabicTimeOnly(task.sentAt || task.startTime)}</span>
                      <span className="text-[10.5px] text-amber-700/80 font-medium">({formatArabicDateOnly(task.sentAt || task.startTime)})</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 grid grid-cols-2 gap-3 border-t border-amber-200/60">
                  <button
                    type="button"
                    onClick={() => onAcceptTask && onAcceptTask(task.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>قبول المهمة وبدئها</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRejectingTaskId(task.id);
                      setRejectionReason('');
                      setRejectionError('');
                    }}
                    className="bg-white hover:bg-red-50 text-red-600 border border-red-200 text-xs font-black py-3 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <X className="w-4 h-4" />
                    <span>الاعتذار / رفض</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* B. Active Tasks Card */}
      {hasActiveOrPausedTasks && (
        <div className="bg-white rounded-3xl border-2 border-emerald-200 p-5 md:p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold shrink-0">
                <Play className="w-5 h-5 fill-emerald-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <span>المهام الجارية حالياً</span>
                  <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                    {myActiveTasks.length} جارية
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">المهام القائمة والجاري تنفيذها في الميدان</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {myActiveTasks.map(task => {
              const isPaused = task.status === 'paused';
              const isActive = task.status === 'active';
              const start = new Date(task.startTime).getTime();
              const now = Date.now();
              const totalPaused = task.totalPausedMs || 0;
              const currentPause = (isPaused && task.pausedAt) ? (now - new Date(task.pausedAt).getTime()) : 0;
              const activeWorkTimeMs = Math.max(0, now - start - totalPaused - currentPause);

              return (
                <div
                  key={task.id}
                  className={`bg-white border rounded-2xl p-4 space-y-3 transition-all relative overflow-hidden ${
                    isActive ? 'border-emerald-300 ring-2 ring-emerald-100 shadow-xs' : 'border-amber-200'
                  }`}
                >
                  <div className={`absolute right-0 top-0 bottom-0 w-1.5 ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></div>

                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-800">{task.taskType}</span>
                        <span className={`text-[9.5px] font-black px-2.5 py-0.5 rounded-full ${
                          isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse' : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {isActive ? '🟢 جارية الان' : '⏸️ متوقفة مؤقتاً'}
                        </span>
                      </div>

                      {task.subscriberName && (
                        <p className="text-xs text-slate-600 font-bold flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>المشترك: {task.subscriberName}</span>
                        </p>
                      )}

                      {task.subscriberPhone && (
                        <div className="text-xs text-slate-600 flex items-center justify-between font-bold bg-slate-50 p-1.5 px-2.5 rounded-lg border border-slate-100 max-w-xs">
                          <div className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-blue-700">{task.subscriberPhone}</span>
                          </div>
                          <CopyPhoneButton phone={task.subscriberPhone} showText={false} />
                        </div>
                      )}

                      {task.notes && (
                        <p className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>الموقع: {task.notes}</span>
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium bg-slate-50/80 p-2 rounded-xl border border-slate-150">
                        <span className="flex items-center gap-1">
                          <Send className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>وقت الإرسال:</span>
                          <strong className="text-slate-800 font-mono font-bold">{formatArabicTimeOnly(task.sentAt || task.assignedDate || task.startTime)}</strong>
                          <span className="text-[9.5px] text-slate-400">({formatArabicDateOnly(task.sentAt || task.assignedDate || task.startTime)})</span>
                        </span>
                        <span className="flex items-center gap-1 border-r border-slate-200 pr-3">
                          <Play className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>بدء التنفيذ:</span>
                          <strong className="text-slate-800 font-mono font-bold">{formatArabicTimeOnly(task.startTime)}</strong>
                        </span>
                      </div>

                      {task.pauseRequested && task.pauseRequestStatus === 'pending' && (
                        <div className="bg-amber-50 border border-amber-300 text-amber-900 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 mt-2">
                          <Pause className="w-4 h-4 text-amber-600 animate-pulse shrink-0" />
                          <span>⏳ تم إرسال طلب إيقاف مؤقت وبانتظار موافقة المشرف/المالك ({task.pauseRequestReason || 'بدون سبب'})</span>
                        </div>
                      )}

                      {task.pauseRequestStatus === 'rejected' && task.pauseRejectionReason && (
                        <div className="bg-red-50 border border-red-200 text-red-800 p-2 rounded-xl text-xs font-bold mt-2">
                          ❌ تم رفض طلب الإيقاف المؤقت من الإدارة: {task.pauseRejectionReason}
                        </div>
                      )}
                    </div>

                    <div className="text-left shrink-0">
                      <p className="text-[9px] text-slate-400 font-bold">الوقت المستغرق</p>
                      <p className={`text-xs font-black px-2 py-0.5 rounded-md ${
                        isActive ? 'text-emerald-800 bg-emerald-50 border border-emerald-100 font-mono animate-pulse' : 'text-amber-800 bg-amber-50 border border-amber-100 font-mono'
                      }`}>
                        {formatMsToHMS(activeWorkTimeMs)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 grid grid-cols-2 gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleInitiateCompleteTask(task)}
                      className="bg-blue-700 hover:bg-blue-800 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إنهاء وإكمال المهمة</span>
                    </button>

                    {isActive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPausingTaskId(task.id);
                          setPauseReason('');
                        }}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Pause className="w-4 h-4" />
                        <span>إيقاف مؤقت</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onResumeTask && onResumeTask(task.id)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Play className="w-4 h-4" />
                        <span>استئناف المهمة</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setPostponingTaskId(task.id);
                        setPostponeReason('');
                        setPostponeError('');
                      }}
                      className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <Calendar className="w-4 h-4 text-purple-600" />
                      <span>تأجيل المهمة</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRejectingTaskId(task.id);
                        setRejectionReason('');
                        setRejectionError('');
                      }}
                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/80 text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                    >
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span>اعتذار / إلغاء</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* C. Waiting Card (rendered if no pending tasks AND no active/paused tasks) */}
      {!myPendingTasks.length && !hasActiveOrPausedTasks && (
        <div className="bg-white rounded-3xl border-2 border-amber-200/80 p-5 md:p-6 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold shrink-0">
                <Inbox className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-base">في انتظار المهام</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">حالة النظام والاستعداد لاستقبال المهام</p>
              </div>
            </div>
          </div>

          <div className="text-center py-8 bg-amber-50/30 rounded-2xl border border-dashed border-amber-200 p-6">
            <div className="w-12 h-12 bg-amber-100/60 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6 animate-spin-slow" />
            </div>
            <h4 className="font-extrabold text-slate-700 text-sm">لا توجد مهام جارية أو بانتظار القبول حالياً</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto leading-relaxed">
              في انتظار المهام... عند إسناد مهمة جديدة لك من الإدارة ستظهر فوراً هنا.
            </p>
          </div>
        </div>
      )}

      {/* E. Today's Points Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-l from-purple-700 to-indigo-700 text-white p-6 rounded-3xl shadow-sm flex items-center justify-between relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>
        <div className="space-y-1 z-10">
          <p className="text-xs font-black text-purple-200 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-purple-200" />
            <span>⭐ نقاط اليوم الإداري الحالي</span>
          </p>
          <h3 className="text-3xl md:text-4xl font-black text-white tracking-tight">
            {netPointsToday.toFixed(1)} <span className="text-sm font-bold text-purple-200">نقطة</span>
          </h3>
          <p className="text-[11px] text-purple-100 font-medium pt-1">
            مجموع نقاط المهام والمكافآت المكتسبة اليوم ({myCompletedTasksToday.length} مهمة مكتملة اليوم)
          </p>
        </div>
        <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center shrink-0 z-10 shadow-xs">
          <Award className="w-9 h-9 text-amber-300 stroke-[2]" />
        </div>
      </motion.div>

      {/* ======================================================== */}
      {/* PERFORMANCE & POINTS CARD */}
      {/* ======================================================== */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
          <h3 className="font-black text-slate-800 text-sm">سجل تقييم ونقاط الفني</h3>
        </div>

        {/* عدد النقاط وسجل التقييم */}
        <TechnicianPointsCard
          employee={employee}
          tasks={tasks}
          manualPoints={manualPoints}
          taskTypes={taskTypes}
        />
      </div>

      {/* Rejection Reason Modal Sheet */}
      <AnimatePresence>
        {rejectingTaskId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col my-auto"
            >
              <div className="bg-red-600 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <X className="w-5 h-5 text-red-200" />
                  <h3 className="font-extrabold text-sm">الاعتذار عن قبول المهمة</h3>
                </div>
                <button
                  onClick={() => setRejectingTaskId(null)}
                  className="p-1 hover:bg-red-500 rounded-lg text-red-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmReject} className="p-6 space-y-4 overflow-y-auto flex-1">
                {rejectionError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{rejectionError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    سبب الاعتذار / الرفض للمسؤول *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="مثال: المكان خارج النطاق المتاح لي حالياً أو عدم توفر المواد..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none transition-all text-slate-800"
                  ></textarea>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد الإعتذار</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingTaskId(null)}
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

      {/* Pause Task Reason Modal Sheet */}
      <AnimatePresence>
        {pausingTaskId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col my-auto"
            >
              <div className="bg-amber-600 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pause className="w-5 h-5 text-amber-200" />
                  <h3 className="font-extrabold text-sm">طلب إيقاف المهمة مؤقتاً</h3>
                </div>
                <button
                  onClick={() => setPausingTaskId(null)}
                  className="p-1 hover:bg-amber-500 rounded-lg text-amber-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmPause} className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 font-bold">
                  ⚠️ يتطلب إيقاف المهمة مؤقتاً موافقة المشرف أو المالك. سيتم إرسال الطلب فوراً للمراجعة والاعتماد.
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    سبب الإيقاف المؤقت <span className="text-red-500">* (مطلوب)</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={pauseReason}
                    onChange={(e) => setPauseReason(e.target.value)}
                    placeholder="مثال: جاري شراء مستلزمات أو انتظار المشترك أو استراحة طارئة..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-slate-800"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال طلب الإيقاف للمشرف</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPausingTaskId(null)}
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

      {/* Postpone Task Reason Modal Sheet */}
      <AnimatePresence>
        {postponingTaskId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col my-auto"
            >
              <div className="bg-purple-700 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-200" />
                  <h3 className="font-extrabold text-sm">تأجيل المهمة</h3>
                </div>
                <button
                  onClick={() => setPostponingTaskId(null)}
                  className="p-1 hover:bg-purple-600 rounded-lg text-purple-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmPostpone} className="p-6 space-y-4 overflow-y-auto flex-1">
                {postponeError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{postponeError}</span>
                  </div>
                )}

                <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3 text-xs text-purple-900 font-bold leading-relaxed">
                  📌 عند تحديد المهمة كمؤجلة، ستبقى معلقة حتى يقوم المشرف أو المالك بإعادة إرسالها وتكليفها.
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    اختر سبب سريع أو اكتب السبب:
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {[
                      'المشترك طلب تأجيل الموعد',
                      'المشترك غير متواجد / مغلق',
                      'المنطقة مقطوعة وبانتظار تمديد كابل',
                      'عائق فني أو انقطاع طاقة بالموقع',
                      'ظرف طارئ'
                    ].map((reasonText) => (
                      <button
                        key={reasonText}
                        type="button"
                        onClick={() => {
                          setPostponeReason(reasonText);
                          setPostponeError('');
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold transition-all cursor-pointer ${
                          postponeReason === reasonText
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50'
                        }`}
                      >
                        {reasonText}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    required
                    value={postponeReason}
                    onChange={(e) => {
                      setPostponeReason(e.target.value);
                      setPostponeError('');
                    }}
                    placeholder="اكتب سبب تأجيل المهمة بالتفصيل..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none transition-all text-slate-800"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>تأكيد تأجيل المهمة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPostponingTaskId(null)}
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

      {/* Re-send Task Modal Sheet */}
      <AnimatePresence>
        {reopenModalTaskId && selectedReopenTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col my-auto"
            >
              <div className="bg-blue-700 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-blue-200" />
                  <h3 className="font-extrabold text-sm">طلب إعادة إرسال المهمة من المشرف والمالك</h3>
                </div>
                <button
                  onClick={() => setReopenModalTaskId(null)}
                  className="p-1 hover:bg-blue-600 rounded-lg text-blue-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmReopenRequest} className="p-6 space-y-4 overflow-y-auto flex-1">
                {reopenError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{reopenError}</span>
                  </div>
                )}

                {/* Selected Task Details Summary */}
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-xs space-y-1">
                  <p className="font-black text-blue-900">المهمة السابقة: {selectedReopenTask.taskType}</p>
                  {selectedReopenTask.subscriberName && (
                    <p className="text-slate-700 font-bold">المشترك: {selectedReopenTask.subscriberName}</p>
                  )}
                  {selectedReopenTask.subscriberPhone && (
                    <p className="text-slate-600 font-mono dir-ltr text-right">الهاتف: {selectedReopenTask.subscriberPhone}</p>
                  )}
                  <p className="text-[10px] text-slate-400 pt-1">
                    تاريخ الإكمال: {formatArabicDateOnly(selectedReopenTask.endTime || selectedReopenTask.startTime)}
                  </p>
                </div>

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

      {/* Task Completion & Operation Details Modal */}
      <AnimatePresence>
        {completingTask && (() => {
          const start = new Date(completingTask.startTime).getTime();
          const now = Date.now();
          const totalPaused = completingTask.totalPausedMs || 0;
          const currentPause = (completingTask.status === 'paused' && completingTask.pausedAt) ? (now - new Date(completingTask.pausedAt).getTime()) : 0;
          const activeWorkTimeMs = Math.max(0, now - start - totalPaused - currentPause);
          const durationMinutes = Math.max(0, Math.round(activeWorkTimeMs / 60000));
          const limitMinutes = getTaskTimeLimitMinutes(completingTask.taskType, taskTypes);
          const isOverdue = durationMinutes > limitMinutes;

          return (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col my-auto"
              >
                <div className="bg-emerald-700 p-4 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                    <h3 className="font-extrabold text-sm">إكمال المهمة وتوثيق معلومات العملية</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompletingTask(null)}
                    className="p-1 hover:bg-emerald-800 rounded-lg text-emerald-100 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleConfirmCompletionDelay} className="p-6 space-y-4 overflow-y-auto flex-1">
                  {completionDelayError && (
                    <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{completionDelayError}</span>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 text-xs text-slate-800 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">المهمة:</span>
                      <strong className="text-slate-900 font-black">{completingTask.taskType}</strong>
                    </div>
                    {completingTask.subscriberName && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold">المشترك:</span>
                        <strong className="text-slate-900 font-black">{completingTask.subscriberName}</strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-bold">الوقت المستغرق:</span>
                      <strong className="text-emerald-700 font-mono font-black">{formatMsToHMS(activeWorkTimeMs)}</strong>
                    </div>
                  </div>

                  {/* Mandatory Operation Details Field */}
                  <div>
                    <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                      <span>معلومات العملية وتفاصيل الإنجاز <span className="text-red-500">* (إجباري)</span></span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={completionOperationDetails}
                      onChange={(e) => {
                        setCompletionOperationDetails(e.target.value);
                        setCompletionDelayError('');
                      }}
                      placeholder="اكتب تفاصيل الإنجاز الميدانية والتنفيذية (مثل: تم ربط الراوتر، صيانة الكابل الخارجي، قياس الإشارة، إدخال بيانات المشترك...)"
                      className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition-all text-slate-800 font-medium"
                    ></textarea>
                  </div>

                  {/* Overtime Notice & Delay Reason */}
                  {isOverdue && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-extrabold text-amber-800">
                          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>تنبيه: لقد تجاوزت الوقت المسموح للمهمة ({limitMinutes} دقيقة)</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-amber-800">
                          يرجى كتابة سبب التأخير ليتم مراجعته من المشرف وتفادي الخصم.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-slate-800 mb-1.5">
                          سبب التأخير بالتفصيل <span className="text-red-500">* (إجباري للتأخير)</span>
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={completionDelayReason}
                          onChange={(e) => {
                            setCompletionDelayReason(e.target.value);
                            setCompletionDelayError('');
                          }}
                          placeholder="مثال: صعوبة في التمديد الخارجي / استغراق وقت إضافي لدى المشترك..."
                          className="w-full text-xs p-3 rounded-2xl border border-amber-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-slate-800 font-medium"
                        ></textarea>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black py-3 rounded-2xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد وإكمال المهمة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompletingTask(null)}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-2xl transition-all cursor-pointer"
                    >
                      إلغاء
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

    </div>
  );
}
