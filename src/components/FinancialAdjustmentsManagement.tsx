import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  DollarSign,
  Plus,
  MinusCircle,
  PlusCircle,
  Search,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  FileText,
  User,
  Calendar,
  Tag,
  Download,
  CalendarRange,
  Layers,
  ArrowUpDown,
  Sparkles,
  TrendingDown,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { Employee, FinancialAdjustment, CompanySettings, PayrollPeriod } from '../types';
import {
  subscribeFinancialAdjustments,
  saveFinancialAdjustment,
  deleteFinancialAdjustment,
  subscribeCompanySettings,
  getCompanySettingsCachedSync,
  subscribePayrollPeriods,
  getPayrollPeriodsCachedSync
} from '../lib/dbService';
import {
  formatArabicDateOnly,
  getPayrollCycleRangeForDate,
  getPayrollCycleLabel,
  generateRecentPayrollCycles
} from '../utils';

interface FinancialAdjustmentsManagementProps {
  employees: Employee[];
  userRole?: string;
}

export default function FinancialAdjustmentsManagement({
  employees,
  userRole = 'owner'
}: FinancialAdjustmentsManagementProps) {
  const [records, setRecords] = useState<FinancialAdjustment[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => getCompanySettingsCachedSync());
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(() => getPayrollPeriodsCachedSync());

  // Search & Type Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deduction' | 'reward'>('all');

  // Cycle Filter: 'current' | 'all' | specific period ID (e.g. '2026-09')
  const [cycleFilter, setCycleFilter] = useState<string>('current');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'deduction' | 'reward'>('deduction');

  // Form State
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split('T')[0]);
  const [customCycleId, setCustomCycleId] = useState<string>('auto');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Subscriptions
  useEffect(() => {
    const unsubAdjustments = subscribeFinancialAdjustments(
      (data) => setRecords(data),
      (err) => console.error('Error subscribing financial adjustments:', err)
    );
    const unsubSettings = subscribeCompanySettings(
      (sets) => setCompanySettings(sets),
      (err) => console.error('Error subscribing company settings:', err)
    );
    const unsubPeriods = subscribePayrollPeriods(
      (periods) => setPayrollPeriods(periods),
      (err) => console.error('Error subscribing payroll periods:', err)
    );

    return () => {
      unsubAdjustments();
      unsubSettings();
      unsubPeriods();
    };
  }, []);

  // Effective Cycle Parameters from Settings
  const startDay = companySettings?.salaryCycleStartDay || 16;
  const endDay = companySettings?.salaryCycleEndDay || 15;

  // Recent cycles list for filtering and modal selection
  const availableCycles = useMemo(() => {
    return generateRecentPayrollCycles(12, startDay, endDay);
  }, [startDay, endDay]);

  // Current active cycle
  const currentActiveCycle = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return getPayrollCycleRangeForDate(todayStr, startDay, endDay);
  }, [startDay, endDay]);

  // Detected cycle for the form's adjDate
  const formDetectedCycle = useMemo(() => {
    if (customCycleId !== 'auto') {
      const found = availableCycles.find((c) => c.id === customCycleId);
      if (found) return found;
    }
    return getPayrollCycleRangeForDate(adjDate, startDay, endDay);
  }, [adjDate, customCycleId, startDay, endDay, availableCycles]);

  // Filtered active employees for selection (excluding terminated)
  const selectableEmployees = useMemo(() => {
    return employees.filter((e) => e.status !== 'terminated');
  }, [employees]);

  // Open Modal Handler
  const handleOpenModal = (type: 'deduction' | 'reward') => {
    setModalType(type);
    setSelectedEmpId('');
    setAmount('');
    setReason('');
    setAdjDate(new Date().toISOString().split('T')[0]);
    setCustomCycleId('auto');
    setNotes('');
    setFormError('');
    setShowModal(true);
  };

  // Helper to determine the cycle of any given record
  const getRecordCycleInfo = (rec: FinancialAdjustment) => {
    if (rec.periodStartDate && rec.periodEndDate) {
      return {
        id: rec.cycleId || `${rec.periodEndDate.substring(0, 7)}`,
        startDate: rec.periodStartDate,
        endDate: rec.periodEndDate,
        label: getPayrollCycleLabel(rec.periodStartDate, rec.periodEndDate)
      };
    }
    // Fallback based on record.date
    return getPayrollCycleRangeForDate(rec.date, startDay, endDay);
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!selectedEmpId) {
      setFormError('يرجى تحديد الموظف.');
      return;
    }

    const matchedEmp = employees.find((emp) => emp.id === selectedEmpId);
    if (!matchedEmp) {
      setFormError('الموظف المحدد غير موجود.');
      return;
    }

    if (matchedEmp.status === 'suspended') {
      setFormError('تنبيه: هذا الموظف موقوف عن العمل حالياً.');
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('يرجى إدخال مبلغ مالي صحيح أكبر من الصفر.');
      return;
    }

    if (!reason.trim()) {
      setFormError('يرجى كتابة سبب التعديل المالي (إجباري).');
      return;
    }

    setIsSubmitting(true);
    try {
      const targetCycle = formDetectedCycle;

      const newRecord: FinancialAdjustment = {
        id: `fin_adj_${Date.now()}`,
        employeeId: matchedEmp.id,
        employeeName: matchedEmp.name,
        type: modalType,
        amount: numAmount,
        reason: reason.trim(),
        date: adjDate,
        cycleId: targetCycle.id,
        periodStartDate: targetCycle.startDate,
        periodEndDate: targetCycle.endDate,
        notes: notes.trim() || undefined,
        createdBy: userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'إدارة الموارد البشرية',
        createdAt: new Date().toISOString()
      };

      // 1. Save to Firestore
      await saveFinancialAdjustment(newRecord);

      setSuccessMsg(
        modalType === 'deduction'
          ? `تم إضافة الخصم المالي بمبلغ (${numAmount.toLocaleString()} د.ع) للموظف ${matchedEmp.name} وربطه بـ (${targetCycle.label}) بنجاح.`
          : `تم إضافة المكافأة المالية بمبلغ (${numAmount.toLocaleString()} د.ع) للموظف ${matchedEmp.name} وربطها بـ (${targetCycle.label}) بنجاح.`
      );

      setShowModal(false);
    } catch (err: any) {
      console.error('Error saving financial adjustment:', err);
      setFormError('حدث خطأ أثناء حفظ التعديل المالي. يرجى إعادة المحاولة.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handler
  const handleDelete = async (id: string) => {
    try {
      await deleteFinancialAdjustment(id);
      setDeletingId(null);
    } catch (err) {
      console.error('Error deleting financial adjustment:', err);
      alert('حدث خطأ أثناء حذف التعديل المالي.');
    }
  };

  // Filtered List
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Type filter
      const matchesType = typeFilter === 'all' || r.type === typeFilter;

      // 2. Search filter
      const matchesSearch =
        r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      // 3. Cycle filter
      let matchesCycle = true;
      const recCycle = getRecordCycleInfo(r);

      if (cycleFilter === 'current') {
        matchesCycle = recCycle.startDate === currentActiveCycle.startDate && recCycle.endDate === currentActiveCycle.endDate;
      } else if (cycleFilter !== 'all') {
        matchesCycle = recCycle.id === cycleFilter || (r.date >= (availableCycles.find(c => c.id === cycleFilter)?.startDate || '') && r.date <= (availableCycles.find(c => c.id === cycleFilter)?.endDate || ''));
      }

      return matchesType && matchesSearch && matchesCycle;
    });
  }, [records, typeFilter, searchTerm, cycleFilter, currentActiveCycle, availableCycles, startDay, endDay]);

  // Statistics for Current Filter
  const stats = useMemo(() => {
    const deductions = filteredRecords.filter((r) => r.type === 'deduction').reduce((sum, r) => sum + r.amount, 0);
    const rewards = filteredRecords.filter((r) => r.type === 'reward').reduce((sum, r) => sum + r.amount, 0);
    const netImpact = rewards - deductions;
    return {
      count: filteredRecords.length,
      deductions,
      rewards,
      netImpact
    };
  }, [filteredRecords]);

  // All-time totals
  const allTimeStats = useMemo(() => {
    const deductions = records.filter((r) => r.type === 'deduction').reduce((sum, r) => sum + r.amount, 0);
    const rewards = records.filter((r) => r.type === 'reward').reduce((sum, r) => sum + r.amount, 0);
    return {
      count: records.length,
      deductions,
      rewards
    };
  }, [records]);

  // Excel Export Handler
  const exportToExcel = () => {
    if (filteredRecords.length === 0) return;

    const activeCycleLabel = cycleFilter === 'current'
      ? currentActiveCycle.label
      : cycleFilter === 'all'
      ? 'جميع السجلات والدورات'
      : (availableCycles.find(c => c.id === cycleFilter)?.label || cycleFilter);

    const rows = filteredRecords.map((rec, index) => {
      const cycleInfo = getRecordCycleInfo(rec);
      return {
        'ت': index + 1,
        'تاريخ الاستحقاق': rec.date,
        'دورة الراتب المرتبطة': cycleInfo.label,
        'اسم الموظف': rec.employeeName,
        'نوع التعديل': rec.type === 'deduction' ? 'خصم مالي' : 'مكافأة / بدل مالي',
        'المبلغ (د.ع)': rec.amount,
        'السبب المباشر': rec.reason,
        'ملاحظات إضافية': rec.notes || '-',
        'سجل بواسطة': rec.createdBy || 'الإدارة',
        'تاريخ الإنشاء': formatArabicDateOnly(rec.createdAt)
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 15 },
      { wch: 32 },
      { wch: 24 },
      { wch: 18 },
      { wch: 16 },
      { wch: 30 },
      { wch: 30 },
      { wch: 20 },
      { wch: 25 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل التعديلات المالية');
    XLSX.writeFile(wb, `كشف_التعديلات_والخصومات_المالية_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center font-bold shadow-xs">
              <DollarSign className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-slate-900">سجل التعديلات والخصومات والبدلات المالية</h3>
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-blue-600" />
                  مربوط بدورات الرواتب
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                ربط كل خصم ومكافأة بدورة الراتب المستحقة مع الاحتفاظ بأرشيف وسجلات منفصلة لكل دورة شهرية وسجل Audit
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={exportToExcel}
              disabled={filteredRecords.length === 0}
              className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold text-xs px-3.5 py-2.5 rounded-2xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200"
              title="تصدير السجلات الحالية إلى ملف Excel"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>تصدير Excel</span>
            </button>

            <button
              onClick={() => handleOpenModal('deduction')}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <MinusCircle className="w-4 h-4" />
              <span>+ إضافة خصم مالي</span>
            </button>

            <button
              onClick={() => handleOpenModal('reward')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ إضافة مكافأة / بدل</span>
            </button>
          </div>
        </div>

        {/* Cycle Filter Selection Bar */}
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-800 font-black text-xs">
              <CalendarRange className="w-4 h-4 text-blue-600" />
              <span>تصفية السجلات حسب دورة الرواتب:</span>
            </div>
            <div className="text-[11px] text-slate-500 font-bold">
              إعداد دورة الراتب: من يوم <span className="font-mono text-slate-800 font-black">{startDay}</span> إلى يوم <span className="font-mono text-slate-800 font-black">{endDay}</span> من كل شهر
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Current Active Cycle Button */}
            <button
              onClick={() => setCycleFilter('current')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                cycleFilter === 'current'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>الدورة الحالية ({currentActiveCycle.label})</span>
            </button>

            {/* All Cycles Button */}
            <button
              onClick={() => setCycleFilter('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                cycleFilter === 'all'
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>جميع الدورات والسجلات ({allTimeStats.count})</span>
            </button>

            {/* Specific Past Cycles Dropdown */}
            <div className="relative inline-flex items-center">
              <select
                value={cycleFilter !== 'current' && cycleFilter !== 'all' ? cycleFilter : ''}
                onChange={(e) => {
                  if (e.target.value) setCycleFilter(e.target.value);
                }}
                className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  cycleFilter !== 'current' && cycleFilter !== 'all'
                    ? 'bg-purple-50 text-purple-900 border-purple-300'
                    : 'bg-white text-slate-700 border-slate-200'
                }`}
              >
                <option value="">-- اختيار دورة شهرية سابقة --</option>
                {availableCycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {cycleFilter !== 'current' && (
              <button
                onClick={() => setCycleFilter('current')}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold px-2 py-1 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>العودة للدورة الحالية</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Stats Grid for Selected Cycle View */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-red-50/60 border border-red-100 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-red-700 block mb-0.5">
                {cycleFilter === 'all' ? 'إجمالي الخصومات (الكل)' : 'خصومات الدورة المحددة'}
              </span>
              <span className="text-lg font-black text-red-700 font-mono">
                {stats.deductions.toLocaleString()} <span className="text-xs">د.ع</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
              <MinusCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 block mb-0.5">
                {cycleFilter === 'all' ? 'إجمالي المكافآت (الكل)' : 'مكافآت الدورة المحددة'}
              </span>
              <span className="text-lg font-black text-emerald-700 font-mono">
                {stats.rewards.toLocaleString()} <span className="text-xs">د.ع</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
              <PlusCircle className="w-5 h-5" />
            </div>
          </div>

          <div className={`p-4 rounded-2xl border flex items-center justify-between ${
            stats.netImpact >= 0
              ? 'bg-blue-50/60 border-blue-100 text-blue-900'
              : 'bg-rose-50/60 border-rose-100 text-rose-900'
          }`}>
            <div>
              <span className="text-[11px] font-bold block mb-0.5 text-slate-600">
                صافي أثر التعديلات (مكافآت - خصومات)
              </span>
              <span className="text-lg font-black font-mono">
                {stats.netImpact >= 0 ? '+' : ''}{stats.netImpact.toLocaleString()} <span className="text-xs">د.ع</span>
              </span>
            </div>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
              stats.netImpact >= 0 ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
            }`}>
              {stats.netImpact >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-600 block mb-0.5">
                عدد السجلات في العرض
              </span>
              <span className="text-lg font-black text-slate-800 font-mono">
                {stats.count} <span className="text-xs">سجل</span>
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Search & Type Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="البحث باسم الموظف أو السبب أو الملاحظات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              الكل ({filteredRecords.length})
            </button>
            <button
              onClick={() => setTypeFilter('deduction')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'deduction' ? 'bg-red-600 text-white shadow-2xs' : 'text-slate-600 hover:text-red-600'
              }`}
            >
              الخصومات ({filteredRecords.filter((r) => r.type === 'deduction').length})
            </button>
            <button
              onClick={() => setTypeFilter('reward')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                typeFilter === 'reward' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-emerald-600'
              }`}
            >
              المكافآت ({filteredRecords.filter((r) => r.type === 'reward').length})
            </button>
          </div>
        </div>

        {/* Table of Records */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="p-3.5 font-black">التاريخ</th>
                <th className="p-3.5 font-black">دورة الراتب</th>
                <th className="p-3.5 font-black">الموظف</th>
                <th className="p-3.5 font-black">نوع التعديل</th>
                <th className="p-3.5 font-black">المبلغ</th>
                <th className="p-3.5 font-black">السبب المباشر</th>
                <th className="p-3.5 font-black">ملاحظات</th>
                <th className="p-3.5 font-black">بواسطة</th>
                <th className="p-3.5 font-black text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 font-bold">
                    لا توجد تعديلات مالية مسجلة مطابقة لمعايير البحث في هذه الدورة.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((rec) => {
                  const cycleInfo = getRecordCycleInfo(rec);
                  const isCurrentCycle = cycleInfo.startDate === currentActiveCycle.startDate && cycleInfo.endDate === currentActiveCycle.endDate;

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono text-slate-600 whitespace-nowrap">{rec.date}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1 border ${
                          isCurrentCycle
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          <CalendarRange className="w-3 h-3" />
                          <span>{cycleInfo.label}</span>
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-900 whitespace-nowrap">{rec.employeeName}</td>
                      <td className="p-3.5 whitespace-nowrap">
                        {rec.type === 'deduction' ? (
                          <span className="bg-red-50 text-red-700 border border-red-200 text-[11px] font-extrabold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <MinusCircle className="w-3 h-3 text-red-600" />
                            خصم مالي
                          </span>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-extrabold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <PlusCircle className="w-3 h-3 text-emerald-600" />
                            مكافأة / بدل
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 font-black font-mono whitespace-nowrap">
                        <span className={rec.type === 'deduction' ? 'text-red-600' : 'text-emerald-600'}>
                          {rec.type === 'deduction' ? '-' : '+'}{rec.amount.toLocaleString()} د.ع
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-slate-800 max-w-xs truncate">{rec.reason}</td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate">{rec.notes || '-'}</td>
                      <td className="p-3.5 text-slate-600 text-[11px] font-bold whitespace-nowrap">{rec.createdBy || 'الإدارة'}</td>
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          onClick={() => setDeletingId(rec.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="حذف التعديل المالي"
                        >
                          <Trash2 className="w-4 h-4" />
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

      {/* MODAL: ADD DEDUCTION OR REWARD */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  modalType === 'deduction' ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                }`}>
                  {modalType === 'deduction' ? <MinusCircle className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">
                    {modalType === 'deduction' ? 'إضافة خصم مالي للموظف' : 'إضافة مكافأة / بدلات مالية للموظف'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {modalType === 'deduction'
                      ? 'خصم مباشر يرتبط بمسير رواتب الدورة المحددة ويؤثر في صافي الراتب'
                      : 'مكافأة أو بدل مالي يرتبط بمسير رواتب الدورة المحددة ويضاف إلى صافي الراتب'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-100 text-red-700 p-3 rounded-2xl text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Employee Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>اختر الموظف *</span>
                </label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full text-xs font-bold px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-slate-800 cursor-pointer"
                  required
                >
                  <option value="">-- اختر الموظف --</option>
                  {selectableEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.role || 'موظف'}) {e.status === 'suspended' ? '⚠️ [موقوف]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                  <span>المبلغ المالي (بالدينار العراقي IQD) *</span>
                </label>
                <input
                  type="number"
                  placeholder="مثال: 10000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="1"
                  step="any"
                  className="w-full text-xs font-mono font-bold px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>تاريخ الاستحقاق والتسجيل *</span>
                </label>
                <input
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full text-xs font-mono font-bold px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              {/* Automatic Cycle Link & Indicator */}
              <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-blue-900">
                    <CalendarRange className="w-4 h-4 text-blue-600" />
                    <span>دورة الرواتب المرتبطة:</span>
                  </div>
                  <span className="font-extrabold text-blue-800 bg-blue-100/80 px-2.5 py-0.5 rounded-full text-[11px]">
                    {formDetectedCycle.label}
                  </span>
                </div>
                <div className="text-[11px] text-blue-700 font-medium flex items-center justify-between">
                  <span>من: {formDetectedCycle.startDate} إلى {formDetectedCycle.endDate}</span>
                  <span className="text-[10px] text-blue-600">تطبيق تلقائي في مسير هذه الدورة</span>
                </div>

                {/* Optional Override Cycle */}
                <div className="pt-1.5 border-t border-blue-200/60 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 font-bold">تحديد دورة مخصصة:</span>
                  <select
                    value={customCycleId}
                    onChange={(e) => setCustomCycleId(e.target.value)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-white border border-blue-300 text-slate-800 focus:outline-none"
                  >
                    <option value="auto">تلقائي حسب تاريخ السجل ({formDetectedCycle.startDate.substring(5)})</option>
                    {availableCycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reason (Mandatory) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-purple-600" />
                  <span>سبب التعديل المالي (إجباري) *</span>
                </label>
                <input
                  type="text"
                  placeholder={modalType === 'deduction' ? 'مثال: خصم إتلاف معدات، تأخير متكرر، مخالفة تعليمات...' : 'مثال: مكافأة تميز عمل، إنجاز مهمة معقدة، بدل طوارئ...'}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs font-bold px-3.5 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات تفصيلية إضافية (اختياري)</label>
                <textarea
                  rows={2}
                  placeholder="أي تفاصيل أو ملاحظات إضافية ترغب في توثيقها..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs font-medium px-3.5 py-2.5 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs text-white transition-all shadow-md cursor-pointer flex items-center gap-2 ${
                    modalType === 'deduction' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {isSubmitting ? 'جاري الحفظ...' : modalType === 'deduction' ? 'حفظ وربط الخصم المالي' : 'حفظ وربط المكافأة المالية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingId && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="font-black text-base text-slate-900">تأكيد حذف التعديل المالي</h3>
            <p className="text-xs text-slate-500 font-medium">
              هل أنت متأكد من رغبتك في حذف هذا السجل المالي؟ سيتم إلغاء تأثيره من مسير رواتب الدورة المرتبطة وتوثيق عملية الحذف.
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                تراجع
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
