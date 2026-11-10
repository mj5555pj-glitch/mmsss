import React, { useState, useEffect } from 'react';
import { Clock, Play, Pause, ChevronDown, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, OvertimeRecord } from '../types';
import { formatArabicTimeOnly } from '../utils';
import { canStartOvertime, canEndOvertime, calculateOvertimeMinutes, calculateOvertimeHours, createPendingOvertime } from '../lib/overtimeService';
import { subscribeOvertimeRecords, createOvertimeRecord, updateOvertimeRecord, subscribeCompanySettings } from '../lib/dbService';

interface TechnicianOvertimeCardProps {
  employee: Employee;
  settings?: CompanySettings | null;
}

export default function TechnicianOvertimeCard({ employee, settings: initialSettings }: TechnicianOvertimeCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(initialSettings || null);

  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to Company Settings
  useEffect(() => {
    const unsubSettings = subscribeCompanySettings(
      (sets) => {
        if (sets) setCompanySettings(sets);
      },
      (err) => console.warn('OvertimeCard settings error:', err)
    );
    return () => unsubSettings();
  }, []);

  // Subscribe to Overtime Records
  useEffect(() => {
    const unsubOvertime = subscribeOvertimeRecords(
      (recs) => {
        setOvertimeRecords(recs);
      },
      (err) => console.warn('OvertimeCard records error:', err)
    );
    return () => unsubOvertime();
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const effectiveSettings: CompanySettings = companySettings || {
    companyLatitude: 33.3152,
    companyLongitude: 44.3661,
    allowedRadiusMeters: 500,
    workStartTime: '08:00',
    workEndTime: '16:00',
    earlyCheckInMinutes: 60,
    lateToleranceMinutes: 15,
    earlyCheckoutToleranceMinutes: 15,
    maxLateMinutes: 120,
    salaryCycleStartDay: 1,
    salaryCycleEndDay: 30,
    paidLeavesPerCycle: 2,
    unpaidLeavesPerCycle: 2,
    overtimeHourlyRate: 5000,
  };

  // Find current active or pending session for today
  const myOvertimeRecords = overtimeRecords.filter((r) => r.employeeId === employee.id && !r.isDeleted);
  const activeRecord = myOvertimeRecords.find((r) => r.date === todayStr && !r.endTime) || myOvertimeRecords[0];

  // Live timer tick for running session duration
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!activeRecord || activeRecord.endTime) return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeRecord]);

  // Start Overtime Handler
  const handleStart = async () => {
    setMessage(null);
    setLoadingAction(true);
    try {
      if (employee.status === 'suspended') {
        setMessage({
          type: 'error',
          text: 'عذراً، حسابك موقوف عن العمل حالياً ولا يمكنك بدء وقت إضافي.',
        });
        setLoadingAction(false);
        return;
      }

      const now = new Date();
      // Check via overtimeService pure function
      const check = canStartOvertime(now, effectiveSettings);

      if (!check.allowed) {
        setMessage({
          type: 'error',
          text: check.reason || 'لا يمكن بدء الوقت الإضافي في الوقت الحالي.',
        });
        setLoadingAction(false);
        return;
      }

      if (activeRecord && !activeRecord.endTime) {
        setMessage({
          type: 'error',
          text: 'لديك جلسة وقت إضافي جارية بالفعل. يرجى إنهائها أولاً.',
        });
        setLoadingAction(false);
        return;
      }

      const newRecord = createPendingOvertime(
        employee.id,
        employee.name,
        todayStr,
        now.toISOString()
      );

      await createOvertimeRecord(newRecord);

      setMessage({
        type: 'success',
        text: 'تم بدء جلسة الوقت الإضافي بنجاح.',
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء بدء الوقت الإضافي.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // End Overtime Handler
  const handleEnd = async () => {
    if (!activeRecord || activeRecord.endTime) {
      setMessage({ type: 'error', text: 'لا توجد جلسة وقت إضافي نشطة لإنهائها.' });
      return;
    }

    setMessage(null);
    setLoadingAction(true);
    try {
      const check = canEndOvertime(activeRecord.startTime);
      if (!check.allowed) {
        setMessage({ type: 'error', text: check.reason || 'خطأ في عملية الإنهاء.' });
        setLoadingAction(false);
        return;
      }

      const now = new Date();
      const endTimeIso = now.toISOString();
      const durationMins = calculateOvertimeMinutes(activeRecord.startTime, endTimeIso);

      await updateOvertimeRecord(activeRecord.id, {
        endTime: endTimeIso,
        durationMinutes: durationMins,
        status: 'pending', // Pending admin approval
      });

      setMessage({
        type: 'success',
        text: `تم إنهاء الوقت الإضافي بنجاح (${durationMins} دقيقة). الطلب بانتظار الاعتماد.`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء إنهاء الوقت الإضافي.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Calculated duration and status display
  const currentDurationMins = activeRecord
    ? calculateOvertimeMinutes(
        activeRecord.startTime,
        activeRecord.endTime || new Date().toISOString()
      )
    : 0;

  const currentDurationHours = calculateOvertimeHours(currentDurationMins);

  const getStatusBadge = () => {
    if (!activeRecord) {
      return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">⚪ لا يوجد طلب نشط</span>;
    }
    if (!activeRecord.endTime) {
      return <span className="bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-2.5 py-1 rounded-lg text-xs animate-pulse">⚡ جاري العمل إضافياً</span>;
    }
    if (activeRecord.status === 'approved') {
      return <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">✅ معتمد</span>;
    }
    if (activeRecord.status === 'rejected') {
      return <span className="bg-red-50 text-red-800 border border-red-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">❌ مرفوض</span>;
    }
    return <span className="bg-purple-50 text-purple-800 border border-purple-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">⏳ بانتظار الاعتماد</span>;
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs transition-all">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center font-bold shrink-0">
            <Zap className="w-5 h-5 fill-amber-500 text-amber-600" />
          </div>
          <div className="text-right">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>الوقت الإضافي</span>
              {activeRecord && !activeRecord.endTime && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  نشط الآن
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              تسجيل الساعات الإضافية ومتابعة حالة اعتمادها
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs px-3 py-2 rounded-xl">
          <span>{isOpen ? 'إخفاء' : 'عرض والتحكم'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {/* Collapsible Body */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-5 mt-4 border-t border-slate-100 space-y-4">
              
              {/* Alert Feedback Messages */}
              {message && (
                <div
                  className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                    message.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {message.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{message.text}</span>
                </div>
              )}

              {/* Data Table / Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">حالة الطلب الحالي</span>
                  <div>{getStatusBadge()}</div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت البداية</span>
                  <span className="font-mono font-black text-slate-800">
                    {activeRecord?.startTime ? formatArabicTimeOnly(activeRecord.startTime) : '--:--'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت النهاية</span>
                  <span className="font-mono font-black text-slate-800">
                    {activeRecord?.endTime ? formatArabicTimeOnly(activeRecord.endTime) : (activeRecord ? 'جاري الآن...' : '--:--')}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">عدد الدقائق</span>
                  <span className="font-extrabold text-amber-700 font-mono">
                    {currentDurationMins} دقيقة
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">عدد الساعات</span>
                  <span className="font-extrabold text-amber-700 font-mono">
                    {currentDurationHours} ساعة
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">حالة الاعتماد</span>
                  <span className="font-extrabold text-slate-700">
                    {activeRecord?.status === 'approved'
                      ? 'مقبول ✅'
                      : activeRecord?.status === 'rejected'
                      ? 'مرفوض ❌'
                      : 'قيد الاعتماد ⏳'}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  disabled={loadingAction || (!!activeRecord && !activeRecord.endTime)}
                  onClick={handleStart}
                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    activeRecord && !activeRecord.endTime
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {loadingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 fill-white" />
                  )}
                  <span>بدء وقت إضافي</span>
                </button>

                <button
                  type="button"
                  disabled={loadingAction || !activeRecord || !!activeRecord.endTime}
                  onClick={handleEnd}
                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    !activeRecord || !!activeRecord.endTime
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                >
                  {loadingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Pause className="w-4 h-4 fill-white" />
                  )}
                  <span>إنهاء وقت إضافي</span>
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
