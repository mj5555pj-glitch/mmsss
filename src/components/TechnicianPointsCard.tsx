import React, { useState, useRef } from 'react';
import { 
  Award, TrendingUp, TrendingDown, Sparkles, 
  X, AlertTriangle, ShieldAlert, FileText, BarChart3, Layers, RefreshCw
} from 'lucide-react';
import { Employee, Task, ManualPointsRecord, DbTaskType } from '../types';
import { isThisMonth } from '../utils';

interface TechnicianPointsCardProps {
  employee: Employee;
  tasks: Task[];
  manualPoints: ManualPointsRecord[];
  taskTypes?: DbTaskType[];
}

export default function TechnicianPointsCard({
  employee,
  tasks,
  manualPoints,
  taskTypes = []
}: TechnicianPointsCardProps) {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>(() => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));

  // Hold a frozen snapshot that only updates on initial load or manual refresh
  const [snapshot, setSnapshot] = useState(() => computePointsSnapshot(employee, tasks, manualPoints, taskTypes));

  function computePointsSnapshot(
    emp: Employee,
    currentTasks: Task[],
    currentManualPoints: ManualPointsRecord[],
    typesList: DbTaskType[]
  ) {
    const empCompletedTasks = currentTasks.filter(
      t => t.employeeId === emp.id && 
           t.status === 'completed' &&
           isThisMonth(t.endTime || t.startTime || '')
    );

    const empManualPoints = currentManualPoints.filter(
      mp => mp.employeeId === emp.id && isThisMonth(mp.timestamp)
    );

    const giftsTotal = empManualPoints
      .filter(mp => mp.type === 'gift')
      .reduce((sum, mp) => sum + mp.points, 0);
    const penaltiesTotal = empManualPoints
      .filter(mp => mp.type === 'penalty')
      .reduce((sum, mp) => sum + mp.points, 0);

    const taskPointsSum = empCompletedTasks.reduce((sum, t) => sum + (t.points || 0), 0);
    const totalCyclePoints = Math.max(0, taskPointsSum + giftsTotal - penaltiesTotal);

    const defaultTypes = typesList.length > 0 ? typesList : [
      { id: 'tt-1', name: 'تنصيب', color: '#3B82F6' },
      { id: 'tt-2', name: 'صيانة', color: '#10B981' },
      { id: 'tt-3', name: 'سحب', color: '#F59E0B' },
      { id: 'tt-4', name: 'منافذ', color: '#8B5CF6' },
      { id: 'tt-5', name: 'كلك', color: '#06B6D4' },
      { id: 'tt-6', name: 'دعم', color: '#EC4899' },
    ];

    const map: Record<string, {
      name: string;
      count: number;
      grossPoints: number;
      deductions: number;
      netPoints: number;
      color?: string;
    }> = {};

    defaultTypes.forEach(tt => {
      map[tt.name] = {
        name: tt.name,
        count: 0,
        grossPoints: 0,
        deductions: 0,
        netPoints: 0,
        color: tt.color
      };
    });

    empCompletedTasks.forEach(task => {
      const typeName = task.taskType || 'أخرى';
      if (!map[typeName]) {
        map[typeName] = {
          name: typeName,
          count: 0,
          grossPoints: 0,
          deductions: 0,
          netPoints: 0,
          color: '#64748B'
        };
      }
      map[typeName].count += 1;
      const pts = task.points || 0;
      const ded = task.delayApproved ? 0 : (task.pointsDeducted || 0);
      map[typeName].netPoints += pts;
      map[typeName].deductions += ded;
      map[typeName].grossPoints += (pts + ded);
    });

    const totalTaskDelayDeductions = empCompletedTasks.reduce((sum, task) => {
      const ded = task.delayApproved ? 0 : (task.pointsDeducted || 0);
      return sum + ded;
    }, 0);

    return {
      totalCyclePoints,
      empCompletedTasks,
      giftsTotal,
      penaltiesTotal,
      taskTypeBreakdown: Object.values(map),
      totalTaskDelayDeductions,
    };
  }

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setSnapshot(computePointsSnapshot(employee, tasks, manualPoints, taskTypes));
      setLastUpdatedTime(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
      setIsRefreshing(false);
    }, 300);
  };

  const {
    totalCyclePoints,
    empCompletedTasks,
    giftsTotal,
    penaltiesTotal,
    taskTypeBreakdown,
    totalTaskDelayDeductions,
  } = snapshot;

  return (
    <>
      {/* Dashboard Summary Card */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-3xl border border-blue-800/60 shadow-xl overflow-hidden transition-all text-white">
        <div className="p-5 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shrink-0">
              <Award className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-white text-base md:text-lg">
                  عدد النقاط الكلي للدورة
                </h3>
                <span className="bg-amber-400/20 text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  سجل التقييم الشامل
                </span>
              </div>
              <p className="text-xs text-blue-200 font-medium mt-1">
                مجمع النقاط المستحقة والمكتسبة مع تفكيك الفئات وتتبع خصومات المهام
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-blue-800/50 pt-3 sm:pt-0">
            <div className="text-right sm:text-left">
              <span className="text-[10px] text-blue-300 font-bold block">إجمالي النقاط الحالي:</span>
              <span className={`text-xl font-black font-mono ${totalCyclePoints >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                {totalCyclePoints > 0 ? `+${totalCyclePoints}` : totalCyclePoints} نقطة
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                title={`آخر تحديث: ${lastUpdatedTime}`}
                className="p-2.5 bg-blue-800/80 hover:bg-blue-700 text-blue-100 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-300' : ''}`} />
                <span className="hidden md:inline text-[11px]">تحديث</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDetailModal(true)}
                className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 shrink-0"
              >
                <BarChart3 className="w-4 h-4" />
                <span>عرض سجل النقاط</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL (سجل النقاط التفصيلي) */}
      {showDetailModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto my-auto text-right" 
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-black">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">
                    سجل النقاط التفصيلي للدورة التقييمية
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    الموظف: {employee.name} | القسم: {employee.role || 'فني'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SECTION 1: Aggregated Summary Cards (مجمع النقاط) */}
            <div className="space-y-2">
              <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>أولاً: مجمع النقاط الكلي</span>
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* Net Points */}
                <div className="bg-amber-50 border border-amber-200/80 p-3.5 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] text-amber-800 font-bold block">مجمع النقاط الكلي</span>
                  <span className={`text-lg font-black font-mono block ${totalCyclePoints >= 0 ? 'text-amber-900' : 'text-rose-600'}`}>
                    {totalCyclePoints > 0 ? `+${totalCyclePoints}` : totalCyclePoints} ن
                  </span>
                </div>

                {/* Total Tasks */}
                <div className="bg-blue-50 border border-blue-200/80 p-3.5 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] text-blue-800 font-bold block">المهام المكتملة</span>
                  <span className="text-lg font-black font-mono text-blue-900 block">
                    {empCompletedTasks.length} مهمة
                  </span>
                </div>

                {/* Admin Gifts */}
                <div className="bg-emerald-50 border border-emerald-200/80 p-3.5 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] text-emerald-800 font-bold block">مكافآت إدارية</span>
                  <span className="text-lg font-black font-mono text-emerald-700 block">
                    +{giftsTotal} ن
                  </span>
                </div>

                {/* Deductions Total - strictly task delay deductions */}
                <div className="bg-rose-50 border border-rose-200/80 p-3.5 rounded-2xl text-center space-y-1">
                  <span className="text-[10px] text-rose-800 font-bold block">خصم تأخير المهام</span>
                  <span className="text-lg font-black font-mono text-rose-700 block">
                    -{totalTaskDelayDeductions} ن
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION 2: Category Breakdown (تفكيك النقاط حسب نوع المهمة) */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="font-black text-xs text-slate-800 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>ثانياً: تفكيك النقاط حسب نوع المهمة</span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {taskTypeBreakdown.map((item, idx) => (
                  <div key={idx} className="bg-slate-50 border border-slate-200/70 p-3.5 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: item.color || '#3B82F6' }}
                        />
                        <span className="font-black text-slate-900 text-xs">نقاط {item.name}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                        {item.count} مهمة
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">المكتسبة</span>
                        <span className="font-black text-slate-700 font-mono">+{item.grossPoints}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">خصم التأخير</span>
                        <span className="font-black text-rose-600 font-mono">-{item.deductions}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 font-bold block text-[9px]">الصافي</span>
                        <span className={`font-black font-mono ${item.netPoints >= 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                          {item.netPoints > 0 ? `+${item.netPoints}` : item.netPoints}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Administrative Manual Points Line */}
              {(giftsTotal > 0 || penaltiesTotal > 0) && (
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between text-xs">
                  <span className="font-black text-indigo-900">
                    🎁 النقاط والمكافآت الإدارية الاستثنائية:
                  </span>
                  <span className="font-bold font-mono text-indigo-800">
                    مكافآت +{giftsTotal} ن | خصومات إدارية -{penaltiesTotal} ن
                  </span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2.5 bg-slate-900 text-white font-black text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
