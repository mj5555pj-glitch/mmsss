import React, { useState } from 'react';
import { Award, TrendingUp, TrendingDown, Minus, Info, RefreshCw, ChevronDown, Sparkles, Clock } from 'lucide-react';
import { Employee, Task, ManualPointsRecord, CompanySettings } from '../types';
import { getCompanySettingsCachedSync, getCompanySettings } from '../lib/dbService';
import { hrEngine } from '../lib/hrEngine';
import { EmployeeRewardResult } from '../lib/rewardService';

interface TechnicianRewardCardProps {
  employee: Employee;
  tasks: Task[];
  manualPoints: ManualPointsRecord[];
  allEmployees: Employee[];
  initialSettings?: CompanySettings | null;
}

export default function TechnicianRewardCard({
  employee,
  tasks,
  manualPoints,
  allEmployees,
  initialSettings
}: TechnicianRewardCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(() => initialSettings || getCompanySettingsCachedSync());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastCalculatedTime, setLastCalculatedTime] = useState<string>(() => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));

  const computeSnapshot = (sets: CompanySettings | null) => {
    if (!employee) return null;
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

    const startDate = `${startY}-${String(startM + 1).padStart(2, '0')}-16`;
    const endDate = `${endY}-${String(endM + 1).padStart(2, '0')}-15`;

    return hrEngine.getEmployeeRewardSummary({
      employeeId: employee.id,
      employees: allEmployees,
      tasks,
      manualPoints,
      rewardPoolPercentage: sets?.rewardPoolPercentage ?? 5,
      rewardPointValue: sets?.rewardPointValue ?? 35,
      startDate,
      endDate,
    });
  };

  const [rewardResult, setRewardResult] = useState<EmployeeRewardResult | null>(() => computeSnapshot(companySettings));

  const handleManualRefresh = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsRefreshing(true);
    try {
      const freshSets = await getCompanySettings();
      if (freshSets) setCompanySettings(freshSets);
      setRewardResult(computeSnapshot(freshSets || companySettings));
      setLastCalculatedTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      console.warn('Manual reward refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!rewardResult) return null;

  const { isEligible, totalPoints, averagePoints, difference, rewardPointValue, rewardAmount, type } = rewardResult;

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden transition-all">
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors focus:outline-none"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-slate-900 text-base">المكافأة المتوقعة</h3>
              {!isEligible ? (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-200">
                  غير مشمول بالنظام
                </span>
              ) : type === 'reward' ? (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-200">
                  <TrendingUp className="w-3 h-3 text-emerald-600" />
                  مكافأة متوقعة
                </span>
              ) : type === 'deduction' ? (
                <span className="bg-rose-100 text-rose-800 text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 border border-rose-200">
                  <TrendingDown className="w-3 h-3 text-rose-600" />
                  خصم متوقع
                </span>
              ) : (
                <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-slate-200">
                  لا توجد مكافأة أو خصم
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              احتساب تقديري للدورة الحالية (يتم التحديث عند الحاجة فقط)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-left hidden sm:block">
            <span className="text-[10px] text-slate-400 font-bold block">المبلغ التقديري:</span>
            {!isEligible ? (
              <span className="text-xs font-black text-amber-700">غير مشمول</span>
            ) : (
              <span className={`text-sm font-black dir-ltr ${rewardAmount > 0 ? 'text-emerald-600' : rewardAmount < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                {rewardAmount > 0 ? `+${rewardAmount.toLocaleString()}` : rewardAmount.toLocaleString()} د.ع
              </span>
            )}
          </div>

          <div
            onClick={handleManualRefresh}
            title={`تحديث الحساب (آخر تحديث: ${lastCalculatedTime})`}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-600' : ''}`} />
            <span className="hidden md:inline">تحديث</span>
          </div>

          <div className={`w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isOpen && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-4">
          {!isEligible ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>أنت غير مشمول حالياً بنظام المكافآت.</span>
            </div>
          ) : (
            <>
              {/* Main Banner / Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Total Points */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 font-bold block">نقاطك الإجمالية:</span>
                  <span className="text-base font-black text-slate-900 mt-0.5 block">{totalPoints} نقطة</span>
                </div>

                {/* Average Points */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 font-bold block">متوسط الفنيين:</span>
                  <span className="text-base font-black text-slate-800 mt-0.5 block">{averagePoints} نقطة</span>
                </div>

                {/* Difference */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 font-bold block">الفارق عن المتوسط:</span>
                  <span className={`text-base font-black mt-0.5 block ${difference > 0 ? 'text-emerald-600' : difference < 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                    {difference > 0 ? `+${difference}` : difference} نقطة
                  </span>
                </div>

                {/* Point Value */}
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 font-bold block">قيمة النقطة:</span>
                  <span className="text-base font-black text-purple-700 mt-0.5 block">{rewardPointValue} د.ع</span>
                </div>
              </div>

              {/* Total Calculation Card */}
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                type === 'reward' 
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950' 
                  : type === 'deduction' 
                  ? 'bg-rose-50/80 border-rose-200 text-rose-950' 
                  : 'bg-slate-50 border-slate-200 text-slate-900'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                    type === 'reward' ? 'bg-emerald-200/80 text-emerald-800' : type === 'deduction' ? 'bg-rose-200/80 text-rose-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {type === 'reward' ? <TrendingUp className="w-5 h-5" /> : type === 'deduction' ? <TrendingDown className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                  </div>
                  <div>
                    <span className="text-xs font-black block">
                      {type === 'reward' ? 'المكافأة التقديرية الحالية' : type === 'deduction' ? 'الخصم التقديري الحالي' : 'النتيجة الحالية'}
                    </span>
                    <span className="text-[11px] font-medium opacity-80 block">
                      {type === 'reward' 
                        ? `الفارق (+${difference} نقطة) × ${rewardPointValue} د.ع` 
                        : type === 'deduction' 
                        ? `الفارق (${difference} نقطة) × ${rewardPointValue} د.ع` 
                        : 'نقاطك متساوية تماماً مع متوسط الفنيين'}
                    </span>
                  </div>
                </div>

                <div className="text-right sm:text-left">
                  <span className={`text-xl font-black ${
                    type === 'reward' ? 'text-emerald-700' : type === 'deduction' ? 'text-rose-700' : 'text-slate-800'
                  }`}>
                    {type === 'reward' ? `+${rewardAmount.toLocaleString()}` : `${rewardAmount.toLocaleString()}`} د.ع
                  </span>
                </div>
              </div>

              {/* Calculation Timestamp & Refresh */}
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-600">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>آخر تحديث للحساب:</span>
                  <span className="text-slate-800 font-mono">{lastCalculatedTime}</span>
                </div>
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span>إعادة احتساب المكافأة الآن</span>
                </button>
              </div>

              {/* Footer Note */}
              <div className="pt-1 flex items-center gap-2 text-slate-400 text-[11px] font-medium">
                <Info className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                <span>هذه قيمة تقديرية لا يتم تحديثها تلقائياً، يمكنك النقر على تحديث عند الرغبة في معاودة الحساب.</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
