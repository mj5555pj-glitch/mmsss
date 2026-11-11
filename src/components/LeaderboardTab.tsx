import React, { useState, useMemo, useEffect } from 'react';
import { Trophy, CalendarDays, CalendarRange, CalendarCheck, Award, Lock, Clock } from 'lucide-react';
import { Employee, Task, LeaderboardEntry, ManualPointsRecord } from '../types';
import { isToday, isThisWeek, isThisMonth, isLeaderboardOpen } from '../utils';
import { motion } from 'motion/react';

interface LeaderboardTabProps {
  employees: Employee[];
  tasks: Task[];
  manualPoints?: ManualPointsRecord[];
  userRole?: 'owner' | 'manager' | 'technician' | 'supervisor';
}

export default function LeaderboardTab({ employees, tasks, manualPoints, userRole = 'technician' }: LeaderboardTabProps) {
  // Tabs for periods
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');

  // Enforce "day" period for technician
  const activePeriod = userRole === 'technician' ? 'day' : period;

  // Check if currently open (between 12:00 AM and 3:00 AM)
  const isOpen = isLeaderboardOpen();

  // Countdown calculations
  const getRemainingTime = () => {
    const currentNow = new Date();
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - currentNow.getTime();
    if (diffMs <= 0) return { hours: 0, minutes: 0, seconds: 0 };

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    return { hours, minutes, seconds };
  };

  const [countdown, setCountdown] = useState(() => {
    const initialNow = new Date();
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(0, 0, 0, 0);
    const diffMs = target.getTime() - initialNow.getTime();
    if (diffMs <= 0) return { hours: 0, minutes: 0, seconds: 0 };
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    return { hours, minutes, seconds };
  });

  useEffect(() => {
    if (userRole !== 'technician' || isOpen) return;

    const timer = setInterval(() => {
      setCountdown(getRemainingTime());
    }, 1000);

    return () => clearInterval(timer);
  }, [userRole, isOpen]);

  // Completed tasks only
  const completedTasks = useMemo(() => tasks.filter(t => t.status === 'completed'), [tasks]);

  // Compute leaderboards dynamically
  const leaderboardData = useMemo<LeaderboardEntry[]>(() => {
    // 1. Filter tasks based on period
    const filteredTasks = completedTasks.filter((task) => {
      const dateStr = task.endTime || task.startTime;
      if (activePeriod === 'day') return isToday(dateStr);
      if (activePeriod === 'week') return isThisWeek(dateStr);
      return isThisMonth(dateStr);
    });

    // 1b. Filter manual points based on period
    const filteredManual = (manualPoints || []).filter((mp) => {
      const dateStr = mp.timestamp;
      if (activePeriod === 'day') return isToday(dateStr);
      if (activePeriod === 'week') return isThisWeek(dateStr);
      return isThisMonth(dateStr);
    });

    // 2. Aggregate points and count by Employee
    const aggregates: Record<string, { name: string; points: number; count: number }> = {};
    
    // Initialize with all existing employees to ensure everyone is displayed (even with 0 points)
    employees.forEach(emp => {
      aggregates[emp.id] = { name: emp.name, points: 0, count: 0 };
    });

    // Sum up tasks
    filteredTasks.forEach((task) => {
      if (aggregates[task.employeeId]) {
        aggregates[task.employeeId].points += task.points;
        aggregates[task.employeeId].count += 1;
      } else {
        // Employee might have been deleted, but keep record for historical purposes
        aggregates[task.employeeId] = {
          name: task.employeeName,
          points: task.points,
          count: 1,
        };
      }
    });

    // Sum up manual points
    filteredManual.forEach((mp) => {
      const pointsDiff = mp.type === 'gift' ? mp.points : -mp.points;
      if (aggregates[mp.employeeId]) {
        aggregates[mp.employeeId].points += pointsDiff;
      } else {
        aggregates[mp.employeeId] = {
          name: mp.employeeName,
          points: pointsDiff,
          count: 0
        };
      }
    });

    // Convert to entries and sort
    const entries: LeaderboardEntry[] = Object.keys(aggregates).map((empId) => ({
      rank: 1, // calculated below
      employeeId: empId,
      employeeName: aggregates[empId].name,
      totalPoints: aggregates[empId].points,
      taskCount: aggregates[empId].count,
    }));

    // Sort by points (primary) and task count (secondary)
    entries.sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints;
      }
      return b.taskCount - a.taskCount;
    });

    // Assign ranks, handling ties beautifully
    let currentRank = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i].totalPoints < entries[i - 1].totalPoints) {
        currentRank = i + 1;
      }
      entries[i].rank = currentRank;
    }

    return entries;
  }, [employees, completedTasks, activePeriod, manualPoints]);

  // Render Rank Medal
  const renderRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return (
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-amber-50 text-amber-700 font-extrabold flex items-center justify-center border border-amber-200 shadow-xs text-xs sm:text-sm">
            🥇
          </div>
        );
      case 2:
        return (
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-100 text-slate-700 font-extrabold flex items-center justify-center border border-slate-200 shadow-xs text-xs sm:text-sm">
            🥈
          </div>
        );
      case 3:
        return (
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-orange-50 text-orange-800 font-extrabold flex items-center justify-center border border-orange-150 shadow-xs text-xs sm:text-sm">
            🥉
          </div>
        );
      default:
        return (
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-50 text-slate-500 font-bold flex items-center justify-center border border-slate-100 text-xs sm:text-sm">
            {rank}
          </div>
        );
    }
  };

  const periodConfig = {
    day: {
      title: 'بطل اليوم',
      desc: 'النقاط المسجلة اليوم فقط',
      icon: CalendarDays,
      activeColor: 'bg-blue-700 text-white',
    },
    week: {
      title: 'نجم الأسبوع',
      desc: 'النقاط المسجلة هذا الأسبوع',
      icon: CalendarRange,
      activeColor: 'bg-blue-700 text-white',
    },
    month: {
      title: 'متصدر الشهر',
      desc: 'النقاط المسجلة هذا الشهر',
      icon: CalendarCheck,
      activeColor: 'bg-blue-700 text-white',
    }
  };

  if (userRole === 'technician' && !isOpen) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-3xl border border-slate-150 shadow-sm p-8 text-center space-y-6" dir="rtl">
        {/* Animated Icon */}
        <div className="relative w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
          <div className="absolute inset-0 rounded-full bg-amber-400/10 animate-ping"></div>
          <Lock className="w-10 h-10 text-amber-600 stroke-[2]" />
        </div>

        {/* Message */}
        <div className="space-y-2">
          <h3 className="text-base font-black text-slate-800">🔒 لوحة الصدارة مغلقة حالياً</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            يمكنك مشاهدة ترتيب اليوم بين الساعة <span className="font-extrabold text-blue-700">12:00 ص</span> و <span className="font-extrabold text-blue-700">3:00 ص</span> فقط.
          </p>
        </div>

        {/* Countdown Card */}
        <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-150/60 space-y-3">
          <p className="text-[10px] font-bold text-slate-400 flex items-center justify-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>موعد فتح الصدارة القادم خلال</span>
          </p>
          
          <div className="flex items-center justify-center gap-3" style={{ direction: 'ltr' }}>
            {/* Hours */}
            <div className="text-center min-w-[55px]">
              <div className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 shadow-xs">
                <span className="text-lg font-black text-slate-800 font-mono">
                  {String(countdown.hours).padStart(2, '0')}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-bold block mt-1">ساعة</span>
            </div>
            
            <span className="text-lg font-bold text-slate-400 -mt-5">:</span>

            {/* Minutes */}
            <div className="text-center min-w-[55px]">
              <div className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 shadow-xs">
                <span className="text-lg font-black text-slate-800 font-mono">
                  {String(countdown.minutes).padStart(2, '0')}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-bold block mt-1">دقيقة</span>
            </div>

            <span className="text-lg font-bold text-slate-400 -mt-5">:</span>

            {/* Seconds */}
            <div className="text-center min-w-[55px]">
              <div className="bg-white border border-slate-200 rounded-xl py-1.5 px-2.5 shadow-xs">
                <span className="text-lg font-black text-blue-700 font-mono">
                  {String(countdown.seconds).padStart(2, '0')}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-bold block mt-1">ثانية</span>
            </div>
          </div>
        </div>

        {/* Additional security notice */}
        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1 leading-none">
          <span>🛡️ لوحة الصدارة متاحة للمدير والمالك على مدار 24 ساعة.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Tab Header */}
      <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-700" />
            <span>لوحة الصدارة والتميز</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">تحديث تلقائي وفوري للنقاط والترتيب بعد كل مهمة مكتملة حسب مدة الإنجاز</p>
        </div>

        {/* Tab Controls */}
        {userRole !== 'technician' ? (
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
            {(['day', 'week', 'month'] as const).map((p) => {
              const Icon = periodConfig[p].icon;
              const isActive = period === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg transition-all cursor-pointer ${
                    isActive
                      ? periodConfig[p].activeColor + ' shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{p === 'day' ? 'اليوم' : p === 'week' ? 'الأسبوع' : 'الشهر'}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex bg-blue-50 border border-blue-100 text-blue-700 px-3.5 py-1.5 rounded-xl text-xs font-black items-center gap-1.5 self-start sm:self-auto">
            <CalendarDays className="w-4 h-4 text-blue-700" />
            <span>صدارة اليوم المباشرة</span>
          </div>
        )}
      </div>

      {/* Main Board Content */}
      <div className="p-6">
        {leaderboardData.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-slate-700 text-sm">لا يوجد بيانات لعرضها</h4>
            <p className="text-xs text-slate-400 mt-1">سجل بعض المهام المكتملة لعرض لوحة الصدارة.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 1. Top 3 Podium (Horizontal) */}
            <div className="flex flex-row items-end justify-center gap-2 sm:gap-4 pt-6 pb-2 max-w-4xl mx-auto w-full">
              {/* Right: 3rd Place */}
              {leaderboardData[2] && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="flex-1 min-w-0 max-w-[130px] sm:max-w-[180px] bg-orange-50/20 border border-orange-100 rounded-xl p-2 sm:p-3 text-center flex flex-col items-center justify-between shadow-2xs relative min-h-[95px] sm:min-h-[125px]"
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xl filter drop-shadow-xs select-none">
                    🥉
                  </div>
                  <div className="mt-2.5 w-full">
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 block mb-0.5">المركز الثالث</span>
                    <h4 className="font-extrabold text-slate-800 text-[10px] sm:text-xs truncate animate-fade-in" title={leaderboardData[2].employeeName}>
                      {leaderboardData[2].employeeName}
                    </h4>
                  </div>
                  <div className="mt-1 w-full">
                    <div className="text-xs sm:text-sm font-black text-slate-700 leading-tight">
                      {leaderboardData[2].totalPoints} <span className="text-[9px] font-normal text-slate-400">ن</span>
                    </div>
                    <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-sm inline-block mt-0.5">
                      {leaderboardData[2].taskCount} عمـل
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Center: 1st Place */}
              {leaderboardData[0] && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 min-w-0 max-w-[150px] sm:max-w-[200px] bg-amber-50/40 border border-amber-200 rounded-2xl p-2.5 sm:p-4 text-center flex flex-col items-center justify-between shadow-xs relative min-h-[120px] sm:min-h-[155px]"
                >
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl filter drop-shadow-xs select-none animate-bounce">
                    👑
                  </div>
                  <div className="mt-3.5 w-full">
                    <span className="text-[8px] sm:text-[9px] font-black text-amber-600 bg-amber-100/40 px-1.5 py-0.5 rounded-md inline-block mb-1">
                      الأول 🥇
                    </span>
                    <h4 className="font-black text-slate-800 text-xs sm:text-sm truncate" title={leaderboardData[0].employeeName}>
                      {leaderboardData[0].employeeName}
                    </h4>
                  </div>
                  <div className="mt-1 w-full">
                    <div className="text-sm sm:text-base font-black text-blue-700 leading-tight">
                      {leaderboardData[0].totalPoints} <span className="text-[10px] font-normal text-slate-400">نقطة</span>
                    </div>
                    <span className="text-[9px] bg-blue-50 text-blue-700 font-black px-1.5 py-0.5 rounded-md inline-block mt-0.5 animate-pulse">
                      {leaderboardData[0].taskCount} عمـل
                    </span>
                  </div>
                </motion.div>
              )}

              {/* Left: 2nd Place */}
              {leaderboardData[1] && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.08 }}
                  className="flex-1 min-w-0 max-w-[130px] sm:max-w-[180px] bg-slate-50 border border-slate-200 rounded-xl p-2 sm:p-3 text-center flex flex-col items-center justify-between shadow-2xs relative min-h-[95px] sm:min-h-[125px]"
                >
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-xl filter drop-shadow-xs select-none">
                    🥈
                  </div>
                  <div className="mt-2.5 w-full">
                    <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 block mb-0.5">المركز الثاني</span>
                    <h4 className="font-extrabold text-slate-800 text-[10px] sm:text-xs truncate" title={leaderboardData[1].employeeName}>
                      {leaderboardData[1].employeeName}
                    </h4>
                  </div>
                  <div className="mt-1 w-full">
                    <div className="text-xs sm:text-sm font-black text-slate-700 leading-tight">
                      {leaderboardData[1].totalPoints} <span className="text-[9px] font-normal text-slate-400">ن</span>
                    </div>
                    <span className="text-[8px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded-sm inline-block mt-0.5">
                      {leaderboardData[1].taskCount} عمـل
                    </span>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Separator if we have more than 3 elements */}
            {leaderboardData.length > 3 && (
              <div className="border-t border-slate-100 my-2" />
            )}

            {/* 2. Fourth and Fifth Places (Full-Width Rows) */}
            {leaderboardData.length > 3 && (
              <div className="space-y-1.5">
                {leaderboardData[3] && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25 }}
                    className="flex items-center justify-between p-2 sm:p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-xl shadow-3xs transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-700 font-black flex items-center justify-center border border-slate-200 text-xs sm:text-sm">
                        🏅
                      </div>
                      <div>
                        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 block">المركز الرابع</span>
                        <span className="font-extrabold text-slate-800 text-xs sm:text-sm">
                          {leaderboardData[3].employeeName}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-left sm:text-center">
                        <span className="text-[10px] text-slate-400 block sm:inline ml-1">مجموع النقاط</span>
                        <span className="text-xs sm:text-sm font-black text-blue-700">
                          {leaderboardData[3].totalPoints} <span className="text-[9px] font-normal text-slate-400">ن</span>
                        </span>
                      </div>
                      <div className="text-left sm:text-center hidden sm:block">
                        <span className="text-xs text-slate-400 ml-1">المهام المنجزة</span>
                        <span className="text-xs font-bold text-slate-600">
                          {leaderboardData[3].taskCount} عملية
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {leaderboardData[4] && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: 0.04 }}
                    className="flex items-center justify-between p-2 sm:p-3 bg-slate-50/50 hover:bg-slate-50 border border-slate-150 rounded-xl shadow-3xs transition-all"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 text-slate-700 font-black flex items-center justify-center border border-slate-200 text-xs sm:text-sm">
                        🏅
                      </div>
                      <div>
                        <span className="text-[8px] sm:text-[9px] font-bold text-slate-400 block">المركز الخامس</span>
                        <span className="font-extrabold text-slate-800 text-xs sm:text-sm">
                          {leaderboardData[4].employeeName}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-left sm:text-center">
                        <span className="text-[10px] text-slate-400 block sm:inline ml-1">مجموع النقاط</span>
                        <span className="text-xs sm:text-sm font-black text-blue-700">
                          {leaderboardData[4].totalPoints} <span className="text-[9px] font-normal text-slate-400">ن</span>
                        </span>
                      </div>
                      <div className="text-left sm:text-center hidden sm:block">
                        <span className="text-xs text-slate-400 ml-1">المهام المنجزة</span>
                        <span className="text-xs font-bold text-slate-600">
                          {leaderboardData[4].taskCount} عملية
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {/* 3. Rest of the Rankings (6+) */}
            {leaderboardData.length > 5 && (
              <div className="space-y-3 pt-4">
                {/* Top Table Columns Legend */}
                <div className="hidden sm:grid grid-cols-12 text-xs font-black text-slate-400 px-4 pb-3 border-b border-slate-150">
                  <div className="col-span-2">الترتيب</div>
                  <div className="col-span-4">اسم الموظف المبادر</div>
                  <div className="col-span-3 text-center">مجموع النقاط</div>
                  <div className="col-span-3 text-center">المهام المنجزة</div>
                </div>

                {leaderboardData.slice(5).map((entry, idx) => {
                  return (
                    <motion.div
                      key={entry.employeeId}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: idx * 0.04 }}
                      className="grid grid-cols-12 items-center text-[11px] sm:text-xs p-2 sm:px-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-white transition-all"
                    >
                      {/* Rank Column */}
                      <div className="col-span-3 sm:col-span-2 flex items-center gap-2">
                        {renderRankBadge(entry.rank)}
                      </div>

                      {/* Employee Name Column */}
                      <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                        <span className="font-black text-slate-800 text-xs sm:text-xs truncate">
                          {entry.employeeName}
                        </span>
                      </div>

                      {/* Total Points */}
                      <div className="col-span-2 sm:col-span-3 text-center">
                        <span className={`text-xs sm:text-sm font-black ${
                          entry.totalPoints > 0 ? 'text-blue-700' : 'text-slate-400'
                        }`}>
                          {entry.totalPoints} <span className="text-[9px] font-medium text-slate-400">ن</span>
                        </span>
                      </div>

                      {/* Task Count */}
                      <div className="col-span-2 sm:col-span-3 text-center">
                        <span className={`text-xs sm:text-sm font-black ${
                          entry.taskCount > 0 ? 'text-slate-700' : 'text-slate-400'
                        }`}>
                          {entry.taskCount} <span className="text-[9px] font-medium text-slate-400">عمل</span>
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Decorative ranking footer quote */}
      <div className="bg-slate-50 p-4 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
        ⭐ تتم التحديثات والترتيب تلقائياً فور تسجيل أو إكمال أي مهمة جديدة من قبل المشرف.
      </div>
    </div>
  );
}

