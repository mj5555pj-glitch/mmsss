import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  PlusCircle, 
  Zap, 
  Database, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  Users, 
  Award,
  Play,
  FileText,
  Calendar
} from 'lucide-react';
import { Employee, Task, DbTaskType, PointsRules } from '../types';
import TaskRegistration from './TaskRegistration';
import ActiveTasksView from './ActiveTasksView';
import PostponedTasksView from './PostponedTasksView';
import AllTasksView from './AllTasksView';
import { isToday, formatArabicTimeOnly, calculateTaskPoints } from '../utils';

interface TaskManagementCenterProps {
  employees: Employee[];
  activeTasks: Task[];
  allTasks: Task[];
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  userRole: 'owner' | 'manager' | 'supervisor' | 'technician' | 'admin' | 'viewer';
  
  // Handlers
  onStartTask: (
    employeeId: string,
    taskType: string,
    startTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string,
    parentTaskId?: string
  ) => void;
  onCompleteTask: (id: string, endTime: string, delayReason?: string, operationDetails?: string) => void;
  onPauseTask: (id: string, reason: string) => void;
  onResumeTask: (id: string) => void;
  onCancelActiveTask: (id: string) => void;
  onRegisterCompletedTask?: (
    employeeId: string,
    taskType: string,
    startTime: string,
    endTime: string,
    notes?: string,
    subscriberName?: string,
    subscriberPhone?: string,
    assignedDate?: string
  ) => void;
  onEditActiveTask?: (updatedTask: Task) => void;
  onEditTaskHistory?: (updatedTask: Task) => void;
  onDeleteTaskHistory?: (taskId: string) => void;
  onEditSubscriber?: (oldTasks: Task[], newName: string, newPhone: string) => void | Promise<void>;
  onDeleteSubscriber?: (tasksToDelete: Task[]) => void | Promise<void>;
  onAcceptTask?: (taskId: string) => void;
  onRejectTask?: (taskId: string, reason?: string) => void;
  onApproveReopenTask?: (taskId: string) => void;
  onRejectReopenTask?: (taskId: string) => void;
  onApproveDelayReason?: (taskId: string) => void;
  onRejectDelayReason?: (taskId: string) => void;
  onApprovePauseTask?: (taskId: string) => void;
  onRejectPauseTask?: (taskId: string, reason?: string) => void;
  onPostponeTask?: (taskId: string, reason: string) => void;
  initialEmployeeId?: string;
}

export default function TaskManagementCenter({
  employees,
  activeTasks,
  allTasks,
  taskTypes,
  pointsRules,
  userRole,
  onStartTask,
  onCompleteTask,
  onPauseTask,
  onResumeTask,
  onCancelActiveTask,
  onRegisterCompletedTask,
  onEditActiveTask,
  onEditTaskHistory,
  onDeleteTaskHistory,
  onEditSubscriber,
  onDeleteSubscriber,
  onAcceptTask,
  onRejectTask,
  onApproveReopenTask,
  onRejectReopenTask,
  onApproveDelayReason,
  onRejectDelayReason,
  onApprovePauseTask,
  onRejectPauseTask,
  onPostponeTask,
  initialEmployeeId,
}: TaskManagementCenterProps) {
  const [subTab, setSubTab] = useState<'register' | 'active' | 'postponed' | 'all'>('register');

  React.useEffect(() => {
    if (initialEmployeeId) {
      setSubTab('register');
    }
  }, [initialEmployeeId]);

  // Quick stats calculations for today
  const completedToday = useMemo(() => {
    return allTasks.filter((t) => t.status === 'completed' && isToday(t.endTime));
  }, [allTasks]);

  const pointsToday = useMemo(() => {
    return completedToday.reduce((sum, t) => sum + (t.points || 0), 0);
  }, [completedToday]);

  const activeTechsCount = useMemo(() => {
    const activeEmpIds = new Set(activeTasks.map(t => t.employeeId));
    return activeEmpIds.size;
  }, [activeTasks]);

  const postponedTasksCount = useMemo(() => {
    return allTasks.filter(t => t.status === 'postponed' && !t.parentTaskId).length;
  }, [allTasks]);

  return (
    <div className="space-y-6 text-right" dir="rtl">
      
      {/* Top Banner & Quick Stats */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-blue-800/50 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
                مركز إدارة المهام والعمليات
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                محور النظام الرئيسي
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              إدارة المهام التشغيلية (Tasks Hub)
            </h1>
            <p className="text-blue-100/80 text-xs mt-1 font-medium max-w-2xl leading-relaxed">
              تسجيل المهام المباشرة، متابعة العدادات والمهام النشطة، أرشفة جميع المهام والسجلات الفنية
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 px-4 py-3 rounded-2xl flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                <Zap className="w-4 h-4" />
                <span className="text-[10px] font-bold text-slate-300">النشطة الآن</span>
              </div>
              <span className="text-xl font-black text-white font-mono">{activeTasks.length}</span>
            </div>

            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 px-4 py-3 rounded-2xl flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[10px] font-bold text-slate-300">مكتملة اليوم</span>
              </div>
              <span className="text-xl font-black text-emerald-400 font-mono">{completedToday.length}</span>
            </div>

            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 px-4 py-3 rounded-2xl flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-amber-400 mb-1">
                <Award className="w-4 h-4" />
                <span className="text-[10px] font-bold text-slate-300">نقاط اليوم</span>
              </div>
              <span className="text-xl font-black text-amber-300 font-mono">{pointsToday}</span>
            </div>

            <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 px-4 py-3 rounded-2xl flex flex-col justify-center">
              <div className="flex items-center gap-1.5 text-purple-400 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-[10px] font-bold text-slate-300">فنيون نشطون</span>
              </div>
              <span className="text-xl font-black text-purple-300 font-mono">{activeTechsCount}</span>
            </div>
          </div>
        </div>

        {/* Sub-tab Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => setSubTab('register')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'register'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-blue-300" />
            <span>1. تسجيل مهمة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('active')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'active'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>2. المهام النشطة</span>
            {activeTasks.length > 0 && (
              <span className="bg-amber-500 text-slate-900 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {activeTasks.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('postponed')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'postponed'
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4 text-purple-300" />
            <span>3. المهام المؤجلة</span>
            {postponedTasksCount > 0 && (
              <span className="bg-purple-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {postponedTasksCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('all')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              subTab === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Database className="w-4 h-4 text-emerald-300" />
            <span>4. جميع المهام والسجلات</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: TASK REGISTRATION */}
      {subTab === 'register' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
          <TaskRegistration
            employees={employees}
            activeTasks={activeTasks}
            allTasks={allTasks}
            taskTypes={taskTypes}
            pointsRules={pointsRules}
            onStartTask={onStartTask}
            onCompleteTask={onCompleteTask}
            onPauseTask={onPauseTask}
            onResumeTask={onResumeTask}
            onCancelActiveTask={onCancelActiveTask}
            onRegisterCompletedTask={onRegisterCompletedTask}
            userRole={userRole as any}
            onEditActiveTask={onEditActiveTask}
            hideActiveTasksList={true}
            initialEmployeeId={initialEmployeeId}
          />
        </div>
      )}

      {/* SUB-TAB 2: ACTIVE TASKS */}
      {subTab === 'active' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
          <ActiveTasksView
            employees={employees}
            activeTasks={activeTasks}
            allTasks={allTasks}
            taskTypes={taskTypes}
            pointsRules={pointsRules}
            onStartTask={onStartTask}
            onCompleteTask={onCompleteTask}
            onPauseTask={onPauseTask}
            onResumeTask={onResumeTask}
            onCancelActiveTask={onCancelActiveTask}
            userRole={userRole as any}
            onEditActiveTask={onEditActiveTask}
            onAcceptTask={onAcceptTask}
            onRejectTask={onRejectTask}
            onApproveReopenTask={onApproveReopenTask}
            onRejectReopenTask={onRejectReopenTask}
            onApproveDelayReason={onApproveDelayReason}
            onRejectDelayReason={onRejectDelayReason}
            onApprovePauseTask={onApprovePauseTask}
            onRejectPauseTask={onRejectPauseTask}
            onPostponeTask={onPostponeTask}
          />
        </div>
      )}

      {/* SUB-TAB 3: POSTPONED TASKS */}
      {subTab === 'postponed' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
          <PostponedTasksView
            tasks={allTasks}
            employees={employees}
            taskTypes={taskTypes}
            pointsRules={pointsRules}
            userRole={userRole as any}
            onEditActiveTask={onEditActiveTask}
            onDeleteTask={onDeleteTaskHistory || onCancelActiveTask}
            onStartTask={onStartTask}
          />
        </div>
      )}

      {/* SUB-TAB 4: ALL TASKS */}
      {subTab === 'all' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs">
          <AllTasksView
            tasks={allTasks}
            employees={employees}
            taskTypes={taskTypes}
            userRole={userRole as any}
            onStartTask={onStartTask}
            onEditTaskHistory={onEditTaskHistory}
            onDeleteTaskHistory={onDeleteTaskHistory}
            onEditSubscriber={onEditSubscriber}
            onDeleteSubscriber={onDeleteSubscriber}
            onApproveReopenTask={onApproveReopenTask}
            onRejectReopenTask={onRejectReopenTask}
            onApproveDelayReason={onApproveDelayReason}
            onRejectDelayReason={onRejectDelayReason}
          />
        </div>
      )}

    </div>
  );
}
