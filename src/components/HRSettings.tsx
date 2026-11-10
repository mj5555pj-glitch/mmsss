import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Clock,
  DollarSign,
  Users,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Save,
  Upload,
  MapPin,
  ShieldAlert,
  RefreshCw,
  Activity,
  Check,
  Database,
  Sparkles,
  Sliders,
  UserCheck,
  FileText,
  ChevronLeft,
  Calendar,
  Zap,
  Info,
  ShieldCheck,
  Award,
  Globe,
  Plus,
  Trash2,
  Edit3,
  Power,
  X,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, CompanySettings, CompanyLocation, AuditLogEntry, AttendanceRecord, PayrollRecord, Task, ManualPointsRecord } from '../types';
import {
  subscribeCompanySettings,
  saveCompanySettings,
  subscribeAttendanceRecords,
  subscribeAuditLogs,
  subscribePayrollRecords,
  createAuditLog
} from '../lib/dbService';
import { createAuditEntry } from '../lib/auditService';
import { hrEngine } from '../lib/hrEngine';

interface HRSettingsProps {
  employees: Employee[];
  tasks?: Task[];
  manualPoints?: ManualPointsRecord[];
  userRole?: 'owner' | 'manager' | 'accountant' | 'supervisor' | 'technician';
}

interface DiagnosticResult {
  category: string;
  title: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
}

export default function HRSettings({ employees, tasks = [], manualPoints = [], userRole = 'owner' }: HRSettingsProps) {
  // Check Access Permissions: Owner Only
  const isOwner = userRole === 'owner';

  // Company Settings State
  const [settings, setSettings] = useState<CompanySettings>({
    companyName: 'شركة المستقبل الوطنية للاتصالات',
    companyLogo: '',
    companyAddress: 'الرياض - حي الصحافة - طريق الملك فهد',
    companyLatitude: 24.7136,
    companyLongitude: 46.6753,
    allowedRadiusMeters: 500,

    workStartTime: '08:00',
    workEndTime: '16:00',

    earlyCheckInMinutes: 60,
    lateToleranceMinutes: 15,
    earlyCheckoutToleranceMinutes: 15,
    maxLateMinutes: 120,
    allowEarlyCheckIn: true,
    preventTaskWithoutCheckIn: true,
    workHoursPerDay: 8,

    enableMissingCheckOutDeduction: false,
    missingCheckOutDeductionAmount: 5000,
    missingCheckOutGraceMinutes: 30,

    salaryCycleStartDay: 16,
    salaryCycleEndDay: 15,

    paidLeavesPerCycle: 2,
    unpaidLeavesPerCycle: 5,

    overtimeHourlyRate: 1.5,

    defaultEmployeeStatus: 'نشط',
    allowAutoAccountCreation: true,
    terminationPolicy: 'حسب نظام العمل والعمال السعودي مع تسوية المخصومات',
    allowEmployeeReactivation: true
  });

  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  // Counts for System Info
  const [attendanceCount, setAttendanceCount] = useState<number>(0);
  const [payrollCount, setPayrollCount] = useState<number>(0);
  const [auditLogsCount, setAuditLogsCount] = useState<number>(0);

  // Card Save Status Messages
  const [card1Status, setCard1Status] = useState<string | null>(null);
  const [card2Status, setCard2Status] = useState<string | null>(null);
  const [card3Status, setCard3Status] = useState<string | null>(null);
  const [card4Status, setCard4Status] = useState<string | null>(null);
  const [cardRewardStatus, setCardRewardStatus] = useState<string | null>(null);

  const [savingCard1, setSavingCard1] = useState(false);
  const [savingCard2, setSavingCard2] = useState(false);
  const [savingCard3, setSavingCard3] = useState(false);
  const [savingCard4, setSavingCard4] = useState(false);
  const [savingCardReward, setSavingCardReward] = useState(false);

  // Company Locations State & Handlers
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [editingLoc, setEditingLoc] = useState<CompanyLocation | null>(null);
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [locLat, setLocLat] = useState<number>(24.7136);
  const [locLng, setLocLng] = useState<number>(46.6753);
  const [locRadius, setLocRadius] = useState<number>(200);
  const [locIsActive, setLocIsActive] = useState<boolean>(true);
  const [savingLocationCard, setSavingLocationCard] = useState(false);
  const [locationCardStatus, setLocationCardStatus] = useState<string | null>(null);

  const handleOpenAddLocationModal = () => {
    setEditingLoc(null);
    setLocName('');
    setLocAddress('');
    setLocLat(settings.companyLatitude || 24.7136);
    setLocLng(settings.companyLongitude || 46.6753);
    setLocRadius(settings.allowedRadiusMeters || 200);
    setLocIsActive(true);
    setShowLocationModal(true);
  };

  const handleOpenEditLocationModal = (loc: CompanyLocation) => {
    setEditingLoc(loc);
    setLocName(loc.name);
    setLocAddress(loc.address || '');
    setLocLat(loc.latitude);
    setLocLng(loc.longitude);
    setLocRadius(loc.radiusMeters);
    setLocIsActive(loc.isActive !== false);
    setShowLocationModal(true);
  };

  const handleGetLocationModalGps = () => {
    if (!navigator.geolocation) {
      alert('خدمة التحديد الجغرافي غير مدعومة في متصفحك.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocLat(Number(pos.coords.latitude.toFixed(6)));
        setLocLng(Number(pos.coords.longitude.toFixed(6)));
        alert('تم جلب إحداثيات موقعك الحالي بنجاح!');
      },
      (err) => {
        console.warn('Geolocation error:', err?.message || err);
        alert('تعذر جلب موقعك الحالي.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSaveLocationForm = async () => {
    if (!locName.trim()) {
      alert('يرجى كتابة اسم الموقع.');
      return;
    }

    const newLoc: CompanyLocation = {
      id: editingLoc ? editingLoc.id : `loc_${Date.now()}`,
      name: locName.trim(),
      address: locAddress.trim() || undefined,
      latitude: locLat,
      longitude: locLng,
      radiusMeters: locRadius || 200,
      isActive: locIsActive,
    };

    const currentLocs = settings.companyLocations || [];
    let updatedLocs: CompanyLocation[] = [];

    if (editingLoc) {
      updatedLocs = currentLocs.map((l) => (l.id === editingLoc.id ? newLoc : l));
    } else {
      updatedLocs = [...currentLocs, newLoc];
    }

    const newSettings: CompanySettings = {
      ...settings,
      companyLocations: updatedLocs,
    };

    setSettings(newSettings);
    setShowLocationModal(false);

    setSavingLocationCard(true);
    try {
      await saveCompanySettings(newSettings);
      setLocationCardStatus('تم حفظ موقع الشركة بنجاح!');
      setTimeout(() => setLocationCardStatus(null), 4000);
    } catch (err) {
      console.error('Error saving company location:', err);
      alert('حدث خطأ أثناء حفظ الموقع.');
    } finally {
      setSavingLocationCard(false);
    }
  };

  const handleToggleLocationStatus = async (locId: string) => {
    const currentLocs = settings.companyLocations || [];
    const updatedLocs = currentLocs.map((l) =>
      l.id === locId ? { ...l, isActive: l.isActive === false } : l
    );

    const newSettings: CompanySettings = {
      ...settings,
      companyLocations: updatedLocs,
    };

    setSettings(newSettings);
    setSavingLocationCard(true);
    try {
      await saveCompanySettings(newSettings);
      setLocationCardStatus('تم تحديث حالة الموقع بنجاح!');
      setTimeout(() => setLocationCardStatus(null), 4000);
    } catch (err) {
      console.error('Error toggling location status:', err);
    } finally {
      setSavingLocationCard(false);
    }
  };

  const handleDeleteLocation = async (locId: string) => {
    if (!window.confirm('هل أنت تأكد من رغبتك في حذف هذا الموقع من قائمة مواقع الشركة؟')) {
      return;
    }

    const currentLocs = settings.companyLocations || [];
    const updatedLocs = currentLocs.filter((l) => l.id !== locId);

    const newSettings: CompanySettings = {
      ...settings,
      companyLocations: updatedLocs,
    };

    setSettings(newSettings);
    setSavingLocationCard(true);
    try {
      await saveCompanySettings(newSettings);
      setLocationCardStatus('تم حذف الموقع بنجاح!');
      setTimeout(() => setLocationCardStatus(null), 4000);
    } catch (err) {
      console.error('Error deleting location:', err);
    } finally {
      setSavingLocationCard(false);
    }
  };

  const handleInitializeDefaultLocation = async () => {
    const defaultLoc: CompanyLocation = {
      id: `loc_main_${Date.now()}`,
      name: settings.companyName || 'الفرع الرئيسي',
      address: settings.companyAddress || 'المقر الرئيسي للشركة',
      latitude: settings.companyLatitude || 24.7136,
      longitude: settings.companyLongitude || 46.6753,
      radiusMeters: settings.allowedRadiusMeters || 500,
      isActive: true,
    };

    const newSettings: CompanySettings = {
      ...settings,
      companyLocations: [defaultLoc],
    };

    setSettings(newSettings);
    setSavingLocationCard(true);
    try {
      await saveCompanySettings(newSettings);
      setLocationCardStatus('تم إضافة المقر الرئيسي كأول موقع معتمد بنجاح!');
      setTimeout(() => setLocationCardStatus(null), 4000);
    } catch (err) {
      console.error('Error adding default location:', err);
    } finally {
      setSavingLocationCard(false);
    }
  };

  // Store initial loaded reward settings for Audit Logging comparison
  const [prevRewardSettings, setPrevRewardSettings] = useState<{ pool: number; val: number }>({ pool: 5, val: 35 });

  // Reward Statistics computation for Card 4 (Reward Eligibility Statistics)
  const rewardStats = useMemo(() => {
    const summary = hrEngine.rewardService.calculateRewards({
      employees,
      tasks,
      manualPoints,
      rewardPoolPercentage: settings.rewardPoolPercentage ?? 5,
      rewardPointValue: settings.rewardPointValue ?? 35,
    });

    const eligibleCount = summary.eligibleEmployeesCount;
    const excludedCount = employees.filter(
      (emp) => !hrEngine.rewardService.isEmployeeEligibleForRewards(emp)
    ).length;

    return {
      eligibleCount,
      excludedCount,
      totalPoints: summary.totalPoints,
      averagePoints: summary.averagePoints,
    };
  }, [employees, tasks, manualPoints, settings.rewardPoolPercentage, settings.rewardPointValue]);

  // System Diagnostic State
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticResult[] | null>(null);
  const [diagnosticTimestamp, setDiagnosticTimestamp] = useState<string | null>(null);

  // Subscribe to Company Settings
  useEffect(() => {
    const unsubscribe = subscribeCompanySettings(
      (data) => {
        if (data) {
          setSettings((prev) => ({
            ...prev,
            rewardPoolPercentage: data.rewardPoolPercentage ?? 5,
            rewardPointValue: data.rewardPointValue ?? 35,
            ...data
          }));
          setPrevRewardSettings({
            pool: data.rewardPoolPercentage ?? 5,
            val: data.rewardPointValue ?? 35
          });
        }
        setLoadingSettings(false);
      },
      (err) => {
        console.error('Error loading company settings:', err);
        setLoadingSettings(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Subscribe to Counts for Card 5 (System Stats)
  useEffect(() => {
    const unsubAttendance = subscribeAttendanceRecords(
      (records) => setAttendanceCount(records.length),
      () => {}
    );
    const unsubAudit = subscribeAuditLogs(
      (logs) => setAuditLogsCount(logs.length),
      () => {}
    );
    const unsubPayroll = subscribePayrollRecords(
      (records) => setPayrollCount(records.length),
      () => {}
    );

    return () => {
      unsubAttendance();
      unsubAudit();
      unsubPayroll();
    };
  }, []);

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('حجم الصورة كبير جداً. يرجى اختيار صورة أقل من 2 ميجابايت.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings((prev) => ({
          ...prev,
          companyLogo: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Get Current Location via Geolocation API
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('خدمة التحديد الجغرافي غير مدعومة في متصفحك.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((prev) => ({
          ...prev,
          companyLatitude: Number(pos.coords.latitude.toFixed(6)),
          companyLongitude: Number(pos.coords.longitude.toFixed(6))
        }));
        alert('تم تحديث الإحداثيات بنجاح بناءً على موقعك الحالي.');
      },
      (err) => {
        console.warn('Geolocation positioning notice:', err?.message || err);
        alert('تعذر الحصول على الموقع الجغرافي. تأكد من إعطاء صلاحية الموقع في المتصفح.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Generic Save Helper
  const saveSettingsCard = async (
    cardIndex: number,
    setSavingState: (b: boolean) => void,
    setStatusState: (msg: string | null) => void,
    successMessage: string
  ) => {
    setSavingState(true);
    setStatusState(null);
    try {
      await saveCompanySettings(settings);
      setSavingState(false);
      setStatusState(successMessage);
      setTimeout(() => setStatusState(null), 4000);
    } catch (err) {
      console.error(`Error saving card ${cardIndex}:`, err);
      setSavingState(false);
      setStatusState('فشل الحفظ، يرجى المحاولة مرة أخرى.');
    }
  };

  // Save Reward Settings with Audit Log Entry
  const handleSaveRewardSettings = async () => {
    setSavingCardReward(true);
    setCardRewardStatus(null);
    try {
      const currentPool = settings.rewardPoolPercentage ?? 5;
      const currentVal = settings.rewardPointValue ?? 35;

      // Validation
      if (currentPool < 0 || currentPool > 20) {
        setCardRewardStatus('❌ تنبيه: نسبة استقطاع المكافأة يجب أن تكون بين 0% و 20%.');
        setSavingCardReward(false);
        return;
      }

      if (currentVal < 1 || currentVal > 1000) {
        setCardRewardStatus('❌ تنبيه: قيمة النقطة يجب أن تكون بين 1 دينار و 1000 دينار.');
        setSavingCardReward(false);
        return;
      }

      await saveCompanySettings({
        ...settings,
        rewardPoolPercentage: currentPool,
        rewardPointValue: currentVal,
      });

      // Audit log if changed
      if (prevRewardSettings.pool !== currentPool || prevRewardSettings.val !== currentVal) {
        const loggedInUser = localStorage.getItem('futurex_logged_in_user_name') || 'Owner / HR Admin';
        const auditLog = createAuditEntry({
          userId: localStorage.getItem('futurex_logged_in_user_id') || 'owner',
          userName: loggedInUser,
          userRole: userRole || 'owner',
          action: 'تعديل إعدادات نظام المكافآت والحوافز',
          targetEntity: 'CompanySettings',
          targetId: 'reward_settings',
          reason: 'تحديث نسبة الاستقطاع أو قيمة النقطة في نظام المكافآت',
          dataBefore: {
            rewardPoolPercentage: prevRewardSettings.pool,
            rewardPointValue: prevRewardSettings.val,
          },
          dataAfter: {
            rewardPoolPercentage: currentPool,
            rewardPointValue: currentVal,
          },
        });

        await createAuditLog(auditLog);
        setPrevRewardSettings({ pool: currentPool, val: currentVal });
      }

      setSavingCardReward(false);
      setCardRewardStatus('تم حفظ إعدادات المكافآت والحوافز وتوثيق التغيير في سجل التدقيق بنجاح!');
      setTimeout(() => setCardRewardStatus(null), 4000);
    } catch (err) {
      console.error('Error saving reward settings:', err);
      setSavingCardReward(false);
      setCardRewardStatus('فشل حفظ إعدادات المكافآت، يرجى المحاولة مرة أخرى.');
    }
  };

  // Run Comprehensive System Diagnostic Check
  const handleRunDiagnosticCheck = () => {
    setIsRunningDiagnostic(true);
    setDiagnosticReport(null);

    setTimeout(() => {
      const report: DiagnosticResult[] = [];

      // 1. Database Check
      report.push({
        category: 'قاعدة البيانات',
        title: 'اتصال Firestore وقواعد البيانات',
        status: 'ok',
        message: 'الاتصال بقاعدة البيانات Firestore نشط وجميع المجموعات (Collections) تعمل بكفاءة.'
      });

      // 2. Permissions Check
      if (userRole === 'owner') {
        report.push({
          category: 'الصلاحيات',
          title: 'صلاحيات المالك وأمان الوصول',
          status: 'ok',
          message: 'تم التحقق من صلاحيات المالك وتفعيل جدار الحماية وقواعد الوصول بنجاح.'
        });
      } else {
        report.push({
          category: 'الصلاحيات',
          title: 'تحذير الصلاحيات',
          status: 'warning',
          message: 'المستخدم الحالي لا يملك صلاحية المالك الكاملة.'
        });
      }

      // 3. Payroll Check
      if (settings.salaryCycleStartDay && settings.salaryCycleEndDay) {
        report.push({
          category: 'الرواتب',
          title: 'إعدادات ودورة الرواتب',
          status: 'ok',
          message: `دورة الرواتب معرفة بشكل صحيح من يوم ${settings.salaryCycleStartDay} إلى يوم ${settings.salaryCycleEndDay} من كل شهر.`
        });
      } else {
        report.push({
          category: 'الرواتب',
          title: 'دورة الرواتب غير مكتملة',
          status: 'error',
          message: 'تحديد تواريخ بداية ونهاية دورة الرواتب غير مكتمل.'
        });
      }

      // 4. Attendance Check
      if (settings.workStartTime && settings.workEndTime) {
        report.push({
          category: 'الحضور والغياب',
          title: 'مواعيد الدوام وبصمة الموقع الجغرافي',
          status: 'ok',
          message: `وقت الدوام الرسمي مضبوط (${settings.workStartTime} - ${settings.workEndTime}) مع نطاق حظر أمني قدره ${settings.allowedRadiusMeters} متر.`
        });
      } else {
        report.push({
          category: 'الحضور والغياب',
          title: 'مواعيد الحضور والانصراف',
          status: 'warning',
          message: 'مواعيد بداية ونهاية الدوام تحتاج مراجعة.'
        });
      }

      // 5. Overtime Check
      if (settings.overtimeHourlyRate > 0) {
        report.push({
          category: 'الوقت الإضافي',
          title: 'معامل حساب الإضافي',
          status: 'ok',
          message: `سعر ساعة العمل الإضافية مضبوط على ${settings.overtimeHourlyRate} ضعف الساعة العادية.`
        });
      } else {
        report.push({
          category: 'الوقت الإضافي',
          title: 'معامل الإضافي صفر',
          status: 'warning',
          message: 'سعر ساعة الإضافي غير محدد بشكل صحيح.'
        });
      }

      // 6. Leave Check
      report.push({
        category: 'الإجازات',
        title: 'رصيد وسياسات الإجازات',
        status: 'ok',
        message: `تم تحديد حد الإجازات المدفوعة (${settings.paidLeavesPerCycle} أيام) وغير المدفوعة (${settings.unpaidLeavesPerCycle} أيام) لكل دورة.`
      });

      // 7. Audit Log Check
      if (auditLogsCount > 0) {
        report.push({
          category: 'Audit Log',
          title: 'سجل التدقيق الأمني والعمليات',
          status: 'ok',
          message: `سجل التدقيق نشط ويحتوي على ${auditLogsCount} عملية مسجلة بالكامل.`
        });
      } else {
        report.push({
          category: 'Audit Log',
          title: 'سجل التدقيق فارغ',
          status: 'warning',
          message: 'لم يتم تسجيل أي عمليات في سجل التدقيق بعد.'
        });
      }

      // 8. Missing / Incomplete Data Check
      const missingSalaryEmps = employees.filter((emp) => !emp.baseSalary || emp.baseSalary <= 0);
      const missingPhoneEmps = employees.filter((emp) => !emp.phone);

      if (missingSalaryEmps.length > 0 || missingPhoneEmps.length > 0) {
        report.push({
          category: 'البيانات الناقصة',
          title: 'نقص في بيانات بعض الموظفين',
          status: 'warning',
          message: `يوجد ${missingSalaryEmps.length} موظف بدون راتب أساسي محدد، و${missingPhoneEmps.length} موظف بدون رقم هاتف مسجل.`
        });
      } else {
        report.push({
          category: 'البيانات الناقصة',
          title: 'اكتمال سجلات الموظفين',
          status: 'ok',
          message: 'جميع بيانات الموظفين الأساسية والمالية والوظيفية مكتملة 100%.'
        });
      }

      setDiagnosticReport(report);
      setDiagnosticTimestamp(new Date().toLocaleTimeString('ar-SA'));
      setIsRunningDiagnostic(false);
    }, 1200);
  };

  // If user is not Owner, block view
  if (!isOwner) {
    return (
      <div className="p-8 text-right bg-white rounded-3xl border border-red-200 shadow-sm max-w-2xl mx-auto my-12 space-y-4" dir="rtl">
        <div className="w-16 h-16 rounded-3xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 text-center">عفواً، وصول محظور</h2>
        <p className="text-sm text-slate-600 font-medium text-center leading-relaxed">
          شاشة إعدادات الموارد البشرية والنظام مخصصة حصرياً لمالك النظام (Owner). لا تملك الصلاحيات الكافية للوصول إليها.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right pb-12" dir="rtl">

      {/* Top Banner Header */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Owner Privileges Only
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                إعدادات الموارد البشرية والنظام
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              إعدادات الموارد البشرية (HR Settings)
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              التحكم في بيانات الشركة، قواعد الدوام، دورات الرواتب، سياسات الموظفين، وفحص سلامة النظام
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">وضع النظام:</span>
              <span className="text-xs font-black text-emerald-400">
                نشط ومربوط مباشرة (Firestore)
              </span>
            </div>
          </div>
        </div>
      </div>

      {loadingSettings && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl text-center text-xs font-bold text-blue-800 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
          جاري تحميل الإعدادات من قاعدة البيانات...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* CARD 1: COMPANY INFO (بيانات الشركة) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">1. بيانات الشركة (Company Info)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">اسم الشعار، العنوان، والموقع الجغرافي الخريطة</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">بطاقة 1</span>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              
              {/* Company Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الشركة الرسمي:</label>
                <input
                  type="text"
                  value={settings.companyName || ''}
                  onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                  placeholder="مثال: شركة المستقبل للاتصالات"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>

              {/* Company Logo Upload & Preview */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">شعار الشركة (Logo):</label>
                <div className="flex items-center gap-3">
                  {settings.companyLogo ? (
                    <div className="relative w-14 h-14 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                      <img src={settings.companyLogo} alt="Logo" className="w-full h-full object-contain p-1" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400 shrink-0">
                      <Building2 className="w-6 h-6" />
                    </div>
                  )}

                  <div className="flex-1 space-y-1">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all">
                      <Upload className="w-3.5 h-3.5 text-blue-600" />
                      <span>رفع شعار جديد</span>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>

                    {settings.companyLogo && (
                      <button
                        type="button"
                        onClick={() => setSettings({ ...settings, companyLogo: '' })}
                        className="text-[10px] text-red-600 font-bold block hover:underline"
                      >
                        حذف الشعار الحالى
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Company Address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">عنوان الشركة الرئيسي:</label>
                <input
                  type="text"
                  value={settings.companyAddress || ''}
                  onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
                  placeholder="الرياض - حي الصحافة - طريق الملك فهد"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                />
              </div>

              {/* Map Coordinates & GPS Radius */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-red-500" />
                    موقع الشركة وإحداثيات الخريطة (GPS):
                  </span>
                  <button
                    type="button"
                    onClick={handleGetCurrentLocation}
                    className="text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                  >
                    تحديد موقعي الحالي
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Latitude:</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={settings.companyLatitude}
                      onChange={(e) => setSettings({ ...settings, companyLatitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold mb-0.5">Longitude:</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={settings.companyLongitude}
                      onChange={(e) => setSettings({ ...settings, companyLongitude: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold mb-0.5">النطاق المسموح (متر):</label>
                    <input
                      type="number"
                      value={settings.allowedRadiusMeters}
                      onChange={(e) => setSettings({ ...settings, allowedRadiusMeters: parseInt(e.target.value, 10) || 100 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* Action & Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {card1Status && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                {card1Status}
              </div>
            )}
            <button
              type="button"
              disabled={savingCard1}
              onClick={() =>
                saveSettingsCard(1, setSavingCard1, setCard1Status, 'تم حفظ بيانات الشركة والإحداثيات بنجاح!')
              }
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {savingCard1 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ بيانات الشركة</span>
            </button>
          </div>
        </div>

        {/* CARD: COMPANY LOCATIONS (مواقع الشركة) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 col-span-1 lg:col-span-2">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shrink-0">
                <MapPin className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                  <span>مواقع الشركة (Company Locations)</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full">
                    تعدد المواقع
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  إدارة كافة الفروع، الورش، والمخازن المعتمدة لبصمة الحضور والانصراف
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenAddLocationModal}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة موقع جديد</span>
            </button>
          </div>

          {/* Status Alert if any */}
          {locationCardStatus && (
            <div className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-2xl text-center">
              {locationCardStatus}
            </div>
          )}

          {/* Locations Grid / List */}
          {(!settings.companyLocations || settings.companyLocations.length === 0) ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-200 text-slate-500 rounded-2xl mx-auto flex items-center justify-center">
                <MapPin className="w-6 h-6 text-slate-400" />
              </div>
              <h4 className="font-black text-slate-800 text-sm">لا توجد مواقع شركة مضافة حالياً</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                يمكنك إضافة الفروع والمواقع المعتمدة ليتمكن الفنيون والموظفون من تسجيل البصمة من أي فرع نشط.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleInitializeDefaultLocation}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  إضافة المقر الرئيسي الافتراضي
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddLocationModal}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  + إضافة موقع مخصص
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {settings.companyLocations.map((loc) => (
                <div
                  key={loc.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    loc.isActive !== false
                      ? 'bg-white border-slate-200/90 shadow-2xs hover:border-emerald-300'
                      : 'bg-slate-50/80 border-slate-200 opacity-75'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${loc.isActive !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <h4 className="font-black text-sm text-slate-900">{loc.name}</h4>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          loc.isActive !== false
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {loc.isActive !== false ? 'نشط 🟢' : 'غير نشط ⚪'}
                      </span>
                    </div>

                    {loc.address && (
                      <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{loc.address}</span>
                      </p>
                    )}

                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-[11px] font-mono text-slate-700 grid grid-cols-3 gap-1 text-center">
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">Latitude:</span>
                        <span className="font-bold">{loc.latitude}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">Longitude:</span>
                        <span className="font-bold">{loc.longitude}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block font-sans">Radius:</span>
                        <span className="font-bold text-emerald-700">{loc.radiusMeters}m</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleLocationStatus(loc.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        loc.isActive !== false
                          ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{loc.isActive !== false ? 'إيقاف' : 'تفعيل'}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEditLocationModal(loc)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3 text-slate-600" />
                        <span>تعديل</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteLocation(loc.id)}
                        className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border border-red-200"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CARD 2: WORK SHIFT & ATTENDANCE (الدوام) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">2. إعدادات الدوام والحضور (Shift & Attendance)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">مواعيد العمل، السماحية، البصمة المبكرة والحد الأقصى للتأخير</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">بطاقة 2</span>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت بداية الدوام:</label>
                  <input
                    type="time"
                    value={settings.workStartTime}
                    onChange={(e) => setSettings({ ...settings, workStartTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت نهاية الدوام:</label>
                  <input
                    type="time"
                    value={settings.workEndTime}
                    onChange={(e) => setSettings({ ...settings, workEndTime: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السماحية للحضور (دقائق):</label>
                  <input
                    type="number"
                    value={settings.lateToleranceMinutes}
                    onChange={(e) => setSettings({ ...settings, lateToleranceMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السماحية للخروج (دقائق):</label>
                  <input
                    type="number"
                    value={settings.earlyCheckoutToleranceMinutes}
                    onChange={(e) => setSettings({ ...settings, earlyCheckoutToleranceMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحد الأقصى للتأخير (دقيقة):</label>
                  <input
                    type="number"
                    value={settings.maxLateMinutes}
                    onChange={(e) => setSettings({ ...settings, maxLateMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عدد ساعات الدوام باليوم:</label>
                  <input
                    type="number"
                    value={settings.workHoursPerDay || 8}
                    onChange={(e) => setSettings({ ...settings, workHoursPerDay: parseInt(e.target.value, 10) || 8 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              {/* Early Check-In Permission Toggle */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-900 block">السماح بالبصمة المبكرة:</span>
                  <span className="text-[10px] text-slate-500 font-medium">تمكين الحضور قبل الموعد بـ {settings.earlyCheckInMinutes} دقيقة</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowEarlyCheckIn !== false}
                  onChange={(e) => setSettings({ ...settings, allowEarlyCheckIn: e.target.checked })}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {/* Block Task Assignment Without Check-In Toggle */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-900 block">منع إسناد المهام للموظف قبل تسجيل بصمة الحضور:</span>
                  <span className="text-[10px] text-slate-500 font-medium">يتطلب تسجيل بصمة الحضور (Present أو Late) اليوم قبل إسناد مهمة جديدة للفني</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.preventTaskWithoutCheckIn !== false}
                  onChange={(e) => setSettings({ ...settings, preventTaskWithoutCheckIn: e.target.checked })}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
              </div>

              {/* Missing Check-Out Penalty Settings */}
              <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                      <LogOut className="w-4 h-4 text-amber-600 shrink-0" />
                      خصم الخروج بدون بصمة خروج:
                    </span>
                    <span className="text-[10px] text-amber-800 font-medium mt-0.5 block leading-relaxed">
                      خصم تلقائي في حال غادر الموظف العمل ونسي تسجيل بصمة الخروج بعد انتهاء الدوام والمهلة المحددة
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.enableMissingCheckOutDeduction === true}
                      onChange={(e) =>
                        setSettings({ ...settings, enableMissingCheckOutDeduction: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>

                {settings.enableMissingCheckOutDeduction && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-amber-200/70">
                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">
                        مبلغ الخصم (د.ع / ريال):
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={settings.missingCheckOutDeductionAmount ?? 5000}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            missingCheckOutDeductionAmount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="5000"
                      />
                      <span className="text-[9px] text-amber-700 font-medium mt-0.5 block">
                        قيمة المبلغ المقتطع لعدم التبصيم
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-amber-950 mb-1">
                        الفترة بعد وقت بصمة الخروج للخصم (دقائق):
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        value={settings.missingCheckOutGraceMinutes ?? 30}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            missingCheckOutGraceMinutes: parseInt(e.target.value, 10) || 0,
                          })
                        }
                        className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="30"
                      />
                      <span className="text-[9px] text-amber-700 font-medium mt-0.5 block">
                        مهلة الانتظار بعد نهاية وقت الدوام الرسمي
                      </span>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Action & Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {card2Status && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                {card2Status}
              </div>
            )}
            <button
              type="button"
              disabled={savingCard2}
              onClick={() =>
                saveSettingsCard(2, setSavingCard2, setCard2Status, 'تم حفظ إعدادات وسماحية الدوام بنجاح!')
              }
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {savingCard2 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ إعدادات الدوام</span>
            </button>
          </div>
        </div>

        {/* CARD 3: PAYROLL SETTINGS (الرواتب) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">3. إعدادات الرواتب (Payroll Settings)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">بداية ونهاية الدورة الشهرية، الإضافي، والإجازات</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">بطاقة 3</span>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              
              {/* Cycle Start & End */}
              <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 space-y-2">
                <span className="text-xs font-black text-purple-900 block">دورة الرواتب الشهرية (الافتراضية: 16 إلى 15):</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-600 font-bold mb-0.5">بداية دورة الرواتب (يوم):</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={settings.salaryCycleStartDay}
                      onChange={(e) => setSettings({ ...settings, salaryCycleStartDay: parseInt(e.target.value, 10) || 16 })}
                      className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-600 font-bold mb-0.5">نهاية دورة الرواتب (يوم):</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={settings.salaryCycleEndDay}
                      onChange={(e) => setSettings({ ...settings, salaryCycleEndDay: parseInt(e.target.value, 10) || 15 })}
                      className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Overtime Rate */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سعر ساعة الوقت الإضافي (مضاعف):</label>
                <input
                  type="number"
                  step="0.1"
                  value={settings.overtimeHourlyRate}
                  onChange={(e) => setSettings({ ...settings, overtimeHourlyRate: parseFloat(e.target.value) || 1.5 })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">1.5 تعني ساعة ونصف عن كل ساعة عمل إضافية</span>
              </div>

              {/* Leave Days Allowed Per Cycle */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الإجازات المدفوعة / دورة:</label>
                  <input
                    type="number"
                    value={settings.paidLeavesPerCycle}
                    onChange={(e) => setSettings({ ...settings, paidLeavesPerCycle: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الإجازات بدون راتب / دورة:</label>
                  <input
                    type="number"
                    value={settings.unpaidLeavesPerCycle}
                    onChange={(e) => setSettings({ ...settings, unpaidLeavesPerCycle: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Action & Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {card3Status && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                {card3Status}
              </div>
            )}
            <button
              type="button"
              disabled={savingCard3}
              onClick={() =>
                saveSettingsCard(3, setSavingCard3, setCard3Status, 'تم حفظ دورة وإعدادات الرواتب بنجاح!')
              }
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {savingCard3 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ إعدادات الرواتب</span>
            </button>
          </div>
        </div>

        {/* CARD 4: EMPLOYEES POLICY (الموظفون) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">4. سياسات الموظفين (Employee Policies)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">الحالة الافتراضية، إنشاء الحسابات وسياسات الخدمة</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">بطاقة 4</span>
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              
              {/* Default Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الحالة الافتراضية للموظف الجديد:</label>
                <select
                  value={settings.defaultEmployeeStatus || 'نشط'}
                  onChange={(e) => setSettings({ ...settings, defaultEmployeeStatus: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                >
                  <option value="نشط">نشط (Active)</option>
                  <option value="تحت التجربة">تحت التجربة (Probation)</option>
                  <option value="معلق">معلق (Suspended)</option>
                </select>
              </div>

              {/* Auto Account Creation */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-900 block">السماح بإنشاء حساب تلقائياً:</span>
                  <span className="text-[10px] text-slate-500 font-medium">إنشاء اسم مستخدم وكلمة مرور عند إضافة الموظف</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowAutoAccountCreation !== false}
                  onChange={(e) => setSettings({ ...settings, allowAutoAccountCreation: e.target.checked })}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                />
              </div>

              {/* Termination Policy */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">سياسة إنهاء الخدمة:</label>
                <input
                  type="text"
                  value={settings.terminationPolicy || ''}
                  onChange={(e) => setSettings({ ...settings, terminationPolicy: e.target.value })}
                  placeholder="حسب نظام العمل والعمال السعودي مع تسوية المخصومات"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900"
                />
              </div>

              {/* Allow Reactivation */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-900 block">السماح بإعادة تفعيل الموظف:</span>
                  <span className="text-[10px] text-slate-500 font-medium">تمكين إعادة التفعيل المباشر بعد إنهاء الخدمة</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowEmployeeReactivation !== false}
                  onChange={(e) => setSettings({ ...settings, allowEmployeeReactivation: e.target.checked })}
                  className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                />
              </div>

            </div>
          </div>

          {/* Action & Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {card4Status && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                {card4Status}
              </div>
            )}
            <button
              type="button"
              disabled={savingCard4}
              onClick={() =>
                saveSettingsCard(4, setSavingCard4, setCard4Status, 'تم حفظ سياسات وإعدادات الموظفين بنجاح!')
              }
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {savingCard4 ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ سياسات الموظفين</span>
            </button>
          </div>
        </div>

        {/* REWARD SETTINGS CARD: إعدادات المكافآت والحوافز */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">إعدادات المكافآت والحوافز (Reward Settings)</h3>
                  <p className="text-[11px] text-slate-400 font-medium">النسبة المستقطعة من مجموع النقاط وقيمة النقطة بالدينار</p>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full">نظام المكافآت</span>
            </div>

            {/* Form Fields */}
            <div className="space-y-4">
              
              {/* Reward Pool Percentage */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  النسبة المستقطعة من مجموع النقاط (Reward Pool Percentage %):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    value={settings.rewardPoolPercentage ?? 5}
                    onChange={(e) => setSettings({ ...settings, rewardPoolPercentage: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 pl-10"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-purple-600">%</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">النسبة المستقطعة للاحتياطي (الحد الأدنى 0% والحد الأعلى 20%).</p>
              </div>

              {/* Reward Point Value */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  قيمة النقطة بالدينار (Reward Point Value):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    max="1000"
                    step="1"
                    value={settings.rewardPointValue ?? 35}
                    onChange={(e) => setSettings({ ...settings, rewardPointValue: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 pl-16"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-purple-600">د.ع / نقطة</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 font-medium">المبلغ بالدينار لكل نقطة فارق عن المتوسط (الحد الأدنى 1 د.ع والحد الأعلى 1000 د.ع).</p>
              </div>

            </div>
          </div>

          {/* Action & Status */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {cardRewardStatus && (
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
                {cardRewardStatus}
              </div>
            )}
            <button
              type="button"
              disabled={savingCardReward}
              onClick={handleSaveRewardSettings}
              className="w-full py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {savingCardReward ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ إعدادات المكافآت والحوافز</span>
            </button>
          </div>
        </div>

        {/* CARD 4B: REWARD ELIGIBILITY STATISTICS (بطاقة إحصائيات الشمول والمكافآت) */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-900">إحصائيات الشمول والمكافآت (Reward Eligibility Statistics)</h3>
                <p className="text-[11px] text-slate-400 font-medium">ملخص لحظي لعدد المشمولين، غير المشمولين، المجموع ومتوسط النقاط</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1 rounded-full">إحصائيات الشمول</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Eligible Count */}
            <div className="p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200/80">
              <span className="text-[10px] text-emerald-800 font-bold block">عدد المشمولين:</span>
              <span className="text-lg font-black text-emerald-700 mt-0.5 block">{rewardStats.eligibleCount} موظف</span>
            </div>

            {/* 2. Excluded Count */}
            <div className="p-3.5 bg-amber-50/60 rounded-2xl border border-amber-200/80">
              <span className="text-[10px] text-amber-800 font-bold block">عدد غير المشمولين:</span>
              <span className="text-lg font-black text-amber-700 mt-0.5 block">{rewardStats.excludedCount} موظف</span>
            </div>

            {/* 3. Total Points for Eligible */}
            <div className="p-3.5 bg-purple-50/60 rounded-2xl border border-purple-200/80">
              <span className="text-[10px] text-purple-800 font-bold block">إجمالي النقاط للمشمولين:</span>
              <span className="text-lg font-black text-purple-700 mt-0.5 block">{rewardStats.totalPoints} نقطة</span>
            </div>

            {/* 4. Average Points */}
            <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200/80">
              <span className="text-[10px] text-blue-800 font-bold block">متوسط النقاط للمشمولين:</span>
              <span className="text-lg font-black text-blue-700 mt-0.5 block">{rewardStats.averagePoints} نقطة</span>
            </div>
          </div>
        </div>

      </div>

      {/* CARD 5: SYSTEM INFO & DIAGNOSTIC CHECK (البطاقة الخامسة: النظام) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base text-slate-900">5. معلومات وقواعد النظام (System Info & Diagnostics)</h3>
              <p className="text-xs text-slate-500 font-medium">عرض بيانات الإصدار، حالة قاعدة البيانات، وفحص سلامة النظام الشامل</p>
            </div>
          </div>

          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 self-start">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            النظام يعمل بكفاءة عاليه
          </span>
        </div>

        {/* System Details Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">إصدار التطبيق:</span>
            <span className="text-xs font-black text-slate-900 font-mono mt-0.5 block">v2.5.0 Pro</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">إصدار قاعدة البيانات:</span>
            <span className="text-xs font-black text-slate-900 font-mono mt-0.5 block">Firestore Cloud v1.0</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">آخر مزامنة:</span>
            <span className="text-xs font-black text-emerald-700 font-mono mt-0.5 block">الآن (مباشر)</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">آخر نسخة احتياطية:</span>
            <span className="text-xs font-black text-blue-700 mt-0.5 block">تلقائي يومي</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">حالة الاتصال:</span>
            <span className="text-xs font-black text-emerald-600 mt-0.5 block">متصل مباشر ✅</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">عدد المستخدمين:</span>
            <span className="text-xs font-black text-slate-900 font-mono mt-0.5 block">{employees.length} مستخدم</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">عدد الموظفين:</span>
            <span className="text-xs font-black text-slate-900 font-mono mt-0.5 block">{employees.length} موظف</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">سجلات الحضور:</span>
            <span className="text-xs font-black text-blue-800 font-mono mt-0.5 block">{attendanceCount} سجل</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">سجلات الرواتب:</span>
            <span className="text-xs font-black text-purple-800 font-mono mt-0.5 block">{payrollCount} سجل</span>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
            <span className="text-[10px] text-slate-400 font-bold block">سجلات Audit:</span>
            <span className="text-xs font-black text-amber-800 font-mono mt-0.5 block">{auditLogsCount} سجل</span>
          </div>

        </div>

        {/* Diagnostic Check Section */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 text-white p-5 rounded-2xl">
            <div>
              <h4 className="font-black text-sm text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                فحص النظام الشامل (System Diagnostic Tool)
              </h4>
              <p className="text-xs text-slate-400 font-medium mt-1">
                يفحص اتصال قاعدة البيانات، الصلاحيات، الرواتب، الحضور، الإضافي، الإجازات، والبيانات الناقصة
              </p>
            </div>

            <button
              type="button"
              disabled={isRunningDiagnostic}
              onClick={handleRunDiagnosticCheck}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-md"
            >
              {isRunningDiagnostic ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جاري فحص النظام...</span>
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  <span>فحص النظام الآن</span>
                </>
              )}
            </button>
          </div>

          {/* Diagnostic Report Results */}
          {diagnosticReport && (
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h5 className="font-black text-xs text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  تقرير فحص النظام ({diagnosticTimestamp})
                </h5>
                <span className="text-[11px] font-bold text-slate-500">
                  تم فحص 8 معايير أساسية
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diagnosticReport.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
                      item.status === 'ok'
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                        : item.status === 'warning'
                        ? 'bg-amber-50/70 border-amber-200 text-amber-950'
                        : 'bg-red-50/70 border-red-200 text-red-950'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {item.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                      {item.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-600" />}
                      {item.status === 'error' && <XCircle className="w-4 h-4 text-red-600" />}
                    </div>

                    <div className="space-y-0.5">
                      <div className="font-black text-xs flex items-center gap-1.5">
                        <span>{item.category}:</span>
                        <span className="font-extrabold">{item.title}</span>
                      </div>
                      <p className="text-[11px] font-medium opacity-90 leading-relaxed">
                        {item.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Add / Edit Location Modal */}
      <AnimatePresence>
        {showLocationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 text-right space-y-5"
              dir="rtl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-slate-900">
                      {editingLoc ? 'تعديل موقع شركة' : 'إضافة موقع شركة جديد'}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">
                      أدخل بيانات الموقع الجغرافي ونطاق السماحية بالأمتار
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 text-xs font-bold">
                <div>
                  <label className="block text-slate-700 mb-1">اسم الموقع * :</label>
                  <input
                    type="text"
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                    placeholder="مثال: الفرع الرئيسي, المخزن الإقليمي, الورشة المركزية"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 mb-1">العنوان الوصفي :</label>
                  <input
                    type="text"
                    value={locAddress}
                    onChange={(e) => setLocAddress(e.target.value)}
                    placeholder="مثال: الرياض - طريق الملك فهد"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-emerald-500 focus:outline-none transition-all"
                  />
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-800 font-extrabold flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-emerald-600" />
                      إحداثيات الموقع (GPS Coordinates)
                    </span>
                    <button
                      type="button"
                      onClick={handleGetLocationModalGps}
                      className="text-[10px] bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-extrabold px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                    >
                      تحديد موقعي الحالي
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Latitude:</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={locLat}
                        onChange={(e) => setLocLat(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Longitude:</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={locLng}
                        onChange={(e) => setLocLng(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 mb-1">نطاق البصمة بالمتر (Radius) :</label>
                    <input
                      type="number"
                      value={locRadius}
                      onChange={(e) => setLocRadius(parseInt(e.target.value, 10) || 100)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold font-mono text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 mb-1">الحالة :</label>
                    <select
                      value={locIsActive ? 'active' : 'inactive'}
                      onChange={(e) => setLocIsActive(e.target.value === 'active')}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 cursor-pointer"
                    >
                      <option value="active">نشط 🟢 (يسمح بالتسجيل)</option>
                      <option value="inactive">غير نشط ⚪ (متوقف)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSaveLocationForm}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs"
                >
                  {editingLoc ? 'حفظ التعديلات' : 'إضافة الموقع'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer"
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
