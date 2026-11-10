import React, { useState, useEffect, useMemo } from 'react';
import {
  Award,
  TrendingUp,
  TrendingDown,
  UserCheck,
  UserX,
  Search,
  Eye,
  Edit2,
  DollarSign,
  Clock,
  Info,
  X,
  CheckCircle2,
  AlertCircle,
  Plus,
  Zap,
  Filter,
  Users,
  Building2,
  ShieldAlert,
  Calendar
} from 'lucide-react';
import {
  Employee,
  Task,
  ManualPointsRecord,
  CompanySettings,
  FinancialAdjustment
} from '../types';
import {
  subscribeCompanySettings,
  getFinancialAdjustments,
  getFinancialAdjustmentsCachedSync,
  saveEmployee,
  createAuditLog
} from '../lib/dbService';
import { calculateRewards } from '../lib/rewardService';
import { createAuditEntry } from '../lib/auditService';
import { formatArabicDateOnly } from '../utils';

interface RewardsAndDeductionsCenterProps {
  employees: Employee[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  userRole?: string;
}

export default function RewardsAndDeductionsCenter({
  employees,
  tasks,
  manualPoints = [],
  userRole = 'owner'
}: RewardsAndDeductionsCenterProps) {
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [financialAdjustments, setFinancialAdjustments] = useState<FinancialAdjustment[]>(() => getFinancialAdjustmentsCachedSync());

  // Filtering & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<'all' | 'eligible' | 'excluded'>('all');

  // Modal State for Full Details
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Modal State for Eligibility Edit
  const [editingEligibilityEmp, setEditingEligibilityEmp] = useState<Employee | null>(null);
  const [editStatus, setEditStatus] = useState<'eligible' | 'excluded'>('eligible');
  const [editReason, setEditReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    getFinancialAdjustments().then(adjs => {
      setFinancialAdjustments(adjs);
    }).catch(err => console.warn('Rewards center financial adjustments load notice:', err));

    const unsubSettings = subscribeCompanySettings((s) => setCompanySettings(s), () => {});

    return () => {
      unsubSettings();
    };
  }, []);

  const currentPeriod = useMemo(() => {
    const now = new Date();
    let startM = now.getMonth();
    let startY = now.getFullYear();
    if (now.getDate() < 16) {
      startM = startM - 1;
      if (startM < 0) {
        startM = 11;
        startY -= 1;
      }
    }
    const endM = startM === 11 ? 0 : startM + 1;
    const endY = startM === 11 ? startY + 1 : startY;

    return {
      startDate: `${startY}-${String(startM + 1).padStart(2, '0')}-16`,
      endDate: `${endY}-${String(endM + 1).padStart(2, '0')}-15`,
    };
  }, []);

  // Compute Rewards Summary using rewardService
  const rewardsSummary = useMemo(() => {
    return calculateRewards({
      employees,
      tasks,
      manualPoints,
      rewardPoolPercentage: companySettings?.rewardPoolPercentage ?? 5,
      rewardPointValue: companySettings?.rewardPointValue ?? 35,
      startDate: currentPeriod.startDate,
      endDate: currentPeriod.endDate,
    });
  }, [employees, tasks, manualPoints, companySettings, currentPeriod]);

  // Combined calculations for each employee
  const employeeDataList = useMemo(() => {
    return employees.map((emp) => {
      const res = rewardsSummary.employeeResults[emp.id];
      const isEligible = res ? res.isEligible : (emp.rewardStatus !== 'excluded' && !emp.excluded);

      const totalPoints = res ? res.totalPoints : 0;
      const averagePoints = res ? res.averagePoints : rewardsSummary.averagePoints;
      const difference = res ? res.difference : 0;
      const pointValue = res ? res.rewardPointValue : (companySettings?.rewardPointValue ?? 35);
      const rawRewardAmount = res ? res.rewardAmount : 0;

      const rewardValue = rawRewardAmount > 0 ? rawRewardAmount : 0;
      const penaltyValue = rawRewardAmount < 0 ? Math.abs(rawRewardAmount) : 0;

      // Filter Manual Financial Adjustments for this employee scoped to current payroll period
      const empAdjustments = financialAdjustments.filter((f) => {
        if (f.employeeId !== emp.id) return false;
        if (currentPeriod?.startDate && currentPeriod?.endDate && f.date) {
          return f.date >= currentPeriod.startDate && f.date <= currentPeriod.endDate;
        }
        return true;
      });
      const manualDeductionsList = empAdjustments.filter((f) => f.type === 'deduction');
      const manualRewardsList = empAdjustments.filter((f) => f.type === 'reward');

      const totalManualDeductions = manualDeductionsList.reduce((sum, f) => sum + (f.amount || 0), 0);
      const totalManualRewards = manualRewardsList.reduce((sum, f) => sum + (f.amount || 0), 0);

      // Net Reward Calculation
      const netReward = rawRewardAmount + totalManualRewards - totalManualDeductions;

      return {
        employee: emp,
        isEligible,
        totalPoints,
        averagePoints,
        difference,
        pointValue,
        rawRewardAmount,
        rewardValue,
        penaltyValue,
        manualDeductionsList,
        manualRewardsList,
        totalManualDeductions,
        totalManualRewards,
        netReward,
        exclusionReason: emp.rewardExclusionReason || '',
        lastUpdated: new Date().toISOString()
      };
    });
  }, [employees, rewardsSummary, companySettings, financialAdjustments]);

  // Filtered List
  const filteredData = useMemo(() => {
    return employeeDataList.filter((item) => {
      const matchesSearch =
        item.employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.employee.role && item.employee.role.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesEligibility =
        eligibilityFilter === 'all' ||
        (eligibilityFilter === 'eligible' && item.isEligible) ||
        (eligibilityFilter === 'excluded' && !item.isEligible);

      return matchesSearch && matchesEligibility;
    });
  }, [employeeDataList, searchTerm, eligibilityFilter]);

  // Overall Metrics
  const totalSystemPoints = useMemo(() => employeeDataList.reduce((acc, curr) => acc + curr.totalPoints, 0), [employeeDataList]);
  const eligibleCount = useMemo(() => employeeDataList.filter((item) => item.isEligible).length, [employeeDataList]);
  const totalRewardsEst = useMemo(() => employeeDataList.reduce((acc, curr) => acc + (curr.netReward > 0 ? curr.netReward : 0), 0), [employeeDataList]);
  const totalDeductionsEst = useMemo(() => employeeDataList.reduce((acc, curr) => acc + (curr.netReward < 0 ? Math.abs(curr.netReward) : 0), 0), [employeeDataList]);

  // Handler to open edit eligibility modal
  const handleOpenEditEligibility = (emp: Employee) => {
    setEditingEligibilityEmp(emp);
    const isEx = emp.rewardStatus === 'excluded' || emp.excluded === true;
    setEditStatus(isEx ? 'excluded' : 'eligible');
    setEditReason(emp.rewardExclusionReason || '');
    setSaveError('');
  };

  // Handler to save eligibility
  const handleSaveEligibility = async () => {
    if (!editingEligibilityEmp) return;
    setIsSaving(true);
    setSaveError('');
    try {
      const updatedEmp: Employee = {
        ...editingEligibilityEmp,
        rewardStatus: editStatus,
        eligible: editStatus === 'eligible',
        excluded: editStatus === 'excluded',
        rewardExclusionReason: editStatus === 'excluded' ? editReason : ''
      };

      await saveEmployee(updatedEmp);

      const auditEntry = createAuditEntry({
        userId: 'admin_hr',
        userName: 'إدارة الموارد البشرية',
        userRole: userRole as any,
        action: 'تغيير شمولية المكافآت',
        targetEntity: 'Employee',
        targetId: editingEligibilityEmp.id,
        reason: editReason || 'تعديل حالة الشمول بنظام المكافآت والخصومات',
        dataBefore: { rewardStatus: editingEligibilityEmp.rewardStatus },
        dataAfter: { rewardStatus: editStatus, rewardExclusionReason: editReason }
      });
      await createAuditLog(auditEntry);

      setEditingEligibilityEmp(null);
    } catch (err: any) {
      console.error(err);
      setSaveError(err.message || 'حدث خطأ أثناء حفظ حالة الشمول');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedData = useMemo(() => {
    if (!selectedEmployee) return null;
    return employeeDataList.find((item) => item.employee.id === selectedEmployee.id) || null;
  }, [selectedEmployee, employeeDataList]);

  return (
    <div className="space-y-6 dir-rtl">
      {/* Top Header & KPI Summary */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 text-white flex items-center justify-center shadow-md">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-black text-slate-900 text-base">مركز المكافآت والخصومات المالية</h2>
              <p className="text-xs text-slate-500 font-medium">
                متابعة نقاط الكادر الفني، المتوسط العام، استحقاقات المكافآت والخصومات والتسويات المالية
              </p>
            </div>
          </div>
        </div>

        {/* System KPIs Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
              <span>إجمالي النقاط المجمعة</span>
            </div>
            <p className="text-xl font-black text-slate-900 font-mono">{totalSystemPoints.toLocaleString()} نقطة</p>
            <span className="text-[10px] text-slate-400 font-bold block mt-1">عبر جميع المهام المكتملة والنقاط اليدوية</span>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
              <Users className="w-4 h-4 text-blue-500" />
              <span>الموظفون المشمولون</span>
            </div>
            <p className="text-xl font-black text-slate-900 font-mono">{eligibleCount} / {employees.length}</p>
            <span className="text-[10px] text-slate-400 font-bold block mt-1">متوسط النقاط: {rewardsSummary.averagePoints} نقطة</span>
          </div>

          <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl">
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold mb-1">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>إجمالي المكافآت التقديرية</span>
            </div>
            <p className="text-xl font-black text-emerald-700 font-mono">{totalRewardsEst.toLocaleString()} د.ع</p>
            <span className="text-[10px] text-emerald-600 font-bold block mt-1">المستحقين للمكافأة الحالية</span>
          </div>

          <div className="p-4 bg-rose-50/60 border border-rose-200/80 rounded-2xl">
            <div className="flex items-center gap-2 text-rose-800 text-xs font-bold mb-1">
              <TrendingDown className="w-4 h-4 text-rose-600" />
              <span>إجمالي الخصومات والتعديلات</span>
            </div>
            <p className="text-xl font-black text-rose-700 font-mono">{totalDeductionsEst.toLocaleString()} د.ع</p>
            <span className="text-[10px] text-rose-600 font-bold block mt-1">الفوارق السالبة + الخصومات اليدوية</span>
          </div>
        </div>

        {/* Search & Filters Controls */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="البحث باسم الموظف أو المسمى الوظيفي..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all"
            />
          </div>

          <select
            value={eligibilityFilter}
            onChange={(e) => setEligibilityFilter(e.target.value as any)}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
          >
            <option value="all">جميع حالات الشمول</option>
            <option value="eligible">المشمولين بالمكافآت فقط</option>
            <option value="excluded">المستبعدين فقط</option>
          </select>
        </div>

        {/* Main Rewards Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-black">
                <th className="p-3.5">الاسم والوظيفة</th>
                <th className="p-3.5 text-center">عدد النقاط الحالي</th>
                <th className="p-3.5 text-center">حالة الشمول</th>
                <th className="p-3.5">قيمة المكافأة الحالية</th>
                <th className="p-3.5">قيمة الخصم الحالي</th>
                <th className="p-3.5">صافي الاستحقاق</th>
                <th className="p-3.5">آخر تحديث</th>
                <th className="p-3.5 text-center">التفاصيل والإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-400 font-bold">
                    لا يوجد موظفون ينطبق عليهم معيار البحث المحدد.
                  </td>
                </tr>
              ) : (
                filteredData.map((data) => {
                  const {
                    employee: emp,
                    isEligible,
                    totalPoints,
                    rewardValue,
                    penaltyValue,
                    netReward,
                    exclusionReason
                  } = data;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 font-black flex items-center justify-center shrink-0 border border-purple-100">
                            {emp.name.slice(0, 1)}
                          </div>
                          <div>
                            <span className="font-black text-slate-900 block">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 block">{emp.role || 'فني'}</span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5 text-center">
                        <span className="font-mono font-black text-purple-800 bg-purple-50 border border-purple-100 px-3 py-1 rounded-xl inline-block">
                          {totalPoints} نقطة
                        </span>
                      </td>

                      <td className="p-3.5 text-center">
                        {isEligible ? (
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            مشمول
                          </span>
                        ) : (
                          <span className="bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1" title={exclusionReason}>
                            <UserX className="w-3.5 h-3.5 text-amber-600" />
                            غير مشمول
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-bold font-mono text-emerald-700">
                        {rewardValue > 0 ? `+${rewardValue.toLocaleString()} د.ع` : '0 د.ع'}
                      </td>

                      <td className="p-3.5 font-bold font-mono text-rose-700">
                        {penaltyValue > 0 ? `-${penaltyValue.toLocaleString()} د.ع` : '0 د.ع'}
                      </td>

                      <td className="p-3.5">
                        <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-xl border ${
                          netReward > 0
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : netReward < 0
                            ? 'bg-rose-50 text-rose-800 border-rose-200'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}>
                          {netReward > 0 ? `+${netReward.toLocaleString()}` : `${netReward.toLocaleString()}`} د.ع
                        </span>
                      </td>

                      <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                        {formatArabicDateOnly(new Date().toISOString())}
                      </td>

                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedEmployee(emp)}
                            className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-blue-200/80"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>عرض التفاصيل</span>
                          </button>

                          {userRole === 'owner' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditEligibility(emp)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-slate-200"
                              title="تعديل الشمولية"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>الشمول</span>
                            </button>
                          )}
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

      {/* FULL DETAILS MODAL */}
      {selectedEmployee && selectedData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 dir-rtl">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/30 text-amber-300 flex items-center justify-center font-black">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-white">
                    تفاصيل حساب المكافآت والخصومات للموظف: {selectedEmployee.name}
                  </h3>
                  <p className="text-xs text-slate-300 font-medium">
                    الوظيفة: {selectedEmployee.role || 'فني'} | الهاتف: {selectedEmployee.phone || 'غير مسجل'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              
              {/* Inclusion status banner */}
              {!selectedData.isEligible ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 font-bold space-y-1">
                  <div className="flex items-center gap-2 text-amber-800 text-sm font-black">
                    <UserX className="w-4 h-4 text-amber-600" />
                    <span>الموظف غير مشمول بنظام المكافآت والحوافز</span>
                  </div>
                  {selectedData.exclusionReason ? (
                    <p className="text-xs text-amber-800">سبب الاستبعاد: <strong className="text-slate-900">{selectedData.exclusionReason}</strong></p>
                  ) : (
                    <p className="text-xs text-amber-700">لم يحدد سبب الاستبعاد في النظام.</p>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 font-bold flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>الموظف مشمول بنظام المكافآت والحوافز ويتم احتساب نقاطه تلقائياً.</span>
                </div>
              )}

              {/* Core Breakdown Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-slate-500 font-bold block text-[11px]">مجموع النقاط:</span>
                  <span className="text-base font-black text-purple-700 block mt-0.5 font-mono">{selectedData.totalPoints} نقطة</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-slate-500 font-bold block text-[11px]">متوسط نقاط الفنيين:</span>
                  <span className="text-base font-black text-slate-800 block mt-0.5 font-mono">{selectedData.averagePoints} نقطة</span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-slate-500 font-bold block text-[11px]">الفرق عن المتوسط:</span>
                  <span className={`text-base font-black block mt-0.5 font-mono ${selectedData.difference > 0 ? 'text-emerald-600' : selectedData.difference < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {selectedData.difference > 0 ? `+${selectedData.difference}` : selectedData.difference} نقطة
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl">
                  <span className="text-slate-500 font-bold block text-[11px]">قيمة النقطة:</span>
                  <span className="text-base font-black text-slate-800 block mt-0.5 font-mono">{selectedData.pointValue} د.ع</span>
                </div>
              </div>

              {/* Monetary Calculation Summary */}
              <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-300">قيمة المكافأة أو الخصم (الفرق × قيمة النقطة):</span>
                  <span className={`font-black font-mono ${selectedData.rawRewardAmount > 0 ? 'text-emerald-400' : selectedData.rawRewardAmount < 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {selectedData.rawRewardAmount > 0 ? `+${selectedData.rawRewardAmount.toLocaleString()}` : `${selectedData.rawRewardAmount.toLocaleString()}`} د.ع
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-300">إجمالي المكافآت المالية اليدوية:</span>
                  <span className="font-black font-mono text-emerald-400">+{selectedData.totalManualRewards.toLocaleString()} د.ع</span>
                </div>

                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-bold text-slate-300">إجمالي الخصومات المالية اليدوية:</span>
                  <span className="font-black font-mono text-rose-400">-{selectedData.totalManualDeductions.toLocaleString()} د.ع</span>
                </div>

                <div className="flex items-center justify-between text-sm pt-1">
                  <span className="font-black text-amber-300">صافي استحقاق المكافأة / الخصم:</span>
                  <span className={`font-black font-mono text-base ${selectedData.netReward > 0 ? 'text-emerald-400' : selectedData.netReward < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                    {selectedData.netReward > 0 ? `+${selectedData.netReward.toLocaleString()}` : `${selectedData.netReward.toLocaleString()}`} د.ع
                  </span>
                </div>
              </div>

              {/* Manual Financial Deductions Table */}
              <div className="space-y-3">
                <h4 className="font-black text-slate-900 flex items-center gap-2 text-xs">
                  <TrendingDown className="w-4 h-4 text-rose-600" />
                  <span>جميع الخصومات المالية اليدوية المسجلة ({selectedData.manualDeductionsList.length})</span>
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-rose-50 text-rose-900 font-bold border-b border-rose-100">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">مبلغ الخصم</th>
                        <th className="p-2.5">السبب والبيان</th>
                        <th className="p-2.5">بواسطة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {selectedData.manualDeductionsList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-slate-400 font-bold">
                            لا توجد خصومات مالية يدوية مسجلة لهذا الموظف.
                          </td>
                        </tr>
                      ) : (
                        selectedData.manualDeductionsList.map((f) => (
                          <tr key={f.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-600">{formatArabicDateOnly(f.date)}</td>
                            <td className="p-2.5 font-mono font-black text-rose-700">-{f.amount.toLocaleString()} د.ع</td>
                            <td className="p-2.5 text-slate-800">{f.reason || 'خصم إداري'}</td>
                            <td className="p-2.5 text-slate-500">{f.createdByName || 'الإدارة'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Manual Financial Rewards Table */}
              <div className="space-y-3">
                <h4 className="font-black text-slate-900 flex items-center gap-2 text-xs">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>جميع المكافآت المالية اليدوية المسجلة ({selectedData.manualRewardsList.length})</span>
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-right text-[11px]">
                    <thead className="bg-emerald-50 text-emerald-900 font-bold border-b border-emerald-100">
                      <tr>
                        <th className="p-2.5">التاريخ</th>
                        <th className="p-2.5">مبلغ المكافأة</th>
                        <th className="p-2.5">السبب والبيان</th>
                        <th className="p-2.5">بواسطة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {selectedData.manualRewardsList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-4 text-slate-400 font-bold">
                            لا توجد مكافآت مالية يدوية مسجلة لهذا الموظف.
                          </td>
                        </tr>
                      ) : (
                        selectedData.manualRewardsList.map((f) => (
                          <tr key={f.id} className="hover:bg-slate-50">
                            <td className="p-2.5 font-mono text-slate-600">{formatArabicDateOnly(f.date)}</td>
                            <td className="p-2.5 font-mono font-black text-emerald-700">+{f.amount.toLocaleString()} د.ع</td>
                            <td className="p-2.5 text-slate-800">{f.reason || 'مكافأة إدارية'}</td>
                            <td className="p-2.5 text-slate-500">{f.createdByName || 'الإدارة'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEmployee(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-6 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ELIGIBILITY MODAL */}
      {editingEligibilityEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 dir-rtl">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-xl overflow-hidden border border-slate-200">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <h3 className="font-extrabold text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-amber-400" />
                <span>تعديل شمولية المكافآت: {editingEligibilityEmp.name}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingEligibilityEmp(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSaveEligibility(); }} className="p-6 space-y-4 text-xs">
              {saveError && (
                <div className="p-3 bg-red-50 text-red-700 rounded-xl flex items-center gap-2 font-bold border border-red-200">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <div>
                <label className="block text-slate-800 font-bold mb-2">حالة الشمول *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditStatus('eligible')}
                    className={`py-2.5 px-3 rounded-xl font-black border cursor-pointer flex items-center justify-center gap-2 transition-all ${
                      editStatus === 'eligible'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>مشمول بالمكافآت</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditStatus('excluded')}
                    className={`py-2.5 px-3 rounded-xl font-black border cursor-pointer flex items-center justify-center gap-2 transition-all ${
                      editStatus === 'excluded'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <UserX className="w-4 h-4" />
                    <span>غير مشمول</span>
                  </button>
                </div>
              </div>

              {editStatus === 'excluded' && (
                <div>
                  <label className="block text-slate-800 font-bold mb-1.5">سبب الاستبعاد *</label>
                  <textarea
                    rows={3}
                    required
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="اكتب سبب استبعاد الموظف من نظام المكافآت..."
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white outline-none font-medium transition-all"
                  ></textarea>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSaving ? 'جاري الحفظ...' : 'تأكيد وحفظ'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingEligibilityEmp(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
