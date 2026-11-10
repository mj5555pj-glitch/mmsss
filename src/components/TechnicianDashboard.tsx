import React, { useState, useEffect } from 'react';
import { 
  User, CheckCircle2, Clock, MapPin, Phone, AlertCircle, Inbox, 
  Award, Play, Pause, X, ChevronDown, Check, History, ChevronRight, RefreshCw, Search, Send,
  Lock, XCircle, Calendar, Package, Boxes, Plus, Trash2, Banknote
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, Task, ManualPointsRecord, DbTaskType, TaskType, ConsumedMaterial, TechnicianStockItem, MaterialItem } from '../types';
import { isToday, formatArabicTimeOnly, formatArabicDateOnly, formatMsToHMS, getTaskTimeLimitMinutes } from '../utils';
import { getTechnicianInventory, getMaterialItems } from '../lib/dbService';
import CopyPhoneButton from './CopyPhoneButton';
import TechnicianAttendanceCard from './TechnicianAttendanceCard';
import TechnicianCycleHistoryCard from './TechnicianCycleHistoryCard';
import TechnicianOvertimeCard from './TechnicianOvertimeCard';
import TechnicianLeaveCard from './TechnicianLeaveCard';
import TechnicianPayrollCard from './TechnicianPayrollCard';
import TechnicianRewardCard from './TechnicianRewardCard';
import TechnicianPointsCard from './TechnicianPointsCard';

interface TechnicianDashboardProps {
  employee: Employee | undefined;
  tasks: Task[];
  manualPoints: ManualPointsRecord[];
  allEmployees: Employee[];
  taskTypes?: DbTaskType[];
  onAcceptTask?: (taskId: string) => void;
  onRejectTask?: (taskId: string, reason: string) => void;
  onCompleteTask?: (
    taskId: string, 
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

  // Payment Collection state (تحصيل أموال من المشترك أو مجاناً)
  const [paymentStatus, setPaymentStatus] = useState<'free' | 'collected'>('free');
  const [collectedAmount, setCollectedAmount] = useState<number | ''>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');

  // Technician inventory state for task completion
  const [techStocks, setTechStocks] = useState<TechnicianStockItem[]>([]);
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialItem[]>([]);
  const [consumedItems, setConsumedItems] = useState<Array<{ materialId: string; quantity: number; notes?: string }>>([]);

  useEffect(() => {
    if (completingTask && employee?.id) {
      getTechnicianInventory(employee.id).then(setTechStocks).catch(console.warn);
      getMaterialItems().then(setCatalogMaterials).catch(console.warn);
      setConsumedItems([]);
    }
  }, [completingTask, employee?.id]);

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
    setPaymentStatus(task.paymentStatus === 'collected' ? 'collected' : 'free');
    setCollectedAmount(task.collectedAmount && task.collectedAmount > 0 ? task.collectedAmount : '');
    setPaymentNotes(task.paymentNotes || '');
  };

  const handleConfirmCompletionDelay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    if (!completionOperationDetails.trim()) {
      setCompletionDelayError('يرجى كتابة معلومات العملية (تفاصيل التنفيذ والإنجاز) أولاً. هذا الحقل إجباري.');
      return;
    }

    if (paymentStatus === 'collected') {
      const parsedAmount = Number(collectedAmount);
      if (!parsedAmount || parsedAmount <= 0) {
        setCompletionDelayError('يرجى إدخال المبلغ المحصل من المشترك بالدينار العراقي، أو اختيار خيار (مجاناً).');
        return;
      }
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

    const enrichedConsumedMaterials: ConsumedMaterial[] = consumedItems
      .filter(i => i.materialId && i.quantity > 0)
      .map(i => {
        const stockItem = techStocks.find(s => s.materialId === i.materialId);
        const catalogItem = catalogMaterials.find(m => m.id === i.materialId);
        return {
          materialId: i.materialId,
          materialName: stockItem?.materialName || catalogItem?.name || 'مادة',
          unit: stockItem?.unit || catalogItem?.unit || 'قطعة',
          quantity: i.quantity,
          notes: i.notes
        };
      });

    const paymentInfo = {
      paymentStatus,
      collectedAmount: paymentStatus === 'collected' ? Math.max(0, Number(collectedAmount) || 0) : 0,
      paymentNotes: paymentNotes.trim() || undefined
    };

    if (onCompleteTask) {
      onCompleteTask(
        completingTask.id, 
        new Date().toISOString(), 
        completionDelayReason.trim() || undefined,
        completionOperationDetails.trim(),
        enrichedConsumedMaterials.length > 0 ? enrichedConsumedMaterials : undefined,
        paymentInfo
      );
    }
    setCompletingTask(null);
    setCompletionOperationDetails('');
    setCompletionDelayReason('');
    setCompletionDelayError('');
    setConsumedItems([]);
    setPaymentStatus('free');
    setCollectedAmount('');
    setPaymentNotes('');
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
      {/* HR & ADMINISTRATIVE CARDS (2-6 STRICT ORDER) */}
      {/* 2️⃣ تسجيل الحضور والانصراف (Attendance) */}
      {/* 3️⃣ راتبي (Payroll) */}
      {/* 4️⃣ مكافآتي (Reward) */}
      {/* 5️⃣ الإجازات (Leaves) */}
      {/* 6️⃣ الوقت الإضافي (Overtime) */}
      {/* ======================================================== */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 px-1">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
          <h3 className="font-black text-slate-800 text-sm">خدمات الشؤون الإدارية والمالية والتقييم للموظف</h3>
        </div>

        {/* 1️⃣ عدد النقاط الكلي للدورة وسجل النقاط */}
        <TechnicianPointsCard
          employee={employee}
          tasks={tasks}
          manualPoints={manualPoints}
          taskTypes={taskTypes}
        />

        {/* 2️⃣ تسجيل الحضور والانصراف */}
        <TechnicianAttendanceCard employee={employee} />

        {/* 3️⃣ راتبي */}
        <TechnicianPayrollCard
          employee={employee}
          tasks={tasks}
          manualPoints={manualPoints}
          allEmployees={allEmployees}
        />

        {/* 4️⃣ مكافآتي */}
        <TechnicianRewardCard
          employee={employee}
          tasks={tasks}
          manualPoints={manualPoints}
          allEmployees={allEmployees}
        />

        {/* 5️⃣ الإجازات */}
        <TechnicianLeaveCard employee={employee} />

        {/* 6️⃣ الوقت الإضافي */}
        <TechnicianOvertimeCard employee={employee} />
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

                  {/* Dispense Materials to Subscriber (صرف مواد للمشترك من عهدة الفني) */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-black text-slate-800">صرف مواد ومستلزمات للمشترك</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const firstAvailable = techStocks.find(s => s.quantity > 0)?.materialId || catalogMaterials[0]?.id || '';
                          setConsumedItems([...consumedItems, { materialId: firstAvailable, quantity: 1, notes: '' }]);
                        }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-black flex items-center gap-1 cursor-pointer bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ صرف مادة</span>
                      </button>
                    </div>

                    {consumedItems.length === 0 ? (
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        هل قمت بتركيب راوتر، أونيو، أو تمديد كابل ألياف ضوئية للمشترك؟ اضغط على <strong>+ صرف مادة</strong> لتسجيلها وسيتم خصمها من عهدتك تلقائياً.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {consumedItems.map((item, idx) => {
                          const stockItem = techStocks.find(s => s.materialId === item.materialId);
                          const catalogItem = catalogMaterials.find(m => m.id === item.materialId);
                          const unit = stockItem?.unit || catalogItem?.unit || 'قطعة';
                          const availableQty = stockItem ? stockItem.quantity : 0;
                          const isExceeding = item.quantity > availableQty;

                          return (
                            <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-2 shadow-xs">
                              <div className="flex items-center gap-2">
                                <select
                                  value={item.materialId}
                                  onChange={(e) => {
                                    const updated = [...consumedItems];
                                    updated[idx].materialId = e.target.value;
                                    setConsumedItems(updated);
                                  }}
                                  className="flex-1 text-xs p-2 rounded-xl border border-slate-200 font-bold text-slate-800 outline-none bg-white"
                                >
                                  <option value="">-- اختر المادة --</option>
                                  {techStocks.filter(s => s.quantity > 0).map(s => (
                                    <option key={s.materialId} value={s.materialId}>
                                      {s.materialName} (متوفر لديك: {s.quantity} {s.unit})
                                    </option>
                                  ))}
                                  {catalogMaterials
                                    .filter(m => !techStocks.some(s => s.materialId === m.id && s.quantity > 0))
                                    .map(m => (
                                      <option key={m.id} value={m.id}>
                                        {m.name} (غير متوفر بعهدتك)
                                      </option>
                                    ))}
                                </select>

                                <div className="flex items-center gap-1 w-24 shrink-0">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const updated = [...consumedItems];
                                      updated[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                      setConsumedItems(updated);
                                    }}
                                    className="w-full text-xs p-2 text-center font-mono font-black text-amber-700 rounded-xl border border-slate-200 outline-none"
                                    placeholder="الكمية"
                                  />
                                  <span className="text-[10px] text-slate-500 font-bold shrink-0">{unit}</span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = consumedItems.filter((_, i) => i !== idx);
                                    setConsumedItems(updated);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                  title="إلغاء المادة"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {isExceeding && availableQty > 0 && (
                                <span className="text-[10px] text-amber-600 font-bold block bg-amber-50 px-2 py-0.5 rounded-md">
                                  تنبيه: الكمية المدخلة ({item.quantity}) تتجاوز رصيدك الحالي ({availableQty})
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Subscriber Payment Collection (تحصيل أموال من المشترك أو مجاناً) */}
                  <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 md:p-4 space-y-3">
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
