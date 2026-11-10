import React, { useState, useEffect } from 'react';
import { Clock, MapPin, UserCheck, ChevronDown, CheckCircle2, AlertCircle, RefreshCw, Send, ShieldAlert, FileText, Check, X, LogOut, Calendar, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, AttendanceRecord, GraceRequest } from '../types';
import { formatArabicTimeOnly, getEffectiveWorkDateStr, normalizeDateString } from '../utils';
import { validateAttendance, canCheckOut, calculateEarlyCheckoutMinutes, getEffectiveEarlyCheckoutMinutes, resolveDailyAttendanceStatus, checkUserLocationAgainstCompanyLocations } from '../lib/attendanceService';
import { subscribeAttendanceRecords, createAttendanceRecord, updateAttendanceRecord, subscribeCompanySettings, subscribeLeaveRequests, subscribeGraceRequests, createGraceRequest } from '../lib/dbService';
import { LeaveRequest } from '../types';

interface TechnicianAttendanceCardProps {
  employee: Employee;
  settings?: CompanySettings | null;
}

export default function TechnicianAttendanceCard({ employee, settings: initialSettings }: TechnicianAttendanceCardProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [graceRequests, setGraceRequests] = useState<GraceRequest[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(initialSettings || null);

  // Subscribe to Leave Requests
  useEffect(() => {
    const unsubLeaves = subscribeLeaveRequests(
      (recs) => setLeaveRequests(recs),
      (err) => console.warn('AttendanceCard leaves error:', err)
    );
    return () => unsubLeaves();
  }, []);

  // Subscribe to Grace Requests
  useEffect(() => {
    const unsubGrace = subscribeGraceRequests(
      (recs) => setGraceRequests(recs),
      (err) => console.warn('AttendanceCard grace requests error:', err)
    );
    return () => unsubGrace();
  }, []);
  
  const [loadingAction, setLoadingAction] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [currentGps, setCurrentGps] = useState<{ lat: number; lon: number; accuracy?: number } | null>(null);

  // Modal for Checkout Confirmation (إشعار تفاصيل اليوم)
  const [showCheckoutConfirmModal, setShowCheckoutConfirmModal] = useState<boolean>(false);

  // Modal for Grace Requests
  const [graceModalType, setGraceModalType] = useState<'late_arrival' | 'early_departure' | null>(null);
  const [graceReason, setGraceReason] = useState<string>('');
  const [graceMinutes, setGraceMinutes] = useState<number>(15);
  const [submittingGrace, setSubmittingGrace] = useState<boolean>(false);

  const openGraceModal = (type: 'late_arrival' | 'early_departure') => {
    setGraceModalType(type);
    setGraceReason('');
    const defaultMins = type === 'late_arrival'
      ? (todayRecord?.lateMinutes || 15)
      : getEffectiveEarlyCheckoutMinutes(todayRecord, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes);
    setGraceMinutes(defaultMins > 0 ? defaultMins : 15);
  };

  // Subscribe to Company Settings
  useEffect(() => {
    const unsubSettings = subscribeCompanySettings(
      (sets) => {
        if (sets) setCompanySettings(sets);
      },
      (err) => console.warn('AttendanceCard settings error:', err)
    );
    return () => unsubSettings();
  }, []);

  // Subscribe to Attendance Records
  useEffect(() => {
    const unsubAttendance = subscribeAttendanceRecords(
      (recs) => {
        setAttendanceRecords(recs);
      },
      (err) => console.warn('AttendanceCard records error:', err)
    );
    return () => unsubAttendance();
  }, []);

  // Live timer for dynamic status updates
  const [nowDate, setNowDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowDate(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Active Today's Record for this Employee
  const todayStr = getEffectiveWorkDateStr(nowDate);
  const todayRecord = attendanceRecords.find(
    (r) => r.employeeId === employee.id && r.date === todayStr && !r.isDeleted
  );

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
    salaryCycleStartDay: 1,
    salaryCycleEndDay: 30,
    paidLeavesPerCycle: 2,
    unpaidLeavesPerCycle: 2,
    overtimeHourlyRate: 5000,
  };

  // Resolve dynamic status for today
  const dynamicStatus = resolveDailyAttendanceStatus(
    todayRecord,
    todayStr,
    effectiveSettings,
    nowDate,
    leaveRequests,
    employee.id,
    employee
  );

  // Check active or requested leave for today
  const activeTodayLeave = leaveRequests.find(
    (l) =>
      l.employeeId === employee.id &&
      (l.status === 'approved' || l.status === 'pending') &&
      l.startDate <= todayStr &&
      todayStr <= l.endDate &&
      !l.isDeleted
  );

  const isPaidLeave = dynamicStatus === 'leave_paid' || activeTodayLeave?.type === 'paid';
  const isUnpaidLeave = dynamicStatus === 'leave_unpaid' || activeTodayLeave?.type === 'unpaid';
  const isAbsent = dynamicStatus === 'absent' || todayRecord?.status === 'absent';
  const isExemptFromFingerprint = Boolean(employee.isExemptFromFingerprint || employee.exemptFromFingerprint);

  const isAttendanceBlocked = isPaidLeave || isUnpaidLeave || isAbsent || isExemptFromFingerprint;

  // Helper to obtain current geolocation
  const getCurrentPositionPromise = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('خدمة تحديد الموقع الجغرافي (GPS) غير مدعومة في جهازك/متصفحك.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          let errorMsg = 'تعذر الحصول على موقعك الجغرافي.';
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = 'يرجى السماح بصلاحية الجغرافيا/الموقع (GPS) لتسجيل البصمة.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = 'معلومات الموقع الجغرافي غير متوفرة حالياً.';
          } else if (err.code === err.TIMEOUT) {
            errorMsg = 'انتهت مهلة استجابة تحديد الموقع.';
          }
          reject(new Error(errorMsg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // Check In Handler
  const handleCheckIn = async () => {
    setMessage(null);
    setLoadingAction(true);
    try {
      // 0. Check employee status
      if (employee.status === 'suspended') {
        setMessage({
          type: 'error',
          text: 'عذراً، حسابك موقوف عن العمل حالياً. لا يمكنك تسجيل الحضور. يرجى مراجعة الإدارة.',
        });
        setLoadingAction(false);
        return;
      }

      const empStartStr = normalizeDateString(employee.employmentDate || employee.joinDate || employee.joinedAt);
      if (empStartStr && normalizeDateString(todayStr) < empStartStr) {
        setMessage({
          type: 'error',
          text: 'لم يحن تاريخ مباشرة العمل الخاص بك بعد.',
        });
        setLoadingAction(false);
        return;
      }

      // 1. Check leave or absence restrictions
      if (isPaidLeave) {
        setMessage({
          type: 'error',
          text: 'عذراً، لديك إجازة مدفوعة الأجر مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الدخول أو الخروج أثناء فترة الإجازة.',
        });
        setLoadingAction(false);
        return;
      }

      if (isUnpaidLeave) {
        setMessage({
          type: 'error',
          text: 'عذراً، لديك إجازة بدون راتب مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الدخول أو الخروج أثناء فترة الإجازة.',
        });
        setLoadingAction(false);
        return;
      }

      if (isAbsent) {
        setMessage({
          type: 'error',
          text: 'عذراً، أنت في حالة غياب لهذا اليوم ولا يمكنك تسجيل بصمة الدخول أو الخروج.',
        });
        setLoadingAction(false);
        return;
      }

      const pos = await getCurrentPositionPromise();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCurrentGps({ lat, lon, accuracy: pos.coords.accuracy });

      const now = new Date();
      const checkInIso = now.toISOString();

      // Validate check-in using attendanceService
      const validation = validateAttendance(lat, lon, now, effectiveSettings);

      if (!validation.isValid) {
        setMessage({
          type: 'error',
          text: validation.errorMessage || 'لا يمكن تسجيل البصمة حسب القوانين الحالية.',
        });
        setLoadingAction(false);
        return;
      }

      // Prepare AttendanceRecord
      const recordId = todayRecord?.id || `att_${employee.id}_${todayStr}`;
      const newRecord: AttendanceRecord = {
        id: recordId,
        employeeId: employee.id,
        employeeName: employee.name,
        date: todayStr,
        checkInTime: checkInIso,
        locationName: validation.matchedLocationName || 'الموقع الرئيسي',
        location: {
          latitude: lat,
          longitude: lon,
          distanceMeters: validation.distanceMeters,
          isWithinRadius: validation.isWithinRadius,
        },
        lateMinutes: validation.lateMinutes,
        status: validation.status,
        notes: validation.status === 'late' ? `تأخير ${validation.lateMinutes} دقيقة` : 'دخول في الوقت المسموح',
      };

      if (todayRecord) {
        await updateAttendanceRecord(todayRecord.id, newRecord);
      } else {
        await createAttendanceRecord(newRecord);
      }

      setMessage({
        type: 'success',
        text: `تم تسجيل بصمة الدخول بنجاح (${validation.status === 'late' ? `تأخير ${validation.lateMinutes} دقيقة` : 'في الوقت المسموح'}).`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء تسجيل بصمة الدخول.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Open Checkout Confirmation Modal
  const handleOpenCheckoutModal = () => {
    if (isPaidLeave) {
      setMessage({
        type: 'error',
        text: 'عذراً، لديك إجازة مدفوعة الأجر مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الخروج.',
      });
      return;
    }

    if (isUnpaidLeave) {
      setMessage({
        type: 'error',
        text: 'عذراً، لديك إجازة بدون راتب مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الخروج.',
      });
      return;
    }

    if (isAbsent) {
      setMessage({
        type: 'error',
        text: 'عذراً، أنت في حالة غياب لهذا اليوم ولا يمكنك تسجيل بصمة الخروج.',
      });
      return;
    }

    if (!todayRecord || !todayRecord.checkInTime) {
      setMessage({ type: 'error', text: 'يجب تسجيل بصمة الدخول أولاً قبل تسجيل الخروج.' });
      return;
    }

    if (todayRecord.checkOutTime) {
      setMessage({ type: 'error', text: 'تم تسجيل بصمة الخروج لهذا اليوم بالفعل.' });
      return;
    }

    setShowCheckoutConfirmModal(true);
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    // Check leave or absence restrictions first
    if (isPaidLeave) {
      setMessage({
        type: 'error',
        text: 'عذراً، لديك إجازة مدفوعة الأجر مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الدخول أو الخروج أثناء فترة الإجازة.',
      });
      return;
    }

    if (isUnpaidLeave) {
      setMessage({
        type: 'error',
        text: 'عذراً، لديك إجازة بدون راتب مسجلة لهذا اليوم. لا يُسمح بتسجيل بصمة الدخول أو الخروج أثناء فترة الإجازة.',
      });
      return;
    }

    if (isAbsent) {
      setMessage({
        type: 'error',
        text: 'عذراً، أنت في حالة غياب لهذا اليوم ولا يمكنك تسجيل بصمة الدخول أو الخروج.',
      });
      return;
    }

    if (!todayRecord || !todayRecord.checkInTime) {
      setMessage({ type: 'error', text: 'يجب تسجيل بصمة الدخول أولاً قبل تسجيل الخروج.' });
      return;
    }

    setMessage(null);
    setLoadingAction(true);
    try {
      const pos = await getCurrentPositionPromise();
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      setCurrentGps({ lat, lon, accuracy: pos.coords.accuracy });

      const now = new Date();
      const checkOutIso = now.toISOString();
      const recordDateStr = todayRecord?.date || todayStr;

      // Validate check-out using attendanceService with checkInTime context
      const checkoutCheck = canCheckOut(
        now,
        effectiveSettings.workStartTime,
        effectiveSettings.workEndTime,
        todayRecord.checkInTime
      );

      if (!checkoutCheck.canCheckOut) {
        setMessage({
          type: 'error',
          text: 'لا يمكن تسجيل الخروج قبل وقت الدخول المسجل.',
        });
        setLoadingAction(false);
        return;
      }

      // Validate location against active company locations during checkout
      const checkoutLocationCheck = checkUserLocationAgainstCompanyLocations(lat, lon, effectiveSettings);
      if (!checkoutLocationCheck.isWithinRadius) {
        setMessage({
          type: 'error',
          text: checkoutLocationCheck.errorMessage || 'أنت خارج نطاق جميع مواقع الشركة المعتمدة.',
        });
        setLoadingAction(false);
        return;
      }

      const earlyCheckoutMinutes = calculateEarlyCheckoutMinutes(
        now,
        effectiveSettings.workEndTime,
        effectiveSettings.earlyCheckoutToleranceMinutes,
        todayRecord?.date || todayStr
      );

      await updateAttendanceRecord(todayRecord.id, {
        checkOutTime: checkOutIso,
        checkOutLocationName: checkoutLocationCheck.matchedLocationName || 'الموقع الرئيسي',
        checkOutLocation: {
          latitude: lat,
          longitude: lon,
          distanceMeters: checkoutLocationCheck.distanceMeters,
          isWithinRadius: true,
        },
        earlyCheckoutMinutes,
      });

      setMessage({
        type: 'success',
        text: `تم تسجيل بصمة الخروج بنجاح (${earlyCheckoutMinutes > 0 ? `خروج مبكر ${earlyCheckoutMinutes} دقيقة` : 'اكتمل الدوام'}).`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء تسجيل بصمة الخروج.',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  // Today's Grace Requests status
  const todayLateGrace = graceRequests.find(
    (g) => g.employeeId === employee.id && g.date === todayStr && g.type === 'late_arrival' && !g.isDeleted
  );
  const todayEarlyGrace = graceRequests.find(
    (g) => g.employeeId === employee.id && g.date === todayStr && g.type === 'early_departure' && !g.isDeleted
  );

  const handleSubmitGrace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!graceModalType) return;
    if (!graceReason.trim()) {
      setMessage({ type: 'error', text: 'يرجى كتابة سبب طلب السماحية.' });
      return;
    }

    setSubmittingGrace(true);
    try {
      const minutesToSave = graceMinutes > 0 ? graceMinutes : 15;

      const newReq: GraceRequest = {
        id: `grace_${employee.id}_${todayStr}_${graceModalType}_${Date.now()}`,
        employeeId: employee.id,
        employeeName: employee.name,
        date: todayStr,
        type: graceModalType,
        minutes: minutesToSave,
        reason: graceReason.trim(),
        status: 'pending',
        requestedAt: new Date().toISOString()
      };

      if (todayRecord?.id) {
        newReq.attendanceRecordId = todayRecord.id;
      }

      await createGraceRequest(newReq);
      setMessage({
        type: 'success',
        text: `تم تقديم ${graceModalType === 'late_arrival' ? 'طلب سماحية التأخير' : 'طلب سماحية الخروج المبكر'} بنجاح، بانتظار موافقة المدير.`
      });
      setGraceModalType(null);
      setGraceReason('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'حدث خطأ أثناء إرسال طلب السماحية.' });
    } finally {
      setSubmittingGrace(false);
    }
  };

  // Today's Status Helpers
  const getStatusBadge = () => {
    if (dynamicStatus === 'waiting_for_check_in') {
      return <span className="bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">⏳ في انتظار البصمة</span>;
    }
    if (isExemptFromFingerprint || dynamicStatus === 'exempt_from_fingerprint') {
      return <span className="bg-slate-100 text-slate-800 border border-slate-300 font-extrabold px-2.5 py-1 rounded-lg text-xs">🛡️ غير مشمول بالبصمة</span>;
    }
    switch (dynamicStatus) {
      case 'not_recorded':
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">⚪ غير مسجل</span>;
      case 'present':
        return <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🟢 حاضر (في الوقت)</span>;
      case 'late':
        return <span className="bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🟡 متأخر ({todayRecord?.lateMinutes || 0} دقيقة)</span>;
      case 'absent':
        return <span className="bg-red-50 text-red-800 border border-red-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🔴 غائب (انتهت المهلة)</span>;
      case 'leave_paid':
        return <span className="bg-purple-50 text-purple-800 border border-purple-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🟣 إجازة مدفوعة</span>;
      case 'leave_unpaid':
        return <span className="bg-blue-50 text-blue-800 border border-blue-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🔵 إجازة بدون راتب</span>;
      case 'holiday':
        return <span className="bg-teal-50 text-teal-800 border border-teal-200 font-extrabold px-2.5 py-1 rounded-lg text-xs">🟢 عطلة رسمية</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 font-bold px-2.5 py-1 rounded-lg text-xs">⚪ غير مسجل</span>;
    }
  };

  const lastStamp = todayRecord?.checkOutTime
    ? formatArabicTimeOnly(todayRecord.checkOutTime)
    : todayRecord?.checkInTime
    ? formatArabicTimeOnly(todayRecord.checkInTime)
    : 'لا يوجد';

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-5 md:p-6 shadow-xs transition-all">
      {/* Collapsible Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between cursor-pointer focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center font-bold shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div className="text-right">
            <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
              <span>الحضور والانصراف</span>
              {todayRecord?.checkInTime && (
                <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  تم تسجيل الدخول
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              متابعة مواعيد الدوام الرسمي والبصمة الجغرافية
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
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت بداية الدوام</span>
                  <span className="font-mono font-black text-slate-800">{effectiveSettings.workStartTime}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت نهاية الدوام</span>
                  <span className="font-mono font-black text-slate-800">{effectiveSettings.workEndTime}</span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">حالة اليوم</span>
                  <div>{getStatusBadge()}</div>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت الدخول</span>
                  <span className="font-mono font-black text-slate-800">
                    {todayRecord?.checkInTime
                      ? formatArabicTimeOnly(todayRecord.checkInTime)
                      : isExemptFromFingerprint
                      ? `${effectiveSettings.workStartTime} (تلقائي)`
                      : '--:--'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">وقت الخروج</span>
                  <span className="font-mono font-black text-slate-800">
                    {todayRecord?.checkOutTime
                      ? formatArabicTimeOnly(todayRecord.checkOutTime)
                      : isExemptFromFingerprint
                      ? `${effectiveSettings.workEndTime} (تلقائي)`
                      : '--:--'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">آخر وقت بصمة</span>
                  <span className="font-mono font-black text-slate-800">
                    {isExemptFromFingerprint ? 'تلقائي (غير مشمول بالبصمة)' : lastStamp}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">دقائق التأخير</span>
                  <span className="font-extrabold text-amber-700">
                    {todayRecord?.lateMinutes || 0} دقيقة
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">دقائق الخروج المبكر</span>
                  <span className="font-extrabold text-amber-700">
                    {getEffectiveEarlyCheckoutMinutes(todayRecord, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes)} دقيقة
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 text-[10px] font-bold block mb-1">حالة الموقع (GPS)</span>
                  <span className="font-bold flex items-center gap-1 text-slate-700">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {todayRecord?.location?.isWithinRadius ? (
                      <span className="text-emerald-700 font-extrabold">داخل النطاق 🟢</span>
                    ) : (
                      <span className="text-slate-500 font-medium">بانتظار الفحص</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Leave or Absence or Fingerprint Exemption Restriction Banner */}
              {isAttendanceBlocked && (
                <div
                  className={`p-4 rounded-2xl border text-xs font-bold space-y-1 shadow-2xs ${
                    isExemptFromFingerprint
                      ? 'bg-amber-50 text-amber-950 border-amber-200/80'
                      : isPaidLeave
                      ? 'bg-purple-50 text-purple-950 border-purple-200'
                      : isUnpaidLeave
                      ? 'bg-blue-50 text-blue-950 border-blue-200'
                      : 'bg-red-50 text-red-950 border-red-200'
                  }`}
                >
                  <div className="flex items-center gap-2 font-black text-sm">
                    <ShieldAlert className="w-5 h-5 shrink-0" />
                    <span>
                      {isExemptFromFingerprint
                        ? '🛡️ أنت غير مشمول بنظام البصمة الحيوية'
                        : isPaidLeave
                        ? '⛔ غير مسموح بتسجيل البصمة: لديك إجازة مدفوعة اليوم'
                        : isUnpaidLeave
                        ? '⛔ غير مسموح بتسجيل البصمة: لديك إجازة بدون راتب اليوم'
                        : '⛔ غير مسموح بتسجيل البصمة: أنت في حالة غياب اليوم'}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 pr-7 leading-relaxed">
                    {isExemptFromFingerprint
                      ? `أنت مسجل في النظام كـ (غير مشمول بالبصمة). لا يلزمك تسجيل بصمة دخول أو خروج هاتفية، ويُحتسب حضورك وأوقات الدوام تلقائياً (${effectiveSettings.workStartTime} - ${effectiveSettings.workEndTime}).`
                      : isPaidLeave
                      ? 'تم تسجيل أو طلب إجازة مدفوعة الأجر لهذا اليوم. تم تعطيل بصمتي الدخول والخروج تلقائياً.'
                      : isUnpaidLeave
                      ? 'تم تسجيل أو طلب إجازة بدون راتب لهذا اليوم. تم تعطيل بصمتي الدخول والخروج تلقائياً.'
                      : 'أنت مسجل في حالة غياب لهذا اليوم أو انتهت المهلة الرسمية لتسجيل الحضور. لا يمكنك تسجيل البصمة.'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  disabled={loadingAction || !!todayRecord?.checkInTime || isAttendanceBlocked}
                  onClick={handleCheckIn}
                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    todayRecord?.checkInTime || isAttendanceBlocked
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {loadingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {isExemptFromFingerprint
                      ? 'حضور تلقائي (غير مشمول بالبصمة)'
                      : todayRecord?.checkInTime
                      ? 'تم تسجيل الدخول'
                      : isPaidLeave
                      ? 'غير مسموح (إجازة مدفوعة)'
                      : isUnpaidLeave
                      ? 'غير مسموح (إجازة بدون راتب)'
                      : isAbsent
                      ? 'انتهت المهلة (غائب)'
                      : 'بصمة دخول'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={loadingAction || !todayRecord?.checkInTime || !!todayRecord?.checkOutTime || isAttendanceBlocked}
                  onClick={handleOpenCheckoutModal}
                  className={`py-3 px-4 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    !todayRecord?.checkInTime || !!todayRecord?.checkOutTime || isAttendanceBlocked
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200 opacity-80'
                      : 'bg-blue-700 hover:bg-blue-800 text-white hover:scale-[1.01] active:scale-[0.99]'
                  }`}
                >
                  {loadingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Clock className="w-4 h-4" />
                  )}
                  <span>
                    {todayRecord?.checkOutTime
                      ? 'تم تسجيل الخروج ✅'
                      : !todayRecord?.checkInTime
                      ? 'بصمة خروج (تتطلب دخول أولاً)'
                      : isPaidLeave
                      ? 'غير مسموح (إجازة مدفوعة)'
                      : isUnpaidLeave
                      ? 'غير مسموح (إجازة بدون راتب)'
                      : isAbsent
                      ? 'غير مسموح (غائب)'
                      : 'بصمة خروج ⏰'}
                  </span>
                </button>
              </div>

              {/* Grace Requests Section (طلبات السماحية - التأخير والخروج المبكر) */}
              <div className="mt-3 pt-3 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-700 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    طلبات السماحية (بانتظار موافقة المدير)
                  </span>
                </div>

                {/* 1. Late Arrival Grace Request Button / Status */}
                <div>
                  {todayLateGrace?.status === 'pending' ? (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        طلب سماحية تأخير ({todayLateGrace.minutes} دقيقة) قيد المراجعة والاعتماد
                      </span>
                      <span className="text-[10px] bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-md font-black">قيد الانتظار</span>
                    </div>
                  ) : todayLateGrace?.status === 'approved' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        تمت موافقة المدير على سماحية التأخير (تم إلغاء خصم الدقائق)
                      </span>
                      <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-md font-black">معتمد ✅</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-amber-50/60 p-2.5 rounded-xl border border-amber-100">
                      <div className="text-xs">
                        <span className="font-bold text-amber-900 block">
                          {todayRecord?.lateMinutes ? `تأخير في الحضور: ${todayRecord.lateMinutes} دقيقة` : 'طلب سماحية تأخير حضور'}
                        </span>
                        {todayLateGrace?.status === 'rejected' && (
                          <span className="text-[10px] text-red-600 font-bold block mt-0.5">تم رفض الطلب السابق: {todayLateGrace.rejectionReason || 'بدون سبب'}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openGraceModal('late_arrival')}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                      >
                        <Send className="w-3 h-3" />
                        طلب سماحية تأخير
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. Early Departure Grace Request Button / Status */}
                <div>
                  {todayEarlyGrace?.status === 'pending' ? (
                    <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                        طلب سماحية خروج مبكر ({todayEarlyGrace.minutes} دقيقة) قيد المراجعة والاعتماد
                      </span>
                      <span className="text-[10px] bg-purple-200/70 text-purple-900 px-2 py-0.5 rounded-md font-black">قيد الانتظار</span>
                    </div>
                  ) : todayEarlyGrace?.status === 'approved' ? (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        تمت موافقة المدير على سماحية الخروج المبكر (تم إلغاء خصم الدقائق)
                      </span>
                      <span className="text-[10px] bg-emerald-200/70 text-emerald-900 px-2 py-0.5 rounded-md font-black">معتمد ✅</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
                      <div className="text-xs">
                        <span className="font-bold text-purple-900 block">
                          {getEffectiveEarlyCheckoutMinutes(todayRecord, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes) > 0
                            ? `خروج مبكر: ${getEffectiveEarlyCheckoutMinutes(todayRecord, effectiveSettings.workEndTime, effectiveSettings.earlyCheckoutToleranceMinutes)} دقيقة`
                            : 'طلب سماحية خروج مبكر'}
                        </span>
                        {todayEarlyGrace?.status === 'rejected' && (
                          <span className="text-[10px] text-red-600 font-bold block mt-0.5">تم رفض الطلب السابق: {todayEarlyGrace.rejectionReason || 'بدون سبب'}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => openGraceModal('early_departure')}
                        className="bg-purple-700 hover:bg-purple-800 text-white font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-xs"
                      >
                        <Send className="w-3 h-3" />
                        طلب سماحية خروج مبكر
                      </button>
                    </div>
                  )}
                </div>

              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grace Request Modal */}
      <AnimatePresence>
        {graceModalType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 relative text-right max-h-[90vh] overflow-y-auto my-auto"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-xl ${graceModalType === 'late_arrival' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700'}`}>
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">
                      {graceModalType === 'late_arrival' ? 'تقديم طلب سماحية تأخير' : 'تقديم طلب سماحية / تعديل نسيان الخروج'}
                    </h3>
                    <p className="text-xs text-slate-400">
                      سيتم إرسال الطلب للمدير للمراجعة والموافقة على إلغاء الخصم
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setGraceModalType(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitGrace} className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">الموظف:</span>
                    <span className="font-black text-slate-800">{employee.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">التاريخ:</span>
                    <span className="font-mono font-bold text-slate-800">{todayStr}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    عدد دقائق السماحية المطلوب استثناؤها (بالدقائق):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(Math.max(1, parseInt(e.target.value) || 15))}
                    className="w-full rounded-2xl border border-slate-200 p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    سبب طلب السماحية (إجباري) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={graceReason}
                    onChange={(e) => setGraceReason(e.target.value)}
                    placeholder={graceModalType === 'late_arrival' ? 'أدخل سبب التأخير (مثال: ازدحام مروري، ظرف طارئ...)' : 'أدخل سبب الخروج المبكر أو نسيان بصمة الخروج (مثال: نسيان البصمة، ظرف طارئ...)'}
                    className="w-full rounded-2xl border border-slate-200 p-3 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submittingGrace || !graceReason.trim()}
                    className={`flex-1 py-3 px-4 rounded-2xl text-xs font-black text-white flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs ${
                      graceModalType === 'late_arrival' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-700 hover:bg-purple-800'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {submittingGrace ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>إرسال الطلب للمدير</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setGraceModalType(null)}
                    className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Checkout Confirmation Modal (إشعار تفاصيل اليوم) */}
      <AnimatePresence>
        {showCheckoutConfirmModal && todayRecord?.checkInTime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 relative text-right max-h-[90vh] overflow-y-auto my-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-100 text-blue-700">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">
                      تأكيد تسجيل بصمة الخروج
                    </h3>
                    <p className="text-xs text-slate-400">
                      مراجعة تفاصيل ساعات العمل المسجلة اليوم وتأكيد الانصراف
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCheckoutConfirmModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Day Details Card */}
              <div className="space-y-3 mb-5">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs space-y-2.5">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                      اسم الموظف:
                    </span>
                    <span className="font-black text-slate-800 text-sm">{employee.name}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      تاريخ اليوم:
                    </span>
                    <span className="font-mono font-bold text-slate-800">{todayStr}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      وقت تسجيل الدخول:
                    </span>
                    <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-lg border border-emerald-200/80">
                      {formatArabicTimeOnly(todayRecord.checkInTime)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                      الوقت الحالي (بصمة الخروج):
                    </span>
                    <span className="font-mono font-black text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-200/80">
                      {formatArabicTimeOnly(nowDate.toISOString())}
                    </span>
                  </div>

                  {/* Total Worked Time */}
                  {(() => {
                    const checkInMs = new Date(todayRecord.checkInTime).getTime();
                    const diffMs = Math.max(0, nowDate.getTime() - checkInMs);
                    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    return (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                        <span className="text-slate-600 font-extrabold">إجمالي وقت العمل اليوم:</span>
                        <span className="font-black text-slate-900 bg-slate-200/70 px-2.5 py-0.5 rounded-lg">
                          {hrs > 0 ? `${hrs} ساعة و ${mins} دقيقة` : `${mins} دقيقة`}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                    <span>جدول الدوام الرسمي:</span>
                    <span className="font-mono font-bold">{effectiveSettings.workStartTime} - {effectiveSettings.workEndTime}</span>
                  </div>
                </div>

                {/* Status Notice Banner */}
                {(() => {
                  const earlyCheckoutMinutes = calculateEarlyCheckoutMinutes(
                    nowDate,
                    effectiveSettings.workEndTime,
                    effectiveSettings.earlyCheckoutToleranceMinutes,
                    todayRecord?.date || todayStr
                  );
                  if (earlyCheckoutMinutes > 0) {
                    return (
                      <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-bold space-y-1">
                        <div className="flex items-center gap-2 font-black text-amber-900">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>تنبيه خروج مبكر ({earlyCheckoutMinutes} دقيقة)</span>
                        </div>
                        <p className="text-[11px] text-amber-800 font-medium leading-relaxed pr-6">
                          الخروج الآن يسبق موعد نهاية الدوام الرسمي ({effectiveSettings.workEndTime}). هل أنت ألماني بتأكيد الخروج المبكر؟
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/80 text-emerald-900 text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>اكتمل وقت الدوام الرسمي بنجاح. جاهز لتأكيد بصمة الخروج.</span>
                    </div>
                  );
                })()}
              </div>

              {/* Action Buttons: Cancel & Confirm */}
              <div className="flex items-center gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={async () => {
                    setShowCheckoutConfirmModal(false);
                    await handleCheckOut();
                  }}
                  className="flex-1 py-3 px-4 rounded-2xl text-xs font-black text-white bg-blue-700 hover:bg-blue-800 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                >
                  {loadingAction ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  <span>تأكيد تسجيل الخروج</span>
                </button>

                <button
                  type="button"
                  disabled={loadingAction}
                  onClick={() => setShowCheckoutConfirmModal(false)}
                  className="py-3 px-5 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
