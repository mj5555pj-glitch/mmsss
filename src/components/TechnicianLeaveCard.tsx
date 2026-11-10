import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ChevronDown, CheckCircle2, AlertCircle, RefreshCw, Send, Plus, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, LeaveRequest, PayrollPeriod } from '../types';
import { calculateLeaveBalance, canRequestLeave } from '../lib/leaveService';
import {
  subscribeLeaveRequests,
  createLeaveRequest,
  subscribeCompanySettings,
  subscribePayrollPeriods,
  getPayrollPeriods,
  getPayrollPeriodsCachedSync
} from '../lib/dbService';

interface TechnicianLeaveCardProps {
  employee: Employee;
  settings?: CompanySettings | null;
}

export default function TechnicianLeaveCard({ employee, settings: initialSettings }: TechnicianLeaveCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(initialSettings || null);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [leaveType, setLeaveType] = useState<'paid' | 'unpaid'>('paid');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');

  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to Company Settings
  useEffect(() => {
    const unsubSettings = subscribeCompanySettings(
      (sets) => {
        if (sets) setCompanySettings(sets);
      },
      (err) => console.warn('LeaveCard settings error:', err)
    );
    return () => unsubSettings();
  }, []);

  // Subscribe to Leave Requests
  useEffect(() => {
    const unsubLeaves = subscribeLeaveRequests(
      (recs) => {
        setLeaveRequests(recs);
      },
      (err) => console.warn('LeaveCard requests error:', err)
    );
    return () => unsubLeaves();
  }, []);

  // Subscribe to Payroll Periods
  useEffect(() => {
    const unsubPeriods = subscribePayrollPeriods(
      (periods) => {
        if (periods && periods.length > 0) setPayrollPeriods(periods);
      },
      (err) => console.warn('LeaveCard periods error:', err)
    );
    getPayrollPeriods().then(periods => {
      if (periods && periods.length > 0) setPayrollPeriods(periods);
    }).catch(err => console.warn('LeaveCard get periods error:', err));
    return () => unsubPeriods();
  }, []);

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
    salaryCycleStartDay: 16,
    salaryCycleEndDay: 15,
    paidLeavesPerCycle: 2,
    unpaidLeavesPerCycle: 2,
    overtimeHourlyRate: 5000,
  };

  // Find active or open payroll period
  const activePeriod: PayrollPeriod = useMemo(() => {
    const found = payrollPeriods.find((p) => p.status === 'open');
    if (found) return found;

    const now = new Date();
    const curD = now.getDate();
    let startM = now.getMonth();
    let startY = now.getFullYear();
    if (curD < 16) {
      startM -= 1;
      if (startM < 0) {
        startM = 11;
        startY -= 1;
      }
    }
    const endM = startM === 11 ? 0 : startM + 1;
    const endY = startM === 11 ? startY + 1 : startY;

    const startDate = `${startY}-${String(startM + 1).padStart(2, '0')}-16`;
    const endDate = `${endY}-${String(endM + 1).padStart(2, '0')}-15`;
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    const diffTime = Math.abs(endObj.getTime() - startObj.getTime());
    const actualDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return {
      id: `period_${startY}_${String(startM + 1).padStart(2, '0')}`,
      startDate,
      endDate,
      actualDays: actualDays || 30,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
  }, [payrollPeriods]);

  // Filter for employee and calculate balances specifically for the active payroll cycle
  const myLeaves = leaveRequests.filter((r) => r.employeeId === employee.id && !r.isDeleted);

  const myCurrentCycleApprovedLeaves = myLeaves.filter((r) => {
    if (r.status !== 'approved') return false;
    const lStart = r.startDate;
    const lEnd = r.endDate || r.startDate;
    return lStart <= activePeriod.endDate && lEnd >= activePeriod.startDate;
  });

  const approvedPaidCount = myCurrentCycleApprovedLeaves
    .filter((r) => r.type === 'paid')
    .reduce((sum, r) => sum + (r.totalDays || 0), 0);

  const approvedUnpaidCount = myCurrentCycleApprovedLeaves
    .filter((r) => r.type === 'unpaid')
    .reduce((sum, r) => sum + (r.totalDays || 0), 0);

  const balance = calculateLeaveBalance(approvedPaidCount, approvedUnpaidCount, effectiveSettings);

  // Calculate requested total days inclusive
  const calculateDaysBetween = (s: string, e: string): number => {
    const start = new Date(s);
    const end = new Date(e);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const requestedDays = calculateDaysBetween(startDate, endDate);

  // Handle Leave Request Submission
  const handleSubmitLeaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (employee.status === 'suspended') {
      setModalError('عذراً، حسابك موقوف عن العمل حالياً ولا يمكنك تقديم طلب إجازة.');
      return;
    }

    if (!reason.trim()) {
      setModalError('يرجى كتابة سبب طلب الإجازة.');
      return;
    }

    // Validate using leaveService pure function
    const validation = canRequestLeave(
      leaveType,
      requestedDays,
      approvedPaidCount,
      approvedUnpaidCount,
      effectiveSettings,
      true
    );

    if (!validation.allowed) {
      setModalError(validation.reason || 'لا يمكن تقديم طلب الإجازة.');
      return;
    }

    setLoadingAction(true);
    try {
      const newRequest: LeaveRequest = {
        id: `leave_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        employeeId: employee.id,
        employeeName: employee.name,
        type: leaveType,
        startDate,
        endDate,
        totalDays: requestedDays,
        reason: reason.trim(),
        status: 'pending',
        requestedAt: new Date().toISOString(),
      };

      await createLeaveRequest(newRequest);

      setMessage({
        type: 'success',
        text: `تم تقديم طلب الإجازة (${requestedDays} يوم - ${leaveType === 'paid' ? 'مدفوعة' : 'بدون راتب'}) بنجاح، بانتظار موافقة الإدارة.`,
      });

      setIsModalOpen(false);
      setReason('');
    } catch (err: any) {
      setModalError(err.message || 'حدث خطأ أثناء تقديم طلب الإجازة.');
    } finally {
      setLoadingAction(false);
    }
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
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold shrink-0">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-right">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>الإجازات</span>
              {myLeaves.some((l) => l.status === 'pending') && (
                <span className="bg-purple-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  طلب قيد الانتظار
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              عرض رصيد الإجازات المتبقية وتقديم طلبات الإجازة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs px-3 py-2 rounded-xl">
          <span>{isOpen ? 'إخفاء' : 'عرض والتسجيل'}</span>
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
              
              {/* Payroll Cycle Renewal Notice */}
              <div className="bg-purple-50/70 border border-purple-200/70 rounded-2xl p-3 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-purple-900 font-bold">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>دورة الرواتب الحالية: {activePeriod.startDate} إلى {activePeriod.endDate}</span>
                </div>
                <span className="text-[11px] font-black text-purple-700 bg-purple-100/80 px-2.5 py-0.5 rounded-full">
                  يتجدد الرصيد كل دورة
                </span>
              </div>

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

              {/* Leave Balances Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-purple-50/60 border border-purple-100 p-3.5 rounded-2xl">
                  <span className="text-purple-600 text-[10px] font-bold block mb-1">الإجازات المدفوعة المستخدمة</span>
                  <span className="text-xl font-black text-purple-900">{balance.usedPaidLeaves}</span>
                  <span className="text-[10px] text-purple-600 font-bold mr-1">من {balance.maxPaidLeaves} يوم</span>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl">
                  <span className="text-emerald-600 text-[10px] font-bold block mb-1">الإجازات المدفوعة المتبقية</span>
                  <span className="text-xl font-black text-emerald-900">{balance.remainingPaidLeaves}</span>
                  <span className="text-[10px] text-emerald-600 font-bold mr-1">يوم متاح</span>
                </div>

                <div className="bg-amber-50/60 border border-amber-100 p-3.5 rounded-2xl">
                  <span className="text-amber-600 text-[10px] font-bold block mb-1">الإجازات بدون راتب المستخدمة</span>
                  <span className="text-xl font-black text-amber-900">{balance.usedUnpaidLeaves}</span>
                  <span className="text-[10px] text-amber-600 font-bold mr-1">من {balance.maxUnpaidLeaves} يوم</span>
                </div>

                <div className="bg-blue-50/60 border border-blue-100 p-3.5 rounded-2xl">
                  <span className="text-blue-600 text-[10px] font-bold block mb-1">المتبقية بدون راتب</span>
                  <span className="text-xl font-black text-blue-900">{balance.remainingUnpaidLeaves}</span>
                  <span className="text-[10px] text-blue-600 font-bold mr-1">يوم متاح</span>
                </div>
              </div>

              {/* Request Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(true);
                    setModalError(null);
                  }}
                  className="w-full bg-purple-700 hover:bg-purple-800 text-white font-black text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>تقديم طلب إجازة جديدة</span>
                </button>
              </div>

              {/* My Recent Requests History */}
              {myLeaves.length > 0 && (
                <div className="pt-3 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">طلبات الإجازة السابقة:</h4>
                  <div className="space-y-2">
                    {myLeaves.slice(0, 3).map((l) => (
                      <div key={l.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-slate-800">
                            {l.type === 'paid' ? '🌴 إجازة مدفوعة' : '📄 إجازة بدون راتب'} ({l.totalDays} يوم)
                          </p>
                          <p className="text-[10px] text-slate-400">
                            من {l.startDate} إلى {l.endDate} - {l.reason}
                          </p>
                        </div>
                        <div>
                          {l.status === 'approved' && <span className="bg-emerald-50 text-emerald-800 font-extrabold px-2 py-0.5 rounded-md text-[10px]">معتمدة</span>}
                          {l.status === 'rejected' && <span className="bg-red-50 text-red-800 font-extrabold px-2 py-0.5 rounded-md text-[10px]">مرفوضة</span>}
                          {l.status === 'pending' && <span className="bg-amber-50 text-amber-800 font-extrabold px-2 py-0.5 rounded-md text-[10px]">قيد المراجعة</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Sheet for Leave Request */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-purple-100"
            >
              <div className="bg-purple-700 p-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-purple-200" />
                  <h3 className="font-extrabold text-sm">طلب إجازة جديدة</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-purple-600 rounded-lg text-purple-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitLeaveRequest} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Leave Type Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع الإجازة *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setLeaveType('paid')}
                      className={`p-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        leaveType === 'paid'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      🌴 إجازة مدفوعة (متبقي: {balance.remainingPaidLeaves})
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveType('unpaid')}
                      className={`p-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                        leaveType === 'unpaid'
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      📄 بدون راتب (متبقي: {balance.remainingUnpaidLeaves})
                    </button>
                  </div>
                </div>

                {/* Dates Selection */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ البداية *</label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-slate-800 font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ النهاية *</label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-slate-800 font-bold"
                    />
                  </div>
                </div>

                <div className="bg-purple-50 p-2.5 rounded-xl text-xs font-bold text-purple-900 flex justify-between">
                  <span>إجمالي عدد الأيام المطلوبة:</span>
                  <span className="font-black text-purple-950 font-mono">{requestedDays} يوم</span>
                </div>

                {/* Reason Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">سبب الإجازة *</label>
                  <textarea
                    rows={3}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="اكتب سبب طلب الإجازة والتفاصيل..."
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-slate-800 font-medium"
                  ></textarea>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={loadingAction}
                    className="flex-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {loadingAction ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>إرسال الطلب</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
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
