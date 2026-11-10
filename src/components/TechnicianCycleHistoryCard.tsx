import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  Clock,
  UserCheck,
  FileSpreadsheet,
  Search,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Filter,
  Info,
  X,
  ShieldAlert,
  Send,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, AttendanceRecord, LeaveRequest, GraceRequest } from '../types';
import { resolveDailyAttendanceStatusDetails, checkIsMissingCheckOut, getEffectiveEarlyCheckoutMinutes, getEffectiveLateMinutes } from '../lib/attendanceService';
import { normalizeDateString } from '../utils';
import {
  subscribeAttendanceRecords,
  subscribeCompanySettings,
  subscribeLeaveRequests,
  subscribeGraceRequests,
  createGraceRequest
} from '../lib/dbService';

interface TechnicianCycleHistoryCardProps {
  employee: Employee;
  settings?: CompanySettings | null;
}

export default function TechnicianCycleHistoryCard({
  employee,
  settings: initialSettings
}: TechnicianCycleHistoryCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [graceRequests, setGraceRequests] = useState<GraceRequest[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(initialSettings || null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDayDetail, setSelectedDayDetail] = useState<any>(null);

  // Grace request form state inside day detail modal
  const [showGraceForm, setShowGraceForm] = useState(false);
  const [graceType, setGraceType] = useState<'late_arrival' | 'early_departure'>('late_arrival');
  const [graceMinutes, setGraceMinutes] = useState<number>(15);
  const [graceReason, setGraceReason] = useState('');
  const [graceSubmitting, setGraceSubmitting] = useState(false);
  const [graceSuccess, setGraceSuccess] = useState('');
  const [graceError, setGraceError] = useState('');

  // Subscribe to Company Settings
  useEffect(() => {
    const unsubSettings = subscribeCompanySettings(
      (sets) => {
        if (sets) setCompanySettings(sets);
      },
      (err) => console.warn('CycleHistoryCard settings error:', err)
    );
    return () => unsubSettings();
  }, []);

  // Subscribe to Attendance Records
  useEffect(() => {
    const unsubAttendance = subscribeAttendanceRecords(
      (recs) => setAttendanceRecords(recs),
      (err) => console.warn('CycleHistoryCard attendance error:', err)
    );
    return () => unsubAttendance();
  }, []);

  // Subscribe to Leave Requests
  useEffect(() => {
    const unsubLeaves = subscribeLeaveRequests(
      (recs) => setLeaveRequests(recs),
      (err) => console.warn('CycleHistoryCard leaves error:', err)
    );
    return () => unsubLeaves();
  }, []);

  // Subscribe to Grace Requests
  useEffect(() => {
    const unsubGrace = subscribeGraceRequests(
      (recs) => setGraceRequests(recs),
      (err) => console.warn('CycleHistoryCard grace error:', err)
    );
    return () => unsubGrace();
  }, []);

  // Live timer tick for date resolution
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // Default settings fallback
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

  // Compute Cycle Date Range (16th of previous month to 15th of current month)
  const cycleInfo = useMemo(() => {
    const now = nowDate;
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const curD = now.getDate();

    let endY = curY;
    let endM = curM;
    if (curD >= 16) {
      endM += 1;
      if (endM > 12) {
        endM = 1;
        endY += 1;
      }
    }

    const startM = endM === 1 ? 12 : endM - 1;
    const startY = endM === 1 ? endY - 1 : endY;

    const startDateStr = `${startY}-${String(startM).padStart(2, '0')}-16`;
    const endDateStr = `${endY}-${String(endM).padStart(2, '0')}-15`;

    const cycleDays: string[] = [];
    const d = new Date(startDateStr);
    const endD = new Date(endDateStr);
    while (d <= endD) {
      cycleDays.push(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() + 1);
    }
    cycleDays.reverse(); // Newest first

    return {
      startDateStr,
      endDateStr,
      cycleDays
    };
  }, [nowDate]);

  // Compute list of days with status & times for this employee
  const { daysList, stats } = useMemo(() => {
    let presentCount = 0;
    let lateCount = 0;
    let absentCount = 0;
    let leaveCount = 0;

    const empStartStr = normalizeDateString(employee.employmentDate || employee.joinDate || employee.joinedAt);

    const list = cycleInfo.cycleDays.map((dStr) => {
      const isBeforeEmployment = Boolean(empStartStr && normalizeDateString(dStr) < empStartStr);

      const record =
        attendanceRecords.find(
          (r) => r.employeeId === employee.id && r.date === dStr && !r.isDeleted
        ) || null;

      const statusDetails = isBeforeEmployment
        ? {
            status: 'not_employed' as const,
            sourceArabic: 'خارج فترة التعيين',
            explanation: 'تاريخ يسبق بداية عمل الموظف'
          }
        : resolveDailyAttendanceStatusDetails(
            record,
            dStr,
            effectiveSettings,
            nowDate,
            leaveRequests,
            employee.id,
            employee
          );

      if (statusDetails.status === 'present') presentCount++;
      else if (
        statusDetails.status === 'late' ||
        statusDetails.status === 'early_departure' ||
        statusDetails.status === 'late_and_early'
      ) lateCount++;
      else if (statusDetails.status === 'absent') absentCount++;
      else if (
        statusDetails.status === 'leave_paid' ||
        statusDetails.status === 'leave_unpaid'
      )
        leaveCount++;

      const dayName = new Date(`${dStr}T00:00:00`).toLocaleDateString('ar-IQ', {
        weekday: 'long'
      });

      return {
        dateStr: dStr,
        dayName,
        record,
        statusDetails
      };
    });

    return {
      daysList: list,
      stats: {
        totalDays: cycleInfo.cycleDays.length,
        presentCount,
        lateCount,
        absentCount,
        leaveCount
      }
    };
  }, [cycleInfo, attendanceRecords, effectiveSettings, nowDate, leaveRequests, employee]);

  // Filtered list based on status & search
  const filteredDaysList = useMemo(() => {
    return daysList.filter((item) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchDate = item.dateStr.includes(q);
        const matchDay = item.dayName.toLowerCase().includes(q);
        const matchStatus = (item.statusDetails.sourceArabic || item.statusDetails.status)
          .toLowerCase()
          .includes(q);
        if (!matchDate && !matchDay && !matchStatus) return false;
      }

      // Status filter
      if (statusFilter === 'present') {
        return item.statusDetails.status === 'present';
      }
      if (statusFilter === 'late') {
        return (
          item.statusDetails.status === 'late' ||
          item.statusDetails.status === 'early_departure' ||
          item.statusDetails.status === 'late_and_early'
        );
      }
      if (statusFilter === 'absent') {
        return item.statusDetails.status === 'absent';
      }
      if (statusFilter === 'leave') {
        return (
          item.statusDetails.status === 'leave_paid' ||
          item.statusDetails.status === 'leave_unpaid'
        );
      }

      return true;
    });
  }, [daysList, statusFilter, searchQuery]);

  // Format time for Excel export
  const getExcelTimeDisplay = (
    timeIso: string | undefined | null,
    statusDetails: { status: string; sourceArabic?: string; explanation?: string },
    isCheckOut = false,
    record?: AttendanceRecord | null,
    dateStr?: string
  ) => {
    if (timeIso) {
      return new Date(timeIso).toLocaleTimeString('ar-IQ', {
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    if (isCheckOut && record && dateStr) {
      const missingInfo = checkIsMissingCheckOut(record, dateStr, effectiveSettings, nowDate);
      if (missingInfo.isMissingCheckOut) {
        const [h, m] = (effectiveSettings?.workEndTime || '16:00').split(':').map(Number);
        const dummy = new Date();
        dummy.setHours(h, m, 0, 0);
        const workEndFormatted = dummy.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
        return `${workEndFormatted} (تلقائي - لم يبصم خروج)`;
      }
    }

    if (isCheckOut && (statusDetails.status === 'present' || statusDetails.status === 'late')) {
      return '--:--';
    }

    switch (statusDetails.status) {
      case 'absent':
        return 'غائب';
      case 'leave_paid':
        return 'مجاز (إجازة مدفوعة)';
      case 'leave_unpaid':
        return 'إجازة بدون راتب';
      case 'holiday':
        return 'عطلة رسمية';
      case 'not_employed':
        return 'خارج فترة التعيين';
      case 'exempt_from_fingerprint':
        return 'غير مشمول بالبصمة';
      case 'not_recorded':
        return 'غير مسجل';
      default:
        return statusDetails.sourceArabic || 'غائب';
    }
  };

  // Export technician cycle history to Excel
  const handleExportToExcel = () => {
    const rows = daysList.map((item) => {
      const checkInDisplay = getExcelTimeDisplay(item.record?.checkInTime, item.statusDetails, false, item.record, item.dateStr);
      const checkOutDisplay = getExcelTimeDisplay(item.record?.checkOutTime, item.statusDetails, true, item.record, item.dateStr);

      return {
        'اسم الموظف': employee.name,
        'الوظيفة': employee.role === 'technician' ? 'فني صيانة' : employee.role,
        'اليوم': item.dayName,
        'التاريخ': item.dateStr,
        'وقت الحضور': checkInDisplay,
        'وقت الانصراف': checkOutDisplay,
        'حالة اليوم': item.statusDetails.sourceArabic || item.statusDetails.status,
        'ملاحظات/تفاصيل': item.statusDetails.explanation || '',
        'تعديل إداري': item.record?.isAdjusted ? 'نعم (معدّل)' : 'لا'
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل الدورة المالية');
    const cleanName = employee.name.replace(/[/\\?%*:|"<>]/g, '_');
    XLSX.writeFile(
      wb,
      `سجل_حضور_${cleanName}_دورة_${cycleInfo.startDateStr}_إلى_${cycleInfo.endDateStr}.xlsx`
    );
  };

  // Status Badge Renderer
  const renderStatusBadge = (status: string, explanation?: string, onlyColor = false) => {
    if (onlyColor) {
      switch (status) {
        case 'present':
          return (
            <div className="flex items-center gap-1" title="حاضر في الوقت">
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'late':
          return (
            <div className="flex items-center gap-1" title={`متأخر ${explanation ? `- ${explanation}` : ''}`}>
              <span className="w-3.5 h-3.5 rounded-full bg-amber-500 ring-2 ring-amber-200 shadow-xs inline-block shrink-0 animate-pulse" />
            </div>
          );
        case 'early_departure':
          return (
            <div className="flex items-center gap-1" title={`خروج مبكر ${explanation ? `- ${explanation}` : ''}`}>
              <span className="w-3.5 h-3.5 rounded-full bg-orange-500 ring-2 ring-orange-200 shadow-xs inline-block shrink-0 animate-pulse" />
            </div>
          );
        case 'late_and_early':
          return (
            <div className="flex items-center gap-1" title={`تأخير وخروج مبكر ${explanation ? `- ${explanation}` : ''}`}>
              <span className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-2 ring-rose-200 shadow-xs inline-block shrink-0 animate-pulse" />
            </div>
          );
        case 'absent':
          return (
            <div className="flex items-center gap-1" title="غائب">
              <span className="w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-red-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'leave_paid':
          return (
            <div className="flex items-center gap-1" title="مجاز (إجازة مدفوعة)">
              <span className="w-3.5 h-3.5 rounded-full bg-purple-500 ring-2 ring-purple-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'leave_unpaid':
          return (
            <div className="flex items-center gap-1" title="إجازة بدون راتب">
              <span className="w-3.5 h-3.5 rounded-full bg-blue-500 ring-2 ring-blue-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'holiday':
          return (
            <div className="flex items-center gap-1" title="عطلة رسمية">
              <span className="w-3.5 h-3.5 rounded-full bg-teal-500 ring-2 ring-teal-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'exempt_from_fingerprint':
          return (
            <div className="flex items-center gap-1" title="غير مشمول بالبصمة">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-500 ring-2 ring-slate-200 shadow-xs inline-block shrink-0" />
            </div>
          );
        case 'not_employed':
          return (
            <div className="flex items-center gap-1" title="خارج فترة التعيين">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-300 ring-2 ring-slate-100 shadow-xs inline-block shrink-0" />
            </div>
          );
        default:
          return (
            <div className="flex items-center gap-1" title="غير مسجل">
              <span className="w-3.5 h-3.5 rounded-full bg-slate-300 ring-2 ring-slate-100 shadow-xs inline-block shrink-0" />
            </div>
          );
      }
    }

    switch (status) {
      case 'present':
        return (
          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🟢 حاضر في الوقت
          </span>
        );
      case 'late':
        return (
          <span className="bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🟡 متأخر ({explanation || 'تأخير في الحضور'})
          </span>
        );
      case 'early_departure':
        return (
          <span className="bg-orange-50 text-orange-800 border border-orange-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🟠 خروج مبكر ({explanation || 'تسجيل خروج مبكر'})
          </span>
        );
      case 'late_and_early':
        return (
          <span className="bg-rose-50 text-rose-800 border border-rose-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🔴 تأخير وخروج مبكر ({explanation || 'تأخير في الحضور وخروج مبكر'})
          </span>
        );
      case 'absent':
        return (
          <span className="bg-red-50 text-red-800 border border-red-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🔴 غائب
          </span>
        );
      case 'leave_paid':
        return (
          <span className="bg-purple-50 text-purple-800 border border-purple-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🟣 مجاز (إجازة مدفوعة)
          </span>
        );
      case 'leave_unpaid':
        return (
          <span className="bg-blue-50 text-blue-800 border border-blue-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🔵 إجازة بدون راتب
          </span>
        );
      case 'holiday':
        return (
          <span className="bg-teal-50 text-teal-800 border border-teal-200 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🟢 عطلة رسمية
          </span>
        );
      case 'exempt_from_fingerprint':
        return (
          <span className="bg-slate-100 text-slate-800 border border-slate-300 font-extrabold px-2.5 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1">
            🛡️ غير مشمول بالبصمة
          </span>
        );
      case 'not_employed':
        return (
          <span className="bg-slate-100 text-slate-500 font-medium px-2.5 py-0.5 rounded-lg text-[11px]">
            خارج فترة التعيين
          </span>
        );
      default:
        return (
          <span className="bg-slate-100 text-slate-600 font-bold px-2.5 py-0.5 rounded-lg text-[11px]">
            ⚪ غير مسجل
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm shrink-0">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-xl sm:text-2xl flex items-center gap-2">
              <span>سجل أيام الدورة المالية والدوام</span>
              <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-0.5 rounded-full">
                {stats.totalDays} يوم
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              جدول كامل ومفصل لأوقات الحضور والانصراف لكل يوم في الدورة المالية للموظف {employee.name}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportToExcel}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-black text-xs shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 self-start sm:self-auto"
          title="تصدير جميع أيام الدورة المالية إلى ملف Excel"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>تصدير ملف Excel</span>
        </button>
      </div>

      {/* Main Content Body */}
      <div className="space-y-4 text-xs">
        {/* Period Banner & Stats */}
        <div className="bg-slate-100/80 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>الدورة المالية الحالية: {cycleInfo.startDateStr} إلى {cycleInfo.endDateStr}</span>
            </div>
            <p className="text-slate-600 font-medium text-xs mt-0.5">
              إجمالي الأيام: <strong className="font-mono text-slate-900">{stats.totalDays} يوم</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-emerald-100 text-emerald-900 font-extrabold px-3 py-1 rounded-xl text-xs">
              حاضر: {stats.presentCount}
            </span>
            <span className="bg-amber-100 text-amber-900 font-extrabold px-3 py-1 rounded-xl text-xs">
              متأخر: {stats.lateCount}
            </span>
            <span className="bg-red-100 text-red-900 font-extrabold px-3 py-1 rounded-xl text-xs">
              غائب: {stats.absentCount}
            </span>
            <span className="bg-purple-100 text-purple-900 font-extrabold px-3 py-1 rounded-xl text-xs">
              إجازات: {stats.leaveCount}
            </span>
          </div>
        </div>

        {/* Controls: Search & Filter Badges */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-2">
          {/* Search */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالتاريخ أو اليوم..."
              className="w-full text-xs pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 focus:border-blue-600 focus:bg-white bg-slate-50 focus:outline-none transition-all"
            />
          </div>

          {/* Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 ${
                statusFilter === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              الكل ({daysList.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('present')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 ${
                statusFilter === 'present'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              حاضر ({stats.presentCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('late')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 ${
                statusFilter === 'late'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              متأخر ({stats.lateCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('absent')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 ${
                statusFilter === 'absent'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 text-red-800 hover:bg-red-100'
              }`}
            >
              غائب ({stats.absentCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('leave')}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shrink-0 ${
                statusFilter === 'leave'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
              }`}
            >
              إجازات ({stats.leaveCount})
            </button>
          </div>
        </div>

        {/* Table of Days - Full Screen Width without Card Borders */}
        <div className="w-full bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="w-full">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-black sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 sm:p-3">اليوم والتاريخ</th>
                  <th className="p-2.5 sm:p-3 text-center">وقت الحضور</th>
                  <th className="p-2.5 sm:p-3 text-center">وقت الانصراف</th>
                  <th className="p-2.5 sm:p-3 text-center">حالة اليوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredDaysList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                      لا توجد سجلات مطابقة للفلاتر المختارة
                    </td>
                  </tr>
                ) : (
                  filteredDaysList.map(({ dateStr, dayName, record, statusDetails }) => {
                    const checkInDisplay = record?.checkInTime
                      ? new Date(record.checkInTime).toLocaleTimeString('ar-IQ', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '--:--';

                    const missingInfo = checkIsMissingCheckOut(record, dateStr, effectiveSettings, nowDate);

                    let checkOutDisplay: React.ReactNode = '--:--';
                    if (record?.checkOutTime) {
                      checkOutDisplay = new Date(record.checkOutTime).toLocaleTimeString('ar-IQ', {
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    } else if (missingInfo.isMissingCheckOut) {
                      const [h, m] = (effectiveSettings?.workEndTime || '16:00').split(':').map(Number);
                      const dummy = new Date();
                      dummy.setHours(h, m, 0, 0);
                      const formattedWorkEnd = dummy.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                      checkOutDisplay = (
                        <div className="inline-flex items-center justify-center gap-1" title="تطبيق خروج تلقائي - لم يبصم خروج">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                          <span className="font-mono font-bold text-slate-800">{formattedWorkEnd}</span>
                          <span className="text-[9px] font-black text-red-700 bg-red-50 border border-red-200 px-1 py-0.5 rounded">
                            تلقائي
                          </span>
                        </div>
                      );
                    } else {
                      checkOutDisplay = '--:--';
                    }

                    const isToday = dateStr === todayStr;

                    return (
                      <tr
                        key={dateStr}
                        onClick={() => setSelectedDayDetail({
                          dateStr,
                          dayName,
                          record,
                          statusDetails,
                          missingInfo,
                          checkInDisplay,
                          checkOutDisplay
                        })}
                        className={`hover:bg-blue-50/60 transition-colors cursor-pointer ${
                          isToday ? 'bg-amber-50/70 font-bold' : ''
                        }`}
                        title="اضغط لعرض التفاصيل الكاملة لهذا اليوم"
                      >
                        {/* Date & Day Name */}
                        <td className="p-2.5 sm:p-3">
                          <div className="font-extrabold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{dayName}</span>
                            <span className="font-mono text-slate-500 text-[11px]">({dateStr})</span>
                            {isToday && (
                              <span className="bg-amber-200 text-amber-950 text-[9px] font-black px-1.5 py-0.5 rounded">
                                اليوم
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Check In Time */}
                        <td className="p-2.5 sm:p-3 text-center font-mono font-bold text-slate-800 text-xs sm:text-sm whitespace-nowrap">
                          {typeof checkInDisplay === 'string' ? checkInDisplay : checkInDisplay}
                        </td>

                        {/* Check Out Time */}
                        <td className="p-2.5 sm:p-3 text-center text-xs whitespace-nowrap">
                          {checkOutDisplay}
                        </td>

                        {/* Status Badge */}
                        <td className="p-2.5 sm:p-3 text-center">
                          <div className="flex items-center justify-center">
                            {renderStatusBadge(statusDetails.status, statusDetails.explanation, true)}
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
      </div>

      {/* Day Details Modal */}
      <AnimatePresence>
        {selectedDayDetail && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col my-auto"
            >
              <div className="bg-slate-900 p-4 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <h3 className="font-extrabold text-sm">
                    تفاصيل يوم {selectedDayDetail.dayName} ({selectedDayDetail.dateStr})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDayDetail(null)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
                {/* Auto Check-out Alert Banner if applicable */}
                {selectedDayDetail.missingInfo?.isMissingCheckOut && (
                  <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-rose-900 space-y-2">
                    <div className="font-black text-xs flex items-center gap-1.5 text-rose-800">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>تنبيه: عدم إثبات بصمة الخروج (تطبيق خصم تلقائي)</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-rose-700">
                      لم يتم تسجيل بصمة الخروج الفعلية لهذا اليوم. قام النظام بتسجيل خروج تلقائي بحلول وقت نهاية الدوام الرسمي، ومترتب عليه خصم قدره <strong className="font-mono text-rose-900">{selectedDayDetail.missingInfo.deductionAmount?.toLocaleString()} د.ع</strong>.
                    </p>
                    <div className="pt-2 border-t border-rose-200/60 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] text-rose-800 font-bold">نسيت تسجيل الخروج؟ أرسل طلب تعديل للمالك لإلغاء الخصم:</span>
                      <button
                        type="button"
                        onClick={() => {
                          setShowGraceForm(true);
                          setGraceError('');
                          setGraceSuccess('');
                          setGraceType('early_departure');
                          setGraceMinutes(15);
                          setGraceReason('طلب تعديل عذر نسيان بصمة الخروج وإثبات الانصراف بوقت نهاية الدوام الرسمي');
                        }}
                        className="bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-xs"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>طلب تعديل نسيان الخروج</span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 text-[10px] block font-medium">وقت تسجيل الدخول:</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {typeof selectedDayDetail.checkInDisplay === 'string' ? selectedDayDetail.checkInDisplay : 'مسجل'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block font-medium">وقت تسجيل الخروج:</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">
                      {selectedDayDetail.missingInfo?.isMissingCheckOut
                        ? `${effectiveSettings?.workEndTime || '16:00'} (تلقائي)`
                        : selectedDayDetail.record?.checkOutTime
                        ? new Date(selectedDayDetail.record.checkOutTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                        : '--:--'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">حالة الحضور:</span>
                    {renderStatusBadge(selectedDayDetail.statusDetails.status, selectedDayDetail.statusDetails.explanation)}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                    <span className="text-slate-500 font-medium">التبيان والشرح:</span>
                    <span className="font-bold text-slate-800">{selectedDayDetail.statusDetails.explanation || '-'}</span>
                  </div>
                  {getEffectiveLateMinutes(selectedDayDetail.record, effectiveSettings.workStartTime, effectiveSettings.lateToleranceMinutes) > 0 && (
                    <div className="flex justify-between items-center text-amber-800">
                      <span>دقائق التأخير الصباحي:</span>
                      <span className="font-mono font-bold">{getEffectiveLateMinutes(selectedDayDetail.record, effectiveSettings.workStartTime, effectiveSettings.lateToleranceMinutes)} دقيقة</span>
                    </div>
                  )}
                  {getEffectiveEarlyCheckoutMinutes(selectedDayDetail.record, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes) > 0 && (
                    <div className="flex justify-between items-center text-amber-800">
                      <span>دقائق الخروج المبكر:</span>
                      <span className="font-mono font-bold">{getEffectiveEarlyCheckoutMinutes(selectedDayDetail.record, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes)} دقيقة</span>
                    </div>
                  )}
                  {selectedDayDetail.record?.notes && (
                    <div className="pt-2 border-t border-slate-200 text-slate-600">
                      <span className="font-bold text-slate-800 block mb-0.5">ملاحظات مسجلة:</span>
                      <p className="bg-white p-2 rounded-xl border border-slate-200">{selectedDayDetail.record.notes}</p>
                    </div>
                  )}
                </div>

                {/* Grace Requests Section - ONLY visible if there is late arrival/early checkout OR existing grace requests */}
                {(() => {
                  const lateM = selectedDayDetail.record?.lateMinutes || 0;
                  const earlyM = getEffectiveEarlyCheckoutMinutes(
                    selectedDayDetail.record,
                    effectiveSettings?.workEndTime,
                    effectiveSettings?.earlyCheckoutToleranceMinutes
                  );
                  const isMissingCheckOut = selectedDayDetail.missingInfo?.isMissingCheckOut;
                  const hasLateOrEarly = lateM > 0 || earlyM > 0 || isMissingCheckOut;
                  const existingGraceList = graceRequests.filter(
                    g => g.employeeId === employee.id && g.date === selectedDayDetail.dateStr && !g.isDeleted
                  );

                  if (!hasLateOrEarly && existingGraceList.length === 0) {
                    return null;
                  }

                  return (
                    <div className="space-y-3 bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80">
                      <div className="flex items-center justify-between">
                        <div className="font-extrabold text-amber-950 text-xs flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>طلبات السماحية لهذا اليوم</span>
                        </div>
                        {hasLateOrEarly && !showGraceForm && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowGraceForm(true);
                              setGraceError('');
                              setGraceSuccess('');
                              if (earlyM > lateM) {
                                setGraceType('early_departure');
                                setGraceMinutes(earlyM || 15);
                              } else {
                                setGraceType('late_arrival');
                                setGraceMinutes(lateM || 15);
                              }
                            }}
                            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span>إرسال طلب سماحية</span>
                          </button>
                        )}
                      </div>

                      {graceSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-2.5 rounded-xl font-bold text-[11px] flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>{graceSuccess}</span>
                        </div>
                      )}

                      {/* Existing grace requests for this date */}
                      {existingGraceList.length > 0 && (
                        <div className="space-y-2">
                          {existingGraceList.map(req => (
                            <div key={req.id} className="bg-white p-3 rounded-xl border border-amber-200/60 text-[11px] space-y-1">
                              <div className="flex items-center justify-between font-bold">
                                <span className="text-slate-800">
                                  {req.type === 'late_arrival' ? 'طلب سماحية تأخير' : 'طلب سماحية خروج مبكر'} ({req.minutes} دقيقة)
                                </span>
                                {req.status === 'pending' && (
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full font-bold text-[10px]">
                                    قيد المراجعة ⏳
                                  </span>
                                )}
                                {req.status === 'approved' && (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[10px]">
                                    مقترن بالموافقة ✅
                                  </span>
                                )}
                                {req.status === 'rejected' && (
                                  <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full font-bold text-[10px]">
                                    مرفوض ❌
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-600">{req.reason}</div>
                              {req.rejectionReason && (
                                <div className="text-red-600 font-bold bg-red-50 p-1.5 rounded-lg text-[10px]">
                                  سبب الرفض: {req.rejectionReason}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Form for new grace request */}
                      {showGraceForm && hasLateOrEarly && (
                        <div className="bg-white p-3.5 rounded-xl border border-amber-200 space-y-3">
                          {graceError && (
                            <div className="bg-red-50 text-red-700 p-2 rounded-lg text-[11px] font-bold">
                              {graceError}
                            </div>
                          )}

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">نوع الاستثناء *</label>
                            <select
                              value={graceType}
                              onChange={(e) => setGraceType(e.target.value as any)}
                              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-bold bg-white"
                            >
                              {lateM > 0 && <option value="late_arrival">طلب سماحية تأخير حضور صباحي ({lateM} دقيقة)</option>}
                              {(earlyM > 0 || isMissingCheckOut) && (
                                <option value="early_departure">
                                  {isMissingCheckOut
                                    ? 'طلب تعديل عذر نسيان بصمة الخروج (إلغاء الخصم)'
                                    : `طلب سماحية خروج مبكر (${earlyM || 15} دقيقة)`}
                                </option>
                              )}
                              {lateM === 0 && earlyM === 0 && !isMissingCheckOut && (
                                <>
                                  <option value="late_arrival">طلب سماحية تأخير حضور صباحي</option>
                                  <option value="early_departure">طلب سماحية خروج مبكر</option>
                                </>
                              )}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">عدد دقائق السماحية المطلوبة *</label>
                            <input
                              type="number"
                              min={1}
                              max={480}
                              value={graceMinutes}
                              onChange={(e) => setGraceMinutes(Number(e.target.value))}
                              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">سبب طلب السماحية / العذر *</label>
                            <textarea
                              rows={2}
                              value={graceReason}
                              onChange={(e) => setGraceReason(e.target.value)}
                              placeholder="اكتب عذر التأخير أو سبب الخروج المبكر..."
                              className="w-full text-xs p-2.5 rounded-xl border border-slate-200 font-medium outline-none focus:border-amber-500"
                            />
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              disabled={graceSubmitting}
                              onClick={async () => {
                                if (!graceReason.trim()) {
                                  setGraceError('يرجى كتابة سبب طلب السماحية');
                                  return;
                                }
                                setGraceSubmitting(true);
                                setGraceError('');
                                setGraceSuccess('');
                                try {
                                  const newReq: GraceRequest = {
                                    id: `grace_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                                    employeeId: employee.id,
                                    employeeName: employee.name,
                                    attendanceRecordId: selectedDayDetail?.record?.id,
                                    date: selectedDayDetail.dateStr,
                                    type: graceType,
                                    minutes: Number(graceMinutes) || 15,
                                    reason: graceReason.trim(),
                                    status: 'pending',
                                    requestedAt: new Date().toISOString()
                                  };
                                  await createGraceRequest(newReq);
                                  setGraceSuccess('تم إرسال طلب السماحية بنجاح');
                                  setShowGraceForm(false);
                                  setGraceReason('');
                                } catch (err: any) {
                                  setGraceError(err?.message || 'حدث خطأ أثناء إرسال الطلب');
                                } finally {
                                  setGraceSubmitting(false);
                                }
                              }}
                              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-black py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{graceSubmitting ? 'جاري الإرسال...' : 'إرسال الطلب'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowGraceForm(false)}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-3 py-2 rounded-xl text-xs cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayDetail(null);
                    setShowGraceForm(false);
                  }}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-2xl transition-all cursor-pointer"
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
