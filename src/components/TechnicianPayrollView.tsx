import React, { useState, useEffect, useMemo } from 'react';
import { 
  DollarSign, ChevronDown, Calculator, 
  RefreshCw, CheckCircle2, AlertCircle, TrendingDown, TrendingUp,
  Gift, MinusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, AttendanceRecord, OvertimeRecord, LeaveRequest, PayrollPeriod, Task, ManualPointsRecord, FinancialAdjustment } from '../types';
import { generateCalculationDetails, CalculationDetails } from '../lib/payrollService';
import { hrEngine } from '../lib/hrEngine';
import { EmployeeRewardResult } from '../lib/rewardService';
import {
  subscribeAttendanceRecords,
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribeCompanySettings,
  subscribeFinancialAdjustments,
  getPayrollPeriods,
  getPayrollPeriodsCachedSync,
  getFinancialAdjustments,
  getFinancialAdjustmentsCachedSync,
  getManualPointsCachedSync,
  getManualPoints
} from '../lib/dbService';

interface TechnicianPayrollViewProps {
  employee: Employee | undefined;
  settings?: CompanySettings | null;
  tasks?: Task[];
  manualPoints?: ManualPointsRecord[];
  allEmployees?: Employee[];
  onRefreshPayroll?: () => Promise<void> | void;
}

export default function TechnicianPayrollView({
  employee,
  settings: initialSettings,
  tasks: propsTasks = [],
  manualPoints: propsManualPoints,
  allEmployees: propsAllEmployees = [],
  onRefreshPayroll
}: TechnicianPayrollViewProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshMessage, setRefreshMessage] = useState<string>('');

  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(initialSettings || null);
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>(() => getFinancialAdjustmentsCachedSync());

  const [tasksState, setTasksState] = useState<Task[]>(propsTasks);
  const [manualPointsState, setManualPointsState] = useState<ManualPointsRecord[]>(() => propsManualPoints || getManualPointsCachedSync());
  const [allEmployeesState, setAllEmployeesState] = useState<Employee[]>(propsAllEmployees);

  // Lazy-load data when view mounts
  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getPayrollPeriods(),
      getFinancialAdjustments(),
      !propsManualPoints ? getManualPoints() : Promise.resolve(null)
    ]).then(([periods, adjs, mPoints]) => {
      if (!isMounted) return;
      if (periods) setPayrollPeriods(periods);
      if (adjs) setFinancialAdjustments(adjs);
      if (mPoints) setManualPointsState(mPoints);
    }).catch(err => console.warn('TechnicianPayrollView lazy load notice:', err));

    const unsubSettings = subscribeCompanySettings((sets) => { if (sets) setCompanySettings(sets); }, () => {});
    const unsubAttendance = subscribeAttendanceRecords((recs) => setAttendanceRecords(recs), () => {});
    const unsubOvertime = subscribeOvertimeRecords((recs) => setOvertimeRecords(recs), () => {});
    const unsubLeaves = subscribeLeaveRequests((recs) => setLeaveRequests(recs), () => {});
    const unsubAdjustments = subscribeFinancialAdjustments((adjs) => setFinancialAdjustments(adjs), () => {});

    return () => {
      isMounted = false;
      unsubSettings();
      unsubAttendance();
      unsubOvertime();
      unsubLeaves();
      unsubAdjustments();
    };
  }, [propsManualPoints]);

  // Keep props in sync
  useEffect(() => {
    if (propsTasks) setTasksState(propsTasks);
  }, [propsTasks]);

  useEffect(() => {
    if (propsManualPoints) setManualPointsState(propsManualPoints);
  }, [propsManualPoints]);

  useEffect(() => {
    if (propsAllEmployees) setAllEmployeesState(propsAllEmployees);
  }, [propsAllEmployees]);

  // Manual Refresh Handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMessage('');
    try {
      if (onRefreshPayroll) {
        await onRefreshPayroll();
      } else {
        const [periods, adjs, mPoints] = await Promise.all([
          getPayrollPeriods(true),
          getFinancialAdjustments(true),
          getManualPoints(true)
        ]);
        if (periods) setPayrollPeriods(periods);
        if (adjs) setFinancialAdjustments(adjs);
        if (mPoints) setManualPointsState(mPoints);
      }
      setRefreshMessage('تم تحديث مسير وبيانات الراتب بنجاح من السحابة');
      setTimeout(() => setRefreshMessage(''), 3000);
    } catch (err) {
      console.error('Error refreshing payroll:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // Filter records for this employee
  const myAttendance = attendanceRecords.filter((r) => r.employeeId === employee?.id && !r.isDeleted);
  const myOvertime = overtimeRecords.filter((r) => r.employeeId === employee?.id && !r.isDeleted);
  const myLeaves = leaveRequests.filter((r) => r.employeeId === employee?.id && !r.isDeleted);

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

  // Calculate Reward Engine result
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
  const calcDetails: CalculationDetails = useMemo(() => {
    if (!employee) {
      return {
        calculationVersion: 'v1.0',
        employeeId: '',
        employeeName: '',
        periodId: activePeriod.id,
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate,
        cycleDays: activePeriod.actualDays || 30,
        baseSalary: 0,
        dailyRate: 0,
        hourlyRate: 0,
        perMinuteRate: 0,
        lateMinutes: 0,
        lateDeduction: 0,
        earlyCheckoutMinutes: 0,
        earlyCheckoutDeduction: 0,
        unpaidLeaveDays: 0,
        unpaidLeaveDeduction: 0,
        absenceDays: 0,
        absenceDeduction: 0,
        advances: 0,
        manualDeductions: 0,
        paidLeaveDays: 0,
        overtimeMinutes: 0,
        overtimeAddition: 0,
        bonuses: 0,
        allowances: 0,
        totalAdditions: 0,
        totalDeductions: 0,
        netSalary: 0,
      };
    }
    return generateCalculationDetails({
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
  }, [employee, activePeriod, myAttendance, myLeaves, myOvertime, effectiveSettings, directRewardsTotal, directDeductionsTotal]);

  if (!employee) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4" dir="rtl">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-lg">لم يتم العثور على حساب الموظف</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          يرجى التأكد من تسجيل الدخول بحساب موظف نشط في النظام.
        </p>
      </div>
    );
  }

  const baseSalary = employee.baseSalary || 0;
  const overtimePay = calcDetails.overtimeAddition;
  const effectiveTotalAdditions = calcDetails.totalAdditions + rewardBonus;
  const effectiveTotalDeductions = calcDetails.totalDeductions + rewardDeduction;
  const netPay = Math.max(0, baseSalary + effectiveTotalAdditions - effectiveTotalDeductions);

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Top Header & Refresh Control */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-slate-800 text-lg">واجهة الراتب والمستحقات المالية</h2>
            <p className="text-xs text-slate-500">
              تتحدث بيانات الراتب يومياً مع إمكانية التحديث المباشر عند الحاجة
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-black text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'جاري تحديث الراتب...' : 'تحديث الراتب'}</span>
          </button>
        </div>
      </div>

      {refreshMessage && (
        <div className="bg-emerald-50 text-emerald-800 text-xs font-bold p-3 px-4 rounded-2xl border border-emerald-200 flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{refreshMessage}</span>
        </div>
      )}

      {/* Hero Salary Card */}
      <div className="bg-gradient-to-l from-emerald-800 to-teal-800 text-white p-6 md:p-7 rounded-3xl shadow-sm relative overflow-hidden space-y-4">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-16 translate-x-16 blur-2xl"></div>

        <div className="flex items-center justify-between z-10 relative">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-emerald-200">الدورة المالية الحالية:</span>
              <span className="text-xs font-bold bg-white/15 px-2.5 py-0.5 rounded-full">
                {activePeriod.startDate} إلى {activePeriod.endDate}
              </span>
            </div>
            <p className="text-[11px] text-emerald-100">
              عدد أيام الدورة المعتمدة: {activePeriod.actualDays || calcDetails.cycleDays} يوماً
            </p>
          </div>
          <span className="bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 text-xs font-black px-3 py-1 rounded-xl">
            مفتوحة
          </span>
        </div>

        <div className="pt-2 z-10 relative">
          <p className="text-xs font-bold text-emerald-200 mb-1">صافي الراتب التقديري المستحق</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl md:text-5xl font-black font-mono tracking-tight text-white">
              {netPay.toLocaleString()}
            </h3>
            <span className="text-sm font-bold text-emerald-200">د.ع</span>
          </div>
        </div>

        {/* Breakdown bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-emerald-600/40 z-10 relative">
          <div className="bg-white/10 rounded-2xl p-2.5">
            <p className="text-[10px] text-emerald-200 font-bold">الراتب الأساسي</p>
            <p className="text-sm font-black font-mono mt-0.5">{baseSalary.toLocaleString()} د.ع</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-2.5">
            <p className="text-[10px] text-emerald-200 font-bold">أجر العمل الإضافي</p>
            <p className="text-sm font-black font-mono mt-0.5 text-emerald-200">+{overtimePay.toLocaleString()} د.ع</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-2.5">
            <p className="text-[10px] text-emerald-200 font-bold">مكافأة الإنجاز والنقاط</p>
            <p className="text-sm font-black font-mono mt-0.5 text-amber-300">+{rewardBonus.toLocaleString()} د.ع</p>
          </div>
          <div className="bg-white/10 rounded-2xl p-2.5">
            <p className="text-[10px] text-emerald-200 font-bold">إجمالي الاستقطاعات</p>
            <p className="text-sm font-black font-mono mt-0.5 text-red-300">-{effectiveTotalDeductions.toLocaleString()} د.ع</p>
          </div>
        </div>
      </div>

      {/* Salary Detailed Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Entitlements Card (الاستحقاقات) */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h3 className="font-black text-slate-800 text-sm">تفاصيل الاستحقاقات والمكافآت</h3>
            </div>
            <span className="text-xs font-black text-emerald-700 font-mono">
              +{effectiveTotalAdditions.toLocaleString()} د.ع
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">الراتب الأساسي الشهري:</span>
              <span className="font-black text-slate-800 font-mono">{baseSalary.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">أجر العمل الإضافي المعتمد ({((calcDetails.overtimeMinutes || 0) / 60).toFixed(1)} س):</span>
              <span className="font-black text-emerald-700 font-mono">+{overtimePay.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">حافز النقاط والإنجاز ({rewardResult?.totalPoints.toFixed(1) || 0} نقطة):</span>
              <span className="font-black text-amber-700 font-mono">+{rewardBonus.toLocaleString()} د.ع</span>
            </div>

            {/* Direct Financial Rewards in Current Cycle */}
            {directRewards.length > 0 && (
              <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/80 space-y-2 mt-2">
                <div className="flex items-center justify-between font-black text-emerald-900 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>مكافآت مالية مباشرة (الدورة الحالية):</span>
                  </span>
                  <span className="font-mono">+{directRewardsTotal.toLocaleString()} د.ع</span>
                </div>
                <div className="space-y-1.5">
                  {directRewards.map((rew) => (
                    <div key={rew.id} className="flex items-center justify-between text-[10.5px] bg-white/80 p-2 rounded-xl border border-emerald-100">
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">{rew.reason || 'مكافأة مباشرة'}</p>
                        <p className="text-[9.5px] text-slate-400 font-mono">{rew.date}</p>
                      </div>
                      <span className="font-mono font-black text-emerald-700">+{Number(rew.amount).toLocaleString()} د.ع</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Deductions Card (الاستقطاعات) */}
        <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-red-50 text-red-700 flex items-center justify-center font-bold">
                <TrendingDown className="w-4 h-4" />
              </div>
              <h3 className="font-black text-slate-800 text-sm">تفاصيل الاستقطاعات والخصومات</h3>
            </div>
            <span className="text-xs font-black text-red-700 font-mono">
              -{effectiveTotalDeductions.toLocaleString()} د.ع
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">استقطاع التأخير الصباحي ({calcDetails.lateMinutes} دقيقة):</span>
              <span className="font-black text-red-600 font-mono">-{calcDetails.lateDeduction.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">استقطاع الغياب غير المبرر ({calcDetails.absenceDays} يوم):</span>
              <span className="font-black text-red-600 font-mono">-{calcDetails.absenceDeduction.toLocaleString()} د.ع</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-50">
              <span className="text-slate-500">أيام الإجازة المدفوعة المستهلكة:</span>
              <span className="font-bold text-slate-700">{calcDetails.paidLeaveDays} من أصل {effectiveSettings.paidLeavesPerCycle}</span>
            </div>

            {/* Direct Financial Deductions in Current Cycle */}
            {directDeductions.length > 0 && (
              <div className="bg-red-50/70 p-3 rounded-2xl border border-red-200/80 space-y-2 mt-2">
                <div className="flex items-center justify-between font-black text-red-900 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <MinusCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>خصومات مالية مباشرة (الدورة الحالية):</span>
                  </span>
                  <span className="font-mono">-{directDeductionsTotal.toLocaleString()} د.ع</span>
                </div>
                <div className="space-y-1.5">
                  {directDeductions.map((ded) => (
                    <div key={ded.id} className="flex items-center justify-between text-[10.5px] bg-white/80 p-2 rounded-xl border border-red-100">
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-800">{ded.reason || 'خصم مالي'}</p>
                        <p className="text-[9.5px] text-slate-400 font-mono">{ded.date}</p>
                      </div>
                      <span className="font-mono font-black text-red-700">-{Number(ded.amount).toLocaleString()} د.ع</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calculation Transparency Details Modal Toggle */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          className="w-full flex items-center justify-between text-xs font-bold text-slate-700 hover:text-slate-900 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <span>عرض تفاصيل ومصفوفة معادلات احتساب الراتب للموظف</span>
          </div>
          <ChevronDown className={`w-4 h-4 transition-transform ${isDetailsOpen ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {isDetailsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="pt-4 mt-3 border-t border-slate-100 space-y-3 text-xs text-slate-600"
            >
              <div className="bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-200">
                <p className="font-bold text-slate-800">معادلة احتساب أجر اليوم وساعة العمل:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>• أجر اليوم = الراتب الأساسي ÷ {calcDetails.cycleDays} = {Math.round(calcDetails.dailyRate).toLocaleString()} د.ع</div>
                  <div>• أجر الساعة = أجر اليوم ÷ 8 ساعات = {Math.round(calcDetails.hourlyRate).toLocaleString()} د.ع</div>
                  <div>• أجر الدقيقة = أجر الساعة ÷ 60 دقيقة = {calcDetails.perMinuteRate.toFixed(2)} د.ع</div>
                  <div>• أجر دقيقة الإضافي = نفس أجر دقيقة الدورة ({calcDetails.perMinuteRate.toFixed(2)} د.ع)</div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                * تم تطبيق جميع القواعد الصارمة لنظام FutureX HR مع مراعاة فترات السماح (15 دقيقة) والإجازات المدفوعة الرسمية المعتمدة.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
