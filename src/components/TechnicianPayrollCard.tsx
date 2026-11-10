import React, { useState, useEffect, useMemo } from 'react';
import { DollarSign, ChevronDown, Eye, FileText, Info, X, Calculator, ShieldCheck, Award, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, AttendanceRecord, OvertimeRecord, LeaveRequest, PayrollPeriod, Task, ManualPointsRecord, FinancialAdjustment } from '../types';
import { generateCalculationDetails, CalculationDetails } from '../lib/payrollService';
import { hrEngine } from '../lib/hrEngine';
import { EmployeeRewardResult } from '../lib/rewardService';
import {
  getPayrollPeriods,
  getPayrollPeriodsCachedSync,
  getManualPointsCachedSync,
  getManualPoints,
  getCompanySettingsCachedSync,
  getCompanySettings,
  getAttendanceRecords,
  getAttendanceRecordsCachedSync,
  getOvertimeRecords,
  getOvertimeRecordsCachedSync,
  getLeaveRequests,
  getLeaveRequestsCachedSync,
  getFinancialAdjustments,
  getFinancialAdjustmentsCachedSync,
  subscribeAttendanceRecords,
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribePayrollPeriods,
  subscribeCompanySettings,
  subscribeFinancialAdjustments
} from '../lib/dbService';

interface TechnicianPayrollCardProps {
  employee: Employee;
  settings?: CompanySettings | null;
  tasks?: Task[];
  manualPoints?: ManualPointsRecord[];
  allEmployees?: Employee[];
}

export default function TechnicianPayrollCard({
  employee,
  settings: initialSettings,
  tasks: propsTasks = [],
  manualPoints: propsManualPoints,
  allEmployees: propsAllEmployees = []
}: TechnicianPayrollCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>(() => getAttendanceRecordsCachedSync());
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>(() => getOvertimeRecordsCachedSync());
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => getLeaveRequestsCachedSync());
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => initialSettings || getCompanySettingsCachedSync());
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>(() => getFinancialAdjustmentsCachedSync());

  const [tasksState, setTasksState] = useState<Task[]>(propsTasks);
  const [manualPointsState, setManualPointsState] = useState<ManualPointsRecord[]>(() => propsManualPoints || getManualPointsCachedSync());
  const [allEmployeesState, setAllEmployeesState] = useState<Employee[]>(propsAllEmployees);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCalculatedTime, setLastCalculatedTime] = useState<string>(() => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));

  // Real-time subscriptions to keep technician payroll automatically synchronized
  useEffect(() => {
    const unsubAtt = subscribeAttendanceRecords(
      (recs) => setAttendanceRecords(recs),
      (err) => console.warn('Attendance sync notice:', err)
    );
    const unsubOt = subscribeOvertimeRecords(
      (recs) => setOvertimeRecords(recs),
      (err) => console.warn('Overtime sync notice:', err)
    );
    const unsubLeaves = subscribeLeaveRequests(
      (recs) => setLeaveRequests(recs),
      (err) => console.warn('Leaves sync notice:', err)
    );
    const unsubPeriods = subscribePayrollPeriods(
      (periods) => {
        if (periods && periods.length > 0) setPayrollPeriods(periods);
      },
      (err) => console.warn('Periods sync notice:', err)
    );
    const unsubSettings = subscribeCompanySettings(
      (sets) => {
        if (sets) setCompanySettings(sets);
      },
      (err) => console.warn('Settings sync notice:', err)
    );
    const unsubAdjustments = subscribeFinancialAdjustments(
      (adjs) => {
        if (adjs) setFinancialAdjustments(adjs);
      },
      (err) => console.warn('Adjustments sync notice:', err)
    );

    // Initial on-demand load
    Promise.all([
      getAttendanceRecords(true),
      getOvertimeRecords(true),
      getLeaveRequests(true),
      getPayrollPeriods(true),
      getCompanySettings(),
      getFinancialAdjustments(true),
      propsManualPoints ? Promise.resolve(propsManualPoints) : getManualPoints()
    ]).then(([freshAtt, freshOt, freshLeaves, freshPeriods, freshSettings, freshAdjs, freshManualPoints]) => {
      if (freshAtt && freshAtt.length > 0) setAttendanceRecords(freshAtt);
      if (freshOt && freshOt.length > 0) setOvertimeRecords(freshOt);
      if (freshLeaves && freshLeaves.length > 0) setLeaveRequests(freshLeaves);
      if (freshPeriods && freshPeriods.length > 0) setPayrollPeriods(freshPeriods);
      if (freshSettings) setCompanySettings(freshSettings);
      if (freshAdjs) setFinancialAdjustments(freshAdjs);
      if (freshManualPoints) setManualPointsState(freshManualPoints);
    }).catch(err => console.warn('TechnicianPayrollCard initial load notice:', err));

    return () => {
      unsubAtt();
      unsubOt();
      unsubLeaves();
      unsubPeriods();
      unsubSettings();
      unsubAdjustments();
    };
  }, []);

  const handleManualRefresh = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsRefreshing(true);
    try {
      const [freshAtt, freshOt, freshLeaves, freshPeriods, freshSettings, freshAdjs, freshManualPoints] = await Promise.all([
        getAttendanceRecords(true).catch(() => attendanceRecords),
        getOvertimeRecords(true).catch(() => overtimeRecords),
        getLeaveRequests(true).catch(() => leaveRequests),
        getPayrollPeriods(true).catch(() => payrollPeriods),
        getCompanySettings().catch(() => companySettings),
        getFinancialAdjustments(true).catch(() => financialAdjustments),
        propsManualPoints ? Promise.resolve(propsManualPoints) : getManualPoints().catch(() => manualPointsState),
      ]);
      if (freshAtt) setAttendanceRecords(freshAtt);
      if (freshOt) setOvertimeRecords(freshOt);
      if (freshLeaves) setLeaveRequests(freshLeaves);
      if (freshPeriods) setPayrollPeriods(freshPeriods);
      if (freshSettings) setCompanySettings(freshSettings);
      if (freshAdjs) setFinancialAdjustments(freshAdjs);
      if (freshManualPoints) setManualPointsState(freshManualPoints);
      setLastCalculatedTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.warn('Manual payroll refresh warning:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Keep props in sync if passed
  useEffect(() => {
    if (propsTasks) setTasksState(propsTasks);
  }, [propsTasks]);

  useEffect(() => {
    if (propsManualPoints) setManualPointsState(propsManualPoints);
  }, [propsManualPoints]);

  useEffect(() => {
    if (propsAllEmployees) setAllEmployeesState(propsAllEmployees);
  }, [propsAllEmployees]);

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

  // Find active or open payroll period, or fallback to current month period (16th of prev/curr month to 15th of curr/next month)
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

  // Filter records for this employee
  const myAttendance = attendanceRecords.filter((r) => r.employeeId === employee.id && !r.isDeleted);
  const myOvertime = overtimeRecords.filter((r) => r.employeeId === employee.id && !r.isDeleted);
  const myLeaves = leaveRequests.filter((r) => r.employeeId === employee.id && !r.isDeleted);

  // Financial adjustments scoped strictly to the current active payroll cycle
  const myCycleAdjustments = useMemo(() => {
    if (!employee) return [];
    return financialAdjustments.filter((adj) => {
      if (adj.employeeId !== employee.id) return false;
      if (!activePeriod?.startDate || !activePeriod?.endDate) return true;
      return adj.date >= activePeriod.startDate && adj.date <= activePeriod.endDate;
    });
  }, [financialAdjustments, employee, activePeriod]);

  const directRewards = useMemo(() => myCycleAdjustments.filter(a => a.type === 'reward'), [myCycleAdjustments]);
  const directDeductions = useMemo(() => myCycleAdjustments.filter(a => a.type === 'deduction'), [myCycleAdjustments]);

  const directRewardsTotal = useMemo(() => directRewards.reduce((sum, a) => sum + (Number(a.amount) || 0), 0), [directRewards]);
  const directDeductionsTotal = useMemo(() => directDeductions.reduce((sum, a) => sum + (Number(a.amount) || 0), 0), [directDeductions]);

  // Calculate Reward Engine result for this employee
  const rewardResult: EmployeeRewardResult | null = useMemo(() => {
    if (!employee) return null;
    const empsList = allEmployeesState.length > 0 ? allEmployeesState : [employee];
    return hrEngine.getEmployeeRewardSummary({
      employeeId: employee.id,
      employees: empsList,
      tasks: tasksState,
      manualPoints: manualPointsState,
      rewardPoolPercentage: companySettings?.rewardPoolPercentage ?? 5,
      rewardPointValue: companySettings?.rewardPointValue ?? 35,
      startDate: activePeriod.startDate,
      endDate: activePeriod.endDate,
    });
  }, [employee, allEmployeesState, tasksState, manualPointsState, companySettings, activePeriod]);

  // Extract monetary reward or deduction from Reward Engine
  const rawRewardAmount = rewardResult?.isEligible ? (rewardResult.rewardAmount || 0) : 0;
  const rewardBonus = rawRewardAmount > 0 ? rawRewardAmount : 0;
  const rewardDeduction = rawRewardAmount < 0 ? Math.abs(rawRewardAmount) : 0;

  // Generate calculation details using payrollService pure logic
  const calcDetails: CalculationDetails = generateCalculationDetails({
    employeeId: employee.id,
    employeeName: employee.name,
    employee: employee,
    baseSalary: employee.baseSalary || 0,
    period: activePeriod,
    attendanceRecords: myAttendance,
    leaveRequests: myLeaves,
    overtimeRecords: myOvertime,
    advances: 0,
    bonuses: directRewardsTotal,
    manualDeductions: directDeductionsTotal,
    overtimeHourlyRate: effectiveSettings.overtimeHourlyRate,
    settings: effectiveSettings,
  });

  // Combine payroll Service totals with Reward Engine output
  const totalRewardsAmount = directRewardsTotal + rewardBonus;
  const effectiveTotalAdditions = calcDetails.totalAdditions + rewardBonus;
  const effectiveTotalDeductions = calcDetails.totalDeductions + rewardDeduction;
  const effectiveNetSalary = Math.max(
    0,
    (employee.baseSalary || 0) + effectiveTotalAdditions - effectiveTotalDeductions
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs transition-all">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-right">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>الراتب المتوقع</span>
              <span className="bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">
                تلقائي ومباشر
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              احتساب الراتب المبدئي، الخصومات والمكافآت التقديرية لدورة العمل الحالية
            </p>
          </div>
        </div>

          <div className="flex items-center gap-2">
            <div
              onClick={handleManualRefresh}
              title={`تحديث الحساب (آخر احتساب: ${lastCalculatedTime})`}
              className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              <span className="hidden sm:inline">تحديث</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs px-3 py-2 rounded-xl">
              <span>{isOpen ? 'إخفاء' : 'عرض التفاصيل'}</span>
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
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
              
              {/* Financial Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-slate-50/80 border border-slate-100 p-3.5 rounded-2xl">
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">الراتب الأساسي</span>
                  <span className="text-lg font-black text-slate-800 font-mono">
                    {(employee.baseSalary || 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold mr-1">د.ع</span>
                </div>

                <div className="bg-purple-50/70 border border-purple-100 p-3.5 rounded-2xl">
                  <span className="text-purple-700 text-[10px] font-bold block mb-1 flex items-center gap-1">
                    <Award className="w-3 h-3 text-purple-600 shrink-0" />
                    <span>مجموع المكافآت</span>
                  </span>
                  <span className="text-lg font-black text-purple-800 font-mono">
                    +{totalRewardsAmount.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-purple-600 font-bold mr-1">د.ع</span>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-100 p-3.5 rounded-2xl">
                  <span className="text-emerald-600 text-[10px] font-bold block mb-1">مجموع الإضافات</span>
                  <span className="text-lg font-black text-emerald-800 font-mono">
                    +{effectiveTotalAdditions.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-emerald-600 font-bold mr-1">د.ع</span>
                </div>

                <div className="bg-red-50/60 border border-red-100 p-3.5 rounded-2xl">
                  <span className="text-red-600 text-[10px] font-bold block mb-1">مجموع الخصومات</span>
                  <span className="text-lg font-black text-red-800 font-mono">
                    -{effectiveTotalDeductions.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-red-600 font-bold mr-1">د.ع</span>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl col-span-2 md:col-span-1">
                  <span className="text-blue-700 text-[10px] font-black block mb-1">صافي الراتب المتوقع</span>
                  <span className="text-xl font-black text-blue-900 font-mono">
                    {effectiveNetSalary.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-blue-700 font-black mr-1">د.ع</span>
                </div>
              </div>

              {/* Show Details Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(true)}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-black text-xs py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Eye className="w-4 h-4" />
                  <span>عرض تفاصيل الحساب والمعادلة</span>
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Modal */}
      <AnimatePresence>
        {isDetailsOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden border border-blue-100 max-h-[90vh] flex flex-col my-auto"
            >
              {/* Header */}
              <div className="bg-blue-700 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-blue-200" />
                  <h3 className="font-extrabold text-sm">تفاصيل احتساب الراتب للموظف: {employee.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(false)}
                  className="p-1 hover:bg-blue-600 rounded-lg text-blue-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs text-slate-800">
                
                {/* Engine Version Header */}
                <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-slate-500">نسخة محرك الرواتب والمكافآت:</span>
                  <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md text-[11px]">
                    {calcDetails.calculationVersion || 'PayrollEngine_v1.0'} + RewardEngine
                  </span>
                </div>

                {/* Section 1: Cycle & Rates */}
                <div>
                  <h4 className="font-black text-slate-800 text-xs mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>بيانات دورة الرواتب والأسعار:</span>
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-slate-400 text-[10px] block">عدد أيام الدورة الفعلية:</span>
                      <span className="font-bold text-slate-800 font-mono">{calcDetails.cycleDays} يوماً</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">قيمة اليوم الفعلي:</span>
                      <span className="font-bold text-slate-800 font-mono">{Math.round(calcDetails.dailyRate).toLocaleString()} د.ع</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">سعر الساعة التقديري:</span>
                      <span className="font-bold text-slate-800 font-mono">{Math.round(calcDetails.dailyRate / 8).toLocaleString()} د.ع</span>
                    </div>
                  </div>
                </div>

                {/* Section 2: Deductions Breakdown */}
                <div>
                  <h4 className="font-black text-slate-800 text-xs mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                    <Info className="w-4 h-4 text-red-600" />
                    <span>تفاصيل الخصومات والاستقطاعات:</span>
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>تأخير الحضور ({calcDetails.lateMinutes} دقيقة):</span>
                      <span className="font-mono font-bold text-red-700">-{calcDetails.lateDeduction.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>الخروج المبكر ({calcDetails.earlyCheckoutMinutes || 0} دقيقة):</span>
                      <span className="font-mono font-bold text-red-700">-{(calcDetails.earlyCheckoutDeduction || 0).toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>عدم بصمة الخروج ({calcDetails.missingCheckOutCount || 0} مرات):</span>
                      <span className="font-mono font-bold text-red-700">-{(calcDetails.missingCheckOutDeduction || 0).toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>أيام الغياب بدون عذر ({calcDetails.absenceDays} يوم):</span>
                      <span className="font-mono font-bold text-red-700">-{calcDetails.absenceDeduction.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>إجازات بدون راتب ({calcDetails.unpaidLeaveDays} يوم):</span>
                      <span className="font-mono font-bold text-red-700">-{calcDetails.unpaidLeaveDeduction.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>أيام غير على رأس العمل ({calcDetails.notEmployedDays || 0} يوم):</span>
                      <span className="font-mono font-bold text-red-700">-{(calcDetails.notEmployedDeduction || 0).toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>استقطاع السلف:</span>
                      <span className="font-mono font-bold text-red-700">-{(calcDetails.advances || 0).toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-red-50/40 rounded-lg">
                      <span>الخصومات اليدوية الإدارية:</span>
                      <span className="font-mono font-bold text-red-700">-{(calcDetails.manualDeductions || 0).toLocaleString()} د.ع</span>
                    </div>

                    {rewardDeduction > 0 && (
                      <div className="flex justify-between p-2 bg-rose-100/80 border border-rose-200 rounded-lg font-bold text-rose-900">
                        <span>خصم نظام النقاط والأداء (Reward Engine):</span>
                        <span className="font-mono font-black text-rose-700">-{rewardDeduction.toLocaleString()} د.ع</span>
                      </div>
                    )}

                    <div className="flex justify-between p-2.5 bg-red-100/60 rounded-xl font-black text-red-900 mt-2">
                      <span>إجمالي الخصومات المستقطعة:</span>
                      <span className="font-mono">-{effectiveTotalDeductions.toLocaleString()} د.ع</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Additions Breakdown */}
                <div>
                  <h4 className="font-black text-slate-800 text-xs mb-2 flex items-center gap-1.5 border-b border-slate-100 pb-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>تفاصيل الإضافات والمستحقات:</span>
                  </h4>
                  <div className="space-y-1.5">
                    <div className="flex justify-between p-2 bg-emerald-50/40 rounded-lg">
                      <span>الوقت الإضافي ({calcDetails.overtimeMinutes} دقيقة / {(calcDetails.overtimeMinutes / 60).toFixed(1)} ساعة):</span>
                      <span className="font-mono font-bold text-emerald-700">+{calcDetails.overtimeAddition.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-emerald-50/40 rounded-lg">
                      <span>المكافآت والحوافز المباشرة:</span>
                      <span className="font-mono font-bold text-emerald-700">+{calcDetails.bonuses.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2 bg-purple-50/70 border border-purple-100 rounded-lg font-bold text-purple-900">
                      <span>مكافأة النقاط والأداء التقديرية (Reward Engine):</span>
                      <span className="font-mono font-black text-purple-700">+{rewardBonus.toLocaleString()} د.ع</span>
                    </div>

                    <div className="flex justify-between p-2.5 bg-emerald-100/60 rounded-xl font-black text-emerald-900 mt-2">
                      <span>إجمالي الإضافات:</span>
                      <span className="font-mono">+{effectiveTotalAdditions.toLocaleString()} د.ع</span>
                    </div>
                  </div>
                </div>

                {/* Section 4: Final Net Expected Salary */}
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="font-extrabold text-blue-900 text-sm block">صافي الراتب المستحق والمتوقع:</span>
                    <span className="text-[10px] text-blue-700">معادلة: الراتب الأساسي + الإضافات - الخصومات</span>
                  </div>
                  <div className="text-left">
                    <span className="text-2xl font-black text-blue-900 font-mono">
                      {effectiveNetSalary.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-blue-700 mr-1">د.ع</span>
                  </div>
                </div>

              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDetailsOpen(false)}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-3 rounded-xl transition-colors cursor-pointer"
                >
                  إغلاق نافذة التفاصيل
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
