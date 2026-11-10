import React from 'react';
import { Users, CheckCircle2, Zap, Trophy } from 'lucide-react';
import { motion } from 'motion/react';

interface StatsProps {
  employeeCount: number;
  activeTasksCount: number;
  completedTasksTodayCount: number;
  totalPoints: number;
}

export default function DashboardStatsCard({
  employeeCount,
  activeTasksCount,
  completedTasksTodayCount,
  totalPoints
}: StatsProps) {
  
  const statsList = [
    {
      id: 'stat-employees',
      title: 'عدد الموظفين',
      value: `${employeeCount} فنيين`,
      desc: 'إجمالي الكادر الفني المسجل في النظام',
      icon: Users,
      textColor: 'text-blue-700',
      bgColor: 'bg-blue-50',
      badge: `${employeeCount} نشط`,
      badgeColor: 'text-blue-600 bg-blue-50'
    },
    {
      id: 'stat-active-tasks',
      title: 'المهام الجارية',
      value: `${activeTasksCount} مهام`,
      desc: 'مهام قيد التنفيذ والمتابعة الآن بالميدان',
      icon: Zap,
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      badge: 'مباشر',
      badgeColor: 'text-amber-600 bg-amber-50 animate-pulse'
    },
    {
      id: 'stat-completed-today',
      title: 'المهام المنجزة اليوم',
      value: `${completedTasksTodayCount} مهام`,
      desc: 'المهام التي تم إكمالها وتسجيلها هذا اليوم',
      icon: CheckCircle2,
      textColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      badge: 'اليوم',
      badgeColor: 'text-emerald-600 bg-emerald-50'
    },
    {
      id: 'stat-total-points',
      title: '⭐ نقاط اليوم',
      value: `${totalPoints} نقطة`,
      desc: 'إجمالي النقاط المكتسبة خلال اليوم الإداري الحالي.',
      icon: Trophy,
      textColor: 'text-purple-600',
      bgColor: 'bg-purple-50',
      badge: 'اليوم',
      badgeColor: 'text-purple-600 bg-purple-50'
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" dir="rtl">
      {statsList.map((stat, index) => {
        const Icon = stat.icon;
        
        return (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="bg-white p-2.5 sm:p-3.5 rounded-xl shadow-xs border border-slate-100 flex flex-col justify-between hover:border-slate-200 hover:shadow-xs transition-all h-[95px] sm:h-[105px]"
          >
            <div>
              <div className="flex items-center justify-between gap-1 mb-1 sm:mb-1.5">
                <span className="text-[10px] sm:text-[11px] text-slate-500 font-bold block truncate">{stat.title}</span>
                <span className={`text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 rounded-md font-bold leading-none shrink-0 ${stat.badgeColor}`}>
                  {stat.badge}
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 sm:mt-1">
                <div className={`w-6.5 h-6.5 sm:w-7.5 sm:h-7.5 rounded-lg ${stat.bgColor} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${stat.textColor}`} />
                </div>
                <span className="text-sm sm:text-base font-black text-slate-800 tracking-tight leading-none truncate">
                  {stat.value}
                </span>
              </div>
            </div>
            
            <div className="text-[9px] sm:text-[10px] text-slate-400 font-medium mt-1.5 pt-1.5 sm:mt-2 sm:pt-2 border-t border-slate-100/80 truncate">
              {stat.desc}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
