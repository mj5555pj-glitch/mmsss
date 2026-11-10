import React, { useState, useEffect, useMemo } from 'react';
import { 
  Award, TrendingUp, TrendingDown, Sparkles, RefreshCw,
  AlertTriangle, Layers, Trophy, CheckCircle2, BarChart3, Calendar
} from 'lucide-react';
import { Employee, Task, ManualPointsRecord, DbTaskType } from '../types';
import { isToday, isThisMonth, getAdministrativeMonthRange, formatArabicDateOnly, formatArabicTimeOnly } from '../utils';
import { getManualPoints } from '../lib/dbService';

interface TechnicianPointsViewProps {
  employee: Employee | undefined;
  tasks: Task[];
  manualPoints: ManualPointsRecord[];
  allEmployees: Employee[];
  taskTypes?: DbTaskType[];
  onRefreshPoints?: () => Promise<void> | void;
}

export default function TechnicianPointsView({
  employee,
  tasks,
  manualPoints: initialManualPoints,
  allEmployees,
  taskTypes = [],
  onRefreshPoints
}: TechnicianPointsViewProps) {
  const [manualPoints, setManualPoints] = useState<ManualPointsRecord[]>(initialManualPoints);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshMessage, setRefreshMessage] = useState<string>('');

  useEffect(() => {
    setManualPoints(initialManualPoints);
  }, [initialManualPoints]);

  // Current Cycle Range (16th to 15th)
  const { start: cycleStartDate, end: cycleEndDate } = useMemo(() => getAdministrativeMonthRange(), []);
  const cycleDateRangeString = useMemo(() => {
    return `${formatArabicDateOnly(cycleStartDate.toISOString())} إلى ${formatArabicDateOnly(cycleEndDate.toISOString())}`;
  }, [cycleStartDate, cycleEndDate]);

  if (!employee) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center max-w-md mx-auto space-y-4" dir="rtl">
        <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="font-extrabold text-slate-800 text-lg">لم يتم العثور على حساب الموظف</h3>
        <p className="text-sm text-slate-500 leading-relaxed">
          يرجى التأكد من تسجيل الدخول بحساب موظف نشط في النظام.
        </p>
      </div>
    );
  }

  // Handle Manual Refresh
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setRefreshMessage('');
    try {
      if (onRefreshPoints) {
        await onRefreshPoints();
      } else {
        const fresh = await getManualPoints(true);
        setManualPoints(fresh);
      }
      setRefreshMessage('تم تحديث نقاط الدورة الحالية بنجاح من السحابة');
      setTimeout(() => setRefreshMessage(''), 3000);
    } catch (err) {
      console.error('Error refreshing points:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 1. Filter employee's completed tasks strictly in the CURRENT CYCLE
  const empCycleCompletedTasks = useMemo(() => {
    return tasks.filter(
      t => t.employeeId === employee.id && 
           t.status === 'completed' && 
           isThisMonth(t.endTime || t.startTime || '')
    );
  }, [tasks, employee.id]);

  // Tasks completed today (within current cycle)
  const myCompletedTasksToday = useMemo(() => {
    return empCycleCompletedTasks.filter(t => isToday(t.endTime || t.startTime || ''));
  }, [empCycleCompletedTasks]);

  const tasksPointsTodaySum = myCompletedTasksToday.reduce((sum, t) => sum + (t.points || 0), 0);

  // 2. Filter employee's manual points strictly in the CURRENT CYCLE
  const empCycleManualPoints = useMemo(() => {
    return manualPoints.filter(
      mp => mp.employeeId === employee.id && isThisMonth(mp.timestamp)
    );
  }, [manualPoints, employee.id]);

  const giftsTodaySum = empCycleManualPoints
    .filter(mp => mp.type === 'gift' && isToday(mp.timestamp))
    .reduce((sum, mp) => sum + mp.points, 0);

  const penaltiesTodaySum = empCycleManualPoints
    .filter(mp => mp.type === 'penalty' && isToday(mp.timestamp))
    .reduce((sum, mp) => sum + mp.points, 0);

  const netPointsToday = Math.max(0, tasksPointsTodaySum + giftsTodaySum - penaltiesTodaySum);

  const giftsCycleTotal = empCycleManualPoints
    .filter(mp => mp.type === 'gift')
    .reduce((sum, mp) => sum + mp.points, 0);

  const penaltiesCycleTotal = empCycleManualPoints
    .filter(mp => mp.type === 'penalty')
    .reduce((sum, mp) => sum + mp.points, 0);

  // 3. Total Points in CURRENT CYCLE ONLY
  const taskCyclePointsSum = empCycleCompletedTasks.reduce((sum, t) => sum + (t.points || 0), 0);
  const totalCyclePoints = Math.max(0, taskCyclePointsSum + giftsCycleTotal - penaltiesCycleTotal);

  // 4. Calculate Breakdown by Task Type for CURRENT CYCLE ONLY
  const taskTypeBreakdown = useMemo(() => {
    const map: Record<string, {
      name: string;
      count: number;
      grossPoints: number;
      deductions: number;
      netPoints: number;
      color?: string;
    }> = {};

    const defaultTypes = taskTypes.length > 0 ? taskTypes : [
      { id: 'tt-1', name: 'تنصيب', color: '#3B82F6' },
      { id: 'tt-2', name: 'صيانة', color: '#10B981' },
      { id: 'tt-3', name: 'سحب', color: '#F59E0B' },
      { id: 'tt-4', name: 'منافذ', color: '#8B5CF6' },
      { id: 'tt-5', name: 'كلك', color: '#06B6D4' },
      { id: 'tt-6', name: 'دعم', color: '#EC4899' },
    ];

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

    empCycleCompletedTasks.forEach(task => {
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

    return Object.values(map);
  }, [empCycleCompletedTasks, taskTypes]);

  // 5. Leaderboard Calculation for CURRENT CYCLE ONLY
  const leaderboardList = useMemo(() => {
    const scores = allEmployees.map(emp => {
      const eTasks = tasks.filter(
        t => t.employeeId === emp.id && 
             t.status === 'completed' && 
             isThisMonth(t.endTime || t.startTime || '')
      );
      const tPoints = eTasks.reduce((sum, t) => sum + (t.points || 0), 0);
      const eManual = manualPoints.filter(
        mp => mp.employeeId === emp.id && isThisMonth(mp.timestamp)
      );
      const gSum = eManual.filter(mp => mp.type === 'gift').reduce((sum, mp) => sum + mp.points, 0);
      const pSum = eManual.filter(mp => mp.type === 'penalty').reduce((sum, mp) => sum + mp.points, 0);
      const total = Math.max(0, tPoints + gSum - pSum);
      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        points: total,
        completedCount: eTasks.length,
        isCurrent: emp.id === employee.id
      };
    });
    return scores.sort((a, b) => b.points - a.points);
  }, [allEmployees, tasks, manualPoints, employee.id]);

  const myRank = leaderboardList.findIndex(item => item.id === employee.id) + 1;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      {/* Top Banner & Refresh Control */}
      <div className="bg-white p-4 md:p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center font-bold shrink-0">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-slate-800 text-lg">واجهة نقاط الدورة الحالية</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>فترة الدورة: {cycleDateRangeString}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-black text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-2xs disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'جاري تحديث النقاط...' : 'تحديث نقاط الدورة'}</span>
          </button>
        </div>
      </div>

      {refreshMessage && (
        <div className="bg-emerald-50 text-emerald-800 text-xs font-bold p-3 px-4 rounded-2xl border border-emerald-200 flex items-center gap-2 shadow-2xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{refreshMessage}</span>
        </div>
      )}

      {/* Points Summary Hero Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Points Today */}
        <div className="bg-gradient-to-br from-purple-700 to-indigo-700 text-white p-5 rounded-3xl shadow-sm relative overflow-hidden space-y-2">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-6 translate-x-6 blur-lg"></div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-purple-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>نقاط اليوم الإداري</span>
            </span>
            <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">اليوم</span>
          </div>
          <h3 className="text-3xl font-black text-white">
            {netPointsToday.toFixed(1)} <span className="text-xs font-bold text-purple-200">نقطة</span>
          </h3>
          <p className="text-[11px] text-purple-100 font-medium">
            من {myCompletedTasksToday.length} مهمة منجزة اليوم
          </p>
        </div>

        {/* Total Cycle Points */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-purple-600" />
              <span>نقاط الدورة الحالية فقط</span>
            </span>
            <span className="text-[10px] font-black bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
              الدورة الحالية
            </span>
          </div>
          <h3 className="text-3xl font-black text-slate-800">
            {totalCyclePoints.toFixed(1)} <span className="text-xs font-bold text-slate-400">نقطة</span>
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">
            مجموع مهام الدورة ({empCycleCompletedTasks.length}) + المكافآت - الخصومات
          </p>
        </div>

        {/* Rank & Standing */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-2 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-500 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>ترتيب الدورة الحالية</span>
            </span>
            <span className="text-[10px] font-black bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
              المركز {myRank > 0 ? `#${myRank}` : '-'}
            </span>
          </div>
          <h3 className="text-3xl font-black text-amber-600">
            #{myRank > 0 ? myRank : 1} <span className="text-xs font-bold text-slate-400">من {allEmployees.length} فني</span>
          </h3>
          <p className="text-[11px] text-slate-500 font-medium">
            بناءً على نقاط الدورة الحالية المعتمدة
          </p>
        </div>
      </div>

      {/* Task Type Breakdown Table */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm">تفصيل نقاط مهام الدورة الحالية حسب النوع</h3>
            <p className="text-[11px] text-slate-400">المهام المنجزة والنقاط المحتسبة خلال الدورة الحالية</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {taskTypeBreakdown.map((item, idx) => (
            <div 
              key={idx} 
              className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-3.5 space-y-1.5 transition-all hover:bg-slate-100/70"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || '#3B82F6' }}></span>
                  {item.name}
                </span>
                <span className="text-[10px] font-bold bg-white text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200">
                  {item.count} مهام
                </span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="text-[11px] text-slate-400 font-bold">الصافي:</span>
                <span className="text-sm font-black text-blue-700 font-mono">
                  {item.netPoints.toFixed(1)} <span className="text-[10px]">نقطة</span>
                </span>
              </div>
              {item.deductions > 0 && (
                <div className="text-[10px] text-red-600 font-bold pt-0.5 flex justify-between">
                  <span>استقطاع تأخير:</span>
                  <span>-{item.deductions.toFixed(1)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Rewards and Deductions History for Current Cycle */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-sm">مكافآت وعقوبات الدورة الحالية</h3>
              <p className="text-[11px] text-slate-400">القرارات الإدارية المنفذة خلال فترة الدورة الحالية</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-200">
              +{giftsCycleTotal} مكافأة
            </span>
            <span className="text-red-700 bg-red-50 px-2.5 py-1 rounded-xl border border-red-200">
              -{penaltiesCycleTotal} عقوبة
            </span>
          </div>
        </div>

        {empCycleManualPoints.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            لا توجد مكافآت أو عقوبات مسجلة على حسابك في الدورة الحالية.
          </div>
        ) : (
          <div className="space-y-2">
            {empCycleManualPoints.map((rec) => (
              <div
                key={rec.id}
                className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
                  rec.type === 'gift'
                    ? 'bg-emerald-50/50 border-emerald-200 text-emerald-950'
                    : 'bg-red-50/50 border-red-200 text-red-950'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className={`font-black px-2 py-0.5 rounded-lg text-[10px] ${
                      rec.type === 'gift' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}>
                      {rec.type === 'gift' ? '🎁 مكافأة' : '⚠️ عقوبة'}
                    </span>
                    <span className="font-bold">{rec.reason}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    بواسطة: {rec.adminName || 'الإدارة'} • {formatArabicDateOnly(rec.timestamp)} - {formatArabicTimeOnly(rec.timestamp)}
                  </p>
                </div>
                <div className="font-black text-sm font-mono">
                  {rec.type === 'gift' ? `+${rec.points}` : `-${rec.points}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leaderboard Table for Current Cycle */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
            <Trophy className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-sm">لوحة ترتيب المتصدرين (الدورة الحالية)</h3>
            <p className="text-[11px] text-slate-400">ترتيب الفنيين بناءً على مجموع نقاط الدورة الحالية فقط</p>
          </div>
        </div>

        <div className="space-y-2">
          {leaderboardList.slice(0, 10).map((user, index) => (
            <div
              key={user.id}
              className={`p-3 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                user.isCurrent
                  ? 'bg-purple-50 border-purple-300 ring-2 ring-purple-100 font-bold'
                  : 'bg-slate-50/60 border-slate-100 hover:bg-slate-100/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs ${
                  index === 0 ? 'bg-amber-400 text-amber-950 shadow-xs' :
                  index === 1 ? 'bg-slate-300 text-slate-800' :
                  index === 2 ? 'bg-amber-600 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {index + 1}
                </span>
                <div>
                  <span className="font-black text-slate-800">{user.name}</span>
                  {user.isCurrent && (
                    <span className="mr-2 text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">
                      أنت
                    </span>
                  )}
                  <p className="text-[10px] text-slate-400 font-medium">
                    {user.completedCount} مهمة في الدورة
                  </p>
                </div>
              </div>

              <div className="text-left font-mono">
                <span className="font-black text-purple-700 text-sm">{user.points.toFixed(1)}</span>
                <span className="text-[10px] text-slate-400 mr-1 font-sans">نقطة</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
