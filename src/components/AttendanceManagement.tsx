import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Calendar,
  UserCheck,
  Filter,
  Clock,
  MapPin,
  Edit3,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  Save,
  RefreshCw,
  ShieldAlert,
  UserX,
  CalendarX,
  Check,
  Info,
  FileSpreadsheet,
  Download,
  Unlock,
  ChevronRight,
  ChevronLeft,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Employee,
  AttendanceRecord,
  PayrollPeriod,
  PayrollRecord,
  CompanySettings,
  AuditLogEntry,
  LeaveRequest
} from '../types';
import {
  subscribeAttendanceRecords,
  subscribePayrollPeriods,
  subscribePayrollRecords,
  subscribeCompanySettings,
  subscribeLeaveRequests,
  updateAttendanceRecord,
  createAttendanceRecord,
  updateLeaveRequest,
  createLeaveRequest,
  createAuditLog,
  updatePayrollPeriod
} from '../lib/dbService';
import { hrEngine } from '../lib/hrEngine';
import { checkIsMissingCheckOut, calculateEarlyCheckoutMinutes, getEffectiveEarlyCheckoutMinutes, calculateLateMinutes, getEffectiveLateMinutes } from '../lib/attendanceService';
import { getEffectiveWorkDateStr, normalizeDateString } from '../utils';

interface AttendanceManagementProps {
  employees: Employee[];
  userRole?: string;
}

export default function AttendanceManagement({ employees, userRole }: AttendanceManagementProps) {
  // State variables
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);

  // Live clock for dynamic timeline updates
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Selected Date state
  const [selectedDate, setSelectedDate] = useState<string>(() => getEffectiveWorkDateStr());

  const todayStr = useMemo(() => getEffectiveWorkDateStr(nowDate), [nowDate]);
  const isFutureDate = selectedDate > todayStr;

  const getEffectiveStatus = (record: AttendanceRecord | null, emp?: Employee): string => {
    if (emp) {
      const empStartStr = normalizeDateString(emp.employmentDate || emp.joinDate || emp.joinedAt);
      if (empStartStr && normalizeDateString(selectedDate) < empStartStr) {
        return 'not_employed';
      }
    }
    return hrEngine.attendanceService.resolveDailyAttendanceStatus(
      record,
      selectedDate,
      companySettings,
      nowDate,
      leaveRequests,
      emp?.id,
      emp
    );
  };

  // Edit Modal state
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);

  // History Modal state (All Days View for Technician)
  const [viewingEmployeeHistory, setViewingEmployeeHistory] = useState<Employee | null>(null);

  // Modal form fields
  const [formCheckIn, setFormCheckIn] = useState('');
  const [formCheckOut, setFormCheckOut] = useState('');
  const [formStatus, setFormStatus] = useState<'present' | 'late' | 'absent' | 'leave_paid' | 'leave_unpaid' | 'waiting_for_check_in' | 'not_recorded'>('present');
  const [formReason, setFormReason] = useState('');

  // Status message state
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Real-time subscriptions
  useEffect(() => {
    const unsubAttendance = subscribeAttendanceRecords(
      (recs) => setAttendanceRecords(recs),
      (err) => console.error('Attendance subscription error:', err)
    );
    const unsubPeriods = subscribePayrollPeriods(
      (periods) => setPayrollPeriods(periods),
      (err) => console.error('Payroll periods subscription error:', err)
    );
    const unsubPayrollRecs = subscribePayrollRecords(
      (recs) => setPayrollRecords(recs),
      (err) => console.error('Payroll records subscription error:', err)
    );
    const unsubSettings = subscribeCompanySettings(
      (sets) => setCompanySettings(sets),
      (err) => console.error('Company settings subscription error:', err)
    );
    const unsubLeaves = subscribeLeaveRequests(
      (reqs) => setLeaveRequests(reqs),
      (err) => console.error('Leave requests subscription error:', err)
    );

    return () => {
      unsubAttendance();
      unsubPeriods();
      unsubPayrollRecs();
      unsubSettings();
      unsubLeaves();
    };
  }, []);

  // Effective company settings fallback
  const workStartTime = companySettings?.workStartTime || '08:00';
  const workEndTime = companySettings?.workEndTime || '16:00';

  // Find matching payroll period for the selected date
  const matchingPeriodForSelectedDate = useMemo(() => {
    if (!selectedDate) return null;
    return payrollPeriods.find(
      (p) => selectedDate >= p.startDate && selectedDate <= p.endDate
    ) || null;
  }, [payrollPeriods, selectedDate]);

  // Check if selected date is locked (ONLY locked if period status is explicitly 'closed' or 'archived')
  const isDateLockedByPayroll = useMemo(() => {
    if (!matchingPeriodForSelectedDate) return false;
    return matchingPeriodForSelectedDate.status === 'closed' || matchingPeriodForSelectedDate.status === 'archived';
  }, [matchingPeriodForSelectedDate]);

  // Sorted list of all available payroll periods (latest first)
  const sortedPayrollPeriods = useMemo(() => {
    return [...payrollPeriods].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [payrollPeriods]);

  // Select a specific period from the cycle dropdown
  const handleSelectPeriod = (periodId: string) => {
    const period = payrollPeriods.find((p) => p.id === periodId);
    if (!period) return;
    const todayStr = getEffectiveWorkDateStr();
    if (todayStr >= period.startDate && todayStr <= period.endDate) {
      setSelectedDate(todayStr);
    } else {
      setSelectedDate(period.startDate);
    }
  };

  // Navigate to Previous Period (Older)
  const handlePrevPeriod = () => {
    if (!matchingPeriodForSelectedDate || sortedPayrollPeriods.length === 0) return;
    const currentIndex = sortedPayrollPeriods.findIndex((p) => p.id === matchingPeriodForSelectedDate.id);
    if (currentIndex < sortedPayrollPeriods.length - 1) {
      const prevPeriod = sortedPayrollPeriods[currentIndex + 1];
      setSelectedDate(prevPeriod.startDate);
    }
  };

  // Navigate to Next Period (Newer)
  const handleNextPeriod = () => {
    if (!matchingPeriodForSelectedDate || sortedPayrollPeriods.length === 0) return;
    const currentIndex = sortedPayrollPeriods.findIndex((p) => p.id === matchingPeriodForSelectedDate.id);
    if (currentIndex > 0) {
      const nextPeriod = sortedPayrollPeriods[currentIndex - 1];
      setSelectedDate(nextPeriod.startDate);
    }
  };

  // Quick Unlock Period Action
  const handleQuickUnlockPeriod = async () => {
    if (!matchingPeriodForSelectedDate) return;
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      await updatePayrollPeriod(matchingPeriodForSelectedDate.id, {
        status: 'calculated',
        closedAt: null,
        closedBy: null
      });
      setFeedbackMessage({
        type: 'success',
        text: 'تم إلغاء قفل الدورة المالية بنجاح! يمكنك الآن تعديل بيانات الحضور والانصراف.'
      });
    } catch (err: any) {
      console.error('Failed to unlock period:', err);
      setFeedbackMessage({
        type: 'error',
        text: 'حدث خطأ أثناء إلغاء قفل الدورة المالية.'
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Merge active employees with today's attendance records
  const attendanceForSelectedDate = useMemo(() => {
    const recordsMap = new Map<string, AttendanceRecord>();
    attendanceRecords
      .filter((r) => r.date === selectedDate && !r.isDeleted)
      .forEach((r) => recordsMap.set(r.employeeId, r));

    return employees
      .filter((emp) => emp.status !== 'terminated')
      .map((emp) => {
        const record = recordsMap.get(emp.id);
        return {
          employee: emp,
          record: record || null,
        };
      });
  }, [employees, attendanceRecords, selectedDate]);

  // Attendance list for current date
  const filteredList = attendanceForSelectedDate;

  // Statistics counters
  const stats = useMemo(() => {
    let present = 0;
    let late = 0;
    let absent = 0;
    let leavePaid = 0;
    let leaveUnpaid = 0;
    let notRecorded = 0;
    let waitingForCheckIn = 0;
    let holiday = 0;
    let exemptFromFingerprint = 0;

    attendanceForSelectedDate.forEach(({ employee, record }) => {
      const status = getEffectiveStatus(record, employee);
      if (status === 'present') {
        present++;
      } else if (status === 'late') {
        late++;
      } else if (status === 'absent') {
        absent++;
      } else if (status === 'leave_paid') {
        leavePaid++;
      } else if (status === 'leave_unpaid') {
        leaveUnpaid++;
      } else if (status === 'not_recorded') {
        notRecorded++;
      } else if (status === 'waiting_for_check_in') {
        waitingForCheckIn++;
      } else if (status === 'holiday') {
        holiday++;
      } else if (status === 'exempt_from_fingerprint') {
        exemptFromFingerprint++;
      }
    });

    return {
      total: attendanceForSelectedDate.length,
      present,
      late,
      absent,
      leavePaid,
      leaveUnpaid,
      notRecorded,
      waitingForCheckIn,
      holiday,
      exemptFromFingerprint,
    };
  }, [attendanceForSelectedDate, selectedDate, companySettings, nowDate]);

  // Open Edit Modal
  const handleOpenEditModal = (emp: Employee, rec: AttendanceRecord | null) => {
    setFeedbackMessage(null);
    setEditingEmployee(emp);
    setEditingRecord(rec);

    if (rec) {
      // Format check-in time HH:mm
      let checkInStr = '';
      if (rec.checkInTime) {
        try {
          const d = new Date(rec.checkInTime);
          checkInStr = d.toTimeString().substring(0, 5);
        } catch {
          checkInStr = rec.checkInTime.substring(0, 5);
        }
      } else {
        checkInStr = workStartTime;
      }

      // Format check-out time HH:mm
      let checkOutStr = '';
      if (rec.checkOutTime) {
        try {
          const d = new Date(rec.checkOutTime);
          checkOutStr = d.toTimeString().substring(0, 5);
        } catch {
          checkOutStr = rec.checkOutTime.substring(0, 5);
        }
      } else {
        checkOutStr = workEndTime;
      }

      setFormCheckIn(checkInStr);
      setFormCheckOut(checkOutStr);
      setFormStatus(rec.status as any || 'present');
      setFormReason(rec.adjustmentReason || '');
    } else {
      // New record defaults
      setFormCheckIn(workStartTime);
      setFormCheckOut(workEndTime);
      setFormStatus('present');
      setFormReason('');
    }
  };

  // Close Edit Modal
  const handleCloseEditModal = () => {
    setEditingEmployee(null);
    setEditingRecord(null);
    setFeedbackMessage(null);
  };

  // Save Attendance Record
  const handleSaveAttendance = async () => {
    if (!editingEmployee) return;

    if (isDateLockedByPayroll) {
      setFeedbackMessage({
        type: 'error',
        text: 'لا يمكن تعديل الحضور لأن دورة الرواتب لهذه الفترة تم اعتمادها.',
      });
      return;
    }

    if (!formReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'سبب التعديل إجباري لضمان الشفافية والتدقيق.',
      });
      return;
    }

    setActionLoading(true);
    setFeedbackMessage(null);

    try {
      // Convert time inputs HH:mm to ISO string for the selectedDate
      let checkInISO: string | null = null;
      let checkOutISO: string | null = null;

      if (formStatus !== 'leave_paid' && formStatus !== 'leave_unpaid' && formStatus !== 'holiday') {
        if (formCheckIn && formCheckIn.trim() !== '') {
          checkInISO = new Date(`${selectedDate}T${formCheckIn}:00`).toISOString();
        }
        if (formCheckOut && formCheckOut.trim() !== '') {
          checkOutISO = new Date(`${selectedDate}T${formCheckOut}:00`).toISOString();
        }
      }

      // Calculate late minutes
      let lateMins = 0;
      if ((formStatus === 'late' || formStatus === 'present') && checkInISO) {
        lateMins = calculateLateMinutes(
          checkInISO,
          workStartTime,
          companySettings?.lateToleranceMinutes || 0
        );
      }

      // Calculate early checkout minutes
      let earlyCheckoutMins = 0;
      if ((formStatus === 'present' || formStatus === 'late') && checkOutISO) {
        earlyCheckoutMins = calculateEarlyCheckoutMinutes(
          checkOutISO,
          workEndTime,
          companySettings?.earlyCheckoutToleranceMinutes || 0,
          selectedDate
        );
      }

      const prevStatus = editingRecord ? editingRecord.status : 'absent';
      const prevCheckIn = editingRecord ? editingRecord.checkInTime : null;
      const prevCheckOut = editingRecord ? editingRecord.checkOutTime : null;

      // Syncing Leave Request: If status is set to leave_paid or leave_unpaid, create/approve matching leave request
      if (formStatus === 'leave_paid' || formStatus === 'leave_unpaid') {
        const leaveType = formStatus === 'leave_paid' ? 'paid' : 'unpaid';
        const matchingLeaves = leaveRequests.filter(
          (l) =>
            l.employeeId === editingEmployee.id &&
            l.startDate <= selectedDate &&
            selectedDate <= l.endDate &&
            !l.isDeleted
        );

        if (matchingLeaves.length > 0) {
          for (const leaveReq of matchingLeaves) {
            await updateLeaveRequest(leaveReq.id, {
              status: 'approved',
              type: leaveType,
              processedBy: 'المشرف الإداري (تعديل مباشر للحالة)',
              processedAt: new Date().toISOString(),
            });
          }
        } else {
          const newLeaveReq: LeaveRequest = {
            id: `leave_direct_${editingEmployee.id}_${selectedDate.replace(/-/g, '')}`,
            employeeId: editingEmployee.id,
            employeeName: editingEmployee.name,
            startDate: selectedDate,
            endDate: selectedDate,
            totalDays: 1,
            type: leaveType,
            reason: formReason.trim() || 'إجازة معتمدة بقرار إداري مباشر',
            status: 'approved',
            requestedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            processedBy: 'المشرف الإداري (تغيير مباشر للحالة)',
            processedAt: new Date().toISOString(),
          };
          await createLeaveRequest(newLeaveReq);
        }
      }

      // Restoring Leave Balance: If status is changed away from leave to present/late/waiting/not_recorded/absent, cancel active leaves for this date
      if (formStatus === 'present' || formStatus === 'late' || formStatus === 'waiting_for_check_in' || formStatus === 'not_recorded' || formStatus === 'absent') {
        const matchingLeaves = leaveRequests.filter(
          (l) =>
            l.employeeId === editingEmployee.id &&
            (l.status === 'approved' || l.status === 'pending') &&
            l.startDate <= selectedDate &&
            selectedDate <= l.endDate &&
            !l.isDeleted
        );

        for (const leaveReq of matchingLeaves) {
          await updateLeaveRequest(leaveReq.id, {
            status: 'cancelled',
            processedBy: 'المشرف الإداري (تغيير الحالة الإدارية)',
            processedAt: new Date().toISOString(),
            rejectionReason: `تم تغيير حالة الموظف بتاريخ ${selectedDate} وإرجاع رصيد الإجازات للموظف تلقائياً.`,
          });
        }
      }

      if (editingRecord) {
        // Update existing record
        await updateAttendanceRecord(editingRecord.id, {
          status: formStatus,
          checkInTime: checkInISO,
          checkOutTime: checkOutISO,
          lateMinutes: lateMins,
          earlyCheckoutMinutes: earlyCheckoutMins,
          isAdjusted: true,
          adjustedBy: 'الإدارة',
          adjustedAt: new Date().toISOString(),
          adjustmentReason: formReason.trim(),
        });
      } else {
        // Create new record
        const newRecord: AttendanceRecord = {
          id: `att_${editingEmployee.id}_${selectedDate}`,
          employeeId: editingEmployee.id,
          employeeName: editingEmployee.name,
          date: selectedDate,
          checkInTime: checkInISO,
          checkOutTime: checkOutISO,
          status: formStatus,
          lateMinutes: lateMins,
          earlyCheckoutMinutes: earlyCheckoutMins,
          isAdjusted: true,
          adjustedBy: 'الإدارة',
          adjustedAt: new Date().toISOString(),
          adjustmentReason: formReason.trim(),
        };
        await createAttendanceRecord(newRecord);
      }

      // Create Audit Log Entry
      const now = new Date();
      const auditLog: AuditLogEntry = {
        id: `audit_att_${now.getTime()}_${Math.random().toString(36).substring(2, 6)}`,
        userId: 'manager',
        userName: 'المشرف الإداري',
        userRole: userRole || 'manager',
        date: selectedDate,
        time: now.toTimeString().substring(0, 8),
        timestamp: now.toISOString(),
        action: `تعديل سجل حضور الموظف (${editingEmployee.name}) لتاريخ ${selectedDate}`,
        reason: formReason.trim(),
        targetEntity: 'attendance_record',
        targetId: editingRecord ? editingRecord.id : `att_${editingEmployee.id}_${selectedDate}`,
        dataBefore: { status: prevStatus, checkIn: prevCheckIn, checkOut: prevCheckOut },
        dataAfter: { status: formStatus, checkIn: checkInISO, checkOut: checkOutISO, reason: formReason.trim() },
      };

      await createAuditLog(auditLog);

      handleCloseEditModal();
    } catch (err: any) {
      console.error('Error saving attendance:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء حفظ التعديلات.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Helper for status badge styling
  const renderStatusBadge = (status: string, explanation?: string) => {
    switch (status) {
      case 'present':
        return (
          <span title={explanation} className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            حاضر
          </span>
        );
      case 'late':
        return (
          <span title={explanation} className="bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            متأخر
          </span>
        );
      case 'early_departure':
        return (
          <span title={explanation} className="bg-orange-100 text-orange-800 border border-orange-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
            خروج مبكر
          </span>
        );
      case 'late_and_early':
        return (
          <span title={explanation} className="bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
            تأخير وخروج مبكر
          </span>
        );
      case 'leave_paid':
        return (
          <span title={explanation} className="bg-purple-100 text-purple-800 border border-purple-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
            إجازة مدفوعة
          </span>
        );
      case 'leave_unpaid':
        return (
          <span title={explanation} className="bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            إجازة بدون راتب
          </span>
        );
      case 'holiday':
        return (
          <span title={explanation} className="bg-teal-100 text-teal-800 border border-teal-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-600"></span>
            عطلة رسمية
          </span>
        );
      case 'not_recorded':
        return (
          <span title={explanation} className="bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            غير مسجل
          </span>
        );
      case 'waiting_for_check_in':
        return (
          <span title={explanation} className="bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            بانتظار البصمة
          </span>
        );
      case 'not_employed':
        return (
          <span title={explanation} className="bg-slate-100 text-slate-500 border border-slate-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            لم يكن على رأس العمل
          </span>
        );
      case 'exempt_from_fingerprint':
        return (
          <span title={explanation} className="bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            🛡️ غير مشمول بالبصمة
          </span>
        );
      default:
        return (
          <span title={explanation} className="bg-red-100 text-red-800 border border-red-200 text-[11px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 w-fit cursor-help">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
            غائب
          </span>
        );
    }
  };

  // Helper to format check-in/out time for Excel exports
  const getExcelTimeDisplay = (
    timeIso: string | undefined | null,
    statusDetails: { status: string; sourceArabic?: string; explanation?: string },
    isCheckOut: boolean = false
  ) => {
    if (timeIso) {
      return new Date(timeIso).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
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

  // Export individual technician's financial cycle days to Excel
  const exportTechnicianCycleToExcel = (
    employee: Employee,
    daysList: Array<{
      dateStr: string;
      dayName: string;
      record: AttendanceRecord | null;
      statusDetails: any;
    }>,
    startDateStr: string,
    endDateStr: string
  ) => {
    const rows = daysList.map((item) => {
      const checkInDisplay = getExcelTimeDisplay(item.record?.checkInTime, item.statusDetails, false);
      const checkOutDisplay = getExcelTimeDisplay(item.record?.checkOutTime, item.statusDetails, true);

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
    XLSX.writeFile(wb, `سجل_حضور_${cleanName}_دورة_${startDateStr}_إلى_${endDateStr}.xlsx`);
  };

  // Export all active employees' financial cycle days to Excel
  const exportAllEmployeesCycleToExcel = () => {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    const curD = now.getDate();

    let endY = curY;
    let endM = curM;
    if (curD >= 16) {
      endM += 1;
      if (endM > 12) { endM = 1; endY += 1; }
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

    const rows: any[] = [];

    employees.filter(e => e.status !== 'terminated').forEach((emp) => {
      cycleDays.forEach((dStr) => {
        const empStartStr = normalizeDateString(emp.employmentDate || emp.joinDate || emp.joinedAt);
        const isBeforeEmployment = Boolean(empStartStr && normalizeDateString(dStr) < empStartStr);

        const record = attendanceRecords.find(
          (r) => r.employeeId === emp.id && r.date === dStr && !r.isDeleted
        ) || null;

        const statusDetails = isBeforeEmployment ? {
          status: 'not_employed' as const,
          sourceArabic: 'خارج فترة التعيين',
          explanation: 'تاريخ يسبق بداية عمل الموظف'
        } : hrEngine.attendanceService.resolveDailyAttendanceStatusDetails(
          record,
          dStr,
          companySettings,
          nowDate,
          leaveRequests,
          emp.id,
          emp
        );

        const dayName = new Date(`${dStr}T00:00:00`).toLocaleDateString('ar-IQ', { weekday: 'long' });

        const checkInDisplay = getExcelTimeDisplay(record?.checkInTime, statusDetails, false);
        const checkOutDisplay = getExcelTimeDisplay(record?.checkOutTime, statusDetails, true);

        rows.push({
          'اسم الموظف': emp.name,
          'الوظيفة': emp.role === 'technician' ? 'فني صيانة' : emp.role,
          'اليوم': dayName,
          'التاريخ': dStr,
          'وقت الحضور': checkInDisplay,
          'وقت الانصراف': checkOutDisplay,
          'حالة اليوم': statusDetails.sourceArabic || statusDetails.status,
          'ملاحظات/تفاصيل': statusDetails.explanation || '',
          'تعديل إداري': record?.isAdjusted ? 'نعم' : 'لا'
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل الدورة المالية الشامل');
    XLSX.writeFile(wb, `سجل_حضور_جميع_الموظفين_دورة_${startDateStr}_إلى_${endDateStr}.xlsx`);
  };

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Header Banner */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                Attendance Management
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                نظام إدارة الحضور والإنصراف
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              إدارة وتعديل الحضور
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              التحكم الكامل بسجلات الحضور اليومي، المراجعة الإدارية والربط بدورة الرواتب
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي سجلات اليوم:</span>
              <span className="text-xs font-black text-white">{stats.total} موظف مسجل</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cycle & Date Controls Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 shadow-sm border border-slate-700/80 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* Right side: Title & Current Cycle Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-300">الدورة المالية النشطة:</span>
                {matchingPeriodForSelectedDate ? (
                  <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                    matchingPeriodForSelectedDate.status === 'open'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : matchingPeriodForSelectedDate.status === 'calculated'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      : matchingPeriodForSelectedDate.status === 'closed'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-500/20 text-slate-300 border-slate-500/40'
                  }`}>
                    {matchingPeriodForSelectedDate.status === 'open'
                      ? '🟢 مفتوحة'
                      : matchingPeriodForSelectedDate.status === 'calculated'
                      ? '🔵 معتمدة'
                      : matchingPeriodForSelectedDate.status === 'closed'
                      ? '🔒 مقفلة'
                      : '✅ تم تسليمها'}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 font-medium">خارج الدورات المسجلة</span>
                )}
              </div>
              
              {matchingPeriodForSelectedDate && (
                <p className="text-xs font-mono text-emerald-300 font-bold mt-1">
                  الفترة: {matchingPeriodForSelectedDate.startDate} إلى {matchingPeriodForSelectedDate.endDate}
                </p>
              )}
            </div>
          </div>

          {/* Left side: Controls (Cycle select, Date picker, Export Excel) */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Cycle Selector Dropdown */}
            <div className="relative flex-1 sm:w-56">
              <select
                value={matchingPeriodForSelectedDate?.id || ''}
                onChange={(e) => handleSelectPeriod(e.target.value)}
                className="w-full pr-4 pl-8 py-2 bg-slate-800/90 border border-slate-600 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer appearance-none"
              >
                {sortedPayrollPeriods.length === 0 ? (
                  <option value="">لا توجد دورات مسجلة</option>
                ) : (
                  sortedPayrollPeriods.map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                      {p.startDate} إلى {p.endDate} ({
                        p.status === 'open' ? '🟢 مفتوحة' : p.status === 'calculated' ? '🔵 معتمدة' : p.status === 'closed' ? '🔒 مقفلة' : '✅ تم تسليمها'
                      })
                    </option>
                  ))
                )}
              </select>
              <Filter className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 pointer-events-none" />
            </div>

            {/* Prev / Next Cycle Buttons */}
            <button
              type="button"
              onClick={handlePrevPeriod}
              title="الدورة السابقة"
              className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
            >
              <span>السابقة</span>
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleNextPeriod}
              title="الدورة التالية"
              className="p-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl border border-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
              <span>التالية</span>
            </button>

            {/* Date Picker */}
            <div className="relative flex items-center shrink-0">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pr-8 pl-3 py-2 bg-slate-800/90 border border-slate-600 rounded-xl text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              />
              <Calendar className="w-3.5 h-3.5 absolute right-2.5 text-slate-400 pointer-events-none" />
            </div>

            {/* Export All Cycle Days to Excel Button */}
            <button
              type="button"
              onClick={exportAllEmployeesCycleToExcel}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
              title="تصدير جميع سجلات أيام الدورة المالية لكافة الموظفين إلى ملف Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير الدورة (Excel)</span>
            </button>
          </div>

        </div>
      </div>

      {/* Period Locked Warning Banner */}
      {isDateLockedByPayroll && (
        <div className="bg-amber-50 border-2 border-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 text-xs font-bold shadow-xs">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-700 shrink-0" />
            <div>
              <span className="font-extrabold block">ملاحظة هامة (الفترة مقفلة أو تم تسليمها):</span>
              <span>لا يمكن تعديل الحضور مباشرة لأن الدورة المالية مقفلة رسمياً.</span>
            </div>
          </div>

          {(userRole === 'owner' || userRole === 'manager' || !userRole) && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={handleQuickUnlockPeriod}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-xs"
            >
              <Unlock className="w-4 h-4" />
              <span>إلغاء قفل الدورة الآن للتعديل</span>
            </button>
          )}
        </div>
      )}

      {/* Main Table View */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-extrabold">
              <tr>
                <th className="p-4">الموظف</th>
                <th className="p-4">وقت الدخول</th>
                <th className="p-4">وقت الخروج</th>
                <th className="p-4">حالة اليوم</th>
                <th className="p-4">التأخير</th>
                <th className="p-4">الخروج المبكر</th>
                <th className="p-4">الموقع (GPS)</th>
                <th className="p-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد سجلات حضور مسجلة لهذا التاريخ.
                  </td>
                </tr>
              ) : (
                filteredList.map(({ employee, record }) => {
                  const empStartStr = normalizeDateString(employee.employmentDate || employee.joinDate || employee.joinedAt);
                  const isBeforeEmployment = Boolean(empStartStr && normalizeDateString(selectedDate) < empStartStr);
                  const statusDetails = isBeforeEmployment ? {
                    status: 'not_employed' as const,
                    source: 'Computed' as const,
                    sourceArabic: 'خارج فترة التعيين',
                    explanation: 'تاريخ يسبق تاريخ مباشرة الموظف للعمل'
                  } : hrEngine.attendanceService.resolveDailyAttendanceStatusDetails(
                    record,
                    selectedDate,
                    companySettings,
                    nowDate,
                    leaveRequests,
                    employee.id,
                    employee
                  );
                  const checkInDisplay = record?.checkInTime
                    ? new Date(record.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                  const missingInfo = checkIsMissingCheckOut(record, selectedDate, companySettings, nowDate);

                  let checkOutDisplayNode: React.ReactNode = '--:--';
                  if (record?.checkOutTime) {
                    checkOutDisplayNode = new Date(record.checkOutTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                  } else if (missingInfo.isMissingCheckOut) {
                    const [h, m] = (companySettings?.workEndTime || '16:00').split(':').map(Number);
                    const dummy = new Date();
                    dummy.setHours(h, m, 0, 0);
                    const formattedWorkEnd = dummy.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                    checkOutDisplayNode = (
                      <div className="flex items-center gap-1.5" title="تطبيق خروج تلقائي - لم يبصم خروج">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                        <span className="font-mono font-bold text-slate-800">{formattedWorkEnd}</span>
                        <span className="text-[10px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                          <span>تلقائي</span>
                        </span>
                      </div>
                    );
                  }

                  const effectiveLate = getEffectiveLateMinutes(
                    record,
                    workStartTime,
                    companySettings?.lateToleranceMinutes || 15
                  );
                  const lateMinsDisplay = effectiveLate > 0
                    ? `${effectiveLate} دقيقة`
                    : 'لا يوجد';

                  const effectiveEarlyOut = getEffectiveEarlyCheckoutMinutes(
                    record,
                    workEndTime,
                    companySettings?.earlyCheckoutToleranceMinutes || 0
                  );
                  const earlyOutDisplay = effectiveEarlyOut > 0
                    ? `${effectiveEarlyOut} دقيقة`
                    : 'لا يوجد';

                  return (
                    <tr
                      key={employee.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      {/* Employee Name */}
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => setViewingEmployeeHistory(employee)}
                          className="text-right group cursor-pointer block w-full focus:outline-none"
                          title="اضغط لعرض جميع أيام الموظف والتعديل المباشر"
                        >
                          <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                            <span>{employee.name}</span>
                            <span className="text-[10px] text-blue-700 bg-blue-50 group-hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded-md font-bold inline-flex items-center gap-1 transition-colors">
                              <Calendar className="w-3 h-3 text-blue-600" />
                              <span>سجل الأيام</span>
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">{employee.phone || 'بدون رقم'}</div>
                        </button>
                      </td>

                      {/* Check in */}
                      <td className="p-4 font-mono font-bold text-slate-700">
                        {checkInDisplay}
                      </td>

                      {/* Check out */}
                      <td className="p-4">
                        {checkOutDisplayNode}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <div className="space-y-1">
                          {renderStatusBadge(statusDetails.status, statusDetails.explanation)}
                          <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1 cursor-help" title={statusDetails.explanation}>
                            <Info className="w-3 h-3 text-slate-400 shrink-0 inline" />
                            <span className="truncate max-w-[130px]">{statusDetails.explanation}</span>
                          </div>
                        </div>
                      </td>

                      {/* Late Minutes */}
                      <td className="p-4">
                        {effectiveLate > 0 ? (
                          <span className="font-bold text-amber-700 font-mono">{lateMinsDisplay}</span>
                        ) : (
                          <span className="text-slate-400">{lateMinsDisplay}</span>
                        )}
                      </td>

                      {/* Early Checkout */}
                      <td className="p-4">
                        {effectiveEarlyOut > 0 ? (
                          <span className="font-bold text-blue-700 font-mono">{earlyOutDisplay}</span>
                        ) : (
                          <span className="text-slate-400">{earlyOutDisplay}</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="p-4">
                        {record?.locationName ? (
                          <div className="flex flex-col gap-1">
                            <span className="font-extrabold text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 text-[11px] w-fit">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              {record.locationName}
                            </span>
                            {record.location && record.location.distanceMeters !== undefined && (
                              <span className="text-[10px] text-slate-500 font-mono font-medium">
                                ({Math.round(record.location.distanceMeters)}m)
                              </span>
                            )}
                          </div>
                        ) : record?.location ? (
                          record.location.isWithinRadius ? (
                            <span className="text-emerald-700 font-bold flex items-center gap-1 text-[11px]">
                              <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                              داخل النطاق ({Math.round(record.location.distanceMeters || 0)}m)
                            </span>
                          ) : (
                            <span className="text-red-600 font-bold flex items-center gap-1 text-[11px]">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              خارج النطاق ({Math.round(record.location.distanceMeters || 0)}m)
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          disabled={isDateLockedByPayroll}
                          onClick={() => handleOpenEditModal(employee, record)}
                          className={`px-3 py-1.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                            isDateLockedByPayroll
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Technician All Days History Modal */}
      <AnimatePresence>
        {viewingEmployeeHistory && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col overflow-y-auto my-auto"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base flex items-center gap-2">
                      <span>سجل أيام الموظف: {viewingEmployeeHistory.name}</span>
                      <span className="text-[11px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded-md">
                        {viewingEmployeeHistory.role === 'technician' ? 'فني صيانة' : viewingEmployeeHistory.role}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      عرض جميع الأيام مع وقت الحضور والانصراف — اضغط على أي يوم للتعديل المباشر
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingEmployeeHistory(null)}
                  className="p-1.5 hover:bg-slate-800 rounded-xl text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content */}
              {(() => {
                // Determine cycle date range (16th of previous month to 15th of current month)
                const now = new Date();
                const curY = now.getFullYear();
                const curM = now.getMonth() + 1;
                const curD = now.getDate();

                let endY = curY;
                let endM = curM;
                if (curD >= 16) {
                  endM += 1;
                  if (endM > 12) { endM = 1; endY += 1; }
                }

                const startM = endM === 1 ? 12 : endM - 1;
                const startY = endM === 1 ? endY - 1 : endY;

                const startDateStr = `${startY}-${String(startM).padStart(2, '0')}-16`;
                const endDateStr = `${endY}-${String(endM).padStart(2, '0')}-15`;

                // Generate dates list descending
                const cycleDays: string[] = [];
                const d = new Date(startDateStr);
                const endD = new Date(endDateStr);
                while (d <= endD) {
                  cycleDays.push(d.toISOString().split('T')[0]);
                  d.setDate(d.getDate() + 1);
                }
                cycleDays.reverse(); // Newest first

                // Compute stats for this technician in cycle
                let presentCount = 0;
                let lateCount = 0;
                let absentCount = 0;
                let leaveCount = 0;

                const daysList = cycleDays.map((dStr) => {
                  const empStartStr = normalizeDateString(viewingEmployeeHistory.employmentDate || viewingEmployeeHistory.joinDate || viewingEmployeeHistory.joinedAt);
                  const isBeforeEmployment = Boolean(empStartStr && normalizeDateString(dStr) < empStartStr);

                  const record = attendanceRecords.find(
                    (r) => r.employeeId === viewingEmployeeHistory.id && r.date === dStr && !r.isDeleted
                  ) || null;

                  const statusDetails = isBeforeEmployment ? {
                    status: 'not_employed' as const,
                    source: 'Computed' as const,
                    sourceArabic: 'خارج فترة التعيين',
                    explanation: 'تاريخ يسبق بداية عمل الموظف'
                  } : hrEngine.attendanceService.resolveDailyAttendanceStatusDetails(
                    record,
                    dStr,
                    companySettings,
                    nowDate,
                    leaveRequests,
                    viewingEmployeeHistory.id,
                    viewingEmployeeHistory
                  );

                  if (statusDetails.status === 'present') presentCount++;
                  else if (statusDetails.status === 'late') lateCount++;
                  else if (statusDetails.status === 'absent') absentCount++;
                  else if (statusDetails.status === 'leave_paid' || statusDetails.status === 'leave_unpaid') leaveCount++;

                  const dayName = new Date(`${dStr}T00:00:00`).toLocaleDateString('ar-IQ', { weekday: 'long' });

                  return {
                    dateStr: dStr,
                    dayName,
                    record,
                    statusDetails
                  };
                });

                return (
                  <div className="p-5 space-y-4 text-xs">
                    {/* Period Banner & Quick Stats */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-slate-800 text-sm">
                          الدورة الحالية: {startDateStr} إلى {endDateStr}
                        </div>
                        <p className="text-slate-500 font-medium text-xs mt-0.5">
                          إجمالي أيام الدورة: <span className="font-bold font-mono text-slate-900">{cycleDays.length} يوم</span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2.5 py-1 rounded-xl text-xs">
                          حاضر: {presentCount}
                        </span>
                        <span className="bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2.5 py-1 rounded-xl text-xs">
                          متأخر: {lateCount}
                        </span>
                        <span className="bg-red-50 text-red-800 border border-red-200 font-bold px-2.5 py-1 rounded-xl text-xs">
                          غائب: {absentCount}
                        </span>
                        <span className="bg-purple-50 text-purple-800 border border-purple-200 font-bold px-2.5 py-1 rounded-xl text-xs">
                          إجازات: {leaveCount}
                        </span>

                        <button
                          type="button"
                          onClick={() => exportTechnicianCycleToExcel(viewingEmployeeHistory, daysList, startDateStr, endDateStr)}
                          className="mr-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                          title="تصدير جميع أيام الدورة المالية للموظف إلى ملف Excel"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>تصدير ملف Excel</span>
                        </button>
                      </div>
                    </div>

                    {/* Table of Days */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-extrabold sticky top-0 z-10">
                            <tr>
                              <th className="p-3">اليوم والتاريخ</th>
                              <th className="p-3">وقت الدخول</th>
                              <th className="p-3">وقت الخروج</th>
                              <th className="p-3">حالة اليوم</th>
                              <th className="p-3 text-center">الإجراء المباشر</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                            {daysList.map(({ dateStr, dayName, record, statusDetails }) => {
                              const checkInDisplay = record?.checkInTime
                                ? new Date(record.checkInTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })
                                : '--:--';

                              const missingInfo = checkIsMissingCheckOut(record, dateStr, companySettings, nowDate);

                              let checkOutDisplayNode: React.ReactNode = '--:--';
                              if (record?.checkOutTime) {
                                checkOutDisplayNode = new Date(record.checkOutTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                              } else if (missingInfo.isMissingCheckOut) {
                                const [h, m] = (companySettings?.workEndTime || '16:00').split(':').map(Number);
                                const dummy = new Date();
                                dummy.setHours(h, m, 0, 0);
                                const formattedWorkEnd = dummy.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
                                checkOutDisplayNode = (
                                  <div className="flex items-center gap-1.5" title="تطبيق خروج تلقائي - لم يبصم خروج">
                                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                                    <span className="font-mono font-bold text-slate-800">{formattedWorkEnd}</span>
                                    <span className="text-[10px] font-extrabold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                                      <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                                      <span>تلقائي</span>
                                    </span>
                                  </div>
                                );
                              }

                              const isToday = dateStr === todayStr;

                              return (
                                <tr
                                  key={dateStr}
                                  onClick={() => {
                                    setSelectedDate(dateStr);
                                    const targetEmp = viewingEmployeeHistory;
                                    setViewingEmployeeHistory(null);
                                    handleOpenEditModal(targetEmp, record);
                                  }}
                                  className={`hover:bg-blue-50/70 transition-colors cursor-pointer ${
                                    isToday ? 'bg-amber-50/50' : ''
                                  }`}
                                >
                                  {/* Date & Day */}
                                  <td className="p-3">
                                    <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                                      <span>{dayName}</span>
                                      <span className="font-mono text-slate-600">({dateStr})</span>
                                      {isToday && (
                                        <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-1.5 py-0.5 rounded">اليوم</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* Check in */}
                                  <td className="p-3 font-mono font-bold text-slate-700">
                                    {checkInDisplay}
                                  </td>

                                  {/* Check out */}
                                  <td className="p-3">
                                    {checkOutDisplayNode}
                                  </td>

                                  {/* Status */}
                                  <td className="p-3">
                                    {renderStatusBadge(statusDetails.status, statusDetails.explanation)}
                                  </td>

                                  {/* Action button */}
                                  <td className="p-3 text-center">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedDate(dateStr);
                                        const targetEmp = viewingEmployeeHistory;
                                        setViewingEmployeeHistory(null);
                                        handleOpenEditModal(targetEmp, record);
                                      }}
                                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-xl font-extrabold text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                                      <span>انتقال وتعديل</span>
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-bold">
                  💡 عند النقر على أي يوم، سيتم الانتقال إليه مباشرة وفتح شاشة التعديل الإداري
                </p>
                <button
                  type="button"
                  onClick={() => setViewingEmployeeHistory(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Attendance Modal */}
      <AnimatePresence>
        {editingEmployee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200 max-h-[90vh] flex flex-col overflow-y-auto my-auto"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm">تعديل سجل الحضور</h3>
                    <p className="text-[10px] text-slate-400">{editingEmployee.name} - {selectedDate}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Feedback Alert inside Modal */}
              {feedbackMessage && (
                <div
                  className={`p-3 m-4 mb-0 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                    feedbackMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  {feedbackMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{feedbackMessage.text}</span>
                </div>
              )}

              {/* Modal Body Form */}
              <div className="p-6 space-y-4 text-xs">
                
                {/* 1. Status selector */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1.5">
                    حالة الدوام اليومي:
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="present">حاضر 🟢</option>
                    <option value="late">متأخر 🟡</option>
                    <option value="absent">غائب 🔴</option>
                    <option value="waiting_for_check_in">في انتظار البصمة ⏳</option>
                    <option value="not_recorded">غير مسجل (لم يبصم بعد) ⚪</option>
                    <option value="leave_paid">إجازة مدفوعة 🟣</option>
                    <option value="leave_unpaid">إجازة بدون راتب 🔵</option>
                  </select>

                  {/* Restoring leave balance notice */}
                  {(formStatus === 'present' || formStatus === 'late' || formStatus === 'waiting_for_check_in' || formStatus === 'not_recorded' || formStatus === 'absent') && (
                    <div className="mt-2 bg-emerald-50 text-emerald-900 border border-emerald-200 p-2.5 rounded-xl text-[11px] font-bold flex items-center gap-2">
                      <Info className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>💡 ملحوظة: تغيير حالة الموظف خارج نطاق الإجازة سيقوم بإلغاء الإجازة المسجلة لهذا اليوم واسترجاع رصيد الإجازات المخصوم تلقائياً.</span>
                    </div>
                  )}
                </div>

                {/* 2. Check-in & Check-out times */}
                {formStatus !== 'leave_paid' && formStatus !== 'leave_unpaid' && formStatus !== 'holiday' && (
                  <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-700">تعديل أوقات البصمة:</span>
                      <button
                        type="button"
                        onClick={() => { setFormCheckIn(''); setFormCheckOut(''); }}
                        className="text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <span>🚫 لم يبصم بعد (تفريغ الوقتين)</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-extrabold text-slate-700">
                            وقت الدخول:
                          </label>
                          {formCheckIn ? (
                            <button
                              type="button"
                              onClick={() => setFormCheckIn('')}
                              className="text-[10px] text-red-600 hover:underline font-bold cursor-pointer"
                            >
                              مسح (لم يبصم)
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-extrabold bg-amber-100 px-1.5 py-0.5 rounded">لم يبصم بعد</span>
                          )}
                        </div>
                        <input
                          type="time"
                          value={formCheckIn}
                          onChange={(e) => setFormCheckIn(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="font-extrabold text-slate-700">
                            وقت الخروج:
                          </label>
                          {formCheckOut ? (
                            <button
                              type="button"
                              onClick={() => setFormCheckOut('')}
                              className="text-[10px] text-red-600 hover:underline font-bold cursor-pointer"
                            >
                              مسح (لم يبصم)
                            </button>
                          ) : (
                            <span className="text-[10px] text-amber-700 font-extrabold bg-amber-100 px-1.5 py-0.5 rounded">لم يبصم بعد</span>
                          )}
                        </div>
                        <input
                          type="time"
                          value={formCheckOut}
                          onChange={(e) => setFormCheckOut(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Reason for edit (Mandatory!) */}
                <div>
                  <label className="font-extrabold text-slate-700 block mb-1.5">
                    سبب التعديل الإداري <span className="text-red-600 font-black">* (إجباري)</span>:
                  </label>
                  <textarea
                    rows={3}
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    placeholder="اكتب سبب تعديل السجل هنا لضمان التدقيق والشفافية..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseEditModal}
                  className="px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer text-xs"
                >
                  إلغاء
                </button>

                <button
                  type="button"
                  disabled={actionLoading || isDateLockedByPayroll}
                  onClick={handleSaveAttendance}
                  className={`px-5 py-2.5 rounded-xl font-black text-xs text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    isDateLockedByPayroll
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {actionLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>حفظ التعديلات</span>
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
