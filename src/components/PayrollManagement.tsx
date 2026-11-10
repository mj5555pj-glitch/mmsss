import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  Lock,
  Unlock,
  Check,
  Eye,
  HelpCircle,
  Download,
  RefreshCw,
  Sparkles,
  ChevronLeft,
  ChevronDown,
  User,
  Clock,
  AlertCircle,
  Users,
  TrendingUp,
  TrendingDown,
  Info,
  Archive,
  ArrowLeftRight,
  Edit,
  Plus,
  Trash2,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getEffectiveWorkDateStr } from '../utils';
import {
  Employee,
  PayrollPeriod,
  PayrollRecord,
  OvertimeRecord,
  LeaveRequest,
  AttendanceRecord,
  CompanySettings,
  AuditLogEntry,
  Task,
  ManualPointsRecord,
  FinancialAdjustment
} from '../types';
import {
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribeAttendanceRecords,
  subscribeCompanySettings,
  getCompanySettingsCachedSync,
  subscribeTasks,
  getPayrollPeriods,
  getPayrollPeriodsCachedSync,
  getPayrollRecords,
  getPayrollRecordsCachedSync,
  getFinancialAdjustments,
  getFinancialAdjustmentsCachedSync,
  subscribeFinancialAdjustments,
  getManualPoints,
  getManualPointsCachedSync,
  createPayrollPeriod,
  updatePayrollPeriod,
  createPayrollRecord,
  updatePayrollRecord,
  createAuditLog
} from '../lib/dbService';
import { hrEngine } from '../lib/hrEngine';
import { CalculationDetails } from '../lib/payrollService';

interface PayrollManagementProps {
  employees: Employee[];
  tasks?: Task[];
  manualPoints?: ManualPointsRecord[];
  userRole?: 'owner' | 'manager' | 'accountant' | 'supervisor' | 'technician';
}

export default function PayrollManagement({
  employees,
  tasks: propsTasks,
  manualPoints: propsManualPoints,
  userRole = 'manager'
}: PayrollManagementProps) {
  // Navigation Tabs: 'preview' | 'employees' | 'validation' | 'approval' | 'archive'
  const [activeTab, setActiveTab] = useState<'preview' | 'employees' | 'validation' | 'approval' | 'archive'>('preview');

  // State with Local Cache & Lazy Loading
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() => getPayrollRecordsCachedSync());
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => getCompanySettingsCachedSync());
  const [tasks, setTasks] = useState<Task[]>(propsTasks || []);
  const [manualPoints, setManualPoints] = useState<ManualPointsRecord[]>(() => propsManualPoints || getManualPointsCachedSync());
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>(() => getFinancialAdjustmentsCachedSync());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (propsTasks) setTasks(propsTasks);
  }, [propsTasks]);

  useEffect(() => {
    if (propsManualPoints) setManualPoints(propsManualPoints);
  }, [propsManualPoints]);

  // Selected Employee Payslip Modal
  const [selectedEmployeeForPayslip, setSelectedEmployeeForPayslip] = useState<Employee | null>(null);
  const [showCalculationExplanation, setShowCalculationExplanation] = useState(false);

  // Lock & Unlock confirmation modals
  const [showLockConfirmModal, setShowLockConfirmModal] = useState(false);
  const [showUnlockConfirmModal, setShowUnlockConfirmModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Archive Selected Period Modal
  const [archivedPeriodSelected, setArchivedPeriodSelected] = useState<PayrollPeriod | null>(null);
  const [selectedArchivedEmpRecord, setSelectedArchivedEmpRecord] = useState<PayrollRecord | null>(null);

  // Manual refresh helper
  const handleRefreshPayrollData = async () => {
    setIsRefreshing(true);
    try {
      const [periods, records, adjustments, mPoints] = await Promise.all([
        getPayrollPeriods(true),
        getPayrollRecords(true),
        getFinancialAdjustments(true),
        !propsManualPoints ? getManualPoints(true) : Promise.resolve(null)
      ]);
      setPayrollPeriods(periods);
      setPayrollRecords(records);
      setFinancialAdjustments(adjustments);
      if (mPoints) setManualPoints(mPoints);
    } catch (err) {
      console.error('Error refreshing payroll data:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Lazy-load cached or fresh DB data and subscribe to active components
  useEffect(() => {
    let isMounted = true;

    // Load data from cache or fetch if expired (> 24h)
    Promise.all([
      getPayrollPeriods(),
      getPayrollRecords(),
      getFinancialAdjustments(),
      !propsManualPoints ? getManualPoints() : Promise.resolve(null)
    ]).then(([periods, records, adjustments, mPoints]) => {
      if (!isMounted) return;
      setPayrollPeriods(periods);
      setPayrollRecords(records);
      setFinancialAdjustments(adjustments);
      if (mPoints) setManualPoints(mPoints);
    }).catch(err => console.warn('Lazy loading payroll data warning:', err));

    const unsubOvertime = subscribeOvertimeRecords(
      (recs) => setOvertimeRecords(recs),
      (err) => console.error('Error subscribing overtime records:', err)
    );
    const unsubLeave = subscribeLeaveRequests(
      (recs) => setLeaveRequests(recs),
      (err) => console.error('Error subscribing leave requests:', err)
    );
    const unsubAttendance = subscribeAttendanceRecords(
      (recs) => setAttendanceRecords(recs),
      (err) => console.error('Error subscribing attendance records:', err)
    );
    const unsubAdjustments = subscribeFinancialAdjustments(
      (adjs) => setFinancialAdjustments(adjs),
      (err) => console.error('Error subscribing financial adjustments in payroll:', err)
    );
    const unsubSettings = subscribeCompanySettings(
      (sets) => setCompanySettings(sets),
      (err) => console.error('Error subscribing company settings:', err)
    );
    const unsubTasks = !propsTasks ? subscribeTasks(
      (t) => setTasks(t),
      (err) => console.error('Error subscribing tasks in payroll:', err)
    ) : () => {};

    return () => {
      isMounted = false;
      unsubOvertime();
      unsubLeave();
      unsubAttendance();
      unsubAdjustments();
      unsubSettings();
      unsubTasks();
    };
  }, [propsTasks, propsManualPoints]);

  // Selected period state for manual period navigation
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // Compute available cycles list (e.g. past 12 cycles + any stored periods)
  const availablePeriods = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // Determine current cycle reference month
    let refYear = currentYear;
    let refMonth = currentMonth;
    if (currentDay >= 16) {
      refMonth += 1;
      if (refMonth > 12) {
        refMonth = 1;
        refYear += 1;
      }
    }

    const cyclesMap = new Map<string, PayrollPeriod>();

    // Generate last 12 monthly cycles (16th of previous month to 15th of current month)
    for (let i = 0; i < 12; i++) {
      let m = refMonth - i;
      let y = refYear;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }

      const periodId = `${y}-${String(m).padStart(2, '0')}`;
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;

      const startDate = `${prevY}-${String(prevM).padStart(2, '0')}-16`;
      const endDate = `${y}-${String(m).padStart(2, '0')}-15`;
      const actualDays = hrEngine.payrollService.calculateActualDaysInPeriod(startDate, endDate);

      const existing = payrollPeriods.find(
        (p) => p.id === periodId || (p.startDate === startDate && p.endDate === endDate)
      );

      if (existing) {
        cyclesMap.set(existing.id, existing);
      } else {
        cyclesMap.set(periodId, {
          id: periodId,
          startDate,
          endDate,
          actualDays,
          status: 'open',
          createdAt: new Date().toISOString()
        });
      }
    }

    // Include any additional periods saved in DB
    payrollPeriods.forEach((p) => {
      if (!cyclesMap.has(p.id)) {
        cyclesMap.set(p.id, p);
      }
    });

    return Array.from(cyclesMap.values()).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [payrollPeriods]);

  // Determine current active period (selected period or smart fallback)
  const activePeriod = useMemo(() => {
    if (selectedPeriodId) {
      const found = availablePeriods.find((p) => p.id === selectedPeriodId);
      if (found) return found;
    }

    // Default smart logic:
    // If today is >= 16th (e.g. 17/8), check if the previous cycle is open/calculated.
    // If so, default to the previous cycle so the user can review and lock it first!
    const now = new Date();
    const currentDay = now.getDate();
    if (currentDay >= 16 && availablePeriods.length > 1) {
      const prevCycle = availablePeriods[1]; // sorted descending, index 1 is previous cycle
      if (prevCycle && (prevCycle.status === 'open' || prevCycle.status === 'calculated')) {
        return prevCycle;
      }
    }

    const openOrCalculated = availablePeriods.find((p) => p.status === 'open' || p.status === 'calculated');
    if (openOrCalculated) return openOrCalculated;

    return availablePeriods[0] || {
      id: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-16`,
      endDate: `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-15`,
      actualDays: 30,
      status: 'open',
      createdAt: now.toISOString()
    };
  }, [availablePeriods, selectedPeriodId]);

  // Check if a new cycle has started after activePeriod
  const isNewCycleStarted = useMemo(() => {
    if (!activePeriod) return false;
    const todayStr = getEffectiveWorkDateStr(new Date());
    // If today is strictly past activePeriod.endDate (e.g. today > 2026-08-15)
    if (todayStr > activePeriod.endDate) return true;
    // Or if activePeriod is older than the current latest cycle in availablePeriods (index > 0)
    if (availablePeriods.length > 0 && availablePeriods[0].id !== activePeriod.id) {
      return true;
    }
    return false;
  }, [activePeriod, availablePeriods]);

  // Auto-unlock current ongoing cycle if it was locked or archived before its end date
  useEffect(() => {
    if (activePeriod && (activePeriod.status === 'closed' || activePeriod.status === 'archived') && !isNewCycleStarted) {
      console.log('Auto-unlocking/unarchiving active period because current cycle has not ended yet:', activePeriod.id);
      updatePayrollPeriod(activePeriod.id, {
        status: 'calculated',
        closedAt: null,
        closedBy: null
      }).catch((err) => {
        console.error('Failed to auto-unlock/unarchive current period:', err);
      });
    }
  }, [activePeriod, isNewCycleStarted]);

  // Filter Active Employees (exclude deleted or terminated employees)
  const activeEmployees = useMemo(() => {
    return employees.filter((emp) => !(emp as any).isDeleted && emp.status !== 'terminated');
  }, [employees]);

  // Compute rewards summary for current employees for active period
  const rewardSummary = useMemo(() => {
    return hrEngine.rewardService.calculateRewards({
      employees,
      tasks,
      manualPoints,
      rewardPoolPercentage: companySettings?.rewardPoolPercentage ?? 5,
      rewardPointValue: companySettings?.rewardPointValue ?? 35,
      startDate: activePeriod?.startDate,
      endDate: activePeriod?.endDate,
    });
  }, [employees, tasks, manualPoints, companySettings, activePeriod]);

  // Effective company settings with defaults
  const effectiveCompanySettings: CompanySettings = useMemo(() => {
    return companySettings || getCompanySettingsCachedSync() || {
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
  }, [companySettings]);

  // Compute live payroll records for active employees for the current period
  const computedPayrollRecordsMap = useMemo(() => {
    const map = new Map<string, { record: PayrollRecord; details: CalculationDetails }>();

    activeEmployees.forEach((emp) => {
      const empAttendance = attendanceRecords.filter((a) => a.employeeId === emp.id && !(a as any).isDeleted);
      const empLeave = leaveRequests.filter((l) => l.employeeId === emp.id && !(l as any).isDeleted);
      const empOvertime = overtimeRecords.filter((o) => o.employeeId === emp.id && !(o as any).isDeleted);

      // Check if an approved/paid record snapshot already exists in DB for this period
      const existingRecord = payrollRecords.find(
        (pr) => pr.periodId === activePeriod.id && pr.employeeId === emp.id && (pr.status === 'approved' || pr.status === 'paid')
      );

      const empReward = rewardSummary.employeeResults[emp.id];
      const rewardAmount = existingRecord?.rewardAmount !== undefined 
        ? existingRecord.rewardAmount 
        : (empReward ? empReward.rewardAmount : 0);
      const rewardPoints = existingRecord?.rewardPoints !== undefined 
        ? existingRecord.rewardPoints 
        : (empReward ? empReward.totalPoints : 0);
      const rewardType = existingRecord?.rewardType !== undefined 
        ? existingRecord.rewardType 
        : (empReward ? empReward.type : 'neutral');
      const rewardCalculationVersion = existingRecord?.rewardCalculationVersion || '1.1';
      const rewardCalculatedAt = existingRecord?.rewardCalculatedAt;

      const cycleDays = hrEngine.payrollService.calculateActualDaysInPeriod(activePeriod.startDate, activePeriod.endDate);
      const empDailyRate = (emp.baseSalary || 0) / cycleDays;
      const empHourlyRate = empDailyRate / (effectiveCompanySettings.workHoursPerDay || 8);

      // Direct Financial Adjustments (Rewards & Deductions) scoped to this active cycle
      const empCycleAdjustments = financialAdjustments.filter((adj) => {
        if (adj.employeeId !== emp.id) return false;
        if (adj.cycleId && (adj.cycleId === activePeriod.id || adj.cycleId === `period_${activePeriod.id}`)) {
          return true;
        }
        if (adj.date && activePeriod.startDate && activePeriod.endDate) {
          return adj.date >= activePeriod.startDate && adj.date <= activePeriod.endDate;
        }
        return false;
      });

      const empBonuses = empCycleAdjustments
        .filter((a) => a.type === 'reward')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const empManualDeductions = empCycleAdjustments
        .filter((a) => a.type === 'deduction')
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const bonuses = existingRecord?.bonuses !== undefined ? existingRecord.bonuses : empBonuses;
      const manualDeductions = existingRecord?.manualDeductions !== undefined ? existingRecord.manualDeductions : empManualDeductions;

      const record = hrEngine.payrollService.generatePayrollRecord({
        employeeId: emp.id,
        employeeName: emp.name,
        employee: emp,
        baseSalary: emp.baseSalary || 0,
        period: activePeriod,
        attendanceRecords: empAttendance,
        leaveRequests: empLeave,
        overtimeRecords: empOvertime,
        advances: 0,
        bonuses,
        manualDeductions,
        rewardAmount,
        rewardPoints,
        rewardType,
        rewardCalculationVersion,
        rewardCalculatedAt,
        overtimeHourlyRate: empHourlyRate,
        workHoursPerDay: effectiveCompanySettings.workHoursPerDay || 8,
        settings: effectiveCompanySettings,
        now: new Date(),
      });

      const details = hrEngine.payrollService.generateCalculationDetails({
        employeeId: emp.id,
        employeeName: emp.name,
        employee: emp,
        baseSalary: emp.baseSalary || 0,
        period: activePeriod,
        attendanceRecords: empAttendance,
        leaveRequests: empLeave,
        overtimeRecords: empOvertime,
        advances: 0,
        bonuses,
        manualDeductions,
        overtimeHourlyRate: empHourlyRate,
        workHoursPerDay: effectiveCompanySettings.workHoursPerDay || 8,
        settings: effectiveCompanySettings,
        now: new Date(),
      });

      map.set(emp.id, { record, details });
    });

    return map;
  }, [activeEmployees, attendanceRecords, leaveRequests, overtimeRecords, activePeriod, effectiveCompanySettings, rewardSummary, financialAdjustments]);

  // Totals for Preview
  const totals = useMemo(() => {
    let totalBase = 0;
    let totalAdditions = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    computedPayrollRecordsMap.forEach(({ record }) => {
      totalBase += record.baseSalary || 0;
      totalAdditions += record.totalAdditions || 0;
      totalDeductions += record.totalDeductions || 0;
      totalNet += record.netSalary || 0;
    });

    return {
      count: activeEmployees.length,
      totalBase,
      totalAdditions,
      totalDeductions,
      totalNet
    };
  }, [computedPayrollRecordsMap, activeEmployees]);

  // --- EXCEL EXPORT HELPERS ---
  const exportSingleEmployeePayslipToExcel = (
    employeeName: string,
    dept: string,
    record: PayrollRecord,
    details?: CalculationDetails,
    customPeriodStr?: string
  ) => {
    const periodString = customPeriodStr || `${activePeriod.startDate} إلى ${activePeriod.endDate}`;

    const wsData = [
      ["كشف راتب تفصيلي للموظف", employeeName],
      ["القسم / الوظيفة", dept || "عام"],
      ["الفترة المالية", periodString],
      ["تاريخ الاستخراج", new Date().toLocaleDateString('ar-IQ')],
      [""],
      ["البند", "البيان التفصيلي", "المبلغ / القيمة (د.ع)"],
      ["الراتب الأساسي الشهري", "راتب العقد الأساسي", record.baseSalary],
      details ? ["أيام الدورة المالية المحسوبة", "إجمالي أيام الفترة", details.cycleDays] : null,
      details ? ["أجر اليوم الفعلي", "الراتب ÷ أيام الدورة", Math.round(details.dailyRate)] : null,
      details ? ["أجر الساعة (8 ساعات)", "أجر اليوم ÷ 8", Math.round(details.hourlyRate)] : null,
      ["--- المستحقات والإضافات ---", "", ""],
      ["بدل الوقت الإضافي المعتمد", `${record.overtimeMinutes || 0} دقيقة`, record.overtimeAddition || 0],
      ["المكافآت والحوافز المباشرة", "حوافز ومكافآت مالية", record.bonuses || 0],
      ["مكافأة / خصم نظام النقاط", "مكافأة أو خصم الأداء والمهام", record.rewardAmount || 0],
      ["إجمالي المستحقات الإضافية", "مجموع الإضافات", record.totalAdditions || 0],
      ["--- الاستقطاعات والخصومات ---", "", ""],
      ["خصم التأخير الصباحي", `${record.lateMinutes || 0} دقيقة تأخير`, record.lateDeduction || 0],
      ["خصم الخروج المبكر", `${record.earlyCheckoutMinutes || 0} دقيقة خروج مبكر`, record.earlyCheckoutDeduction || 0],
      ["خصم عدم بصمة الخروج", `${record.missingCheckOutCount || 0} مرّة (عدم تبصيم خروج)`, record.missingCheckOutDeduction || 0],
      ["خصم الغياب بدون عذر", `${record.absenceDays || 0} يوم (غرامة مضاعفة)`, record.absenceDeduction || 0],
      ["خصم الأيام غير على رأس العمل", `${record.notEmployedDays || 0} يوم (خصم قيمة اليوم 1x)`, record.notEmployedDeduction || 0],
      ["خصم الإجازات بدون راتب", `${record.unpaidLeaveDays || 0} يوم إجازة`, record.unpaidLeaveDeduction || 0],
      ["استقطاع السلف المباشرة", "سداد سلف مالية", record.advances || 0],
      ["الخصومات اليدوية الإدارية", "جزاءات وخصومات إدارية", record.manualDeductions || 0],
      ["إجمالي الخصومات والاستقطاعات", "مجموع الاستقطاعات", record.totalDeductions || 0],
      ["--- النتيجة النهائية ---", "", ""],
      ["صافي الراتب النهائي المستحق للصرف", "المبلغ الصافي المستحق المعتمد", record.netSalary || 0]
    ].filter(Boolean);

    const ws = XLSX.utils.aoa_to_sheet(wsData as any[][]);
    ws['!cols'] = [
      { wch: 32 },
      { wch: 38 },
      { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف الراتب");
    const cleanName = employeeName.replace(/[^\u0600-\u06FFa-zA-Z0-9]/g, '_');
    XLSX.writeFile(wb, `كشف_راتب_${cleanName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const exportFullPayrollTableToExcel = () => {
    if (activeEmployees.length === 0) return;

    const rows = activeEmployees.map((emp, index) => {
      const data = computedPayrollRecordsMap.get(emp.id);
      const rec = data?.record;
      const det = data?.details;

      return {
        "ت": index + 1,
        "اسم الموظف": emp.name,
        "القسم / الوظيفة": emp.department || "عام",
        "الراتب الأساسي (د.ع)": emp.baseSalary || 0,
        "أيام الدورة": det?.cycleDays || activePeriod.actualDays,
        "أجر اليوم (د.ع)": Math.round(det?.dailyRate || 0),
        "تأخير (دقيقة)": rec?.lateMinutes || 0,
        "خصم التأخير (د.ع)": rec?.lateDeduction || 0,
        "خروج مبكر (دقيقة)": rec?.earlyCheckoutMinutes || 0,
        "خصم الخروج المبكر (د.ع)": rec?.earlyCheckoutDeduction || 0,
        "عدم بصمة الخروج (مرات)": rec?.missingCheckOutCount || 0,
        "خصم عدم بصمة الخروج (د.ع)": rec?.missingCheckOutDeduction || 0,
        "غياب (أيام)": rec?.absenceDays || 0,
        "خصم الغياب (د.ع)": rec?.absenceDeduction || 0,
        "غير على رأس العمل (أيام)": rec?.notEmployedDays || 0,
        "خصم غير على رأس العمل (د.ع)": rec?.notEmployedDeduction || 0,
        "إجازات بدون راتب (أيام)": rec?.unpaidLeaveDays || 0,
        "خصم الإجازات (د.ع)": rec?.unpaidLeaveDeduction || 0,
        "وقت إضافي (دقيقة)": rec?.overtimeMinutes || 0,
        "بدل الإضافي (د.ع)": rec?.overtimeAddition || 0,
        "السلف (د.ع)": rec?.advances || 0,
        "المكافآت (د.ع)": rec?.bonuses || 0,
        "نقاط الأداء (د.ع)": rec?.rewardAmount || 0,
        "خصومات يدوية (د.ع)": rec?.manualDeductions || 0,
        "إجمالي الإضافات (د.ع)": rec?.totalAdditions || 0,
        "إجمالي الخصومات (د.ع)": rec?.totalDeductions || 0,
        "صافي الراتب (د.ع)": rec?.netSalary || 0,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 },   // ت
      { wch: 22 },  // اسم الموظف
      { wch: 15 },  // القسم
      { wch: 18 },  // الراتب الأساسي
      { wch: 12 },  // أيام الدورة
      { wch: 15 },  // أجر اليوم
      { wch: 14 },  // تأخير
      { wch: 16 },  // خصم التأخير
      { wch: 16 },  // خروج مبكر
      { wch: 18 },  // خصم الخروج المبكر
      { wch: 12 },  // غياب
      { wch: 15 },  // خصم الغياب
      { wch: 18 },  // إجازات بدون راتب
      { wch: 16 },  // خصم الإجازات
      { wch: 16 },  // وقت إضافي
      { wch: 16 },  // بدل الإضافي
      { wch: 15 },  // السلف
      { wch: 15 },  // المكافآت
      { wch: 15 },  // نقاط الأداء
      { wch: 16 },  // الخصومات اليدوية
      { wch: 18 },  // إجمالي الإضافات
      { wch: 18 },  // إجمالي الخصومات
      { wch: 20 },  // صافي الراتب
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مسير الرواتب العام");
    XLSX.writeFile(wb, `مسير_الرواتب_العام_${activePeriod.startDate}_إلى_${activePeriod.endDate}.xlsx`);
  };

  const exportArchivedPeriodToExcel = (period: PayrollPeriod, records: PayrollRecord[]) => {
    if (records.length === 0) return;

    const rows = records.map((rec, index) => ({
      "ت": index + 1,
      "اسم الموظف": rec.employeeName,
      "الراتب الأساسي (د.ع)": rec.baseSalary,
      "خصم التأخير (د.ع)": rec.lateDeduction,
      "خصم الخروج المبكر (د.ع)": rec.earlyCheckoutDeduction || 0,
      "خصم عدم بصمة الخروج (د.ع)": rec.missingCheckOutDeduction || 0,
      "خصم الغياب (د.ع)": rec.absenceDeduction,
      "خصم غير على رأس العمل (د.ع)": rec.notEmployedDeduction || 0,
      "خصم الإجازات (د.ع)": rec.unpaidLeaveDeduction || 0,
      "بدل الوقت الإضافي (د.ع)": rec.overtimeAddition,
      "السلف المستقطعة (د.ع)": rec.advances,
      "المكافآت (د.ع)": rec.bonuses,
      "نقاط الأداء (د.ع)": rec.rewardAmount || 0,
      "الخصومات اليدوية (د.ع)": rec.manualDeductions || 0,
      "إجمالي الإضافات (د.ع)": rec.totalAdditions,
      "إجمالي الخصومات (د.ع)": rec.totalDeductions,
      "صافي الراتب النهائي (د.ع)": rec.netSalary,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 }, { wch: 22 }, { wch: 18 }, { wch: 16 }, { wch: 18 },
      { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 15 },
      { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "مسير راتب مؤرشف");
    XLSX.writeFile(wb, `كشف_رواتب_مؤرشف_${period.startDate}_إلى_${period.endDate}.xlsx`);
  };

  // Checklist Item Validations
  const validationChecklist = useMemo(() => {
    // 1. All employees have base salary
    const empWithoutSalary = activeEmployees.filter((e) => !e.baseSalary || e.baseSalary <= 0);
    const check1_baseSalary = empWithoutSalary.length === 0;

    // 2. No pending overtime requests
    const pendingOvertime = overtimeRecords.filter((o) => o.status === 'pending' && !(o as any).isDeleted);
    const check2_pendingOvertime = pendingOvertime.length === 0;

    // 3. No pending leave requests
    const pendingLeave = leaveRequests.filter((l) => l.status === 'pending' && !(l as any).isDeleted);
    const check3_pendingLeave = pendingLeave.length === 0;

    // 4. No incomplete attendance records
    // Missing check-outs are automatically handled and deducted in payroll calculations, so they are not treated as unhandled issues.
    const incompleteAttendance: AttendanceRecord[] = [];
    const check4_incompleteAttendance = true;

    // 5. No unapproved attendance adjustments
    const check5_unapprovedAdjustments = true; // Placeholder for future attendance modifications

    // 6. All calculations complete
    const check6_calculationsComplete = computedPayrollRecordsMap.size === activeEmployees.length;

    // Terminated employees present in active cycle
    const terminatedInCycle = employees.filter((e) => e.status === 'terminated' && !(e as any).isDeleted);

    const isAllPassed =
      check1_baseSalary &&
      check2_pendingOvertime &&
      check3_pendingLeave &&
      check4_incompleteAttendance &&
      check5_unapprovedAdjustments &&
      check6_calculationsComplete;

    return {
      check1_baseSalary,
      empWithoutSalary,
      check2_pendingOvertime,
      pendingOvertime,
      check3_pendingLeave,
      pendingLeave,
      check4_incompleteAttendance,
      incompleteAttendance,
      check5_unapprovedAdjustments,
      check6_calculationsComplete,
      terminatedInCycle,
      isAllPassed
    };
  }, [activeEmployees, overtimeRecords, leaveRequests, attendanceRecords, computedPayrollRecordsMap, employees]);

  // Handle Approve Cycle
  const handleApproveCycle = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المحاسب الإداري';

      const periodToSave: PayrollPeriod = {
        ...activePeriod,
        status: 'calculated',
      };

      await createPayrollPeriod(periodToSave);

      // Audit log
      const auditLog: AuditLogEntry = {
        id: `audit_pr_app_${now.getTime()}`,
        userId: userRole,
        userName: currentUserName,
        userRole: userRole as any,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().substring(0, 8),
        timestamp: now.toISOString(),
        action: `اعتماد نتائج الدورة المالية (${activePeriod.startDate} إلى ${activePeriod.endDate})`,
        reason: 'اعتماد رسمي للدورة المالية من إدارة الحسابات',
        targetEntity: 'payroll_period',
        targetId: activePeriod.id,
        dataBefore: { status: activePeriod.status },
        dataAfter: { status: 'calculated' }
      };

      await createAuditLog(auditLog);

      setActionMessage({
        type: 'success',
        text: 'تم اعتماد نتائج الدورة المالية بنجاح.'
      });
    } catch (err: any) {
      console.error('Error approving cycle:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء اعتماد الدورة المالية.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Lock Cycle
  const handleLockCycle = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المحاسب الإداري';

      // Save period as closed
      const periodToSave: PayrollPeriod = {
        ...activePeriod,
        status: 'closed',
        closedAt: now.toISOString(),
        closedBy: currentUserName
      };

      await createPayrollPeriod(periodToSave);

      // Save individual payroll records for each employee to DB
      for (const [_, { record }] of computedPayrollRecordsMap) {
        await createPayrollRecord({
          ...record,
          status: 'approved',
          approvedBy: currentUserName,
          approvedAt: now.toISOString()
        });
      }

      // Audit log
      const auditLog: AuditLogEntry = {
        id: `audit_pr_lock_${now.getTime()}`,
        userId: userRole,
        userName: currentUserName,
        userRole: userRole as any,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().substring(0, 8),
        timestamp: now.toISOString(),
        action: `قفل الدورة المالية (${activePeriod.startDate} إلى ${activePeriod.endDate}) بصفة نهائية`,
        reason: 'قفل نهائي وحفظ السجلات المالية الرسمية',
        targetEntity: 'payroll_period',
        targetId: activePeriod.id,
        dataBefore: { status: activePeriod.status },
        dataAfter: { status: 'closed', closedBy: currentUserName }
      };

      await createAuditLog(auditLog);

      setShowLockConfirmModal(false);
      setActionMessage({
        type: 'success',
        text: 'تم قفل الدورة المالية وحفظ كافة كشوفات الرواتب بنجاح.'
      });
    } catch (err: any) {
      console.error('Error locking cycle:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء قفل الدورة المالية.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Unlock Cycle
  const handleUnlockCycle = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المحاسب الإداري';

      await updatePayrollPeriod(activePeriod.id, {
        status: 'calculated',
        closedAt: null,
        closedBy: null
      });

      // Audit log
      const auditLog: AuditLogEntry = {
        id: `audit_pr_unlock_${now.getTime()}`,
        userId: userRole,
        userName: currentUserName,
        userRole: userRole as any,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().substring(0, 8),
        timestamp: now.toISOString(),
        action: `إلغاء قفل الدورة المالية (${activePeriod.startDate} إلى ${activePeriod.endDate})`,
        reason: 'إلغاء القفل لإتاحة التعديل والمراجعة الإدارية من جديد',
        targetEntity: 'payroll_period',
        targetId: activePeriod.id,
        dataBefore: { status: activePeriod.status },
        dataAfter: { status: 'calculated' }
      };

      await createAuditLog(auditLog);

      setShowUnlockConfirmModal(false);
      setActionMessage({
        type: 'success',
        text: 'تم إلغاء قفل الدورة المالية بنجاح وإعادتها لحالة التعديل والمراجعة.'
      });
    } catch (err: any) {
      console.error('Error unlocking cycle:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء إلغاء قفل الدورة المالية.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Mark as Paid
  const handleMarkAsPaid = async () => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المحاسب الإداري';

      await updatePayrollPeriod(activePeriod.id, {
        status: 'archived'
      });

      // Update records status to paid
      const periodRecords = payrollRecords.filter((r) => r.periodId === activePeriod.id);
      for (const rec of periodRecords) {
        await updatePayrollRecord(rec.id, {
          status: 'paid'
        });
      }

      // Audit log
      const auditLog: AuditLogEntry = {
        id: `audit_pr_paid_${now.getTime()}`,
        userId: userRole,
        userName: currentUserName,
        userRole: userRole as any,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().substring(0, 8),
        timestamp: now.toISOString(),
        action: `تعليم الدورة المالية (${activePeriod.startDate} إلى ${activePeriod.endDate}) كمدفوعة بالكامل`,
        reason: 'تم صرف الرواتب وتوثيق التحويلات الحسابية',
        targetEntity: 'payroll_period',
        targetId: activePeriod.id,
        dataBefore: { status: activePeriod.status },
        dataAfter: { status: 'archived' }
      };

      await createAuditLog(auditLog);

      setActionMessage({
        type: 'success',
        text: 'تم تعليم الدورة المالية كمدفوعة وأرشفة السجلات بنجاح.'
      });
    } catch (err: any) {
      console.error('Error marking cycle as paid:', err);
      setActionMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء تعليم الدورة كمدفوعة.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Past archived periods list
  const archivedPeriodsList = useMemo(() => {
    return payrollPeriods.filter((p) => p.status === 'closed' || p.status === 'archived');
  }, [payrollPeriods]);

  // Selected archived period records
  const archivedPeriodRecords = useMemo(() => {
    if (!archivedPeriodSelected) return [];
    return payrollRecords.filter((r) => r.periodId === archivedPeriodSelected.id);
  }, [archivedPeriodSelected, payrollRecords]);

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Top Header Banner */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Payroll Management
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                نظام معالجة واعتماد كشوفات الرواتب
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              إدارة الرواتب والأجور
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              حساب، مراجعة، واعتماد الرواتب الشهرية والاستقطاعات والإضافات بالدقائق والأيام
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">الدورة المالية الحالية:</span>
              <span className="text-xs font-black text-white font-mono">
                {activePeriod.startDate} ← {activePeriod.endDate} ({activePeriod.actualDays} يوم)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Global Period Selector Bar */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
              <span>تحديد الدورة المالية للرواتب</span>
              {new Date().getDate() >= 16 && (
                <span className="bg-amber-100 text-amber-900 text-[10px] px-2.5 py-0.5 rounded-full font-bold">
                  بدأت دورة جديدة (بعد يوم 16)
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              يمكنك اختيار وتحديد الدورة المالية السابقة أو الحالية لمعاينتها واكتمال الاعتماد والقفل
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Previous cycle button */}
          <button
            type="button"
            onClick={() => {
              const currentIndex = availablePeriods.findIndex((p) => p.id === activePeriod.id);
              if (currentIndex >= 0 && currentIndex < availablePeriods.length - 1) {
                setSelectedPeriodId(availablePeriods[currentIndex + 1].id);
              }
            }}
            disabled={availablePeriods.findIndex((p) => p.id === activePeriod.id) >= availablePeriods.length - 1}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 rounded-xl font-extrabold text-xs transition-colors flex items-center gap-1 cursor-pointer"
            title="الدورة السابقة"
          >
            <span>الدورة السابقة</span>
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Dropdown selector */}
          <select
            value={activePeriod.id}
            onChange={(e) => setSelectedPeriodId(e.target.value)}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[260px]"
          >
            {availablePeriods.map((period, idx) => {
              const isCurrent = idx === 0;
              const isPrev = idx === 1;
              const statusLabel =
                period.status === 'open'
                  ? '🟢 مفتوحة'
                  : period.status === 'calculated'
                  ? '🔵 معتمدة'
                  : period.status === 'closed'
                  ? '🔒 مقفلة'
                  : '✅ تم تسليمها';

              const cycleName = isCurrent
                ? ' (الدورة الحالية)'
                : isPrev
                ? ' (الدورة السابقة)'
                : '';

              return (
                <option key={period.id} value={period.id}>
                  دورة ({period.startDate} إلى {period.endDate}){cycleName} - {statusLabel}
                </option>
              );
            })}
          </select>

          {/* Next cycle button */}
          <button
            type="button"
            onClick={() => {
              const currentIndex = availablePeriods.findIndex((p) => p.id === activePeriod.id);
              if (currentIndex > 0) {
                setSelectedPeriodId(availablePeriods[currentIndex - 1].id);
              }
            }}
            disabled={availablePeriods.findIndex((p) => p.id === activePeriod.id) <= 0}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-40 rounded-xl font-extrabold text-xs transition-colors flex items-center gap-1 cursor-pointer"
            title="الدورة التالية"
          >
            <span>الدورة التالية</span>
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={handleRefreshPayrollData}
            disabled={isRefreshing}
            className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 border border-blue-200 rounded-xl font-extrabold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="تحديث بيانات الراتب من السحابة"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'جاري التحديث...' : 'تحديث البيانات'}</span>
          </button>
        </div>
      </div>

      {/* Message Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('preview')}
          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'preview'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Preview (المعاينة)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'employees'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees (جدول الموظفين)</span>
          <span className="bg-slate-200 text-slate-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
            {totals.count}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('validation')}
          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'validation'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Validation (المشاكل)</span>
          {!validationChecklist.isAllPassed && (
            <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              مراجعة مطلوبة
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('approval')}
          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'approval'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Approval (الاعتماد والقفل)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archive')}
          className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'archive'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>Deliveries (تم تسليمها)</span>
          {archivedPeriodsList.length > 0 && (
            <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {archivedPeriodsList.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={exportFullPayrollTableToExcel}
          className="mr-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>تصدير مسير الرواتب (Excel)</span>
        </button>
      </div>

      {/* TAB 1: Preview */}
      {activeTab === 'preview' && (
        <div className="space-y-6">
          
          {/* Top Large Card: Readiness Checklist */}
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                    validationChecklist.isAllPassed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-red-100 text-red-800 border border-red-200'
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900">جاهزية اعتماد الدورة المالية</h2>
                  <p className="text-slate-500 text-xs font-medium">
                    التحقق التلقائي من استكمال المدخلات الإدارية قبل الاعتماد الحسابي
                  </p>
                </div>
              </div>

              <div>
                {validationChecklist.isAllPassed ? (
                  <span className="bg-emerald-600 text-white text-xs font-black px-4 py-2 rounded-2xl flex items-center gap-2 shadow-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    🟢 الدورة جاهزة للاعتماد
                  </span>
                ) : (
                  <span className="bg-red-600 text-white text-xs font-black px-4 py-2 rounded-2xl flex items-center gap-2 shadow-xs">
                    <XCircle className="w-4 h-4" />
                    🔴 لا يمكن اعتماد الدورة (يوجد ملاحظات)
                  </span>
                )}
              </div>
            </div>

            {/* Checklist Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-6">
              
              {/* Item 1 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check1_baseSalary ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  {validationChecklist.check1_baseSalary ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>جميع الموظفين لديهم راتب أساسي</span>
                </div>
                <span className="font-mono">{validationChecklist.empWithoutSalary.length === 0 ? '✓' : `${validationChecklist.empWithoutSalary.length} ناقص`}</span>
              </div>

              {/* Item 2 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check2_pendingOvertime ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  {validationChecklist.check2_pendingOvertime ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>لا توجد طلبات وقت إضافي معلقة</span>
                </div>
                <span className="font-mono">{validationChecklist.pendingOvertime.length === 0 ? '✓' : `${validationChecklist.pendingOvertime.length} معلق`}</span>
              </div>

              {/* Item 3 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check3_pendingLeave ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  {validationChecklist.check3_pendingLeave ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>لا توجد طلبات إجازات معلقة</span>
                </div>
                <span className="font-mono">{validationChecklist.pendingLeave.length === 0 ? '✓' : `${validationChecklist.pendingLeave.length} معلق`}</span>
              </div>

              {/* Item 4 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check4_incompleteAttendance ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  {validationChecklist.check4_incompleteAttendance ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>لا توجد سجلات حضور ناقصة</span>
                </div>
                <span className="font-mono">{validationChecklist.incompleteAttendance.length === 0 ? '✓' : `${validationChecklist.incompleteAttendance.length} ناقص`}</span>
              </div>

              {/* Item 5 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check5_unapprovedAdjustments ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>لا توجد تعديلات حضور غير معتمدة</span>
                </div>
                <span className="font-mono">✓</span>
              </div>

              {/* Item 6 */}
              <div className={`p-4 rounded-2xl border text-xs font-bold flex items-center justify-between ${
                validationChecklist.check6_calculationsComplete ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900' : 'bg-red-50/50 border-red-200 text-red-900'
              }`}>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>جميع الحسابات مكتملة</span>
                </div>
                <span className="font-mono">✓</span>
              </div>

            </div>
          </div>

          {/* 5 Financial Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            
            {/* Stat 1: Employee Count */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400">إجمالي الموظفين</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono">{totals.count}</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">موظف مشمول بالدورة</p>
            </div>

            {/* Stat 2: Base Salaries */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400">الرواتب الأساسية</span>
              </div>
              <div className="text-lg font-black text-slate-900 font-mono">{totals.totalBase.toLocaleString()} د.ع</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">مجموع العقود الثابتة</p>
            </div>

            {/* Stat 3: Additions */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400">مجموع الإضافات</span>
              </div>
              <div className="text-lg font-black text-emerald-700 font-mono">+{totals.totalAdditions.toLocaleString()} د.ع</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">إضافي + مكافآت</p>
            </div>

            {/* Stat 4: Deductions */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-800 flex items-center justify-center font-bold">
                  <TrendingDown className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400">مجموع الخصومات</span>
              </div>
              <div className="text-lg font-black text-red-700 font-mono">-{totals.totalDeductions.toLocaleString()} د.ع</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">تأخير + غياب + إجازات</p>
            </div>

            {/* Stat 5: Net Salaries */}
            <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-slate-400">صافي الرواتب المستحقة</span>
              </div>
              <div className="text-lg font-black text-emerald-400 font-mono">{totals.totalNet.toLocaleString()} د.ع</div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">المبلغ المطلوب صرفه</p>
            </div>

          </div>

        </div>
      )}

      {/* TAB 2: Employees Table */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-extrabold text-xs text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              كشف مستحقات الموظفين - الدورة الحالية ({activeEmployees.length})
            </h3>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportFullPayrollTableToExcel}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير الجدول بالكامل (Excel)</span>
              </button>
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                اضغط على الموظف أو زر الكشف للفتح التفصيلي
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-slate-500 font-extrabold">
                <tr>
                  <th className="p-4">اسم الموظف</th>
                  <th className="p-4">الراتب الأساسي</th>
                  <th className="p-4">التأخير</th>
                  <th className="p-4">الغياب</th>
                  <th className="p-4">الإجازات</th>
                  <th className="p-4">الوقت الإضافي</th>
                  <th className="p-4">السلف</th>
                  <th className="p-4">المكافآت</th>
                  <th className="p-4">الخصومات</th>
                  <th className="p-4">الصافي</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {activeEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-12 text-center text-slate-400 font-bold">
                      لا يوجد موظفين مسجلين حالياً.
                    </td>
                  </tr>
                ) : (
                  activeEmployees.map((emp) => {
                    const data = computedPayrollRecordsMap.get(emp.id);
                    const recordData = data?.record;
                    const baseSalary = emp.baseSalary || 0;
                    const lateDeduction = recordData?.lateDeduction || 0;
                    const absenceDeduction = recordData?.absenceDeduction || 0;
                    const unpaidLeaveDeduction = recordData?.unpaidLeaveDeduction || 0;
                    const overtimeAddition = recordData?.overtimeAddition || 0;
                    const advances = recordData?.advances || 0;
                    const bonuses = recordData?.bonuses || 0;
                    const totalDeductions = recordData?.totalDeductions || 0;
                    const netSalary = recordData?.netSalary || 0;

                    return (
                      <tr
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmployeeForPayslip(emp);
                          setShowCalculationExplanation(false);
                        }}
                        className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                      >
                        {/* Employee Name */}
                        <td className="p-4">
                          <div className="font-black text-slate-900">{emp.name}</div>
                          <span className="text-[10px] text-slate-400 font-semibold">{emp.department || 'عام'}</span>
                        </td>

                        {/* Base Salary */}
                        <td className="p-4 font-mono font-bold text-slate-800">
                          {baseSalary.toLocaleString()} د.ع
                        </td>

                        {/* Late Deduction */}
                        <td className="p-4 font-mono text-red-600 font-bold">
                          {lateDeduction > 0 ? `-${lateDeduction.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Absence Deduction */}
                        <td className="p-4 font-mono text-red-600 font-bold">
                          {absenceDeduction > 0 ? `-${absenceDeduction.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Unpaid Leave */}
                        <td className="p-4 font-mono text-slate-700">
                          {unpaidLeaveDeduction > 0 ? `-${unpaidLeaveDeduction.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Overtime Addition */}
                        <td className="p-4 font-mono text-emerald-700 font-bold">
                          <div className="flex items-center gap-1">
                            <span>{overtimeAddition > 0 ? `+${overtimeAddition.toLocaleString()} د.ع` : '0'}</span>
                            {recordData?.overtimeMinutes ? (
                              <span className="text-[10px] text-amber-700 font-normal bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                {recordData.overtimeMinutes} د
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Advances */}
                        <td className="p-4 font-mono text-slate-700">
                          {advances > 0 ? `-${advances.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Bonuses */}
                        <td className="p-4 font-mono text-emerald-700 font-bold">
                          {bonuses > 0 ? `+${bonuses.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Total Deductions */}
                        <td className="p-4 font-mono font-black text-red-700">
                          {totalDeductions > 0 ? `-${totalDeductions.toLocaleString()} د.ع` : '0'}
                        </td>

                        {/* Net Salary */}
                        <td className="p-4 font-mono font-black text-emerald-800 text-sm">
                          {netSalary.toLocaleString()} د.ع
                        </td>

                        {/* Action */}
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEmployeeForPayslip(emp);
                                setShowCalculationExplanation(false);
                              }}
                              className="px-2.5 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold transition-all flex items-center gap-1 text-[11px] cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل</span>
                            </button>

                            <button
                              type="button"
                              title="تصدير كشف الموظف إلى ملف Excel"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (data) {
                                  exportSingleEmployeePayslipToExcel(emp.name, emp.department || 'عام', data.record, data.details);
                                }
                              }}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-black transition-all flex items-center gap-1 text-[11px] cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Excel</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Validation Issues */}
      {activeTab === 'validation' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                سجل الملاحظات والمشاكل المحتملة بالدورة الحالية
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-1">
                يعرض النظام أي طلبات معلقة أو بيانات غير مكتملة تؤثر على صحة الكشف
              </p>
            </div>
          </div>

          {validationChecklist.isAllPassed ? (
            <div className="p-12 text-center bg-emerald-50/50 border border-emerald-200 rounded-3xl space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-emerald-950">لا توجد أي مشاكل.</h4>
              <p className="text-xs text-emerald-800 font-medium max-w-md mx-auto">
                جميع البيانات الميدانية والرواتب الأساسية وطلبات الإجازات والوقت الإضافي مكتملة ومراجعة بالكامل.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              
              {/* Issue 1: Employees without base salary */}
              {validationChecklist.empWithoutSalary.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-red-900">موظفين بدون راتب أساسي</h5>
                    <p className="text-[11px] text-red-700 mt-0.5">
                      يوجد {validationChecklist.empWithoutSalary.length} موظف لم يتم تحديد راتبهم الأساسي بالعقد:
                      {' '}<strong className="underline">{validationChecklist.empWithoutSalary.map(e => e.name).join('، ')}</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* Issue 2: Pending Overtime Requests */}
              {validationChecklist.pendingOvertime.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-amber-900">طلبات وقت إضافي معلقة</h5>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      يوجد {validationChecklist.pendingOvertime.length} طلب وقت إضافي بانتظار الاعتماد من مركز الطلبات.
                    </p>
                  </div>
                </div>
              )}

              {/* Issue 3: Pending Leave Requests */}
              {validationChecklist.pendingLeave.length > 0 && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-purple-900">طلبات إجازات معلقة</h5>
                    <p className="text-[11px] text-purple-800 mt-0.5">
                      يوجد {validationChecklist.pendingLeave.length} طلب إجازة بانتظار الاعتماد أو الرفض.
                    </p>
                  </div>
                </div>
              )}

              {/* Issue 4: Incomplete Attendance Records */}
              {validationChecklist.incompleteAttendance.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-blue-900">سجلات حضور ناقصة</h5>
                    <p className="text-[11px] text-blue-800 mt-0.5">
                      يوجد {validationChecklist.incompleteAttendance.length} سجل حضور يحتوي على تسجيل دخول بدون تسجيل خروج بأيام سابقة.
                    </p>
                  </div>
                </div>
              )}

              {/* Issue 5: Terminated Employees in Cycle */}
              {validationChecklist.terminatedInCycle.length > 0 && (
                <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-slate-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-extrabold text-xs text-slate-900">موظفين منتهية خدمتهم</h5>
                    <p className="text-[11px] text-slate-700 mt-0.5">
                      يوجد {validationChecklist.terminatedInCycle.length} موظف منتهي الخدمة/غير نشط في النظام ({validationChecklist.terminatedInCycle.map(e => e.name).join('، ')}).
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* TAB 4: Approval & Lock */}
      {activeTab === 'approval' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-8 shadow-xs max-w-2xl mx-auto space-y-6 text-center">
          <div className="w-16 h-16 rounded-3xl bg-slate-900 text-white flex items-center justify-center mx-auto shadow-lg">
            <Lock className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-xl font-black text-slate-900">اعتماد وقفل الدورة المالية</h3>
            <p className="text-slate-500 text-xs font-medium mt-1">
              إقرار واعتماد كشوفات الرواتب النهائية وتأكيد تسليمها للموظفين
            </p>
          </div>

          {/* Current Period Badge Box & Cycle Selector */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div className="text-right">
                <span className="text-slate-500 font-extrabold block">الدورة المالية المحددة للاعتماد والقفل:</span>
                <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">
                  {activePeriod.startDate} ← {activePeriod.endDate} ({activePeriod.actualDays} يوم)
                </span>
              </div>
              <div>
                <span className={`inline-block px-3 py-1 rounded-full font-black text-[11px] ${
                  activePeriod.status === 'open'
                    ? 'bg-emerald-100 text-emerald-900'
                    : activePeriod.status === 'calculated'
                    ? 'bg-blue-100 text-blue-900'
                    : activePeriod.status === 'closed'
                    ? 'bg-slate-200 text-slate-800'
                    : 'bg-emerald-200 text-emerald-950'
                }`}>
                  حالة الدورة: {activePeriod.status === 'open' ? 'مفتوحة 🟢' : activePeriod.status === 'calculated' ? 'معتمدة 🔵' : activePeriod.status === 'closed' ? 'مقفلة 🔒' : 'تم تسليمها ✅'}
                </span>
              </div>
            </div>

            {/* Cycle Selector Dropdown inside Approval Tab */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-right">
              <label className="text-slate-700 font-bold shrink-0">تغيير الدورة المالية المراد اعتمادها:</label>
              <select
                value={activePeriod.id}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full sm:w-auto bg-white border border-slate-300 text-slate-900 font-bold text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {availablePeriods.map((period, idx) => {
                  const isCurrent = idx === 0;
                  const isPrev = idx === 1;
                  const statusLabel =
                    period.status === 'open'
                      ? '🟢 مفتوحة'
                      : period.status === 'calculated'
                      ? '🔵 معتمدة'
                      : period.status === 'closed'
                      ? '🔒 مقفلة'
                      : '✅ تم تسليمها';

                  const cycleName = isCurrent
                    ? ' (الدورة الحالية)'
                    : isPrev
                    ? ' (الدورة السابقة)'
                    : '';

                  return (
                    <option key={period.id} value={period.id}>
                      دورة ({period.startDate} إلى {period.endDate}){cycleName} - {statusLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            {new Date().getDate() >= 16 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs text-right space-y-1 font-medium">
                <div className="font-extrabold flex items-center gap-1.5 text-amber-800">
                  <Info className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>تنبيه بداية الدورة الجديدة (بعد يوم 16):</span>
                </div>
                <p>
                  إذا بدأ يوم 17/8 أو بعده ودخلت الشركة في دورة مالية جديدة، يمكنك تحديد الدورة السابقة (16/07 إلى 15/08) من القائمة أعلاه لمراجعتها، اعتمادها، وقفلها نهائياً.
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
            
            {/* Button 1: Approve Cycle */}
            <button
              type="button"
              disabled={actionLoading || activePeriod.status === 'closed' || activePeriod.status === 'archived' || !validationChecklist.isAllPassed}
              onClick={handleApproveCycle}
              className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                validationChecklist.isAllPassed && activePeriod.status !== 'closed' && activePeriod.status !== 'archived'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>اعتماد الدورة</span>
            </button>

            {/* Button 2: Lock Cycle (Only allowed after new cycle has started) */}
            <button
              type="button"
              disabled={actionLoading || activePeriod.status === 'closed' || activePeriod.status === 'archived' || !isNewCycleStarted}
              onClick={() => setShowLockConfirmModal(true)}
              className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activePeriod.status !== 'closed' && activePeriod.status !== 'archived' && isNewCycleStarted
                  ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={
                !isNewCycleStarted && activePeriod.status !== 'closed'
                  ? `لا يمكن قفل الدورة إلا بعد انتهاء تاريخها وبداية دورة جديدة (بعد ${activePeriod.endDate})`
                  : undefined
              }
            >
              <Lock className="w-4 h-4" />
              <span>قفل الدورة (نهائي)</span>
            </button>

            {/* Button 3: Unlock / Un-archive Cycle (Active when cycle is locked OR archived) */}
            <button
              type="button"
              disabled={actionLoading || (activePeriod.status !== 'closed' && activePeriod.status !== 'archived')}
              onClick={() => setShowUnlockConfirmModal(true)}
              className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activePeriod.status === 'closed' || activePeriod.status === 'archived'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={activePeriod.status !== 'closed' && activePeriod.status !== 'archived' ? 'زر إلغاء القفل ينشط فقط بعد قفل الدورة أو تسليمها' : undefined}
            >
              <Unlock className="w-4 h-4" />
              <span>إلغاء القفل / إلغاء التسليم</span>
            </button>

            {/* Button 4: Mark as Delivered/Paid (Active ONLY when cycle is locked) */}
            <button
              type="button"
              disabled={actionLoading || activePeriod.status !== 'closed'}
              onClick={handleMarkAsPaid}
              className={`px-4 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activePeriod.status === 'closed'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
              }`}
              title={activePeriod.status !== 'closed' ? 'زر تعليم كتم تسليمها ينشط فقط بعد قفل الدورة' : undefined}
            >
              <DollarSign className="w-4 h-4" />
              <span>تعليم كتم تسليمها</span>
            </button>

          </div>

          {/* Detailed Guidance Messages for User */}
          <div className="space-y-2 text-xs font-medium text-right pt-2">
            {activePeriod.status !== 'closed' && activePeriod.status !== 'archived' && !isNewCycleStarted && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  <strong>تنبيه قفل الدورة:</strong> الدورة المالية الحالية لا زالت جارية (تنتهي بتاريخ <strong className="font-mono">{activePeriod.endDate}</strong>). ولا يمكن قفل الدورة إلا بعد انتهائها وبداية دورة جديدة.
                </span>
              </div>
            )}

            {activePeriod.status !== 'closed' && activePeriod.status !== 'archived' && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl text-slate-700 flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-slate-500" />
                <span>
                  <strong>شروط التشغيل:</strong> ينشط زر <strong>(إلغاء القفل / إلغاء التسليم)</strong> وزر <strong>(تعليم كتم تسليمها)</strong> تلقائياً فور قفل الدورة المالية.
                </span>
              </div>
            )}

            {activePeriod.status === 'closed' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-blue-900 flex items-center gap-2 font-medium">
                <ShieldCheck className="w-4 h-4 shrink-0 text-blue-600" />
                <span>
                  <strong>الدورة مقفلة حالياً:</strong> يمكنك الآن النقر على <strong>(تعليم كتم تسليمها)</strong> لتحويل الكشوفات لسجل التسليم، أو استخدام زر <strong>(إلغاء القفل / إلغاء التسليم)</strong> لإعادة فتحها لإصدار تعديلات جديدة.
                </span>
              </div>
            )}

            {activePeriod.status === 'archived' && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 flex items-center gap-2 font-medium">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>
                  <strong>تم تسليم الرواتب لهذه الدورة:</strong> الرواتب محفوظة كمسلمة رسمياً. يمكنك استخدام زر <strong>(إلغاء القفل / إلغاء التسليم)</strong> لإلغاء التسليم وإعادة فتح الدورة لإجراء أي تعديل جديد.
                </span>
              </div>
            )}
          </div>

        </div>
      )}

      {/* TAB 5: Archive / Delivered */}
      {activeTab === 'archive' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-2 mb-4">
              <Archive className="w-4 h-4 text-slate-700" />
              سجل الدورات المالية المسلّمة ({archivedPeriodsList.length})
            </h3>

            {archivedPeriodsList.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold">
                لا توجد دورات مالية مسلّمة أو مقفلة حتى الآن.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archivedPeriodsList.map((period) => (
                  <div
                    key={period.id}
                    onClick={() => setArchivedPeriodSelected(period)}
                    className={`p-5 rounded-3xl border transition-all cursor-pointer ${
                      archivedPeriodSelected?.id === period.id
                        ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-800">
                        {period.status === 'closed' ? '🔒 مقفلة' : '✅ تم تسليمها'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{period.id}</span>
                    </div>

                    <div className="text-sm font-black text-slate-900 font-mono mt-2">
                      {period.startDate} ← {period.endDate}
                    </div>

                    <p className="text-[11px] text-slate-500 font-medium mt-1">
                      عدد أيام الدورة: {period.actualDays} يوم
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-blue-600 font-bold">
                      <span>عرض الكشف الكامل</span>
                      <ChevronLeft className="w-4 h-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived Period Detail View */}
          {archivedPeriodSelected && (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">
                    كشف الرواتب للدورة المسلّمة: {archivedPeriodSelected.startDate} إلى {archivedPeriodSelected.endDate}
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    السجلات الرسمية المحفوظة بالكامل
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Export PDF Button */}
                  <button
                    type="button"
                    onClick={() => {
                      /* TODO: Export PDF feature integration */
                      alert('تصدير PDF جاهز للبنية المستقبلية.');
                    }}
                    className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>تصدير PDF</span>
                  </button>

                  {/* Export Excel Button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (archivedPeriodSelected) {
                        exportArchivedPeriodToExcel(archivedPeriodSelected, archivedPeriodRecords);
                      }
                    }}
                    className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>تصدير Excel</span>
                  </button>
                </div>
              </div>

              {/* Archived Employees Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold">
                    <tr>
                      <th className="p-3">اسم الموظف</th>
                      <th className="p-3">الراتب الأساسي</th>
                      <th className="p-3">إجمالي الإضافات</th>
                      <th className="p-3">إجمالي الخصومات</th>
                      <th className="p-3">صافي الراتب</th>
                      <th className="p-3 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {archivedPeriodRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400 font-bold">
                          لا توجد سجلات رواتب محفوظة لهذه الدورة.
                        </td>
                      </tr>
                    ) : (
                      archivedPeriodRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="p-3 font-black text-slate-900">{rec.employeeName}</td>
                          <td className="p-3 font-mono">{rec.baseSalary.toLocaleString()} د.ع</td>
                          <td className="p-3 font-mono text-emerald-700">+{rec.totalAdditions.toLocaleString()} د.ع</td>
                          <td className="p-3 font-mono text-red-700">-{rec.totalDeductions.toLocaleString()} د.ع</td>
                          <td className="p-3 font-mono font-black text-emerald-800">{rec.netSalary.toLocaleString()} د.ع</td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedArchivedEmpRecord(rec)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] cursor-pointer"
                            >
                              عرض الكشف
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* MODAL 1: DETAILED PAYSLIP MODAL (كشف راتب تفصيلي) */}
      <AnimatePresence>
        {selectedEmployeeForPayslip && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-base">
                      كشف راتب تفصيلي: {selectedEmployeeForPayslip.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono">
                      الفترة: {activePeriod.startDate} إلى {activePeriod.endDate} ({activePeriod.actualDays} يوم)
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedEmployeeForPayslip(null)}
                  className="p-1 hover:bg-slate-800 rounded-xl text-slate-300 transition-colors cursor-pointer"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 text-xs overflow-y-auto">
                {(() => {
                  const data = computedPayrollRecordsMap.get(selectedEmployeeForPayslip.id);
                  if (!data) return null;
                  const { record, details } = data;

                  return (
                    <div className="space-y-4">
                      
                      {/* Financial Formula Card */}
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2.5 font-medium">
                        
                        {/* Base Salary */}
                        <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                          <span className="font-extrabold text-slate-800 text-sm">الراتب الأساسي:</span>
                          <span className="font-mono font-black text-slate-900 text-sm">{record.baseSalary.toLocaleString()} د.ع</span>
                        </div>

                        {/* Additions Breakdown */}
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[11px] font-black text-emerald-800 flex items-center gap-1">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>(+) المستحقات والإضافات:</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700 bg-amber-50/50 p-2 rounded-xl border border-amber-100">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>• الوقت الإضافي المعتمد ({record.overtimeMinutes} دقيقة):</span>
                            </div>
                            <span className="font-mono text-emerald-700 font-bold">+{record.overtimeAddition.toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• المكافآت والحوافز المباشرة:</span>
                            <span className="font-mono text-emerald-700 font-bold">+{record.bonuses.toLocaleString()} د.ع</span>
                          </div>

                          {/* Direct Cycle Bonuses Itemization */}
                          {(() => {
                            const empCycleBonuses = financialAdjustments.filter((adj) => {
                              if (adj.employeeId !== selectedEmployeeForPayslip.id || adj.type !== 'reward') return false;
                              if (adj.cycleId && (adj.cycleId === activePeriod.id || adj.cycleId === `period_${activePeriod.id}`)) return true;
                              if (adj.date && activePeriod.startDate && activePeriod.endDate) {
                                return adj.date >= activePeriod.startDate && adj.date <= activePeriod.endDate;
                              }
                              return false;
                            });
                            if (empCycleBonuses.length === 0) return null;
                            return (
                              <div className="mr-6 space-y-1 bg-emerald-50/50 p-2 rounded-xl border border-emerald-100 text-[10px]">
                                {empCycleBonuses.map((b) => (
                                  <div key={b.id} className="flex items-center justify-between text-emerald-900">
                                    <span>• {b.reason} ({b.date}):</span>
                                    <span className="font-mono font-bold">+{b.amount.toLocaleString()} د.ع</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {(record.rewardAmount || 0) > 0 && (
                            <div className="flex items-center justify-between pr-4 bg-purple-50/80 p-2 rounded-xl border border-purple-100">
                              <span className="font-extrabold text-purple-900">• مكافأة نظام النقاط:</span>
                              <span className="font-mono text-purple-700 font-black">+{(record.rewardAmount || 0).toLocaleString()} د.ع</span>
                            </div>
                          )}
                        </div>

                        {/* Deductions Breakdown */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-200">
                          <div className="text-[11px] font-black text-red-800 flex items-center gap-1">
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span>(-) الاستقطاعات والخصومات:</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• التأخير صباحاً ({record.lateMinutes} دقيقة):</span>
                            <span className="font-mono text-red-600 font-bold">-{record.lateDeduction.toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• الخروج المبكر ({record.earlyCheckoutMinutes || 0} دقيقة):</span>
                            <span className="font-mono text-red-600 font-bold">-{(record.earlyCheckoutDeduction || 0).toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• عدم بصمة الخروج ({record.missingCheckOutCount || 0} مرات):</span>
                            <span className="font-mono text-red-600 font-bold">-{(record.missingCheckOutDeduction || 0).toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• الإجازات بدون راتب ({record.unpaidLeaveDays} يوم):</span>
                            <span className="font-mono text-red-600 font-bold">-{record.unpaidLeaveDeduction.toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• الغياب بدون عذر ({record.absenceDays} يوم):</span>
                            <span className="font-mono text-red-600 font-bold">-{record.absenceDeduction.toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• الأيام غير على رأس العمل ({record.notEmployedDays || 0} يوم):</span>
                            <span className="font-mono text-red-600 font-bold">-{(record.notEmployedDeduction || 0).toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• السلف المستقطعة:</span>
                            <span className="font-mono text-red-600 font-bold">-{record.advances.toLocaleString()} د.ع</span>
                          </div>

                          <div className="flex items-center justify-between pr-4 text-slate-700">
                            <span>• الخصومات اليدوية الإدارية:</span>
                            <span className="font-mono text-red-600 font-bold">-{record.manualDeductions.toLocaleString()} د.ع</span>
                          </div>

                          {/* Direct Cycle Deductions Itemization */}
                          {(() => {
                            const empCycleDeductions = financialAdjustments.filter((adj) => {
                              if (adj.employeeId !== selectedEmployeeForPayslip.id || adj.type !== 'deduction') return false;
                              if (adj.cycleId && (adj.cycleId === activePeriod.id || adj.cycleId === `period_${activePeriod.id}`)) return true;
                              if (adj.date && activePeriod.startDate && activePeriod.endDate) {
                                return adj.date >= activePeriod.startDate && adj.date <= activePeriod.endDate;
                              }
                              return false;
                            });
                            if (empCycleDeductions.length === 0) return null;
                            return (
                              <div className="mr-6 space-y-1 bg-red-50/50 p-2 rounded-xl border border-red-100 text-[10px]">
                                {empCycleDeductions.map((d) => (
                                  <div key={d.id} className="flex items-center justify-between text-red-900">
                                    <span>• {d.reason} ({d.date}):</span>
                                    <span className="font-mono font-bold">-{d.amount.toLocaleString()} د.ع</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}

                          {(record.rewardAmount || 0) < 0 && (
                            <div className="flex items-center justify-between pr-4 bg-rose-50/80 p-2 rounded-xl border border-rose-100">
                              <span className="font-extrabold text-rose-900">• خصم نظام النقاط:</span>
                              <span className="font-mono text-rose-700 font-black">-{Math.abs(record.rewardAmount || 0).toLocaleString()} د.ع</span>
                            </div>
                          )}

                          {(record.rewardAmount === undefined || record.rewardAmount === 0) && (
                            <div className="flex items-center justify-between pr-4 text-slate-500">
                              <span>• مكافأة / خصم نظام النقاط:</span>
                              <span className="font-mono text-slate-600 font-bold">0 د.ع</span>
                            </div>
                          )}
                        </div>

                        {/* Net Salary Total */}
                        <div className="pt-3 border-t-2 border-slate-300 flex items-center justify-between bg-emerald-50/80 p-3 rounded-xl border border-emerald-200">
                          <span className="font-black text-slate-900 text-base">(=) صافي الراتب النهائي:</span>
                          <span className="font-mono font-black text-emerald-800 text-lg">{record.netSalary.toLocaleString()} د.ع</span>
                        </div>

                      </div>

                      {/* Explain Calculation Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setShowCalculationExplanation(!showCalculationExplanation)}
                          className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <HelpCircle className="w-4 h-4 text-blue-600" />
                          <span>{showCalculationExplanation ? 'إخفاء شرح طريقة الحساب' : 'شرح طريقة الحساب الدقيقة'}</span>
                          <ChevronDown className={`w-4 h-4 transition-transform ${showCalculationExplanation ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Expanded Calculation Details from payrollService */}
                      {showCalculationExplanation && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="bg-blue-50/80 border border-blue-200 p-4 rounded-2xl space-y-2 text-[11px] font-medium text-slate-800"
                        >
                          <div className="font-black text-blue-900 text-xs flex items-center gap-1">
                            <Info className="w-4 h-4 text-blue-600" />
                            <span>المعادلات الحسابية الرسمية ({details.calculationVersion}):</span>
                          </div>

                          <ul className="space-y-1.5 list-disc list-inside text-slate-700 pt-1">
                            <li>
                              <strong>عدد أيام الدورة المالية:</strong> {details.cycleDays} يوم (حساب أيا الفعلي للفترة).
                            </li>
                            <li>
                              <strong>قيمة اليوم الفعلي (dailyRate):</strong> {record.baseSalary.toLocaleString()} ÷ {details.cycleDays} = <strong className="font-mono">{details.dailyRate.toLocaleString()} د.ع/يوم</strong>.
                            </li>
                            <li>
                              <strong>قيمة الساعة العمل (8 ساعات):</strong> {details.dailyRate.toLocaleString()} ÷ 8 = <strong className="font-mono">{details.hourlyRate.toLocaleString()} د.ع/ساعة</strong>.
                            </li>
                            <li>
                              <strong>قيمة الدقيقة الواحدة:</strong> <strong className="font-mono">{details.perMinuteRate.toFixed(4)} د.ع/دقيقة</strong>.
                            </li>
                            <li>
                              <strong>خصم الغياب (غرامة مضاعفة):</strong> عدد أيام الغياب × (قيمة اليوم × 2).
                            </li>
                            <li>
                              <strong>خصم الأيام غير على رأس العمل:</strong> عدد الأيام غير الفعالة × قيمة اليوم (خصم قيمة اليوم 1x).
                            </li>
                            <li>
                              <strong>خصم الإجازة بدون راتب:</strong> عدد الأيام × قيمة اليوم.
                            </li>
                          </ul>
                        </motion.div>
                      )}

                    </div>
                  );
                })()}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const data = computedPayrollRecordsMap.get(selectedEmployeeForPayslip.id);
                    if (data) {
                      exportSingleEmployeePayslipToExcel(selectedEmployeeForPayslip.name, selectedEmployeeForPayslip.department || 'عام', data.record, data.details);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير كشف الموظف (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEmployeeForPayslip(null)}
                  className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer hover:bg-slate-800"
                >
                  إغلاق الكشف
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: CONFIRM LOCK CYCLE */}
      <AnimatePresence>
        {showLockConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-4 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-black text-slate-900">تأكيد قفل الدورة المالية</h3>

              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                هل أنت متأكد من قفل الدورة المالية للفترة (<strong className="font-mono">{activePeriod.startDate} إلى {activePeriod.endDate}</strong>)؟
                <br />
                <span className="text-red-600 font-bold">تنبيه: بعد القفل لن يسمح بأي تعديل نهائياً على سجلات هذه الدورة.</span>
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLockConfirmModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleLockCycle}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  <span>نعم، قفل الدورة نهائياً</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2.5: CONFIRM UNLOCK CYCLE */}
      <AnimatePresence>
        {showUnlockConfirmModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-4 text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Unlock className="w-7 h-7" />
              </div>

              <h3 className="text-lg font-black text-slate-900">تأكيد إلغاء قفل / تسليم الدورة المالية</h3>

              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                هل أنت متأكد من إلغاء قفل أو تسليم الدورة المالية للفترة (<strong className="font-mono">{activePeriod.startDate} إلى {activePeriod.endDate}</strong>)؟
                <br />
                <span className="text-amber-700 font-bold">سيتم إلغاء حالة الأرشفة والقفل وإعادة الدورة إلى حالة "معتمدة/مفتوحة" لإتاحة التعديل والمراجعة الإدارية.</span>
              </p>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUnlockConfirmModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleUnlockCycle}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  <span>نعم، إلغاء القفل وفتح التعديل</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: ARCHIVED EMPLOYEE RECORD PAYSLIP */}
      <AnimatePresence>
        {selectedArchivedEmpRecord && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-6 border border-slate-200 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="font-black text-base text-slate-900">
                  كشف راتب مسلّم: {selectedArchivedEmpRecord.employeeName}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedArchivedEmpRecord(null)}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs font-medium bg-slate-50 p-4 rounded-2xl border border-slate-200">
                <div className="flex justify-between">
                  <span>الراتب الأساسي:</span>
                  <span className="font-mono font-bold">{selectedArchivedEmpRecord.baseSalary.toLocaleString()} د.ع</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>الوقت الإضافي:</span>
                  <span className="font-mono font-bold">+{selectedArchivedEmpRecord.overtimeAddition.toLocaleString()} د.ع</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>المكافآت المباشرة:</span>
                  <span className="font-mono font-bold">+{selectedArchivedEmpRecord.bonuses.toLocaleString()} د.ع</span>
                </div>
                {(selectedArchivedEmpRecord.rewardAmount || 0) > 0 && (
                  <div className="flex justify-between text-purple-700 font-bold bg-purple-50 p-1.5 rounded-lg border border-purple-100">
                    <span>مكافأة نظام النقاط:</span>
                    <span className="font-mono">+{selectedArchivedEmpRecord.rewardAmount?.toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between text-red-600">
                  <span>خصم التأخير الصباحي:</span>
                  <span className="font-mono font-bold">-{selectedArchivedEmpRecord.lateDeduction.toLocaleString()} د.ع</span>
                </div>
                {(selectedArchivedEmpRecord.earlyCheckoutDeduction || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصم الخروج المبكر:</span>
                    <span className="font-mono font-bold">-{(selectedArchivedEmpRecord.earlyCheckoutDeduction || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                {(selectedArchivedEmpRecord.missingCheckOutDeduction || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصم عدم بصمة الخروج:</span>
                    <span className="font-mono font-bold">-{(selectedArchivedEmpRecord.missingCheckOutDeduction || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between text-red-600">
                  <span>خصم الغياب بدون عذر:</span>
                  <span className="font-mono font-bold">-{selectedArchivedEmpRecord.absenceDeduction.toLocaleString()} د.ع</span>
                </div>
                {(selectedArchivedEmpRecord.unpaidLeaveDeduction || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصم إجازات بدون راتب:</span>
                    <span className="font-mono font-bold">-{(selectedArchivedEmpRecord.unpaidLeaveDeduction || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                {(selectedArchivedEmpRecord.notEmployedDeduction || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصم أيام غير على رأس العمل:</span>
                    <span className="font-mono font-bold">-{(selectedArchivedEmpRecord.notEmployedDeduction || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between text-red-600">
                  <span>استقطاع السلف:</span>
                  <span className="font-mono font-bold">-{selectedArchivedEmpRecord.advances.toLocaleString()} د.ع</span>
                </div>
                {(selectedArchivedEmpRecord.manualDeductions || 0) > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>خصومات يدوية إدارية:</span>
                    <span className="font-mono font-bold">-{(selectedArchivedEmpRecord.manualDeductions || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                {(selectedArchivedEmpRecord.rewardAmount || 0) < 0 && (
                  <div className="flex justify-between text-rose-700 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                    <span>خصم نظام النقاط والأداء:</span>
                    <span className="font-mono">-{Math.abs(selectedArchivedEmpRecord.rewardAmount || 0).toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-300 flex justify-between font-black text-sm text-slate-900">
                  <span>صافي الراتب:</span>
                  <span className="font-mono text-emerald-800">{selectedArchivedEmpRecord.netSalary.toLocaleString()} د.ع</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => exportSingleEmployeePayslipToExcel(
                    selectedArchivedEmpRecord.employeeName,
                    'عام',
                    selectedArchivedEmpRecord,
                    undefined,
                    archivedPeriodSelected ? `${archivedPeriodSelected.startDate} إلى ${archivedPeriodSelected.endDate}` : undefined
                  )}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير كشف الموظف (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedArchivedEmpRecord(null)}
                  className="px-4 py-2 bg-slate-900 text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
