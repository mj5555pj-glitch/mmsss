import React, { useState, useMemo } from 'react';
import { FileSpreadsheet, Search, Filter, Trash2, ShieldAlert, Pencil, X, AlertCircle, ChevronRight, Award, Trophy, Star, Clock, Gift, Ban, CheckCircle2, User } from 'lucide-react';
import { Task, Employee, TaskType, ManualPointsRecord, DbTaskType, PointsRules, TaskEditLog } from '../types';
import { 
  formatDate, 
  formatDuration, 
  isToday, 
  isThisWeek, 
  isThisMonth, 
  exportTasksToExcel, 
  formatArabicDateOnly, 
  formatArabicTimeOnly,
  formatMsToHMS,
  toLocalInputString,
  calculateTaskPoints
} from '../utils';
import { motion, AnimatePresence } from 'motion/react';

const formatTasksCount = (count: number) => {
  if (count === 1) return "1 مهمة";
  if (count === 2) return "2 مهمة";
  if (count >= 3 && count <= 10) return `${count} مهام`;
  return `${count} مهمة`;
};

const formatPoints = (points: number) => {
  if (points > 0) return `+${points} نقطة`;
  if (points < 0) return `${points} نقطة`;
  return `0 نقطة`;
};

const renderRank = (rank: number) => {
  if (rank === 1) return <span className="flex items-center justify-center gap-1">🥇 <span className="font-mono">1</span></span>;
  if (rank === 2) return <span className="flex items-center justify-center gap-1">🥈 <span className="font-mono">2</span></span>;
  if (rank === 3) return <span className="flex items-center justify-center gap-1">🥉 <span className="font-mono">3</span></span>;
  return <span className="font-mono">{rank}</span>;
};

interface ReportsViewProps {
  tasks: Task[];
  onDeleteTaskHistory: (id: string) => void;
  onEditTaskHistory: (updatedTask: Task) => void;
  userRole: 'owner' | 'supervisor' | 'manager' | 'technician' | 'admin' | 'viewer';
  employees?: Employee[];
  manualPoints?: ManualPointsRecord[];
  onDeleteManualPoint?: (id: string) => void;
  onEditManualPoint?: (id: string, points: number, reason: string) => void;
  onApproveDelayReason?: (id: string) => void;
  onRejectDelayReason?: (id: string) => void;
  taskTypes?: DbTaskType[];
  pointsRules?: PointsRules;
  currentUsername?: string;
}

export default function ReportsView({ 
  tasks, 
  onDeleteTaskHistory, 
  onEditTaskHistory, 
  userRole, 
  employees, 
  manualPoints,
  onDeleteManualPoint,
  onEditManualPoint,
  taskTypes = [],
  pointsRules,
  currentUsername = 'المدير'
}: ReportsViewProps) {
  // Filters and navigation states
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [periodFilter, setPeriodFilter] = useState<'daily' | 'weekly' | 'monthly' | 'all'>('daily');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeReportSubTab, setActiveReportSubTab] = useState<'reports' | 'leaderboard'>('reports');

  const handleBackToAll = () => {
    setSelectedEmployeeId(null);
    setSearchQuery('');
  };

  // Show a deletion confirm prompt
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDeleteManualConfirm, setShowDeleteManualConfirm] = useState<string | null>(null);
  const [editingManualPoint, setEditingManualPoint] = useState<any | null>(null);
  const [editManualPointsValue, setEditManualPointsValue] = useState(0);
  const [editManualReason, setEditManualReason] = useState('');

  // Show an editing modal
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Expanded logs list toggle state
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  const toggleLogs = (id: string) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Form states for Editing Task
  const [editEmployeeId, setEditEmployeeId] = useState('');
  const [editTaskType, setEditTaskType] = useState<string>('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editTotalPausedMs, setEditTotalPausedMs] = useState(0);
  const [editPauseReason, setEditPauseReason] = useState('');
  const [editPoints, setEditPoints] = useState(0);
  const [editStatus, setEditStatus] = useState<'active' | 'paused' | 'completed'>('completed');
  const [editAssignedDate, setEditAssignedDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSubscriberName, setEditSubscriberName] = useState('');
  const [editSubscriberPhone, setEditSubscriberPhone] = useState('');

  // New Task Edit properties requested by user
  const [editPointsDeducted, setEditPointsDeducted] = useState(0);
  const [editDeductionReason, setEditDeductionReason] = useState('');
  const [editReason, setEditReason] = useState(''); // Optional reason for the edit log
  const [editDurationMinutes, setEditDurationMinutes] = useState(0); // For direct duration editing

  const [error, setError] = useState('');

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditEmployeeId(task.employeeId);
    setEditTaskType(task.taskType);
    setEditStartTime(task.startTime ? toLocalInputString(new Date(task.startTime)) : '');
    setEditEndTime(task.endTime ? toLocalInputString(new Date(task.endTime)) : '');
    setEditTotalPausedMs(Math.max(0, Math.round((task.totalPausedMs || 0) / 60000))); // store as minutes
    setEditPauseReason(task.pauseReason || '');
    setEditPoints(task.originalPoints || task.points);
    setEditStatus(task.status);
    
    // Set points deducted & reason
    setEditPointsDeducted(task.pointsDeducted || 0);
    setEditDeductionReason(task.deductionReason || '');
    setEditReason(''); // Reset edit reason field

    // Format date for <input type="date"> (YYYY-MM-DD)
    const dateVal = task.assignedDate ? task.assignedDate.slice(0, 10) : (task.startTime ? task.startTime.slice(0, 10) : '');
    setEditAssignedDate(dateVal);
    setEditNotes(task.notes || '');
    setEditSubscriberName(task.subscriberName || '');
    setEditSubscriberPhone(task.subscriberPhone || '');

    // Set initial duration in minutes
    const start = new Date(task.startTime).getTime();
    const end = task.endTime ? new Date(task.endTime).getTime() : start;
    const pausedMs = (task.totalPausedMs || 0);
    const activeMs = (end - start) - pausedMs;
    const mins = Math.max(0, Math.round(activeMs / 60000));
    setEditDurationMinutes(mins);

    setError('');
  };

  const handleDateChange = (newDateStr: string) => {
    setEditAssignedDate(newDateStr);
    if (!newDateStr) return;

    // Update the date portion of editStartTime while preserving time
    if (editStartTime) {
      const timePart = editStartTime.split('T')[1] || '08:00';
      setEditStartTime(`${newDateStr}T${timePart}`);
    } else {
      setEditStartTime(`${newDateStr}T08:00`);
    }

    // Update the date portion of editEndTime while preserving time
    if (editEndTime) {
      const timePart = editEndTime.split('T')[1] || '09:00';
      setEditEndTime(`${newDateStr}T${timePart}`);
    }
  };

  // Automated points recalculation helper using taskTypes and pointsRules
  const handleAutoRecalculatePoints = (
    type: string,
    startStr: string,
    endStr: string,
    pausedMins: number
  ) => {
    if (!startStr || !endStr) return;
    try {
      const start = new Date(startStr).getTime();
      const end = new Date(endStr).getTime();
      const pausedMs = pausedMins * 60000;
      const durationMs = (end - start) - pausedMs;
      const durationMinutes = Math.max(0, Math.round(durationMs / 60000));
      const calculated = calculateTaskPoints(type, durationMinutes, taskTypes, pointsRules);
      setEditPoints(calculated);
    } catch (e) {
      console.error(e);
    }
  };

  // Direct duration editing - updates endTime and recalculates points
  const handleDurationChange = (newMins: number) => {
    setEditDurationMinutes(newMins);
    if (!editStartTime) return;
    
    const startMs = new Date(editStartTime).getTime();
    const pausedMs = editTotalPausedMs * 60000;
    const newEndMs = startMs + (newMins * 60000) + pausedMs;
    const newEndStr = toLocalInputString(new Date(newEndMs));
    setEditEndTime(newEndStr);
    
    // Recalculate points automatically
    handleAutoRecalculatePoints(editTaskType, editStartTime, newEndStr, editTotalPausedMs);
  };

  // Direct start time editing - updates end time to preserve duration and recalculates points
  const handleStartTimeChange = (newStartStr: string) => {
    setEditStartTime(newStartStr);
    if (!newStartStr) return;
    
    const startMs = new Date(newStartStr).getTime();
    const pausedMs = editTotalPausedMs * 60000;
    const newEndMs = startMs + (editDurationMinutes * 60000) + pausedMs;
    const newEndStr = toLocalInputString(new Date(newEndMs));
    setEditEndTime(newEndStr);
    
    handleAutoRecalculatePoints(editTaskType, newStartStr, newEndStr, editTotalPausedMs);
  };

  // Direct end time editing - updates duration minutes and recalculates points
  const handleEndTimeChange = (newEndStr: string) => {
    setEditEndTime(newEndStr);
    if (!editStartTime || !newEndStr) return;
    
    const startMs = new Date(editStartTime).getTime();
    const endMs = new Date(newEndStr).getTime();
    const pausedMs = editTotalPausedMs * 60000;
    const newMins = Math.max(0, Math.round((endMs - startMs - pausedMs) / 60000));
    setEditDurationMinutes(newMins);
    
    handleAutoRecalculatePoints(editTaskType, editStartTime, newEndStr, editTotalPausedMs);
  };

  // Direct paused time editing - updates end time to preserve duration and recalculates points
  const handlePausedMinsChange = (newPausedMins: number) => {
    setEditTotalPausedMs(newPausedMins);
    if (!editStartTime) return;
    
    const startMs = new Date(editStartTime).getTime();
    const pausedMs = newPausedMins * 60000;
    const newEndMs = startMs + (editDurationMinutes * 60000) + pausedMs;
    const newEndStr = toLocalInputString(new Date(newEndMs));
    setEditEndTime(newEndStr);
    
    handleAutoRecalculatePoints(editTaskType, editStartTime, newEndStr, newPausedMins);
  };

  const handleSaveEdit = () => {
    if (!editingTask) return;
    setError('');

    if (!editEmployeeId) {
      setError('يرجى اختيار اسم الفني.');
      return;
    }

    if (!editStartTime) {
      setError('يرجى تحديد وقت البدء.');
      return;
    }

    if (editStatus === 'completed' && !editEndTime) {
      setError('يرجى تحديد وقت الانتهاء للمهمة المكتملة.');
      return;
    }

    // Find employee name from editEmployeeId
    const selectedEmployee = employees?.find(e => e.id === editEmployeeId);
    const employeeName = selectedEmployee ? selectedEmployee.name : editingTask.employeeName;

    // Convert start and end times back to ISO strings
    const startISO = new Date(editStartTime).toISOString();
    const endISO = (editStatus === 'completed' && editEndTime) 
      ? new Date(editEndTime).toISOString() 
      : undefined;

    // If status is paused and it wasn't paused before, set pausedAt
    let pausedAt = editingTask.pausedAt;
    if (editStatus === 'paused' && editingTask.status !== 'paused') {
      pausedAt = new Date().toISOString();
    } else if (editStatus !== 'paused') {
      pausedAt = undefined;
    }

    // Build change log list
    const changesList: string[] = [];
    if (editingTask.employeeId !== editEmployeeId) {
      changesList.push(`تغيير الموظف من (${editingTask.employeeName}) إلى (${employeeName})`);
    }
    if (editingTask.taskType !== editTaskType) {
      changesList.push(`تغيير نوع المهمة من (${editingTask.taskType}) إلى (${editTaskType})`);
    }
    if (editingTask.startTime !== startISO) {
      changesList.push(`تعديل وقت البدء`);
    }
    if (editingTask.endTime !== endISO) {
      changesList.push(`تعديل وقت الانتهاء`);
    }
    if (editingTask.points !== Number(editPoints)) {
      changesList.push(`تعديل النقاط المكتسبة من (${editingTask.points}) إلى (${editPoints})`);
    }
    if ((editingTask.pointsDeducted || 0) !== Number(editPointsDeducted)) {
      changesList.push(`تعديل النقاط المخصومة من (${editingTask.pointsDeducted || 0}) إلى (${editPointsDeducted})`);
    }
    if (editingTask.deductionReason !== editDeductionReason) {
      changesList.push(`تعديل سبب الخصم إلى (${editDeductionReason || 'بدون سبب'})`);
    }
    if (editingTask.notes !== editNotes) {
      changesList.push(`تعديل الملاحظات`);
    }
    
    const taskAssignedDateISO = editingTask.assignedDate ? new Date(editingTask.assignedDate).toISOString().slice(0, 10) : '';
    const newAssignedDateISO = editAssignedDate ? new Date(editAssignedDate).toISOString().slice(0, 10) : '';
    if (taskAssignedDateISO !== newAssignedDateISO) {
      changesList.push(`تعديل تاريخ المهمة`);
    }

    let updatedLogs = editingTask.editLogs || [];
    if (changesList.length > 0) {
      const newLog: TaskEditLog = {
        id: `log-${Date.now()}`,
        editedBy: currentUsername || 'المدير',
        editedAt: new Date().toISOString(),
        changes: changesList.join('، '),
        reason: editReason || undefined
      };
      updatedLogs = [...updatedLogs, newLog];
    }

    const updatedTask: Task = {
      ...editingTask,
      employeeId: editEmployeeId,
      employeeName,
      taskType: editTaskType,
      startTime: startISO,
      endTime: endISO,
      status: editStatus,
      points: Number(editPoints),
      pointsDeducted: Number(editPointsDeducted),
      deductionReason: editDeductionReason || undefined,
      totalPausedMs: Number(editTotalPausedMs) * 60000,
      pauseReason: editPauseReason || undefined,
      assignedDate: editAssignedDate ? new Date(editAssignedDate).toISOString() : undefined,
      notes: editNotes || undefined,
      subscriberName: editSubscriberName || undefined,
      subscriberPhone: editSubscriberPhone || undefined,
      pausedAt,
      editLogs: updatedLogs
    };

    onEditTaskHistory(updatedTask);
    setEditingTask(null);
  };

  // Compute summaries of all technicians for the main summary screen
  const technicianSummaries = useMemo(() => {
    const statsMap: Record<string, {
      id: string;
      name: string;
      avatarUrl?: string;
      completedCount: number;
      gainedPoints: number;
      deductedPoints: number;
      totalPausedMs: number;
      activeCount: number;
      giftPoints: number;
      penaltyPoints: number;
      delayMinutes: number;
    }> = {};

    // Initialize with employees prop to ensure all registered employees show up even if they have no tasks
    const employeeList = employees || [];
    employeeList.forEach((emp) => {
      statsMap[emp.id] = {
        id: emp.id,
        name: emp.name,
        avatarUrl: emp.avatarUrl,
        completedCount: 0,
        gainedPoints: 0,
        deductedPoints: 0,
        totalPausedMs: 0,
        activeCount: 0,
        giftPoints: 0,
        penaltyPoints: 0,
        delayMinutes: 0,
      };
    });

    // Populate with all tasks in the system
    tasks.forEach((task) => {
      const empId = task.employeeId;
      if (!statsMap[empId]) {
        statsMap[empId] = {
          id: empId,
          name: task.employeeName,
          completedCount: 0,
          gainedPoints: 0,
          deductedPoints: 0,
          totalPausedMs: 0,
          activeCount: 0,
          giftPoints: 0,
          penaltyPoints: 0,
          delayMinutes: 0,
        };
      }

      const stat = statsMap[empId];

      if (task.status === 'completed') {
        let matchesPeriod = true;
        const dateStr = task.endTime || task.startTime;
        if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
        else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
        else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

        if (matchesPeriod) {
          stat.completedCount += 1;
          
          // Calculate delay minutes
          const start = new Date(task.startTime).getTime();
          const end = new Date(task.endTime || task.startTime).getTime();
          const durationMinutes = Math.max(0, Math.round(((end - start) - (task.totalPausedMs || 0)) / 60000));
          
          const taskTypeObj = taskTypes.find(t => t.id === task.taskType || t.name === task.taskType);
          const freeMinutes = taskTypeObj?.freeMinutes ?? (task.taskType === 'تنصيب' ? 45 : task.taskType === 'صيانة' ? 30 : 60);
          
          if (durationMinutes > freeMinutes) {
            stat.delayMinutes += (durationMinutes - freeMinutes);
          }

          if (task.points > 0) {
            stat.gainedPoints += task.points;
          }
          
          if (task.pointsDeducted && task.pointsDeducted > 0) {
            stat.deductedPoints += task.pointsDeducted;
            stat.penaltyPoints += task.pointsDeducted;
          }
          
          if (task.totalPausedMs) {
            stat.totalPausedMs += task.totalPausedMs;
          }
        }
      } else {
        // Active tasks count (unaffected by period filter to show current workload)
        stat.activeCount += 1;
      }
    });

    // Populate with manual points
    const manualPointsList = manualPoints || [];
    manualPointsList.forEach((mp) => {
      const empId = mp.employeeId;
      if (!statsMap[empId]) {
        statsMap[empId] = {
          id: empId,
          name: mp.employeeName,
          completedCount: 0,
          gainedPoints: 0,
          deductedPoints: 0,
          totalPausedMs: 0,
          activeCount: 0,
          giftPoints: 0,
          penaltyPoints: 0,
          delayMinutes: 0,
        };
      }

      const stat = statsMap[empId];
      let matchesPeriod = true;
      const dateStr = mp.timestamp;
      if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
      else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
      else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

      if (matchesPeriod) {
        if (mp.type === 'gift') {
          stat.giftPoints += mp.points;
          stat.gainedPoints += mp.points;
        } else {
          stat.penaltyPoints += mp.points;
          stat.deductedPoints += mp.points;
        }
      }
    });

    const sorted = Object.values(statsMap).map((stat) => {
      const totalPausedMinutes = Math.round(stat.totalPausedMs / 60000);
      const netPoints = stat.gainedPoints - stat.penaltyPoints;
      return {
        ...stat,
        totalPausedMinutes,
        netPoints,
      };
    }).sort((a, b) => {
      if (b.netPoints !== a.netPoints) {
        return b.netPoints - a.netPoints;
      }
      return b.completedCount - a.completedCount;
    });

    // Calculate ranks, handling ties properly
    let currentRank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (curr.netPoints < prev.netPoints || (curr.netPoints === prev.netPoints && curr.completedCount < prev.completedCount)) {
          currentRank = i + 1;
        }
      }
      (sorted[i] as any).rank = currentRank;
    }

    return sorted;
  }, [employees, tasks, manualPoints, periodFilter, taskTypes]);

  // Selected employee metadata
  const selectedEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    if (selectedEmployeeId === 'all') {
      return { id: 'all', name: 'جميع الفنيين', code: 'all' } as any;
    }
    return employees?.find((e) => e.id === selectedEmployeeId) || 
           technicianSummaries.find((e) => e.id === selectedEmployeeId);
  }, [employees, technicianSummaries, selectedEmployeeId]);

  // All tasks for the selected technician
  const techTasks = useMemo(() => {
    if (!selectedEmployeeId) return [];
    if (selectedEmployeeId === 'all') return tasks;
    return tasks.filter((t) => t.employeeId === selectedEmployeeId);
  }, [tasks, selectedEmployeeId]);

  // Selected technician's active tasks (running or paused)
  const techActiveTasks = useMemo(() => {
    return techTasks.filter((t) => t.status === 'active' || t.status === 'paused' || t.status === 'pending');
  }, [techTasks]);

  // Selected technician's archived tasks (completed or rejected)
  const techArchivedTasks = useMemo(() => {
    return techTasks.filter((t) => t.status === 'completed' || t.status === 'rejected');
  }, [techTasks]);

  // Selected technician's completed tasks
  const techCompletedTasks = useMemo(() => {
    return techTasks.filter((t) => t.status === 'completed');
  }, [techTasks]);

  // Filtered completed tasks for the selected technician matching period & search query
  const techFilteredCompletedTasks = useMemo(() => {
    return techCompletedTasks.filter((task) => {
      // Period filter
      let matchesPeriod = true;
      const dateStr = task.endTime || task.startTime;
      if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
      else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
      else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

      if (!matchesPeriod) return false;

      // Search query filter
      if (searchQuery.trim() === '') return true;
      const query = searchQuery.toLowerCase();
      return (
        task.taskType.toLowerCase().includes(query) ||
        (task.notes && task.notes.toLowerCase().includes(query)) ||
        (task.subscriberName && task.subscriberName.toLowerCase().includes(query)) ||
        (task.subscriberPhone && task.subscriberPhone.toLowerCase().includes(query))
      );
    });
  }, [techCompletedTasks, periodFilter, searchQuery]);

  // Combined tasks and manual points
  const techFilteredCompletedAndManualItems = useMemo(() => {
    const isAll = selectedEmployeeId === 'all';
    const items: (Task & { isManual?: boolean; type?: 'gift' | 'penalty'; adminName?: string; timestamp?: string })[] = [
      ...techArchivedTasks.map(t => ({ ...t, isManual: false })),
      ...(manualPoints || [])
        .filter(mp => isAll || mp.employeeId === selectedEmployeeId)
        .map(mp => ({
          id: mp.id,
          employeeId: mp.employeeId,
          employeeName: mp.employeeName,
          taskType: mp.type === 'gift' ? '🎁 إضافة نقاط هدية' : '⚠️ خصم نقاط عقوبة',
          startTime: mp.timestamp,
          endTime: mp.timestamp,
          status: 'completed' as const,
          points: mp.type === 'gift' ? mp.points : -mp.points,
          notes: mp.reason,
          isManual: true,
          type: mp.type,
          adminName: mp.adminName,
          timestamp: mp.timestamp
        }))
    ];

    return items.filter((item) => {
      // Period filter
      let matchesPeriod = true;
      const dateStr = item.startTime;
      if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
      else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
      else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

      if (!matchesPeriod) return false;

      // Search query filter
      if (searchQuery.trim() === '') return true;
      const query = searchQuery.toLowerCase();
      return (
        item.taskType.toLowerCase().includes(query) ||
        (item.notes && item.notes.toLowerCase().includes(query)) ||
        (item.subscriberName && item.subscriberName.toLowerCase().includes(query)) ||
        (item.subscriberPhone && item.subscriberPhone.toLowerCase().includes(query)) ||
        (isAll && item.employeeName && item.employeeName.toLowerCase().includes(query))
      );
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [techCompletedTasks, manualPoints, selectedEmployeeId, periodFilter, searchQuery]);

  // Statistics for the selected technician specifically
  const selectedTechStats = useMemo(() => {
    if (!selectedEmployeeId) return null;
    const isAll = selectedEmployeeId === 'all';
    
    // Calculate stats specifically for the selected period
    let completedCount = 0;
    let gainedPoints = 0;
    let deductedPoints = 0;
    let totalPausedMs = 0;
    let totalDelayMinutes = 0;
    let maintenanceCount = 0;
    let installationCount = 0;
    let collectionCount = 0;
    let clickCount = 0;

    techCompletedTasks.forEach((task) => {
      let matchesPeriod = true;
      const dateStr = task.endTime || task.startTime;
      if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
      else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
      else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

      if (matchesPeriod) {
        completedCount += 1;
        if (task.points > 0) {
          gainedPoints += task.points;
        } else if (task.points < 0) {
          deductedPoints += Math.abs(task.points);
        }
        if (task.totalPausedMs) {
          totalPausedMs += task.totalPausedMs;
        }

        // Calculate delay minutes
        const start = new Date(task.startTime).getTime();
        const end = new Date(task.endTime || task.startTime).getTime();
        const durationMinutes = Math.max(0, Math.round(((end - start) - (task.totalPausedMs || 0)) / 60000));
        
        const taskTypeObj = taskTypes.find(t => t.id === task.taskType || t.name === task.taskType);
        const freeMinutes = taskTypeObj?.freeMinutes ?? (task.taskType === 'تنصيب' ? 45 : task.taskType === 'صيانة' ? 30 : 60);
        
        if (durationMinutes > freeMinutes) {
          totalDelayMinutes += (durationMinutes - freeMinutes);
        }

        if (task.taskType === TaskType.Maintenance) maintenanceCount += 1;
        else if (task.taskType === TaskType.Installation) installationCount += 1;
        else if (task.taskType === TaskType.Collection) collectionCount += 1;
        else if (task.taskType === TaskType.Click) clickCount += 1;
      }
    });

    const techManualPoints = (manualPoints || []).filter(mp => isAll || mp.employeeId === selectedEmployeeId);
    techManualPoints.forEach((mp) => {
      let matchesPeriod = true;
      const dateStr = mp.timestamp;
      if (periodFilter === 'daily') matchesPeriod = isToday(dateStr);
      else if (periodFilter === 'weekly') matchesPeriod = isThisWeek(dateStr);
      else if (periodFilter === 'monthly') matchesPeriod = isThisMonth(dateStr);

      if (matchesPeriod) {
        if (mp.type === 'gift') {
          gainedPoints += mp.points;
        } else {
          deductedPoints += mp.points;
        }
      }
    });

    const activeCount = techActiveTasks.length;
    const totalPausedMinutes = Math.round(totalPausedMs / 60000);
    const netPoints = gainedPoints - deductedPoints;

    return {
      completedCount,
      gainedPoints,
      deductedPoints,
      netPoints,
      totalPausedMinutes,
      totalDelayMinutes,
      activeCount,
      maintenanceCount,
      installationCount,
      collectionCount,
      clickCount
    };
  }, [selectedEmployeeId, techCompletedTasks, techActiveTasks, manualPoints, periodFilter, taskTypes]);

  // Overall statistics max completed for achievement ratio calculations
  const maxCompleted = useMemo(() => {
    return Math.max(...technicianSummaries.map((s) => s.completedCount), 0);
  }, [technicianSummaries]);

  const handleExport = () => {
    if (selectedEmployeeId) {
      exportTasksToExcel(techTasks, periodFilter, employees, manualPoints);
    } else {
      exportTasksToExcel(tasks, periodFilter, employees, manualPoints);
    }
  };

  const periodLabels = {
    all: 'الكامل (كل الأوقات)',
    daily: 'اليوم',
    weekly: 'هذا الأسبوع',
    monthly: 'هذا الشهر',
  };

  const getArabicRankLabel = (rank: number) => {
    const labels: Record<number, string> = {
      1: 'الأول',
      2: 'الثاني',
      3: 'الثالث',
      4: 'الرابع',
      5: 'الخامس',
      6: 'السادس',
      7: 'السابع',
      8: 'الثامن',
      9: 'التاسع',
      10: 'العاشر'
    };
    return labels[rank] || `المركز ${rank}`;
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden" dir="rtl">

      {selectedEmployeeId === null ? (
        /* ======================== 1. MAIN SCREEN: TECHNICIAN DIRECTORY LIST ======================== */
        <div className="p-6 space-y-6">
            <div>
              <h2 className="text-base font-black text-slate-850 flex items-center gap-2 justify-start">
                <span className="p-2 bg-blue-50 text-blue-700 rounded-xl">👤</span>
                <span>قائمة فنيي النظام</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">اختر فنيًا أدناه لفتح صفحة تقريره الخاصة، أو اختر "جميع الفنيين" لعرض تقرير شامل.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Static "📋 جميع الفنيين" card */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setSelectedEmployeeId('all');
                  setSearchQuery('');
                }}
                className="bg-blue-50/60 hover:bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:shadow-md group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">📋</span>
                  <span className="font-extrabold text-blue-900 text-sm">جميع الفنيين</span>
                </div>
                <ChevronRight className="w-4 h-4 text-blue-600 group-hover:translate-x-[-4px] transition-transform rotate-180" />
              </motion.div>

              {/* Individual Technician cards */}
              {employees?.map((emp) => {
                return (
                  <motion.div
                    key={emp.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedEmployeeId(emp.id);
                      setSearchQuery('');
                    }}
                    className="bg-white hover:bg-slate-50 border border-slate-200/80 p-4 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:shadow-md group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">👤</span>
                      <span className="font-extrabold text-slate-800 text-sm">{emp.name}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-[-4px] transition-transform rotate-180" />
                  </motion.div>
                );
              })}
            </div>
          </div>
      ) : (
        /* ======================== 2. DEDICATED SCREEN: SINGLE TECHNICIAN DETAIL VIEW ======================== */
        <div className="p-6 space-y-6">
          {/* Subheader Toolbar & Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-100">
            <div className="flex flex-wrap items-center gap-3">
              {/* Back to All Technicians Button */}
              <button
                type="button"
                onClick={handleBackToAll}
                className="flex items-center gap-1.5 font-bold text-xs bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
                <span>جميع الفنيين</span>
              </button>

              <div className="min-w-0">
                <h2 className="text-base font-black text-slate-800 flex items-center gap-1.5">
                  <span>تقرير وأداء الفني:</span>
                  <span className="text-blue-700">{selectedEmployee?.name}</span>
                </h2>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">تفاصيل المهام الجارية والمنجزة وسجلات العمليات الفردية</p>
              </div>
            </div>

            {/* Export specific user report */}
            <button
              type="button"
              onClick={handleExport}
              disabled={techTasks.length === 0}
              className={`flex items-center gap-1.5 font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer ${
                techTasks.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير تقرير {selectedEmployee?.name} (.xlsx)</span>
            </button>
          </div>

          {/* Technician Specific Scorecards Grid */}
          {selectedTechStats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Completed count */}
              <div className="bg-slate-50 border border-slate-150 p-3 rounded-xl flex flex-col justify-between text-right">
                <span className="text-[10px] text-slate-500 font-bold block mb-1">📋 مهام مكتملة ({periodLabels[periodFilter]})</span>
                <span className="text-base font-black text-slate-800">{selectedTechStats.completedCount}</span>
              </div>

              {/* Net score */}
              <div className="bg-blue-600 text-white p-3 rounded-xl shadow-xs flex flex-col justify-between text-right">
                <span className="text-[10px] opacity-95 font-bold block mb-1">💯 صافي التقييم</span>
                <span className="text-base font-black">{selectedTechStats.netPoints} نقطة</span>
              </div>

              {/* Gained points */}
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex flex-col justify-between text-right">
                <span className="text-[10px] text-emerald-600 font-bold block mb-1">⭐ نقاط مكتسبة</span>
                <span className="text-base font-black text-emerald-800">+{selectedTechStats.gainedPoints}</span>
              </div>

              {/* Deducted points */}
              <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex flex-col justify-between text-right">
                <span className="text-[10px] text-rose-600 font-bold block mb-1">➖ نقاط مخصومة</span>
                <span className="text-base font-black text-rose-800">-{selectedTechStats.deductedPoints}</span>
              </div>

              {/* Delay time */}
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex flex-col justify-between text-right">
                <span className="text-[10px] text-amber-600 font-bold block mb-1">⏱️ مجموع دقائق التأخير</span>
                <span className="text-base font-black text-amber-800 font-mono">{selectedTechStats.totalDelayMinutes} دقيقة</span>
              </div>

              {/* Active count */}
              <div className="bg-slate-800 text-white p-3 rounded-xl flex flex-col justify-between text-right">
                <span className="text-[10px] opacity-90 font-bold block mb-1">⚙️ المهام الجارية الحالية</span>
                <span className="text-base font-black">{selectedTechStats.activeCount} مهام</span>
              </div>
            </div>
          )}

          {/* ACTIVE TASKS SECTION */}
          {techActiveTasks.length > 0 && (
            <div className="bg-amber-50/50 rounded-2xl border border-amber-150 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 font-bold text-xs">
                <span className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></span>
                <span>المهام الميدانية الجارية الآن ({techActiveTasks.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {techActiveTasks.map((task) => (
                  <div key={task.id} className="bg-white rounded-xl border border-amber-100 p-3.5 shadow-xs relative flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-black">
                        {task.taskType}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500" dir="rtl">
                        بدأت: {formatArabicTimeOnly(task.startTime)}
                      </span>
                    </div>
                    {task.subscriberName && (
                      <div className="text-xs font-black text-slate-800">
                        👤 المشترك: {task.subscriberName}
                      </div>
                    )}
                    {task.notes && (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded leading-relaxed">
                        {task.notes}
                      </p>
                    )}
                    {task.status === 'paused' && (
                      <div className="bg-rose-50 border border-rose-100 text-rose-700 text-[10px] px-2 py-1.5 rounded-lg font-bold leading-normal">
                        🚨 متوقفة مؤقتًا: {task.pauseReason || 'غير محدد'}
                      </div>
                    )}
                    {(userRole === 'admin' || userRole === 'owner') && (
                      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 mt-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(task)}
                          className="flex items-center gap-1 text-[10px] bg-slate-50 hover:bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold transition-all cursor-pointer shadow-xs"
                        >
                          <Pencil className="w-3 h-3 text-blue-600" />
                          <span>تعديل</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDeleteConfirm(task.id)}
                          className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg border border-red-100 font-bold transition-all cursor-pointer shadow-xs"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* COMPLETED TASKS & OPERATIONS LOG FILTER TOOLBAR */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="ابحث في مهام هذا الفني (نوع المهمة، الموقع، اسم المشترك)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pr-9 pl-4 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
              />
              <Search className="absolute right-3 top-3.5 w-4 h-4 text-slate-400" />
            </div>

            {/* Period Filters */}
            <div className="flex flex-wrap items-center gap-3 justify-end">
              <span className="text-xs text-slate-500 font-bold">فترة التقرير:</span>
              <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                {(['all', 'daily', 'weekly', 'monthly'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setPeriodFilter(filter)}
                    className={`text-[10px] font-bold px-3.5 py-2 cursor-pointer transition-all ${
                      periodFilter === filter
                        ? 'bg-blue-700 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {filter === 'all' && 'الكل'}
                    {filter === 'daily' && 'اليوم'}
                    {filter === 'weekly' && 'هذا الأسبوع'}
                    {filter === 'monthly' && 'هذا الشهر'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* OPERATIONS LOG TABLE & LIST */}
          <div className="space-y-3">
            <h3 className="font-extrabold text-xs text-slate-700">سجل عمليات ومستندات الفني ({techFilteredCompletedAndManualItems.length} عملية مطابقة للتصفية)</h3>

            {techFilteredCompletedAndManualItems.length === 0 ? (
              <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-2xl border border-slate-150">
                <Filter className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <h4 className="font-bold text-slate-700 text-sm">لا يوجد مهام أو عمليات مكتملة مطابقة للتصفية</h4>
                <p className="text-xs text-slate-400 mt-1">يرجى تعديل خيارات التصفية أو تغيير نص البحث.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/60 text-slate-500 font-black border-b border-slate-150">
                        <th className="p-4 text-center w-12">ت</th>
                        <th className="p-4">نوع المهمة / العملية</th>
                        <th className="p-4">وقت البدء والانتهاء</th>
                        <th className="p-4">المدة المستغرقة</th>
                        <th className="p-4 text-center">النقاط</th>
                        <th className="p-4 max-w-xs">ملاحظات ومواقع المشتركين / سبب العملية</th>
                        {(userRole === 'admin' || userRole === 'owner') && (
                          <th className="p-4 text-center w-16">إجراء</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {techFilteredCompletedAndManualItems.map((item, index) => {
                        const isManual = !!item.isManual;
                        if (isManual) {
                          const mpType = item.type;
                          const pointsVal = item.points; // includes correct positive/negative sign
                          return (
                            <tr key={item.id} className={`${mpType === 'gift' ? 'bg-emerald-50/10' : 'bg-rose-50/10'} hover:bg-slate-50/50 transition-colors`}>
                              <td className="p-4 text-center text-slate-400 font-mono font-bold align-middle">
                                {index + 1}
                              </td>
                              <td className="p-4 align-middle">
                                <span className={`flex items-center gap-1.5 w-fit border px-2 py-1 rounded-md font-extrabold whitespace-nowrap ${
                                  mpType === 'gift'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                    : 'bg-rose-50 text-rose-800 border-rose-100'
                                }`}>
                                  <span>{mpType === 'gift' ? '🎁' : '⚠️'}</span>
                                  <span>{mpType === 'gift' ? 'إضافة نقاط هدية' : 'خصم نقاط عقوبة'}</span>
                                </span>
                                {selectedEmployeeId === 'all' && (
                                  <div className="text-[10px] text-slate-500 font-extrabold mt-1">
                                    الفني: {item.employeeName}
                                  </div>
                                )}
                              </td>
                              <td className="p-4 text-slate-500 font-medium align-middle whitespace-nowrap">
                                <div className="whitespace-nowrap text-slate-800 font-bold text-xs">
                                  {formatArabicDateOnly(item.startTime)}
                                </div>
                                <div className="whitespace-nowrap text-slate-500 font-mono text-[11px] mt-1" dir="rtl">
                                  <span>{formatArabicTimeOnly(item.startTime)}</span>
                                </div>
                              </td>
                              <td className="p-4 font-bold text-slate-400 align-middle whitespace-nowrap">
                                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]">إجراء إداري</span>
                              </td>
                              <td className="p-4 text-center align-middle whitespace-nowrap">
                                <span className={`px-2.5 py-1 rounded-full font-black border ${
                                  pointsVal > 0
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                    : 'bg-rose-100 text-rose-900 border-rose-200'
                                }`}>
                                  {pointsVal > 0 ? `+${pointsVal}` : pointsVal} ن
                                </span>
                              </td>
                              <td className="p-4 max-w-xs text-slate-700 font-bold align-middle">
                                <div className="text-slate-800 whitespace-pre-line leading-relaxed text-xs">
                                  {item.notes}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-1 font-medium">
                                  بواسطة المشرف: {item.adminName || 'المدير'}
                                </div>
                              </td>
                              {(userRole === 'admin' || userRole === 'owner') && (
                                <td className="p-4 text-center align-middle">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingManualPoint(item);
                                        setEditManualPointsValue(Math.abs(item.points));
                                        setEditManualReason(item.notes || '');
                                      }}
                                      className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-700 rounded-lg transition-colors cursor-pointer"
                                      title="تعديل"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setShowDeleteManualConfirm(item.id)}
                                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                                      title="حذف"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        }

                        const isRejected = item.status === 'rejected';
                        const start = new Date(item.startTime).getTime();
                        const end = item.endTime ? new Date(item.endTime).getTime() : start;
                        const activeMs = Math.max(0, (end - start) - (item.totalPausedMs || 0));
                        const mins = Math.max(0, Math.round(activeMs / 60000));
                        const durationText = isRejected ? 'مرفوضة' : (mins < 1 ? 'أقل من دقيقة' : `${mins} دقيقة`);
                        const hmsText = formatMsToHMS(activeMs);
                        const pauseMins = item.totalPausedMs ? Math.max(1, Math.round(item.totalPausedMs / 60000)) : 0;

                        return (
                          <tr key={item.id} className={`${isRejected ? 'bg-red-50/20' : ''} hover:bg-slate-50/50 transition-colors`}>
                            {/* Row Counter */}
                            <td className="p-4 text-center text-slate-400 font-mono font-bold align-middle">
                              {index + 1}
                            </td>

                            {/* Task Type Badge */}
                            <td className="p-4 align-middle">
                              <span className={`px-2 py-1 rounded-md font-extrabold whitespace-nowrap border ${
                                isRejected ? 'bg-red-100 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-100'
                              }`}>
                                {isRejected ? `🔴 مهمة مرفوضة (${item.taskType})` : item.taskType}
                              </span>
                              {item.taskType === 'دعم' && (() => {
                                const parent = tasks.find(t => t.id === item.parentTaskId);
                                return (
                                  <div className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-black w-fit mt-1">
                                    🤝 دعم: {parent ? `${parent.employeeName} (${parent.taskType})` : 'مهمة جارية'}
                                  </div>
                                );
                              })()}
                              {selectedEmployeeId === 'all' && (
                                <div className="text-[10px] text-slate-500 font-extrabold mt-1">
                                  الفني: {item.employeeName}
                                </div>
                              )}
                            </td>

                            {/* Timestamps */}
                            <td className="p-4 text-slate-500 font-medium align-middle whitespace-nowrap">
                              <div className="whitespace-nowrap text-slate-800 font-bold text-xs">
                                {formatArabicDateOnly(item.startTime)}
                              </div>
                              <div className="whitespace-nowrap text-slate-500 font-mono text-[11px] mt-1" dir="rtl">
                                <span>{formatArabicTimeOnly(item.startTime)}</span>
                                {item.endTime && (
                                  <>
                                    <span className="mx-1 text-slate-300">→</span>
                                    <span>{formatArabicTimeOnly(item.endTime)}</span>
                                  </>
                                )}
                              </div>
                            </td>

                            {/* Duration */}
                            <td className="p-4 font-bold text-slate-600 align-middle whitespace-nowrap">
                              <div className="text-slate-800 text-xs font-mono font-black">
                                {isRejected ? 'مرفوضة' : hmsText}
                              </div>
                              {!isRejected && (
                                <div className="text-[10px] text-slate-500 font-bold mt-0.5">
                                  ({durationText})
                                </div>
                              )}
                              {pauseMins > 0 && (
                                <div className="text-red-500 text-[10px] mt-1">
                                  التوقف: {pauseMins} دقيقة
                                </div>
                              )}
                            </td>

                            {/* Points Earned */}
                            <td className="p-4 text-center align-middle whitespace-nowrap">
                              {!isRejected ? (
                                <span className={`px-2.5 py-1 rounded-full font-black border ${
                                  item.points > 0
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-150'
                                    : item.points < 0
                                    ? 'bg-rose-50 text-rose-800 border-rose-150'
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                                }`}>
                                  {item.points}
                                </span>
                              ) : (
                                <span className="text-slate-300 font-bold">-</span>
                              )}
                            </td>

                            {/* Notes / Locations */}
                            <td className="p-4 max-w-xs text-slate-500 align-middle">
                              {item.subscriberName && (
                                <div className="text-slate-800 font-extrabold mb-1">
                                  👤 المشترك: {item.subscriberName} {item.subscriberPhone && <span className="font-mono text-slate-400 font-medium">({item.subscriberPhone})</span>}
                                </div>
                              )}
                              <div className="truncate text-xs" title={item.notes}>{item.notes || <span className="text-slate-300">-</span>}</div>
                              {isRejected && item.rejectionReason && (
                                <div className="text-[10px] text-red-800 bg-red-100/60 border border-red-200/60 rounded p-1.5 font-bold mt-1">
                                  🚨 سبب اعتذار/رفض الفني ({item.rejectedByTechName || item.employeeName}): {item.rejectionReason}
                                </div>
                              )}
                              {item.previousRejectionReason && (
                                <div className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200/80 rounded p-1.5 font-bold mt-1">
                                  ⚠️ سبب الرفض السابق: {item.previousRejectionReason}
                                </div>
                              )}
                              {item.pauseReason && (userRole === 'admin' || userRole === 'owner') && (
                                <div className="text-[10px] text-amber-600 font-bold mt-1 truncate" title={item.pauseReason}>
                                  سبب التوقف: {item.pauseReason}
                                </div>
                              )}
                              {item.pointsDeducted && item.pointsDeducted > 0 && (
                                <div className="text-[10px] text-rose-600 font-bold mt-1 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 w-fit">
                                  خصم: {item.pointsDeducted} ن {item.deductionReason && `(${item.deductionReason})`}
                                </div>
                              )}
                              {(() => {
                                const isSupportTask = item.taskType === 'دعم' || !!item.parentTaskId;
                                const parent = isSupportTask ? tasks.find(t => t.id === item.parentTaskId) : null;
                                const primaryName = isSupportTask ? (parent ? parent.employeeName : '-') : item.employeeName;
                                const sups = isSupportTask 
                                  ? (parent ? tasks.filter(t => t.parentTaskId === parent.id && t.status === 'completed') : [])
                                  : tasks.filter(t => t.parentTaskId === item.id && t.status === 'completed');
                                
                                if (sups.length === 0) return null;

                                const totalPointsVal = item.originalPoints || (parent ? parent.originalPoints : null) || (item.points * (1 + sups.length));

                                return (
                                  <div className="mt-2 p-2 bg-blue-50/60 border border-blue-150 rounded-lg text-[11px] text-right">
                                    <div className="font-bold text-blue-950 mb-1 flex items-center gap-1">🤝 تفاصيل توزيع النقاط:</div>
                                    <div className="space-y-0.5 text-slate-700">
                                      <div><span className="font-semibold text-slate-900">الفني الأساسي:</span> {primaryName}</div>
                                      <div>
                                        <span className="font-semibold text-slate-900">الداعمون:</span>
                                        <div className="mr-2 space-y-0.5">
                                          {sups.map(s => <div key={s.id} className="text-slate-600">• {s.employeeName}</div>)}
                                        </div>
                                      </div>
                                      <div className="mt-1 pt-1 border-t border-blue-100 font-bold text-slate-900">
                                        إجمالي نقاط المهمة: <span className="font-mono text-blue-700">{totalPointsVal}</span> نقطة
                                      </div>
                                      <div className="mt-1 text-[10px] bg-white/80 p-1.5 rounded border border-blue-100 space-y-0.5">
                                        <div className="font-semibold text-blue-800">توزيع النقاط:</div>
                                        <div>- {primaryName}: <span className="font-mono font-bold text-slate-800">{item.points}</span> نقطة</div>
                                        {sups.map(s => (
                                          <div key={s.id}>- {s.employeeName}: <span className="font-mono font-bold text-slate-800">{s.points}</span> نقطة</div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              {item.editLogs && item.editLogs.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-100/50">
                                  <button
                                    type="button"
                                    onClick={() => toggleLogs(item.id)}
                                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-black flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>📝 سجل التعديلات ({item.editLogs.length})</span>
                                    <span className="text-[8px]">{expandedLogs[item.id] ? '▲' : '▼'}</span>
                                  </button>
                                  {expandedLogs[item.id] && (
                                    <div className="mt-1.5 bg-indigo-50/30 border border-indigo-100/30 p-2 rounded-lg space-y-1.5 text-right max-h-48 overflow-y-auto">
                                      {item.editLogs.map((log) => (
                                        <div key={log.id} className="text-[9px] leading-relaxed border-b border-indigo-100/20 pb-1.5 last:border-0 last:pb-0">
                                          <div className="flex items-center justify-between font-bold text-indigo-900 mb-0.5">
                                            <span>👤 {log.editedBy}</span>
                                            <span className="text-slate-400 text-[8px] font-mono">{formatArabicDateOnly(log.editedAt)}</span>
                                          </div>
                                          <div className="text-slate-600 font-medium">{log.changes}</div>
                                          {log.reason && (
                                            <div className="text-amber-700 font-bold mt-0.5">السبب: {log.reason}</div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Actions (Delete record for mistake correction) */}
                            {(userRole === 'admin' || userRole === 'owner') && (
                              <td className="p-4 text-center align-middle">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item)}
                                    className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-700 rounded-lg transition-colors cursor-pointer"
                                    title="تعديل المهمة"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(item.id)}
                                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                                    title="حذف العملية"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Card List View */}
                <div className="block md:hidden space-y-3">
                  {techFilteredCompletedAndManualItems.map((item, index) => {
                    const isManual = !!item.isManual;
                    if (isManual) {
                      const mpType = item.type;
                      const pointsVal = item.points;
                      return (
                        <div
                          key={item.id}
                          className={`border rounded-xl p-4 shadow-xs relative flex flex-col gap-3 ${
                            mpType === 'gift' ? 'bg-emerald-50/10 border-emerald-100' : 'bg-rose-50/10 border-rose-100'
                          }`}
                        >
                          {/* Header line */}
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 w-5 h-5 rounded-md flex items-center justify-center shrink-0">
                                {index + 1}
                              </span>
                              <div className="flex flex-col">
                                <span className={`border px-2 py-0.5 rounded text-[10px] font-extrabold whitespace-nowrap ${
                                  mpType === 'gift'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}>
                                  {mpType === 'gift' ? '🎁 إضافة نقاط هدية' : '⚠️ خصم نقاط عقوبة'}
                                </span>
                                {selectedEmployeeId === 'all' && (
                                  <span className="text-[9px] text-slate-500 font-extrabold mt-0.5">
                                    الفني: {item.employeeName}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              pointsVal > 0
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                                : 'bg-rose-100 text-rose-900 border-rose-200'
                            }`}>
                              {pointsVal > 0 ? `+${pointsVal}` : pointsVal} ن
                            </span>
                          </div>

                          {/* Date and Time block */}
                          <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100 flex flex-col gap-1.5 text-right">
                            <div className="text-[11px] text-slate-800 font-extrabold flex items-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                              <span>{formatArabicDateOnly(item.startTime)}</span>
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5" dir="rtl">
                              <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              <span>{formatArabicTimeOnly(item.startTime)}</span>
                            </div>
                          </div>

                          {/* Reason */}
                          <div className="text-[11px] text-slate-700 bg-white p-2.5 rounded border border-slate-100 text-right">
                            <div className="font-extrabold text-slate-800">السبب:</div>
                            <div className="leading-relaxed mt-0.5 whitespace-pre-line">{item.notes}</div>
                            <div className="text-[10px] text-slate-400 font-bold mt-1.5">
                              بواسطة المشرف: {item.adminName || 'المدير'}
                            </div>
                          </div>

                          {/* Actions if Admin */}
                          {(userRole === 'admin' || userRole === 'owner') && (
                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-50 mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingManualPoint(item);
                                  setEditManualPointsValue(Math.abs(item.points));
                                  setEditManualReason(item.notes || '');
                                }}
                                className="flex items-center gap-1 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg border border-blue-100 font-bold transition-all cursor-pointer shadow-xs"
                              >
                                <Pencil className="w-3 h-3" />
                                <span>تعديل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDeleteManualConfirm(item.id)}
                                className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg border border-red-100 font-bold transition-all cursor-pointer shadow-xs"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>حذف</span>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    }

                    const start = new Date(item.startTime).getTime();
                    const end = item.endTime ? new Date(item.endTime).getTime() : start;
                    const isRejected = item.status === 'rejected';
                    const activeMs = (end - start) - (item.totalPausedMs || 0);
                    const mins = Math.max(0, Math.round(activeMs / 60000));
                    const durationText = isRejected ? 'مرفوضة' : (mins < 1 ? 'أقل من دقيقة' : `${mins} دقيقة`);
                    const pauseMins = item.totalPausedMs ? Math.max(1, Math.round(item.totalPausedMs / 60000)) : 0;

                    return (
                      <div
                        key={item.id}
                        className={`${isRejected ? 'bg-red-50/20 border-red-200' : 'bg-white border-slate-150'} border rounded-xl p-4 shadow-xs relative flex flex-col gap-3`}
                      >
                        {/* Header line: Index, Badge, Points */}
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-50 w-5 h-5 rounded-md flex items-center justify-center shrink-0">
                              {index + 1}
                            </span>
                            <div className="flex flex-col">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold whitespace-nowrap border ${
                                isRejected ? 'bg-red-100 text-red-800 border-red-200' : 'bg-blue-50 text-blue-800 border-blue-100'
                              }`}>
                                {isRejected ? `🔴 مهمة مرفوضة (${item.taskType})` : item.taskType}
                              </span>
                              {item.taskType === 'دعم' && (() => {
                                const parent = tasks.find(t => t.id === item.parentTaskId);
                                return (
                                  <div className="text-[9px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded font-black w-fit mt-0.5">
                                    🤝 دعم: {parent ? `${parent.employeeName} (${parent.taskType})` : 'مهمة جارية'}
                                  </div>
                                );
                              })()}
                              {selectedEmployeeId === 'all' && (
                                <span className="text-[9px] text-slate-500 font-extrabold mt-0.5">
                                  الفني: {item.employeeName}
                                </span>
                              )}
                            </div>
                          </div>
                          {!isRejected && (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              item.points > 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-150'
                                : item.points < 0
                                ? 'bg-rose-50 text-rose-800 border-rose-150'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}>
                              {item.points}
                            </span>
                          )}
                        </div>

                        {/* Date, Time, and Duration Block */}
                        <div className="bg-slate-50/50 rounded-lg p-2.5 border border-slate-100 flex flex-col gap-1.5 text-right">
                          <div className="text-[11px] text-slate-800 font-extrabold flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            <span>{formatArabicDateOnly(item.startTime)}</span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5" dir="rtl">
                            <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            <span>{formatArabicTimeOnly(item.startTime)}</span>
                            {item.endTime && (
                              <>
                                <span className="mx-1 text-slate-400">→</span>
                                <span>{formatArabicTimeOnly(item.endTime)}</span>
                              </>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-800 font-bold flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                            <span>المدة: {durationText}</span>
                            {pauseMins > 0 && (
                              <span className="text-red-500 text-[10px] font-medium mr-1">
                                (التوقف: {pauseMins} دقيقة)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Notes / Subscriber info */}
                        {(item.notes || item.subscriberName || (isRejected && item.rejectionReason) || (item.pointsDeducted && item.pointsDeducted > 0) || (item.editLogs && item.editLogs.length > 0)) && (
                          <div className="text-[11px] text-slate-600 bg-slate-50/30 p-2.5 rounded border border-slate-100 space-y-1 text-right">
                            {item.subscriberName && (
                              <div className="font-extrabold text-slate-800">
                                👤 المشترك: {item.subscriberName} {item.subscriberPhone && `(${item.subscriberPhone})`}
                              </div>
                            )}
                            {item.notes && <div className="leading-relaxed">{item.notes}</div>}
                            {isRejected && item.rejectionReason && (
                              <div className="text-[10px] text-red-800 bg-red-100/60 border border-red-200/60 rounded p-2 font-bold mt-1">
                                🚨 سبب اعتذار/رفض الفني ({item.rejectedByTechName || item.employeeName}): {item.rejectionReason}
                              </div>
                            )}
                            {item.pointsDeducted && item.pointsDeducted > 0 && (
                              <div className="text-[10px] text-rose-600 font-bold mt-1.5 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 w-fit">
                                خصم: {item.pointsDeducted} ن {item.deductionReason && `(${item.deductionReason})`}
                              </div>
                            )}
                            {(() => {
                              const isSupportTask = item.taskType === 'دعم' || !!item.parentTaskId;
                              const parent = isSupportTask ? tasks.find(t => t.id === item.parentTaskId) : null;
                              const primaryName = isSupportTask ? (parent ? parent.employeeName : '-') : item.employeeName;
                              const sups = isSupportTask 
                                ? (parent ? tasks.filter(t => t.parentTaskId === parent.id && t.status === 'completed') : [])
                                : tasks.filter(t => t.parentTaskId === item.id && t.status === 'completed');
                              
                              if (sups.length === 0) return null;

                              const totalPointsVal = item.originalPoints || (parent ? parent.originalPoints : null) || (item.points * (1 + sups.length));

                              return (
                                <div className="mt-2 p-2 bg-blue-50/60 border border-blue-150 rounded-lg text-[11px] text-right">
                                  <div className="font-bold text-blue-950 mb-1 flex items-center gap-1">🤝 تفاصيل توزيع النقاط:</div>
                                  <div className="space-y-0.5 text-slate-700">
                                    <div><span className="font-semibold text-slate-900">الفني الأساسي:</span> {primaryName}</div>
                                    <div>
                                      <span className="font-semibold text-slate-900">الداعمون:</span>
                                      <div className="mr-2 space-y-0.5">
                                        {sups.map(s => <div key={s.id} className="text-slate-600">• {s.employeeName}</div>)}
                                      </div>
                                    </div>
                                    <div className="mt-1 pt-1 border-t border-blue-100 font-bold text-slate-900">
                                      إجمالي نقاط المهمة: <span className="font-mono text-blue-700">{totalPointsVal}</span> نقطة
                                    </div>
                                    <div className="mt-1 text-[10px] bg-white/80 p-1.5 rounded border border-blue-100 space-y-0.5">
                                      <div className="font-semibold text-blue-800">توزيع النقاط:</div>
                                      <div>- {primaryName}: <span className="font-mono font-bold text-slate-800">{item.points}</span> نقطة</div>
                                      {sups.map(s => (
                                        <div key={s.id}>- {s.employeeName}: <span className="font-mono font-bold text-slate-800">{s.points}</span> نقطة</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            {item.editLogs && item.editLogs.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-100/50">
                                <button
                                  type="button"
                                  onClick={() => toggleLogs(item.id)}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-black flex items-center gap-1 cursor-pointer"
                                >
                                  <span>📝 سجل التعديلات ({item.editLogs.length})</span>
                                  <span className="text-[8px]">{expandedLogs[item.id] ? '▲' : '▼'}</span>
                                </button>
                                {expandedLogs[item.id] && (
                                  <div className="mt-1.5 bg-indigo-50/30 border border-indigo-100/30 p-2 rounded-lg space-y-1.5 text-right max-h-48 overflow-y-auto">
                                    {item.editLogs.map((log) => (
                                      <div key={log.id} className="text-[9px] leading-relaxed border-b border-indigo-100/20 pb-1.5 last:border-0 last:pb-0">
                                        <div className="flex items-center justify-between font-bold text-indigo-900 mb-0.5">
                                          <span>👤 {log.editedBy}</span>
                                          <span className="text-slate-400 text-[8px] font-mono">{formatArabicDateOnly(log.editedAt)}</span>
                                        </div>
                                        <div className="text-slate-600 font-medium">{log.changes}</div>
                                        {log.reason && (
                                          <div className="text-amber-700 font-bold mt-0.5">السبب: {log.reason}</div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions if Admin */}
                        {(userRole === 'admin' || userRole === 'owner') && (
                          <div className="flex justify-end gap-2 pt-2 border-t border-slate-50 mt-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="flex items-center gap-1 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-lg border border-blue-100 font-bold transition-all cursor-pointer shadow-xs"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعديل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowDeleteConfirm(item.id)}
                              className="flex items-center gap-1 text-[10px] bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1.5 rounded-lg border border-red-100 font-bold transition-all cursor-pointer shadow-xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>حذف</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ======================== COMMON MODALS & OVERLAYS ======================== */}

      {/* Delete Record Prompt dialog */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">هل أنت متأكد من حذف هذه المهمة؟</h3>
              
              {/* Warning badge for completed task */}
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium text-right flex items-start gap-2">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="leading-relaxed">
                  تنبيه: هذه المهمة مكتملة بالفعل. سيتم حذفها نهائياً من قاعدة البيانات، وخصم نقاطها من رصيد الموظف، وتحديث لوحة الصدارة والتقارير تلقائياً.
                </p>
              </div>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onDeleteTaskHistory(showDeleteConfirm);
                    setShowDeleteConfirm(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  نعم، حذف المهمة
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-800 p-5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-blue-400" />
                  <h3 className="font-extrabold text-sm">تعديل تفاصيل المهمة</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-right" dir="rtl">
                {error && (
                  <div className="bg-red-50 text-red-700 text-xs p-3 rounded-lg border border-red-100 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Employee Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم الفني *</label>
                    <select
                      value={editEmployeeId}
                      onChange={(e) => setEditEmployeeId(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-bold"
                    >
                      <option value="">-- اختر الفني --</option>
                      {employees?.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Task Type */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">نوع المهمة *</label>
                    <select
                      value={editTaskType}
                      onChange={(e) => {
                        const type = e.target.value;
                        setEditTaskType(type);
                        handleAutoRecalculatePoints(type, editStartTime, editEndTime, editTotalPausedMs);
                      }}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-bold cursor-pointer"
                    >
                      {(() => {
                        const activeTypes = (taskTypes || []).filter(t => t.status === 'active' || (!t.status && !t.isArchived));
                        const isCurrentArchived = editTaskType && !activeTypes.some(t => t.name === editTaskType);
                        const listToRender = isCurrentArchived
                          ? [...activeTypes, { id: 'archived_curr', name: editTaskType, points: editPoints || 0, icon: '📋' }]
                          : activeTypes;

                        if (listToRender.length === 0) {
                          return <option value={editTaskType || 'تنصيب'}>{editTaskType || 'تنصيب'}</option>;
                        }

                        return listToRender.map((type) => (
                          <option key={type.id || type.name} value={type.name}>
                            {type.name} (+{type.points} ن)
                          </option>
                        ));
                      })()}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Task Date */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">تاريخ المهمة *</label>
                    <input
                      type="date"
                      value={editAssignedDate}
                      onChange={(e) => handleDateChange(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
                    />
                  </div>

                  {/* Task Status */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">حالة المهمة *</label>
                    <select
                      value={editStatus}
                      onChange={(e) => {
                        const status = e.target.value as 'active' | 'paused' | 'completed';
                        setEditStatus(status);
                        if (status !== 'completed') {
                          setEditEndTime('');
                        } else if (!editEndTime) {
                          setEditEndTime(toLocalInputString(new Date()));
                        }
                      }}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-bold"
                    >
                      <option value="active">جارية</option>
                      <option value="paused">متوقفة مؤقتاً</option>
                      <option value="completed">مكتملة</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start Time */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت البدء *</label>
                    <input
                      type="datetime-local"
                      value={editStartTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
                    />
                  </div>

                  {/* End Time */}
                  {editStatus === 'completed' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">وقت الانتهاء *</label>
                      <input
                        type="datetime-local"
                        value={editEndTime}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Completion Duration (Direct Editing) */}
                  {editStatus === 'completed' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">مدة الإنجاز (بالدقائق)</label>
                      <input
                        type="number"
                        min="0"
                        value={editDurationMinutes}
                        onChange={(e) => handleDurationChange(Number(e.target.value))}
                        className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-left"
                        placeholder="مدة الإنجاز بالدقائق"
                      />
                    </div>
                  )}

                  {/* Pause Duration */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">مدة التوقف (بالدقائق)</label>
                    <input
                      type="number"
                      min="0"
                      value={editTotalPausedMs}
                      onChange={(e) => handlePausedMinsChange(Number(e.target.value))}
                      placeholder="أدخل مدة التوقف"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-left"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Pause Reason */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">سبب التوقف</label>
                    <input
                      type="text"
                      value={editPauseReason}
                      onChange={(e) => setEditPauseReason(e.target.value)}
                      placeholder="اكتب سبب التوقف إن وجد"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
                    />
                  </div>
                </div>

                {/* Points Earned with override and auto recalculate */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-black text-slate-700">احتساب النقاط للمهمة</span>
                    <button
                      type="button"
                      onClick={() => handleAutoRecalculatePoints(editTaskType, editStartTime, editEndTime, editTotalPausedMs)}
                      className="text-[10px] text-blue-700 font-bold hover:underline cursor-pointer"
                    >
                      إعادة حساب تلقائي
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="0"
                      value={editPoints}
                      onChange={(e) => setEditPoints(Number(e.target.value))}
                      className="w-32 text-xs px-3.5 py-2 rounded-lg border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-center font-bold"
                    />
                    <p className="text-[10px] text-slate-500 leading-normal">
                      يمكنك تعديل النقاط يدوياً لتقديم مكافآت أو خصومات للموظف، أو اضغط "إعادة حساب تلقائي" للتحديث طبقاً لزمن التشغيل الفعلي.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                  {/* Points Deducted */}
                  <div>
                    <label className="block text-xs font-bold text-rose-800 mb-1.5">النقاط المخصومة (التأخير/أخرى)</label>
                    <input
                      type="number"
                      min="0"
                      value={editPointsDeducted}
                      onChange={(e) => setEditPointsDeducted(Number(e.target.value))}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-rose-200 focus:border-rose-700 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-rose-900 font-mono text-left font-bold"
                      placeholder="0"
                    />
                  </div>

                  {/* Deduction Reason */}
                  <div>
                    <label className="block text-xs font-bold text-rose-800 mb-1.5">سبب الخصم</label>
                    <input
                      type="text"
                      value={editDeductionReason}
                      onChange={(e) => setEditDeductionReason(e.target.value)}
                      placeholder="مثال: تأخير في الوصول"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-rose-200 focus:border-rose-700 focus:ring-2 focus:ring-rose-100 outline-none transition-all text-rose-900 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Subscriber Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">اسم المشترك (اختياري)</label>
                    <input
                      type="text"
                      value={editSubscriberName}
                      onChange={(e) => setEditSubscriberName(e.target.value)}
                      placeholder="اسم المشترك"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium"
                    />
                  </div>

                  {/* Subscriber Phone */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">هاتف المشترك (اختياري)</label>
                    <input
                      type="text"
                      value={editSubscriberPhone}
                      onChange={(e) => setEditSubscriberPhone(e.target.value)}
                      placeholder="رقم الهاتف"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-left"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ملاحظات ومواقع</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="ملاحظات حول التنفيذ أو موقع المهمة..."
                    rows={2}
                    className="w-full text-xs px-3.5 py-2 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium resize-none"
                  />
                </div>

                {/* Edit Reason for change logs */}
                <div className="bg-amber-50/40 p-4 rounded-xl border border-amber-100/60">
                  <label className="block text-xs font-black text-amber-800 mb-1.5">سبب هذا التعديل (اختياري - لحفظه في سجل التعديلات) 📝</label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="مثال: تصحيح نوع المهمة ونقلها للفني الصحيح..."
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-amber-200 focus:border-amber-700 focus:ring-2 focus:ring-amber-100 outline-none transition-all text-amber-900 font-medium"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold py-3 rounded-xl border border-slate-200 transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Manual Point Prompt dialog */}
      <AnimatePresence>
        {showDeleteManualConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden p-6 text-center"
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base" dir="rtl">هل أنت متأكد من حذف هذه العملية؟</h3>
              
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium text-right flex items-start gap-2" dir="rtl">
                <span className="text-sm shrink-0">⚠️</span>
                <p className="leading-relaxed">
                  هل أنت متأكد من حذف هذه العملية؟ سيتم التراجع عن تأثيرها على نقاط الفني.
                </p>
              </div>

              <div className="mt-5 flex gap-3" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteManualPoint) {
                      onDeleteManualPoint(showDeleteManualConfirm);
                    }
                    setShowDeleteManualConfirm(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  حذف
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteManualConfirm(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Manual Point Modal */}
      <AnimatePresence>
        {editingManualPoint && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-slate-800 p-5 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-blue-400" />
                  <h3 className="font-extrabold text-sm" dir="rtl">
                    تعديل {editingManualPoint.type === 'gift' ? 'الهدية' : 'العقوبة'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingManualPoint(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-4 text-right" dir="rtl">
                {/* Points */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">عدد النقاط *</label>
                  <input
                    type="number"
                    min="1"
                    value={editManualPointsValue}
                    onChange={(e) => setEditManualPointsValue(Number(e.target.value))}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono text-center font-bold"
                  />
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">السبب *</label>
                  <textarea
                    value={editManualReason}
                    onChange={(e) => setEditManualReason(e.target.value)}
                    placeholder="اكتب سبب التعديل..."
                    rows={3}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-medium resize-none"
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0" dir="rtl">
                <button
                  type="button"
                  onClick={() => {
                    if (onEditManualPoint && editingManualPoint) {
                      onEditManualPoint(editingManualPoint.id, editManualPointsValue, editManualReason);
                    }
                    setEditingManualPoint(null);
                  }}
                  className="flex-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer shadow-sm"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setEditingManualPoint(null)}
                  className="flex-1 bg-white hover:bg-slate-100 text-slate-600 text-xs font-bold py-3 rounded-xl border border-slate-200 transition-colors cursor-pointer"
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

