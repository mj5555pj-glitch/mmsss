import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Users,
  Clock,
  AlertTriangle,
  Zap,
  DollarSign,
  UserCheck,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  BellRing,
  FileText,
  Activity,
  ArrowUpRight,
  RefreshCw,
  X,
  MapPin,
  ShieldCheck,
  Search,
  Filter,
  Check,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Employee,
  CompanySettings,
  AttendanceRecord,
  OvertimeRecord,
  LeaveRequest,
  GraceRequest,
  PayrollPeriod,
  AuditLogEntry
} from '../types';
import { hrEngine } from '../lib/hrEngine';
import { getEffectiveWorkDateStr } from '../utils';
import { getEffectiveEarlyCheckoutMinutes, getEffectiveLateMinutes } from '../lib/attendanceService';
import {
  subscribeAttendanceRecords,
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribeGraceRequests,
  subscribePayrollPeriods,
  subscribeCompanySettings,
  subscribeAuditLogs,
  updateOvertimeRecord,
  updateLeaveRequest,
  updateGraceRequest,
  createAuditLog
} from '../lib/dbService';

interface DailyOperationsCenterProps {
  employees: Employee[];
  onNavigateTab?: (tab: string) => void;
}

export default function DailyOperationsCenter({ employees, onNavigateTab }: DailyOperationsCenterProps) {
  // Real-time Firestore states
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [graceRequests, setGraceRequests] = useState<GraceRequest[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Active modal state for quick management
  const [activeModal, setActiveModal] = useState<
    'attendance' | 'overtime' | 'leaves' | 'grace' | 'payroll' | 'audit' | null
  >(null);

  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Subscriptions to Firestore Realtime DB
  useEffect(() => {
    const unsubSettings = subscribeCompanySettings((sets) => { if (sets) setCompanySettings(sets); }, () => {});
    const unsubAttendance = subscribeAttendanceRecords((recs) => setAttendanceRecords(recs), () => {});
    const unsubOvertime = subscribeOvertimeRecords((recs) => setOvertimeRecords(recs), () => {});
    const unsubLeaves = subscribeLeaveRequests((recs) => setLeaveRequests(recs), () => {});
    const unsubGrace = subscribeGraceRequests((recs) => setGraceRequests(recs), () => {});
    const unsubPeriods = subscribePayrollPeriods((recs) => setPayrollPeriods(recs), () => {});
    const unsubAudit = subscribeAuditLogs((logs) => setAuditLogs(logs), () => {});

    return () => {
      unsubSettings();
      unsubAttendance();
      unsubOvertime();
      unsubLeaves();
      unsubGrace();
      unsubPeriods();
      unsubAudit();
    };
  }, []);

  // Effective Settings Fallback
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

  // Today Date Helper
  const now = new Date();
  const todayStr = getEffectiveWorkDateStr(now);

  const arabicDateFormatted = new Date().toLocaleDateString('ar-IQ', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Active Payroll Period
  const activePeriod: PayrollPeriod = useMemo(() => {
    const found = payrollPeriods.find((p) => p.status === 'open');
    if (found) return found;

    // Fallback current cycle: e.g. 16th of previous/current month to 15th of current/next month
    const startDay = effectiveSettings.salaryCycleStartDay || 16;
    const endDay = effectiveSettings.salaryCycleEndDay || 15;

    const curD = now.getDate();
    let startM = now.getMonth();
    let startY = now.getFullYear();
    if (curD < startDay) {
      startM -= 1;
      if (startM < 0) {
        startM = 11;
        startY -= 1;
      }
    }
    const endM = startM === 11 ? 0 : startM + 1;
    const endY = startM === 11 ? startY + 1 : startY;

    const startDate = `${startY}-${String(startM + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDate = `${endY}-${String(endM + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
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
      createdAt: now.toISOString(),
    };
  }, [payrollPeriods, effectiveSettings, now]);

  // Filter today's attendance
  const todayAttendance = useMemo(() => {
    return attendanceRecords.filter((r) => r.date === todayStr && !r.isDeleted);
  }, [attendanceRecords, todayStr]);

  // Attendance Statistics
  const presentCount = useMemo(() => {
    return todayAttendance.filter((r) => r.status === 'present').length;
  }, [todayAttendance]);

  const lateCount = useMemo(() => {
    return todayAttendance.filter((r) => getEffectiveLateMinutes(r, companySettings?.workStartTime, companySettings?.lateToleranceMinutes) > 0).length;
  }, [todayAttendance, companySettings]);

  const earlyCheckoutCount = useMemo(() => {
    return todayAttendance.filter((r) => getEffectiveEarlyCheckoutMinutes(r, companySettings?.workEndTime, companySettings?.earlyCheckoutToleranceMinutes) > 0).length;
  }, [todayAttendance, companySettings]);

  const activeEmployeesCount = employees.filter((e) => e.status !== 'terminated').length;
  const totalCheckedIn = todayAttendance.filter((r) => r.checkInTime).length;
  const absentCount = useMemo(() => {
    const activeEmps = employees.filter((e) => e.status !== 'terminated');
    const now = new Date();
    return activeEmps.filter((emp) => {
      const rec = todayAttendance.find((r) => r.employeeId === emp.id);
      const status = hrEngine.attendanceService.resolveDailyAttendanceStatus(rec || null, todayStr, effectiveSettings, now, leaveRequests, emp.id, emp);
      return status === 'absent';
    }).length;
  }, [employees, todayAttendance, todayStr, effectiveSettings]);

  // Overtime Statistics
  const pendingOvertimeRecords = useMemo(() => {
    return overtimeRecords.filter((r) => !r.isDeleted && r.status === 'pending');
  }, [overtimeRecords]);

  const approvedOvertimeCount = useMemo(() => {
    return overtimeRecords.filter((r) => !r.isDeleted && r.status === 'approved').length;
  }, [overtimeRecords]);

  const rejectedOvertimeCount = useMemo(() => {
    return overtimeRecords.filter((r) => !r.isDeleted && r.status === 'rejected').length;
  }, [overtimeRecords]);

  // Leave Statistics
  const pendingLeaveRequests = useMemo(() => {
    return leaveRequests.filter((r) => !r.isDeleted && r.status === 'pending');
  }, [leaveRequests]);

  const approvedLeaveCount = useMemo(() => {
    return leaveRequests.filter((r) => !r.isDeleted && r.status === 'approved').length;
  }, [leaveRequests]);

  const rejectedLeaveCount = useMemo(() => {
    return leaveRequests.filter((r) => !r.isDeleted && r.status === 'rejected').length;
  }, [leaveRequests]);

  // Grace Request Statistics (استثناءات التأخير والخروج المبكر)
  const pendingGraceRequests = useMemo(() => {
    return graceRequests.filter((r) => !r.isDeleted && r.status === 'pending');
  }, [graceRequests]);

  const approvedGraceCount = useMemo(() => {
    return graceRequests.filter((r) => !r.isDeleted && r.status === 'approved').length;
  }, [graceRequests]);

  const rejectedGraceCount = useMemo(() => {
    return graceRequests.filter((r) => !r.isDeleted && r.status === 'rejected').length;
  }, [graceRequests]);

  // Expected Total Payroll calculation for active employees
  const totalExpectedPayroll = useMemo(() => {
    let total = 0;
    employees.forEach((emp) => {
      const empAttendance = attendanceRecords.filter((r) => r.employeeId === emp.id && !r.isDeleted);
      const empOvertime = overtimeRecords.filter((r) => r.employeeId === emp.id && !r.isDeleted);
      const empLeaves = leaveRequests.filter((r) => r.employeeId === emp.id && !r.isDeleted);

      const calc = hrEngine.payrollService.generateCalculationDetails({
        employeeId: emp.id,
        employeeName: emp.name,
        employee: emp,
        baseSalary: emp.baseSalary || 0,
        period: activePeriod,
        attendanceRecords: empAttendance,
        leaveRequests: empLeaves,
        overtimeRecords: empOvertime,
        overtimeHourlyRate: effectiveSettings.overtimeHourlyRate,
        settings: effectiveSettings,
        now: new Date(),
      });

      total += calc.netSalary;
    });
    return total;
  }, [employees, attendanceRecords, overtimeRecords, leaveRequests, activePeriod, effectiveSettings]);

  // Smart Alerts List Generation
  const smartAlerts = useMemo(() => {
    const alerts: { id: string; type: 'danger' | 'warning' | 'info'; title: string; subtitle: string; time: string }[] = [];

    // 1. Employees exceeded max late limit
    todayAttendance.forEach((rec) => {
      if (rec.lateMinutes && rec.lateMinutes > effectiveSettings.maxLateMinutes) {
        alerts.push({
          id: `alert_max_late_${rec.id}`,
          type: 'danger',
          title: `تجاوز أقصى حد للتأخير: ${rec.employeeName}`,
          subtitle: `سجل الموظف تأخيراً قدره ${rec.lateMinutes} دقيقة (الحد الأقصى ${effectiveSettings.maxLateMinutes} دقيقة)`,
          time: rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : 'اليوم',
        });
      }
    });

    // 2. Out of GPS radius check-in
    todayAttendance.forEach((rec) => {
      if (rec.location && !rec.location.isWithinRadius) {
        alerts.push({
          id: `alert_gps_${rec.id}`,
          type: 'danger',
          title: `بصمة خارج النطاق المسموح: ${rec.employeeName}`,
          subtitle: `تم تسجيل البصمة على بعد ${Math.round(rec.location.distanceMeters)} متر من مقر الشركة`,
          time: rec.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : 'اليوم',
        });
      }
    });

    // 3. Pending Overtime requests
    if (pendingOvertimeRecords.length > 0) {
      alerts.push({
        id: 'alert_pending_overtime',
        type: 'warning',
        title: `طلبات وقت إضافي بانتظار الموافقة (${pendingOvertimeRecords.length})`,
        subtitle: `يوجد ${pendingOvertimeRecords.length} طلب وقت إضافي معلق يتطلب اعتماد الإدارة`,
        time: 'الآن',
      });
    }

    // 4. Pending Leave requests
    if (pendingLeaveRequests.length > 0) {
      alerts.push({
        id: 'alert_pending_leaves',
        type: 'warning',
        title: `طلبات إجازات بانتظار الاعتماد (${pendingLeaveRequests.length})`,
        subtitle: `يوجد ${pendingLeaveRequests.length} طلب إجازة جديد يتطلب مراجعة الشؤون الإدارية`,
        time: 'الآن',
      });
    }

    // 5. Pending Grace Exception requests
    if (pendingGraceRequests.length > 0) {
      alerts.push({
        id: 'alert_pending_grace',
        type: 'warning',
        title: `طلبات استثناء للتأخير والخروج المبكر (${pendingGraceRequests.length})`,
        subtitle: `يوجد ${pendingGraceRequests.length} طلب سماحية معلق يتطلب قرار المالك`,
        time: 'الآن',
      });
    }

    return alerts;
  }, [todayAttendance, pendingOvertimeRecords, pendingLeaveRequests, pendingGraceRequests, effectiveSettings]);

  // Approve / Reject Handlers
  const handleApproveOvertime = async (id: string) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      await updateOvertimeRecord(id, { status: 'approved', approvedBy: 'Manager', approvedAt: new Date().toISOString() });
      setActionFeedback({ type: 'success', text: 'تمت الموافقة على طلب الوقت الإضافي بنجاح.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء الاعتماد.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectOvertime = async (id: string) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      await updateOvertimeRecord(id, { status: 'rejected', approvedBy: 'Manager', approvedAt: new Date().toISOString() });
      setActionFeedback({ type: 'success', text: 'تم رفض طلب الوقت الإضافي.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء الرفض.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveLeave = async (id: string) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      await updateLeaveRequest(id, { status: 'approved', processedBy: 'Manager', processedAt: new Date().toISOString() });
      setActionFeedback({ type: 'success', text: 'تمت الموافقة على طلب الإجازة بنجاح.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء الاعتماد.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectLeave = async (id: string) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      await updateLeaveRequest(id, { status: 'rejected', processedBy: 'Manager', processedAt: new Date().toISOString() });
      setActionFeedback({ type: 'success', text: 'تم رفض طلب الإجازة.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء الرفض.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveGrace = async (id: string, reqObj?: GraceRequest) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      const now = new Date();
      const currentUserName = 'المالك / المدير';

      await updateGraceRequest(id, {
        status: 'approved',
        processedBy: currentUserName,
        processedAt: now.toISOString(),
      });

      if (reqObj) {
        const auditLog: AuditLogEntry = {
          id: `audit_grace_app_${now.getTime()}_${Math.random().toString(36).substring(2, 6)}`,
          userId: 'owner',
          userName: currentUserName,
          userRole: 'owner',
          date: now.toISOString().split('T')[0],
          time: now.toTimeString().substring(0, 8),
          timestamp: now.toISOString(),
          action: `اعتماد طلب سماحية ${reqObj.type === 'late_arrival' ? 'تأخير' : 'خروج مبكر'} للموظف (${reqObj.employeeName}) بتاريخ ${reqObj.date}`,
          reason: 'اعتماد المالك وإلغاء الخصم المترتب',
          targetEntity: 'grace_request',
          targetId: reqObj.id,
          dataBefore: { status: reqObj.status },
          dataAfter: { status: 'approved', processedBy: currentUserName, processedAt: now.toISOString() },
        };
        await createAuditLog(auditLog);
      }

      setActionFeedback({ type: 'success', text: 'تمت الموافقة على طلب استثناء التأخير/الخروج وتأكيد إلغاء الخصم بنجاح.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء اعتماد طلب السماحية.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectGrace = async (id: string, reqObj?: GraceRequest, reason?: string) => {
    setActionLoading(id);
    setActionFeedback(null);
    try {
      const now = new Date();
      const currentUserName = 'المالك / المدير';

      await updateGraceRequest(id, {
        status: 'rejected',
        processedBy: currentUserName,
        processedAt: now.toISOString(),
        rejectionReason: reason || 'تم الرفض بواسطة المالك',
      });

      if (reqObj) {
        const auditLog: AuditLogEntry = {
          id: `audit_grace_rej_${now.getTime()}_${Math.random().toString(36).substring(2, 6)}`,
          userId: 'owner',
          userName: currentUserName,
          userRole: 'owner',
          date: now.toISOString().split('T')[0],
          time: now.toTimeString().substring(0, 8),
          timestamp: now.toISOString(),
          action: `رفض طلب سماحية ${reqObj.type === 'late_arrival' ? 'تأخير' : 'خروج مبكر'} للموظف (${reqObj.employeeName}) بتاريخ ${reqObj.date}`,
          reason: reason || 'رفض المالك للطلب',
          targetEntity: 'grace_request',
          targetId: reqObj.id,
          dataBefore: { status: reqObj.status },
          dataAfter: { status: 'rejected', processedBy: currentUserName, processedAt: now.toISOString() },
        };
        await createAuditLog(auditLog);
      }

      setActionFeedback({ type: 'success', text: 'تم رفض طلب استثناء التأخير/الخروج.' });
    } catch (err: any) {
      setActionFeedback({ type: 'error', text: err.message || 'حدث خطأ أثناء رفض الطلب.' });
    } finally {
      setActionLoading(null);
    }
  };

  // Date format helpers
  const formatCycleDate = (dStr: string) => {
    if (!dStr) return '';
    const parts = dStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return dStr;
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Page Header Banner */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Daily Operations Center
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                مركز العمليات والإدارة المباشرة
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              لوحة التحكم الإدارية اليومية
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              متابعة العمليات المباشرة، الحضور والإنصراف، الساعات الإضافية والرواتب
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">تاريخ العمل اليوم:</span>
              <span className="text-xs font-black text-white">{arabicDateFormatted}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 1. TOP SECTION: ملخص اليوم (Daily Summary Grid)          */}
      {/* ======================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
            <h2 className="font-black text-slate-800 text-base">ملخص اليوم</h2>
          </div>
          <span className="text-[11px] font-bold text-slate-400">تحديث مباشر وشامل 🔄</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          
          {/* Item 1: Date */}
          <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-slate-400 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>📅</span> تاريخ اليوم
            </span>
            <span className="font-extrabold text-slate-800 text-xs">
              {now.toLocaleDateString('ar-IQ', { month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Item 2: Present */}
          <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-emerald-700 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>👥</span> الحاضرون
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-emerald-900 text-xl font-mono">{presentCount}</span>
              <span className="text-[10px] text-emerald-700 font-bold">موظف</span>
            </div>
          </div>

          {/* Item 3: Late */}
          <div className="bg-amber-50/70 border border-amber-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-amber-700 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>⏰</span> المتأخرون
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-amber-900 text-xl font-mono">{lateCount}</span>
              <span className="text-[10px] text-amber-700 font-bold">موظف</span>
            </div>
          </div>

          {/* Item 4: Absent */}
          <div className="bg-red-50/70 border border-red-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-red-700 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>❌</span> الغياب
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-red-900 text-xl font-mono">{absentCount}</span>
              <span className="text-[10px] text-red-700 font-bold">موظف</span>
            </div>
          </div>

          {/* Item 5: Pending Overtime */}
          <div className="bg-purple-50/70 border border-purple-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-purple-700 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>🕒</span> إضافي معلق
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-purple-900 text-xl font-mono">{pendingOvertimeRecords.length}</span>
              <span className="text-[10px] text-purple-700 font-bold">طلب</span>
            </div>
          </div>

          {/* Item 6: Pending Leaves */}
          <div className="bg-blue-50/70 border border-blue-100 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-blue-700 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>🏖️</span> إجازات معلقة
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-blue-900 text-xl font-mono">{pendingLeaveRequests.length}</span>
              <span className="text-[10px] text-blue-700 font-bold">طلب</span>
            </div>
          </div>

          {/* Item 7: Pending Grace Exceptions */}
          <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-amber-800 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>🛡️</span> استثناءات معلقة
            </span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-amber-950 text-xl font-mono">{pendingGraceRequests.length}</span>
              <span className="text-[10px] text-amber-800 font-bold">طلب</span>
            </div>
          </div>

          {/* Item 8: Expected Payroll */}
          <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex flex-col justify-between col-span-2 lg:col-span-1">
            <span className="text-blue-300 text-[10px] font-bold flex items-center gap-1 mb-1">
              <span>💰</span> الرواتب المتوقعة
            </span>
            <div className="truncate">
              <span className="font-black text-emerald-400 text-base font-mono block truncate">
                {totalExpectedPayroll.toLocaleString()}
              </span>
              <span className="text-[9px] text-slate-400 font-bold block">د.ع / الدورة الحالية</span>
            </div>
          </div>

        </div>
      </div>

      {/* BANNER: PENDING GRACE REQUESTS FOR OWNER DIRECT ACTION */}
      {pendingGraceRequests.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 rounded-3xl border-2 border-amber-300 p-5 md:p-6 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-amber-950 text-base">
                  طلبات استثناء التأخير والخروج المبكر بانتظار قرار المالك ({pendingGraceRequests.length})
                </h3>
                <p className="text-xs text-amber-800 font-medium mt-0.5">
                  يمكنك قبول أو رفض طلبات الاستثناء مباشرة من هنا دون الحاجة للانتقال لصفحة أخرى
                </p>
              </div>
            </div>
            <span className="bg-amber-600 text-white text-[11px] font-black px-3.5 py-1 rounded-full animate-pulse shadow-xs">
              قرار عاجل للمالك ⚡
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {pendingGraceRequests.map((req) => (
              <div key={req.id} className="bg-white p-4.5 rounded-2xl border border-amber-200/90 shadow-sm flex flex-col justify-between space-y-3 hover:border-amber-400 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <span className="font-black text-slate-900 text-sm">{req.employeeName}</span>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                      req.type === 'late_arrival'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-purple-100 text-purple-900 border border-purple-200'
                    }`}>
                      {req.type === 'late_arrival' ? '⏰ استثناء تأخير' : '🏃 استثناء خروج مبكر'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600">
                    <p className="font-bold flex items-center justify-between">
                      <span>التاريخ:</span>
                      <span className="font-mono font-black text-slate-800">{req.date}</span>
                    </p>
                    <p className="font-bold flex items-center justify-between">
                      <span>المدة المطلوبة:</span>
                      <span className="font-mono font-black text-amber-700">{req.minutes} دقيقة</span>
                    </p>
                  </div>

                  <div className="bg-amber-50/60 p-2.5 rounded-xl text-xs text-amber-900 border border-amber-100">
                    <span className="text-[10px] font-bold text-amber-700 block mb-0.5">سبب طلب الاستثناء:</span>
                    <p className="italic font-medium">"{req.reason || 'بدون سبب مدون'}"</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={actionLoading === req.id}
                    onClick={() => handleApproveGrace(req.id, req)}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    {actionLoading === req.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4" />}
                    <span>قبول (إلغاء الخصم)</span>
                  </button>

                  <button
                    type="button"
                    disabled={actionLoading === req.id}
                    onClick={() => handleRejectGrace(req.id, req)}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                  >
                    {actionLoading === req.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-4 h-4" />}
                    <span>رفض الطلب</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MAIN SIX CARDS GRID                                   */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* CARD 1: الحضور اليوم */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">الحضور اليوم</h3>
                  <p className="text-[10px] text-slate-400">إحصائيات انضباط دوام الموظفين</p>
                </div>
              </div>
              <span className="bg-emerald-50 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-200">
                مباشر
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 text-[10px] block">عدد الحاضرين:</span>
                <span className="font-black text-emerald-800 text-sm">{presentCount}</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 text-[10px] block">عدد المتأخرين:</span>
                <span className="font-black text-amber-800 text-sm">{lateCount}</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 text-[10px] block">عدد الغياب:</span>
                <span className="font-black text-red-800 text-sm">{absentCount}</span>
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-400 text-[10px] block">خروج قبل النهاية:</span>
                <span className="font-black text-blue-800 text-sm">{earlyCheckoutCount}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('attendance')}
            className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>إدارة الحضور</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 2: الوقت الإضافي */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5 fill-amber-500 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">الوقت الإضافي</h3>
                  <p className="text-[10px] text-slate-400">ساعات وسجلات العمل الإضافي</p>
                </div>
              </div>
              {pendingOvertimeRecords.length > 0 && (
                <span className="bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  {pendingOvertimeRecords.length} معلق
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-amber-50/60 border border-amber-100 p-2.5 rounded-xl">
                <span className="text-amber-700 text-[10px] font-bold block">الطلبات المعلقة</span>
                <span className="font-black text-amber-900 text-base font-mono">{pendingOvertimeRecords.length}</span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl">
                <span className="text-emerald-700 text-[10px] font-bold block">المقبولة</span>
                <span className="font-black text-emerald-900 text-base font-mono">{approvedOvertimeCount}</span>
              </div>

              <div className="bg-red-50/60 border border-red-100 p-2.5 rounded-xl">
                <span className="text-red-700 text-[10px] font-bold block">المرفوضة</span>
                <span className="font-black text-red-900 text-base font-mono">{rejectedOvertimeCount}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('overtime')}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>اعتماد الوقت الإضافي</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 3: الإجازات */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">الإجازات</h3>
                  <p className="text-[10px] text-slate-400">طلبات الإجازات المدفوعة وغير المدفوعة</p>
                </div>
              </div>
              {pendingLeaveRequests.length > 0 && (
                <span className="bg-purple-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  {pendingLeaveRequests.length} جديد
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-purple-50/60 border border-purple-100 p-2.5 rounded-xl">
                <span className="text-purple-700 text-[10px] font-bold block">الطلبات الجديدة</span>
                <span className="font-black text-purple-900 text-base font-mono">{pendingLeaveRequests.length}</span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl">
                <span className="text-emerald-700 text-[10px] font-bold block">المقبولة</span>
                <span className="font-black text-emerald-900 text-base font-mono">{approvedLeaveCount}</span>
              </div>

              <div className="bg-red-50/60 border border-red-100 p-2.5 rounded-xl">
                <span className="text-red-700 text-[10px] font-bold block">المرفوضة</span>
                <span className="font-black text-red-900 text-base font-mono">{rejectedLeaveCount}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('leaves')}
            className="w-full bg-purple-700 hover:bg-purple-800 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>إدارة الإجازات</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 3.5: استثناءات التأخير والخروج المبكر (Grace Requests) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center font-bold">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">استثناءات التأخير والخروج</h3>
                  <p className="text-[10px] text-slate-400">طلبات السماحية وإلغاء الخصم</p>
                </div>
              </div>
              {pendingGraceRequests.length > 0 && (
                <span className="bg-amber-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full animate-pulse">
                  {pendingGraceRequests.length} معلق
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div className="bg-amber-50/60 border border-amber-100 p-2.5 rounded-xl">
                <span className="text-amber-800 text-[10px] font-bold block">الطلبات المعلقة</span>
                <span className="font-black text-amber-950 text-base font-mono">{pendingGraceRequests.length}</span>
              </div>

              <div className="bg-emerald-50/60 border border-emerald-100 p-2.5 rounded-xl">
                <span className="text-emerald-700 text-[10px] font-bold block">المقبولة</span>
                <span className="font-black text-emerald-900 text-base font-mono">{approvedGraceCount}</span>
              </div>

              <div className="bg-red-50/60 border border-red-100 p-2.5 rounded-xl">
                <span className="text-red-700 text-[10px] font-bold block">المرفوضة</span>
                <span className="font-black text-red-900 text-base font-mono">{rejectedGraceCount}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('grace')}
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>اعتماد طلبات الاستثناء</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 4: الرواتب */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-bold">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">الرواتب</h3>
                  <p className="text-[10px] text-slate-400">إجمالي مستحقات ودورة الرواتب الحالية</p>
                </div>
              </div>
              <span className="bg-blue-50 text-blue-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-blue-200 font-mono">
                {formatCycleDate(activePeriod.startDate)} ↓ {formatCycleDate(activePeriod.endDate)}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 font-bold">دورة الرواتب الحالية:</span>
                <span className="font-black text-slate-800 font-mono">
                  {formatCycleDate(activePeriod.startDate)} ↓ {formatCycleDate(activePeriod.endDate)}
                </span>
              </div>

              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl">
                <span className="text-slate-500 font-bold">عدد الموظفين:</span>
                <span className="font-black text-slate-800 font-mono">{employees.length} موظف</span>
              </div>

              <div className="flex justify-between items-center bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
                <span className="text-blue-900 font-black">مجموع الرواتب المتوقع:</span>
                <span className="font-black text-blue-900 font-mono text-sm">
                  {totalExpectedPayroll.toLocaleString()} د.ع
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveModal('payroll')}
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>إدارة الرواتب</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 5: التنبيهات */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-50 text-red-700 border border-red-100 flex items-center justify-center font-bold">
                  <BellRing className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">التنبيهات</h3>
                  <p className="text-[10px] text-slate-400">إشعارات التجاوزات والطلبات العاجلة</p>
                </div>
              </div>
              <span className="bg-red-50 text-red-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-red-200">
                {smartAlerts.length} تنبيه
              </span>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {smartAlerts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs font-bold bg-slate-50 rounded-2xl">
                  <span>لا توجد تنبيهات عاجلة اليوم 👍</span>
                </div>
              ) : (
                smartAlerts.slice(0, 3).map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                      alert.type === 'danger'
                        ? 'bg-red-50/80 border-red-200 text-red-900'
                        : 'bg-amber-50/80 border-amber-200 text-amber-900'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-current" />
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-[11px] truncate">{alert.title}</p>
                      <p className="text-[10px] opacity-80 truncate">{alert.subtitle}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (pendingOvertimeRecords.length > 0) setActiveModal('overtime');
              else if (pendingLeaveRequests.length > 0) setActiveModal('leaves');
              else setActiveModal('attendance');
            }}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black text-xs py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <span>استعراض كافة التنبيهات</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* CARD 6: العمليات السريعة */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4 hover:border-slate-300 transition-all">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 border border-slate-200 flex items-center justify-center font-bold">
                  <Activity className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">العمليات السريعة</h3>
                  <p className="text-[10px] text-slate-400">وصول مباشر لأهم المهام الإدارية</p>
                </div>
              </div>
              <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                اختصارات
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveModal('attendance')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>إدارة الحضور والإنصراف</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('leaves')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-600" />
                  <span>اعتماد طلبات الإجازات</span>
                </div>
                {pendingLeaveRequests.length > 0 && (
                  <span className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                    {pendingLeaveRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('overtime')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-600" />
                  <span>اعتماد الوقت الإضافي</span>
                </div>
                {pendingOvertimeRecords.length > 0 && (
                  <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                    {pendingOvertimeRecords.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('grace')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>اعتماد طلبات استثناء التأخير والإنصراف</span>
                </div>
                {pendingGraceRequests.length > 0 && (
                  <span className="bg-amber-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
                    {pendingGraceRequests.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('payroll')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span>إدارة الرواتب كشف حساب</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveModal('audit')}
                className="w-full bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/70 p-2.5 rounded-xl font-bold flex items-center justify-between cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>سجل العمليات والتدقيق</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ======================================================== */}
      {/* MODALS FOR QUICK ACTIONS                                 */}
      {/* ======================================================== */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[85vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  {activeModal === 'attendance' && <UserCheck className="w-5 h-5 text-emerald-400" />}
                  {activeModal === 'overtime' && <Zap className="w-5 h-5 text-amber-400" />}
                  {activeModal === 'leaves' && <Calendar className="w-5 h-5 text-purple-400" />}
                  {activeModal === 'grace' && <ShieldAlert className="w-5 h-5 text-amber-400" />}
                  {activeModal === 'payroll' && <DollarSign className="w-5 h-5 text-blue-400" />}
                  {activeModal === 'audit' && <FileText className="w-5 h-5 text-slate-300" />}

                  <h3 className="font-extrabold text-sm">
                    {activeModal === 'attendance' && 'إدارة وتفاصيل الحضور اليومي'}
                    {activeModal === 'overtime' && 'اعتماد ومراجعة الوقت الإضافي'}
                    {activeModal === 'leaves' && 'إدارة واعتماد طلبات الإجازات'}
                    {activeModal === 'grace' && 'طلبات استثناء التأخير والخروج المبكر (قرارات المالك)'}
                    {activeModal === 'payroll' && 'كشف وتفاصيل الرواتب المتوقعة'}
                    {activeModal === 'audit' && 'سجل العمليات والأنشطة الإدارية'}
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setActionFeedback(null);
                  }}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Feedback toast */}
              {actionFeedback && (
                <div
                  className={`p-3 m-4 mb-0 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                    actionFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {actionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{actionFeedback.text}</span>
                </div>
              )}

              {/* Modal Body Content */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
                
                {/* 1. ATTENDANCE MODAL */}
                {activeModal === 'attendance' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div>
                        <span className="font-bold text-slate-700 block">سجل الحضور لليوم:</span>
                        <span className="text-[10px] text-slate-400">{arabicDateFormatted}</span>
                      </div>
                      {onNavigateTab && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            onNavigateTab('reports');
                          }}
                          className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs px-3 py-1.5 rounded-xl cursor-pointer"
                        >
                          عرض تقرير الحضور الكامل
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {employees.map((emp) => {
                        const rec = todayAttendance.find((r) => r.employeeId === emp.id);
                        return (
                          <div key={emp.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{emp.name}</p>
                              <p className="text-[10px] text-slate-400">
                                الدخول: {rec?.checkInTime ? new Date(rec.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                {' | '}
                                الخروج: {rec?.checkOutTime ? new Date(rec.checkOutTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </p>
                            </div>
                            <div className="text-left">
                              {!rec || !rec.checkInTime ? (
                                (emp.isExemptFromFingerprint || emp.exemptFromFingerprint) ? (
                                  <span className="bg-slate-100 text-slate-800 border border-slate-300 font-black px-2.5 py-1 rounded-lg text-[10px]">🛡️ غير مشمول بالبصمة</span>
                                ) : (
                                  <span className="bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-[10px]">لم يسجل الدخول</span>
                                )
                              ) : getEffectiveLateMinutes(rec, effectiveSettings.workStartTime, effectiveSettings.lateToleranceMinutes) === 0 ? (
                                <span className="bg-emerald-100 text-emerald-800 font-black px-2.5 py-1 rounded-lg text-[10px]">حاضر 🟢</span>
                              ) : (
                                <span className="bg-amber-100 text-amber-800 font-black px-2.5 py-1 rounded-lg text-[10px]">متأخر ({getEffectiveLateMinutes(rec, effectiveSettings.workStartTime, effectiveSettings.lateToleranceMinutes)} دقيقة) 🟡</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. OVERTIME MODAL */}
                {activeModal === 'overtime' && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-700">طلبات الوقت الإضافي المعلقة:</h4>
                    {pendingOvertimeRecords.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 font-bold">
                        لا توجد طلبات وقت إضافي معلقة بانتظار الاعتماد 👍
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingOvertimeRecords.map((ov) => (
                          <div key={ov.id} className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-black text-slate-800 text-sm">{ov.employeeName}</p>
                                <p className="text-[10px] text-slate-500 font-mono">التاريخ: {ov.date}</p>
                              </div>
                              <span className="bg-amber-200 text-amber-900 font-black text-[10px] px-2.5 py-0.5 rounded-full">
                                {ov.durationMinutes || 0} دقيقة ({( (ov.durationMinutes || 0) / 60 ).toFixed(1)} ساعة)
                              </span>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                disabled={actionLoading === ov.id}
                                onClick={() => handleApproveOvertime(ov.id)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                {actionLoading === ov.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>اعتماد الطلب</span>
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading === ov.id}
                                onClick={() => handleRejectOvertime(ov.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                {actionLoading === ov.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                <span>رفض الطلب</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. LEAVES MODAL */}
                {activeModal === 'leaves' && (
                  <div className="space-y-4">
                    <h4 className="font-bold text-slate-700">طلبات الإجازات المعلقة:</h4>
                    {pendingLeaveRequests.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 font-bold">
                        لا توجد طلبات إجازات جديدة بانتظار الموافقة 👍
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingLeaveRequests.map((lv) => (
                          <div key={lv.id} className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-black text-slate-800 text-sm">{lv.employeeName}</p>
                                <p className="text-[10px] text-purple-700 font-bold">
                                  {lv.type === 'paid' ? '🌴 إجازة مدفوعة' : '📄 إجازة بدون راتب'} ({lv.totalDays} يوم)
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  من {lv.startDate} إلى {lv.endDate} - السبب: {lv.reason}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                disabled={actionLoading === lv.id}
                                onClick={() => handleApproveLeave(lv.id)}
                                className="flex-1 bg-purple-700 hover:bg-purple-800 text-white font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                {actionLoading === lv.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                <span>موافقة على الإجازة</span>
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading === lv.id}
                                onClick={() => handleRejectLeave(lv.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                {actionLoading === lv.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                <span>رفض الطلب</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 3.5. GRACE REQUESTS MODAL (OWNER APPROVAL/REJECTION) */}
                {activeModal === 'grace' && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl flex items-center justify-between">
                      <div>
                        <h4 className="font-extrabold text-amber-950 text-xs">طلبات السماحية والاستثناء لإنضباط الدوام:</h4>
                        <p className="text-[10px] text-amber-800 mt-0.5">قبول الطلب يقوم تلقائياً بإلغاء خصم التأخير أو الخروج المبكر في سجل الحضور لليوم</p>
                      </div>
                      <span className="bg-amber-600 text-white font-black text-[10px] px-2.5 py-1 rounded-full font-mono">
                        {pendingGraceRequests.length} معلق
                      </span>
                    </div>

                    {pendingGraceRequests.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 font-bold border border-dashed border-slate-200">
                        لا توجد طلبات استثناء للتأخير أو الخروج المبكر معلقة حالياً 👍
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {pendingGraceRequests.map((req) => (
                          <div key={req.id} className="p-4 bg-white border-2 border-amber-200 rounded-2xl space-y-3 shadow-xs">
                            <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2">
                              <div>
                                <p className="font-black text-slate-900 text-sm">{req.employeeName}</p>
                                <p className="text-[11px] text-slate-500 font-mono mt-0.5">التاريخ: {req.date}</p>
                              </div>
                              <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg ${
                                req.type === 'late_arrival'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : 'bg-purple-100 text-purple-900 border border-purple-200'
                              }`}>
                                {req.type === 'late_arrival' ? '⏰ استثناء تأخير' : '🏃 استثناء خروج مبكر'} ({req.minutes} دقيقة)
                              </span>
                            </div>

                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <span className="text-[10px] font-bold text-slate-500 block mb-0.5">سبب طلب الموظف للاستثناء:</span>
                              <p className="italic text-slate-800 font-medium">"{req.reason || 'لم يتم ذكر سبب'}"</p>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                disabled={actionLoading === req.id}
                                onClick={() => handleApproveGrace(req.id, req)}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                              >
                                {actionLoading === req.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span>قبول الاستثناء (إلغاء الخصم)</span>
                              </button>

                              <button
                                type="button"
                                disabled={actionLoading === req.id}
                                onClick={() => handleRejectGrace(req.id, req)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs"
                              >
                                {actionLoading === req.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                <span>رفض الطلب</span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. PAYROLL MODAL */}
                {activeModal === 'payroll' && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <span className="font-bold text-blue-900 block">إجمالي الرواتب المتوقعة للدورة:</span>
                        <span className="text-[10px] text-blue-700">
                          الدورة: {formatCycleDate(activePeriod.startDate)} ↓ {formatCycleDate(activePeriod.endDate)}
                        </span>
                      </div>
                      <span className="text-xl font-black text-blue-950 font-mono">
                        {totalExpectedPayroll.toLocaleString()} د.ع
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h5 className="font-bold text-slate-700">كشف صافي الرواتب المتوقعة للموظفين:</h5>
                      {employees.map((emp) => {
                        const empAttendance = attendanceRecords.filter((r) => r.employeeId === emp.id && !r.isDeleted);
                        const empOvertime = overtimeRecords.filter((r) => r.employeeId === emp.id && !r.isDeleted);
                        const empLeaves = leaveRequests.filter((r) => r.employeeId === emp.id && !r.isDeleted);

                        const calc = hrEngine.payrollService.generateCalculationDetails({
                          employeeId: emp.id,
                          employeeName: emp.name,
                          employee: emp,
                          baseSalary: emp.baseSalary || 0,
                          period: activePeriod,
                          attendanceRecords: empAttendance,
                          leaveRequests: empLeaves,
                          overtimeRecords: empOvertime,
                          overtimeHourlyRate: effectiveSettings.overtimeHourlyRate,
                          settings: effectiveSettings,
                        });

                        return (
                          <div key={emp.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                            <div>
                              <p className="font-black text-slate-800">{emp.name}</p>
                              <p className="text-[10px] text-slate-400">الراتب الأساسي: {(emp.baseSalary || 0).toLocaleString()} د.ع</p>
                            </div>
                            <div className="text-left font-mono">
                              <span className="font-black text-blue-900 text-sm block">
                                {calc.netSalary.toLocaleString()} د.ع
                              </span>
                              <span className="text-[9px] text-slate-400">
                                إضافات: +{calc.totalAdditions.toLocaleString()} | خصومات: -{calc.totalDeductions.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. AUDIT LOGS MODAL */}
                {activeModal === 'audit' && (
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-700">سجل الأنشطة والعمليات الإدارية:</h4>
                    {auditLogs.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl text-slate-400 font-bold">
                        لا توجد عمليات مسجلة حالياً
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {auditLogs.slice(0, 15).map((log) => (
                          <div key={log.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs space-y-1">
                            <div className="flex justify-between items-center font-bold">
                              <span className="text-blue-700">{log.action}</span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {new Date(log.timestamp).toLocaleString('ar-IQ')}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-600">المستخدم: {log.userName || log.userId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setActionFeedback(null);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs py-2.5 rounded-xl transition-colors cursor-pointer"
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
