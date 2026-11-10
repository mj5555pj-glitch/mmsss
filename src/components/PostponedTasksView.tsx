import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  User, 
  Phone, 
  MapPin, 
  Play, 
  Pencil, 
  Trash2, 
  Tag, 
  AlertCircle, 
  History, 
  CheckCircle2, 
  X, 
  Copy, 
  Check, 
  Send
} from 'lucide-react';
import { Employee, Task, DbTaskType, PointsRules } from '../types';
import { formatArabicDateOnly, formatArabicTimeOnly, calculateTaskPoints, isTechnicianEmployee } from '../utils';

interface PostponedTasksViewProps {
  tasks: Task[];
  employees: Employee[];
  taskTypes: DbTaskType[];
  pointsRules?: PointsRules;
  userRole: 'owner' | 'manager' | 'supervisor' | 'technician' | 'admin' | 'viewer';
  onEditActiveTask?: (updatedTask: Task) => void;
  onDeleteTask?: (taskId: string) => void;
  onStartTask?: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => void;
}

function CopyPhoneButton({ phone }: { phone: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="نسخ رقم الهاتف"
      className="p-1 rounded-md hover:bg-slate-200/80 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function PostponedTasksView({
  tasks,
  employees,
  taskTypes,
  pointsRules,
  userRole,
  onEditActiveTask,
  onDeleteTask
}: PostponedTasksViewProps) {
  // Resend / Reassign Modal State
  const [resendingTask, setResendingTask] = useState<Task | null>(null);
  const [resendTechId, setResendTechId] = useState<string>('');
  const [resendTaskType, setResendTaskType] = useState<string>('');
  const [resendNotes, setResendNotes] = useState<string>('');
  const [resendError, setResendError] = useState<string>('');

  // Edit Modal State
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editSubscriberName, setEditSubscriberName] = useState('');
  const [editSubscriberPhone, setEditSubscriberPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPoints, setEditPoints] = useState<number>(0);
  const [editReasonLog, setEditReasonLog] = useState('');

  // Delete Confirmation State
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);

  // Filter only postponed tasks (non-supporter) and sort by newest postponed
  const postponedTasksList = useMemo(() => {
    return tasks
      .filter(t => t.status === 'postponed' && !t.parentTaskId)
      .sort((a, b) => {
        const timeA = new Date(a.postponedAt || a.startTime).getTime();
        const timeB = new Date(b.postponedAt || b.startTime).getTime();
        return timeB - timeA;
      });
  }, [tasks]);

  // Active technicians from list of employees
  const technicianEmployees = useMemo(() => {
    const filtered = employees.filter(isTechnicianEmployee);
    // If no employees strictly matched technician role filter, fallback to non-suspended employees
    if (filtered.length === 0) {
      return employees.filter(e => e.status !== 'suspended' && e.status !== 'terminated');
    }
    return filtered;
  }, [employees]);

  // Handle Open Resend Modal
  const handleOpenResendModal = (task: Task) => {
    setResendingTask(task);
    setResendTechId(task.employeeId || '');
    setResendTaskType(task.taskType);
    setResendNotes(task.notes || '');
    setResendError('');
  };

  // Handle Confirm Resend
  const handleConfirmResend = () => {
    if (!resendingTask) return;
    if (!resendTechId) {
      setResendError('يرجى اختيار الفني لإعادة إسناد وتكليف المهمة له');
      return;
    }

    const selectedEmp = employees.find(e => e.id === resendTechId);
    if (!selectedEmp) {
      setResendError('الفني المحدد غير موجود');
      return;
    }

    const nowIso = new Date().toISOString();
    const oldType = resendingTask.taskType;
    const newType = resendTaskType || oldType;
    const isTypeChanged = oldType !== newType;
    const selectedTypeObj = taskTypes.find(t => t.name === newType);
    const standardPoints = selectedTypeObj?.points ?? calculateTaskPoints(newType, 0, taskTypes, pointsRules);

    const typeChangeText = isTypeChanged 
      ? `[تم تحويل نوع المهمة من (${oldType}) إلى (${newType})] ` 
      : '';

    const resendLogText = `${typeChangeText}إعادة إرسال المهمة المؤجلة وتكليف الفني: ${selectedEmp.name} (الفني السابق: ${resendingTask.employeeName || 'غير محدد'})${resendingTask.postponeReason ? ` | سبب التأجيل السابق: ${resendingTask.postponeReason}` : ''}`;

    const updatedTask: Task = {
      ...resendingTask,
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
      // Clear postponed state completely so it leaves postponed list immediately
      postponedAt: undefined,
      postponeReason: undefined,
      postponedByTechName: undefined,
      previousPostponeReason: resendingTask.previousPostponeReason || resendingTask.postponeReason,
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
  };

  // Handle Open Edit Modal
  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setEditSubscriberName(task.subscriberName || '');
    setEditSubscriberPhone(task.subscriberPhone || '');
    setEditNotes(task.notes || '');
    setEditPoints(task.points || 0);
    setEditReasonLog('');
  };

  // Handle Save Edit
  const handleSaveEdit = () => {
    if (!editingTask || !onEditActiveTask) return;

    const changesList: string[] = [];
    if (editingTask.subscriberName !== editSubscriberName) {
      changesList.push(`اسم المشترك: (${editingTask.subscriberName || 'غير محدد'}) ⬅ (${editSubscriberName})`);
    }
    if (editingTask.subscriberPhone !== editSubscriberPhone) {
      changesList.push(`رقم الهاتف: (${editingTask.subscriberPhone || 'غير محدد'}) ⬅ (${editSubscriberPhone})`);
    }
    if (editingTask.notes !== editNotes) {
      changesList.push(`الملاحظات: (${editingTask.notes || 'لا يوجد'}) ⬅ (${editNotes})`);
    }
    if (editingTask.points !== editPoints) {
      changesList.push(`النقاط: (${editingTask.points || 0}) ⬅ (${editPoints})`);
    }

    let newLogEntry = null;
    if (changesList.length > 0) {
      newLogEntry = {
        id: `edit-${Date.now()}`,
        editedBy: 'الإدارة',
        editedAt: new Date().toISOString(),
        changes: `تعديل المهمة المؤجلة: ${changesList.join(' | ')}${editReasonLog.trim() ? ` [سبب التعديل: ${editReasonLog.trim()}]` : ''}`
      };
    }

    const existingEditLogs = editingTask.editLogs || [];
    const updated: Task = {
      ...editingTask,
      subscriberName: editSubscriberName,
      subscriberPhone: editSubscriberPhone,
      notes: editNotes,
      points: editPoints,
      editLogs: newLogEntry ? [newLogEntry, ...existingEditLogs] : existingEditLogs
    };

    onEditActiveTask(updated);
    setEditingTask(null);
  };

  // Handle Delete
  const handleConfirmDelete = () => {
    if (deleteConfirmTaskId && onDeleteTask) {
      onDeleteTask(deleteConfirmTaskId);
      setDeleteConfirmTaskId(null);
    }
  };

  const canManage = userRole === 'admin' || userRole === 'owner' || userRole === 'manager' || userRole === 'supervisor';

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Task Cards Grid */}
      {postponedTasksList.length === 0 ? (
        <div className="text-center py-16 bg-slate-50/80 rounded-3xl border border-dashed border-slate-200 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 text-purple-400 mx-auto flex items-center justify-center">
            <Calendar className="w-7 h-7" />
          </div>
          <h3 className="font-black text-slate-700 text-sm">لا توجد مهام مؤجلة</h3>
          <p className="text-xs text-slate-400 font-medium">
            لا توجد أي مهام مؤجلة معلقة حالياً في النظام
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {postponedTasksList.map((task) => {
            const techName = task.employeeName || employees.find(e => e.id === task.employeeId)?.name || 'فني غير محدد';
            const postponedTech = task.postponedByTechName || techName;
            const pointsVal = taskTypes.find(t => t.name === task.taskType)?.points ?? task.points;

            return (
              <div
                key={task.id}
                className="bg-white rounded-3xl border border-purple-200/90 hover:border-purple-400 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden"
              >
                {/* Top Purple Accent Line */}
                <div className="h-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 w-full" />

                <div className="p-5 space-y-4 flex-1">
                  
                  {/* Card Header: Tech Name & Postponed Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 font-black text-xs flex items-center justify-center border border-purple-200">
                        {techName.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-800 text-xs flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-purple-600" />
                          <span>{techName}</span>
                        </h4>
                        <span className="text-[10px] text-slate-400 font-medium font-mono">
                          #{task.employeeId.slice(-4)}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] font-black px-2.5 py-1 rounded-md bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                      <span>⏳ مهمة مؤجلة</span>
                    </span>
                  </div>

                  {/* Task Type & Points */}
                  <div className="flex items-center justify-between gap-2 bg-purple-50/50 p-2.5 rounded-2xl border border-purple-100">
                    <div className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-xs font-black text-purple-950">{task.taskType}</span>
                    </div>
                    {pointsVal !== undefined && (
                      <span className="text-[10px] font-black bg-purple-600 text-white px-2 py-0.5 rounded-lg shadow-2xs">
                        +{pointsVal} نقطة
                      </span>
                    )}
                  </div>

                  {/* Postponement Date & Time (NO LIVE RUNNING TIMER) */}
                  <div className="bg-purple-50/70 border border-purple-200/80 rounded-2xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-purple-900 font-black text-xs">
                      <Calendar className="w-3.5 h-3.5 text-purple-600" />
                      <span>تاريخ وتوقيت التأجيل:</span>
                    </div>
                    <div className="text-xs font-bold text-purple-950 font-mono pr-5">
                      {task.postponedAt ? (
                        <span>
                          {formatArabicTimeOnly(task.postponedAt)} &nbsp; | &nbsp; {formatArabicDateOnly(task.postponedAt)}
                        </span>
                      ) : (
                        <span>تأجيل سابق بدون توقيت</span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-purple-800/90 font-medium pr-5">
                      تم التأجيل بواسطة الفني: <strong className="text-purple-950">{postponedTech}</strong>
                    </div>
                  </div>

                  {/* Postponement Reason Box */}
                  <div className="bg-amber-50/60 border border-amber-200/70 rounded-2xl p-3 space-y-1 text-xs">
                    <div className="font-black text-amber-900 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>سبب التأجيل:</span>
                    </div>
                    <p className="font-bold text-slate-800 leading-relaxed bg-white/80 p-2 rounded-xl border border-amber-100/80">
                      {task.postponeReason || 'لم يحدد الفني سبباً محدداً للتأجيل'}
                    </p>
                  </div>

                  {/* Subscriber Information */}
                  {(task.subscriberName || task.subscriberPhone) && (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs space-y-1.5">
                      {task.subscriberName && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold">👤 المشترك:</span>
                          <span className="font-extrabold text-slate-900">{task.subscriberName}</span>
                        </div>
                      )}
                      {task.subscriberPhone && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-400 font-bold">📞 الهاتف:</span>
                            <span className="font-mono font-extrabold text-blue-700 dir-ltr">{task.subscriberPhone}</span>
                          </div>
                          <CopyPhoneButton phone={task.subscriberPhone} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes / Location */}
                  {task.notes && (
                    <div className="flex items-start gap-1.5 bg-slate-50 p-2.5 rounded-2xl border border-slate-150 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">الملاحظات / العنوان:</span>
                        <span className="font-bold text-slate-800">{task.notes}</span>
                      </div>
                    </div>
                  )}

                  {/* History Logs */}
                  {task.editLogs && task.editLogs.length > 0 && (
                    <div className="p-2.5 bg-blue-50/70 border border-blue-200/60 rounded-xl space-y-1 text-xs">
                      <div className="font-black text-blue-900 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1">
                          <History className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>سجل التعديلات ({task.editLogs.length})</span>
                        </span>
                      </div>
                      <div className="space-y-1 max-h-24 overflow-y-auto text-[10px]">
                        {task.editLogs.map((log) => (
                          <div key={log.id} className="p-1.5 bg-white rounded-md border border-blue-100">
                            <div className="font-bold text-slate-700">{log.changes}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Management Action Buttons */}
                {canManage && (
                  <div className="p-4 bg-slate-50/80 border-t border-slate-100 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenResendModal(task)}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white text-xs font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs hover:shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>إعادة إرسال وتكليف الفني</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(task)}
                        className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>تعديل المهمة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteConfirmTaskId(task.id)}
                        className="bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-bold py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                        <span>حذف المهمة</span>
                      </button>
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Resend / Reassign Modal */}
      {resendingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  <Play className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">إعادة إرسال وتكليف المهمة المؤجلة</h3>
                  <p className="text-xs text-slate-500 font-medium">اختر الفني المستلم لتحويل المهمة إليه كـ (بانتظار القبول)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResendingTask(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resendError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{resendError}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              
              {/* Task Summary Banner */}
              <div className="p-3.5 bg-purple-50/70 border border-purple-200/80 rounded-2xl space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-purple-950 text-xs">{resendingTask.taskType}</span>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-200/60 px-2 py-0.5 rounded-md">
                    الفني السابق: {resendingTask.employeeName || 'غير محدد'}
                  </span>
                </div>
                {resendingTask.subscriberName && (
                  <div className="text-slate-700 font-bold">
                    المشترك: <strong>{resendingTask.subscriberName}</strong> {resendingTask.subscriberPhone ? `(${resendingTask.subscriberPhone})` : ''}
                  </div>
                )}
                {resendingTask.postponeReason && (
                  <div className="text-purple-900 text-[11px] font-semibold bg-white/80 p-2 rounded-xl border border-purple-100">
                    سبب التأجيل السابق: {resendingTask.postponeReason}
                  </div>
                )}
              </div>

              {/* Select Target Technician */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">اختر الفني المستلم للمهمة: *</label>
                <select
                  value={resendTechId}
                  onChange={(e) => {
                    setResendTechId(e.target.value);
                    setResendError('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
                >
                  <option value="">-- اختر الفني --</option>
                  {technicianEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                    </option>
                  ))}
                </select>
                {technicianEmployees.length === 0 && (
                  <p className="text-[11px] text-amber-600 font-bold">لا يوجد فنيين مسجلين في النظام حالياً</p>
                )}
              </div>

              {/* Change Task Type (Optional) */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">نوع المهمة (يمكنك تعديل النوع إن لزم):</label>
                <select
                  value={resendTaskType}
                  onChange={(e) => setResendTaskType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 cursor-pointer"
                >
                  {taskTypes.map(tt => (
                    <option key={tt.id} value={tt.name}>
                      {tt.name} ({tt.points} نقطة)
                    </option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">ملاحظات المهمة والتوجيه الجديد:</label>
                <textarea
                  rows={3}
                  value={resendNotes}
                  onChange={(e) => setResendNotes(e.target.value)}
                  placeholder="أضف أي ملاحظات أو تعليمات إضافية للفني الجديد..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResendingTask(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmResend}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>إعادة إرسال وتكليف المهمة</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-lg w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                  <Pencil className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">تعديل بيانات المهمة المؤجلة</h3>
                  <p className="text-xs text-slate-500 font-medium">تعديل اسم المشترك، الهاتف، الملاحظات أو النقاط</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              
              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">اسم المشترك:</label>
                <input
                  type="text"
                  value={editSubscriberName}
                  onChange={(e) => setEditSubscriberName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">رقم هاتف المشترك:</label>
                <input
                  type="text"
                  value={editSubscriberPhone}
                  onChange={(e) => setEditSubscriberPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 font-mono dir-ltr text-right"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">النقاط المستحقة للمهمة:</label>
                <input
                  type="number"
                  min="0"
                  value={editPoints}
                  onChange={(e) => setEditPoints(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">الملاحظات / العنوان:</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-black text-slate-700 block">سبب التعديل (اختياري - للتوثيق):</label>
                <input
                  type="text"
                  value={editReasonLog}
                  onChange={(e) => setEditReasonLog(e.target.value)}
                  placeholder="سبب التعديل..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingTask(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-all cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ التعديلات</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm w-full p-6 space-y-4 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 mx-auto flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-black text-slate-900 text-base">تأكيد حذف المهمة المؤجلة</h3>
            <p className="text-xs text-slate-500 font-medium">هل أنت متأكد من رغبتك في حذف هذه المهمة نهائياً من سجل المهام المؤجلة؟</p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTaskId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-black transition-all cursor-pointer shadow-xs"
              >
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
