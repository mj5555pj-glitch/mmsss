import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  Calendar,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Check,
  X,
  Search,
  Filter,
  CalendarOff,
  DollarSign,
  FileText,
  Sparkles,
  RefreshCw,
  Clock3,
  Building2,
  ShieldAlert,
  Pause,
  Play,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Employee,
  OvertimeRecord,
  LeaveRequest,
  GraceRequest,
  CompanySettings,
  Task
} from '../types';
import {
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribeGraceRequests,
  subscribeCompanySettings,
  updateOvertimeRecord,
  updateLeaveRequest,
  updateGraceRequest,
  createGraceRequest
} from '../lib/dbService';
import { hrEngine } from '../lib/hrEngine';

interface RequestsCenterProps {
  employees: Employee[];
  tasks?: Task[];
  userRole?: 'owner' | 'manager' | 'supervisor' | 'technician';
  onApprovePauseTask?: (taskId: string) => void;
  onRejectPauseTask?: (taskId: string, reason?: string) => void;
}

export default function RequestsCenter({
  employees,
  tasks = [],
  userRole = 'manager',
  onApprovePauseTask,
  onRejectPauseTask
}: RequestsCenterProps) {
  // Data subscriptions state
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [graceRequests, setGraceRequests] = useState<GraceRequest[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);

  // Active Tab state: 'overtime' | 'leave' | 'grace' | 'pause_tasks' | 'attendance'
  const [activeTab, setActiveTab] = useState<'overtime' | 'leave' | 'grace' | 'pause_tasks' | 'attendance'>('overtime');

  // Search & Filter state for requests
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  // Modal State for Action (Approve / Reject / Details)
  const [selectedOvertime, setSelectedOvertime] = useState<OvertimeRecord | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [selectedGrace, setSelectedGrace] = useState<GraceRequest | null>(null);
  const [selectedPauseTask, setSelectedPauseTask] = useState<Task | null>(null);
  
  // Action type: 'approve' | 'reject' | 'details'
  const [actionMode, setActionMode] = useState<'approve' | 'reject' | 'details' | null>(null);

  // Form inputs inside modal
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal for creating new grace request directly
  const [showCreateGraceModal, setShowCreateGraceModal] = useState(false);
  const [newGraceEmpId, setNewGraceEmpId] = useState('');
  const [newGraceType, setNewGraceType] = useState<'late_arrival' | 'early_departure'>('late_arrival');
  const [newGraceDate, setNewGraceDate] = useState(new Date().toISOString().split('T')[0]);
  const [newGraceMinutes, setNewGraceMinutes] = useState(15);
  const [newGraceReason, setNewGraceReason] = useState('');
  const [creatingGrace, setCreatingGrace] = useState(false);

  const handleCreateGraceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGraceEmpId) {
      setFeedbackMessage({ type: 'error', text: 'يرجى اختيار الموظف.' });
      return;
    }
    if (!newGraceReason.trim()) {
      setFeedbackMessage({ type: 'error', text: 'يرجى كتابة سبب طلب السماحية.' });
      return;
    }

    const emp = employees.find((e) => e.id === newGraceEmpId);
    if (!emp) return;

    setCreatingGrace(true);
    setFeedbackMessage(null);
    try {
      const newReq: GraceRequest = {
        id: `grace_${emp.id}_${newGraceDate}_${newGraceType}_${Date.now()}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date: newGraceDate,
        type: newGraceType,
        minutes: newGraceMinutes > 0 ? newGraceMinutes : 15,
        reason: newGraceReason.trim(),
        status: 'pending',
        requestedAt: new Date().toISOString()
      };

      await createGraceRequest(newReq);

      setFeedbackMessage({
        type: 'success',
        text: `تم إرسال طلب السماحية للموظف (${emp.name}) بنجاح ويظهر الآن باللوحة الرئيسية والطلبات.`
      });
      setShowCreateGraceModal(false);
      setNewGraceReason('');
      setNewGraceEmpId('');
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء تقديم طلب السماحية.'
      });
    } finally {
      setCreatingGrace(false);
    }
  };

  // Real-time subscriptions
  useEffect(() => {
    const unsubOvertime = subscribeOvertimeRecords(
      (recs) => setOvertimeRecords(recs),
      (err) => console.error('Overtime records subscription error:', err)
    );
    const unsubLeave = subscribeLeaveRequests(
      (recs) => setLeaveRequests(recs),
      (err) => console.error('Leave requests subscription error:', err)
    );
    const unsubGrace = subscribeGraceRequests(
      (recs) => setGraceRequests(recs),
      (err) => console.error('Grace requests subscription error:', err)
    );
    const unsubSettings = subscribeCompanySettings(
      (sets) => setCompanySettings(sets),
      (err) => console.error('Company settings subscription error:', err)
    );

    return () => {
      unsubOvertime();
      unsubLeave();
      unsubGrace();
      unsubSettings();
    };
  }, []);

  // Stats calculation
  const pendingOvertimeCount = useMemo(() => {
    return overtimeRecords.filter((r) => r.status === 'pending' && !(r as any).isDeleted).length;
  }, [overtimeRecords]);

  const pendingLeaveCount = useMemo(() => {
    return leaveRequests.filter((r) => r.status === 'pending' && !(r as any).isDeleted).length;
  }, [leaveRequests]);

  const pendingGraceCount = useMemo(() => {
    return graceRequests.filter((r) => r.status === 'pending' && !(r as any).isDeleted).length;
  }, [graceRequests]);

  const pauseRequestedTasks = useMemo(() => {
    return tasks.filter((t) => t.pauseRequested || t.pauseRequestStatus);
  }, [tasks]);

  const pendingPauseTasksCount = useMemo(() => {
    return tasks.filter((t) => t.pauseRequested && t.pauseRequestStatus === 'pending').length;
  }, [tasks]);

  // Overtime rate from settings (default fallback 5000 IQD/hr)
  const overtimeHourlyRate = companySettings?.overtimeHourlyRate || 5000;

  // Filtered Overtime List
  const filteredOvertimeList = useMemo(() => {
    return overtimeRecords
      .filter((r) => !(r as any).isDeleted)
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const matchName = r.employeeName.toLowerCase().includes(term);
          const matchDate = r.date.includes(term);
          if (!matchName && !matchDate) return false;
        }
        return true;
      });
  }, [overtimeRecords, statusFilter, searchTerm]);

  // Filtered Leave Requests List
  const filteredLeaveList = useMemo(() => {
    return leaveRequests
      .filter((r) => !(r as any).isDeleted)
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const matchName = r.employeeName.toLowerCase().includes(term);
          const matchReason = r.reason.toLowerCase().includes(term);
          const matchDate = r.startDate.includes(term) || r.endDate.includes(term);
          if (!matchName && !matchReason && !matchDate) return false;
        }
        return true;
      });
  }, [leaveRequests, statusFilter, searchTerm]);

  // Filtered Grace Requests List
  const filteredGraceList = useMemo(() => {
    return graceRequests
      .filter((r) => !(r as any).isDeleted)
      .filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const matchName = r.employeeName.toLowerCase().includes(term);
          const matchDate = r.date.includes(term);
          const matchReason = (r.reason || '').toLowerCase().includes(term);
          if (!matchName && !matchDate && !matchReason) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  }, [graceRequests, statusFilter, searchTerm]);

  // Filtered Pause Tasks List
  const filteredPauseTasksList = useMemo(() => {
    return pauseRequestedTasks
      .filter((t) => {
        const reqStatus = t.pauseRequestStatus || (t.pauseRequested ? 'pending' : 'approved');
        if (statusFilter !== 'all' && reqStatus !== statusFilter) return false;
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const empName = (t.employeeName || employees.find((e) => e.id === t.employeeId)?.name || '').toLowerCase();
          const matchType = (t.taskType || '').toLowerCase().includes(term);
          const matchSubscriber = (t.subscriberName || '').toLowerCase().includes(term);
          const matchReason = (t.pauseRequestReason || '').toLowerCase().includes(term);
          if (!empName.includes(term) && !matchType && !matchSubscriber && !matchReason) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.pauseRequestedAt || a.startTime).getTime();
        const timeB = new Date(b.pauseRequestedAt || b.startTime).getTime();
        return timeB - timeA;
      });
  }, [pauseRequestedTasks, statusFilter, searchTerm, employees]);

  // Modal Reset Handler
  const closeModal = () => {
    setSelectedOvertime(null);
    setSelectedLeave(null);
    setSelectedGrace(null);
    setSelectedPauseTask(null);
    setActionMode(null);
    setRejectionReason('');
    setFeedbackMessage(null);
  };

  // Handle Approve Grace Request
  const handleApproveGrace = async (record: GraceRequest) => {
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateGraceRequest(record.id, {
        status: 'approved',
        processedBy: currentUserName,
        processedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error approving grace request:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء اعتماد طلب السماحية.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Grace Request
  const handleRejectGrace = async (record: GraceRequest) => {
    if (!rejectionReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'سبب الرفض إجباري.',
      });
      return;
    }

    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateGraceRequest(record.id, {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        processedBy: currentUserName,
        processedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error rejecting grace request:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء رفض طلب السماحية.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Helper function to format duration
  const formatDuration = (durationMinutes: number) => {
    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    if (hours > 0 && mins > 0) {
      return `${hours} ساعة و ${mins} دقيقة`;
    } else if (hours > 0) {
      return `${hours} ساعة`;
    } else {
      return `${mins} دقيقة`;
    }
  };

  // Handle Approve Overtime
  const handleApproveOvertime = async (record: OvertimeRecord) => {
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateOvertimeRecord(record.id, {
        status: 'approved',
        approvedBy: currentUserName,
        approvedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error approving overtime:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء اعتماد الوقت الإضافي.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Overtime
  const handleRejectOvertime = async (record: OvertimeRecord) => {
    if (!rejectionReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'سبب الرفض إجباري.',
      });
      return;
    }

    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateOvertimeRecord(record.id, {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        approvedBy: currentUserName,
        approvedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error rejecting overtime:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء رفض الوقت الإضافي.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Approve Leave Request
  const handleApproveLeave = async (request: LeaveRequest) => {
    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateLeaveRequest(request.id, {
        status: 'approved',
        processedBy: currentUserName,
        processedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error approving leave:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء اعتماد الإجازة.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reject Leave Request
  const handleRejectLeave = async (request: LeaveRequest) => {
    if (!rejectionReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'سبب الرفض إجباري.',
      });
      return;
    }

    setActionLoading(true);
    setFeedbackMessage(null);
    try {
      const now = new Date();
      const currentUserName = userRole === 'owner' ? 'المالك' : userRole === 'manager' ? 'المدير العام' : 'المشرف الإداري';

      await updateLeaveRequest(request.id, {
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        processedBy: currentUserName,
        processedAt: now.toISOString(),
      });

      closeModal();
    } catch (err: any) {
      console.error('Error rejecting leave:', err);
      setFeedbackMessage({
        type: 'error',
        text: err.message || 'حدث خطأ أثناء رفض الإجازة.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Pause Task Approval
  const handleApprovePause = (task: Task) => {
    if (onApprovePauseTask) {
      onApprovePauseTask(task.id);
    }
    closeModal();
  };

  // Handle Pause Task Rejection
  const handleRejectPause = (task: Task) => {
    if (!rejectionReason.trim()) {
      setFeedbackMessage({
        type: 'error',
        text: 'سبب الرفض إجباري.',
      });
      return;
    }
    if (onRejectPauseTask) {
      onRejectPauseTask(task.id, rejectionReason.trim());
    }
    closeModal();
  };

  // Helper Badge Renderers
  const renderStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1 w-fit">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            معتمد
          </span>
        );
      case 'rejected':
        return (
          <span className="bg-red-100 text-red-800 border border-red-200 text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1 w-fit">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            مرفوض
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-black px-3 py-1 rounded-full flex items-center gap-1 w-fit animate-pulse">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            بانتظار الموافقة
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
      
      {/* Top Welcome & Navigation Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 rounded-3xl text-white shadow-xl border border-slate-700/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-400/30">
                <UserCheck className="w-6 h-6" />
              </div>
              <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                بوابة الموارد البشرية والعمليات
              </span>
            </div>
            <h1 className="text-2xl font-black text-white">
              مركز الطلبات والموافقات الإدارية
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              متابعة، مراجعة، واعتماد طلبات الوقت الإضافي والإجازات وإيقاف المهام وتعديلات الحضور
            </p>
          </div>

          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 p-3.5 rounded-2xl flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي الطلبات المعلقة:</span>
              <span className="text-xs font-black text-white">
                {pendingOvertimeCount + pendingLeaveCount + pendingGraceCount + pendingPauseTasksCount} طلب بانتظار اتخاذ قرار
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 4 Statistic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Pending Pause Tasks */}
        <div
          onClick={() => { setActiveTab('pause_tasks'); setStatusFilter('pending'); }}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'pause_tasks' && statusFilter === 'pending'
              ? 'bg-rose-500/10 border-rose-400 shadow-md ring-2 ring-rose-400/30'
              : 'bg-white border-slate-200/80 hover:border-rose-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center">
              <Pause className="w-5 h-5 text-rose-600" />
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
              إيقاف المهام
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{pendingPauseTasksCount}</div>
          <p className="text-xs text-slate-500 font-bold mt-1">طلبات إيقاف المهام المعلقة من الفنيين</p>
        </div>

        {/* Card 2: Pending Overtime */}
        <div
          onClick={() => { setActiveTab('overtime'); setStatusFilter('pending'); }}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'overtime' && statusFilter === 'pending'
              ? 'bg-amber-500/10 border-amber-400 shadow-md ring-2 ring-amber-400/30'
              : 'bg-white border-slate-200/80 hover:border-amber-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <Clock3 className="w-5 h-5" />
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              الوقت الإضافي
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{pendingOvertimeCount}</div>
          <p className="text-xs text-slate-500 font-bold mt-1">طلبات الوقت الإضافي المعلقة</p>
        </div>

        {/* Card 3: Pending Leave Requests */}
        <div
          onClick={() => { setActiveTab('leave'); setStatusFilter('pending'); }}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'leave' && statusFilter === 'pending'
              ? 'bg-purple-500/10 border-purple-400 shadow-md ring-2 ring-purple-400/30'
              : 'bg-white border-slate-200/80 hover:border-purple-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-800 flex items-center justify-center">
              <CalendarOff className="w-5 h-5" />
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
              الإجازات
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{pendingLeaveCount}</div>
          <p className="text-xs text-slate-500 font-bold mt-1">طلبات الإجازات المعلقة</p>
        </div>

        {/* Card 4: Pending Grace Requests */}
        <div
          onClick={() => { setActiveTab('grace'); setStatusFilter('pending'); }}
          className={`p-5 rounded-3xl border transition-all cursor-pointer ${
            activeTab === 'grace' && statusFilter === 'pending'
              ? 'bg-blue-500/10 border-blue-400 shadow-md ring-2 ring-blue-400/30'
              : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              طلبات السماحية
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900">{pendingGraceCount}</div>
          <p className="text-xs text-slate-500 font-bold mt-1">طلبات سماحية التأخير والخروج المبكر</p>
        </div>

      </div>

      {/* Main Tabs Header */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          
          <button
            type="button"
            onClick={() => setActiveTab('pause_tasks')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'pause_tasks'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Pause className="w-4 h-4 text-rose-400" />
            <span>طلبات إيقاف المهام</span>
            {pendingPauseTasksCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                {pendingPauseTasksCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overtime')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'overtime'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>طلبات الوقت الإضافي</span>
            {pendingOvertimeCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {pendingOvertimeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('leave')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'leave'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>طلبات الإجازات</span>
            {pendingLeaveCount > 0 && (
              <span className="bg-purple-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {pendingLeaveCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('grace')}
            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'grace'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>طلبات السماحية (التأخير والإنصراف)</span>
            {pendingGraceCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                {pendingGraceCount}
              </span>
            )}
          </button>

        </div>

        {/* Filter & Search Bar */}
        {activeTab !== 'attendance' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Filter Selector */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pending">المعلقة فقط ⏳</option>
              <option value="approved">المعتمدة 🟢</option>
              <option value="rejected">المرفوضة 🔴</option>
              <option value="all">كافة الطلبات (الكل)</option>
            </select>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="بحث بالاسم أو السبب..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-medium pl-3 pr-9 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl flex items-center justify-between text-xs font-bold ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="p-1 hover:bg-black/5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

      {/* TAB 1: PAUSE TASK REQUESTS */}
      {activeTab === 'pause_tasks' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Pause className="w-4 h-4 text-rose-600" />
              <span className="font-extrabold text-xs text-slate-800">
                طلبات إيقاف المهام مؤقتاً المقدمة من الفنيين
              </span>
              <span className="bg-slate-200 text-slate-700 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full">
                {filteredPauseTasksList.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">الفني المسؤول</th>
                  <th className="p-4">نوع المهمة</th>
                  <th className="p-4">المشترك / الموقع</th>
                  <th className="p-4">سبب الإيقاف المؤقت</th>
                  <th className="p-4">وقت الطلب</th>
                  <th className="p-4">حالة الطلب</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredPauseTasksList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد طلبات إيقاف مهام مطابقة لخيارات البحث أو الفلتر الحالية.
                    </td>
                  </tr>
                ) : (
                  filteredPauseTasksList.map((task) => {
                    const empName = task.employeeName || employees.find((e) => e.id === task.employeeId)?.name || 'فني غير محدد';
                    const reqStatus = task.pauseRequestStatus || (task.pauseRequested ? 'pending' : 'approved');

                    return (
                      <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs">
                            {empName.charAt(0)}
                          </div>
                          <span>{empName}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                            {task.taskType}
                          </span>
                        </td>
                        <td className="p-4">
                          {task.subscriberName ? (
                            <div>
                              <strong className="text-slate-900 block">{task.subscriberName}</strong>
                              {task.subscriberPhone && (
                                <span className="text-[10px] text-slate-500 font-mono">{task.subscriberPhone}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">{task.notes || 'غير محدد'}</span>
                          )}
                        </td>
                        <td className="p-4 max-w-[220px] truncate" title={task.pauseRequestReason}>
                          <span className="bg-amber-50 text-amber-900 border border-amber-200 px-2 py-1 rounded-lg text-[11px] font-bold inline-block">
                            💬 {task.pauseRequestReason || 'بدون ذكر سبب'}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-[11px] text-slate-600">
                          {task.pauseRequestedAt ? new Date(task.pauseRequestedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </td>
                        <td className="p-4">{renderStatusBadge(reqStatus as any)}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {reqStatus === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApprovePause(task)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px] shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>موافقة على الإيقاف</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedPauseTask(task);
                                    setActionMode('reject');
                                    setRejectionReason('');
                                  }}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>رفض الإيقاف</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedPauseTask(task);
                                setActionMode('details');
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل</span>
                            </button>
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
      )}

      {/* TAB 2: OVERTIME REQUESTS */}
      {activeTab === 'overtime' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span className="font-extrabold text-xs text-slate-800">
                سجل طلبات الوقت الإضافي
              </span>
              <span className="bg-slate-200 text-slate-700 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full">
                {filteredOvertimeList.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">الموظف</th>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4">الفترة والمدة</th>
                  <th className="p-4">المبلغ المقدر</th>
                  <th className="p-4">ملاحظات / السبب</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredOvertimeList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد طلبات وقت إضافي مطابقة لخيارات البحث أو الفلتر الحالية.
                    </td>
                  </tr>
                ) : (
                  filteredOvertimeList.map((record) => {
                    const estAmount = Math.round(((record.durationMinutes || 0) / 60) * overtimeHourlyRate);
                    return (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-bold flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs">
                            {record.employeeName.charAt(0)}
                          </div>
                          <span>{record.employeeName}</span>
                        </td>
                        <td className="p-4 font-mono font-bold text-slate-700">{record.date}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-900">{formatDuration(record.durationMinutes || 0)}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {record.startTime ? new Date(record.startTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'} - {record.endTime ? new Date(record.endTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                          </div>
                        </td>
                        <td className="p-4 font-mono font-black text-emerald-700">{estAmount.toLocaleString()} د.ع</td>
                        <td className="p-4 max-w-[200px] truncate" title={record.notes}>
                          {record.notes || 'بدون ملاحظات'}
                        </td>
                        <td className="p-4">{renderStatusBadge(record.status)}</td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {record.status === 'pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproveOvertime(record)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>اعتماد</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedOvertime(record);
                                    setActionMode('reject');
                                    setRejectionReason('');
                                  }}
                                  className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>رفض</span>
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOvertime(record);
                                setActionMode('details');
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل</span>
                            </button>
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
      )}

      {/* TAB 3: LEAVE REQUESTS */}
      {activeTab === 'leave' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              <span className="font-extrabold text-xs text-slate-800">
                سجل طلبات الإجازات المقدمة
              </span>
              <span className="bg-slate-200 text-slate-700 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full">
                {filteredLeaveList.length}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">الموظف</th>
                  <th className="p-4">نوع الإجازة</th>
                  <th className="p-4">الفترة الزمنية</th>
                  <th className="p-4">إجمالي الأيام</th>
                  <th className="p-4">السبب</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredLeaveList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد طلبات إجازة مطابقة لخيارات البحث أو الفلتر الحالية.
                    </td>
                  </tr>
                ) : (
                  filteredLeaveList.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs">
                          {req.employeeName.charAt(0)}
                        </div>
                        <span>{req.employeeName}</span>
                      </td>
                      <td className="p-4">
                        {req.type === 'paid' ? (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black px-2.5 py-0.5 rounded-md inline-block">
                            إجازة مدفوعة
                          </span>
                        ) : (
                          <span className="bg-blue-100 text-blue-800 border border-blue-200 text-[10px] font-black px-2.5 py-0.5 rounded-md inline-block">
                            إجازة بدون راتب
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-700">
                        {req.startDate} ⬅ {req.endDate}
                      </td>
                      <td className="p-4 font-bold text-slate-900">{req.totalDays} يوم</td>
                      <td className="p-4 max-w-[200px] truncate" title={req.reason}>
                        {req.reason || 'بدون ذكر سبب'}
                      </td>
                      <td className="p-4">{renderStatusBadge(req.status)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {req.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveLeave(req)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>اعتماد</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLeave(req);
                                  setActionMode('reject');
                                  setRejectionReason('');
                                }}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLeave(req);
                              setActionMode('details');
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>التفاصيل</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: GRACE REQUESTS */}
      {activeTab === 'grace' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span className="font-extrabold text-xs text-slate-800">
                طلبات السماحية الاستثنائية (تأخير الحضور / خروج مبكر)
              </span>
              <span className="bg-slate-200 text-slate-700 text-[11px] font-mono font-bold px-2 py-0.5 rounded-full">
                {filteredGraceList.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateGraceModal(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>تقديم طلب سماحية جديد</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50/75 text-slate-500 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-4">الموظف</th>
                  <th className="p-4">نوع السماحية</th>
                  <th className="p-4">التاريخ</th>
                  <th className="p-4">عدد الدقائق</th>
                  <th className="p-4">السبب</th>
                  <th className="p-4">الحالة</th>
                  <th className="p-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {filteredGraceList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      لا توجد طلبات سماحية مطابقة لخيارات البحث أو الفلتر الحالية.
                    </td>
                  </tr>
                ) : (
                  filteredGraceList.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-black text-xs">
                          {req.employeeName.charAt(0)}
                        </div>
                        <span>{req.employeeName}</span>
                      </td>
                      <td className="p-4">
                        {req.type === 'late_arrival' ? (
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-md inline-block">
                            سماحية تأخير حضور
                          </span>
                        ) : (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 text-[10px] font-black px-2.5 py-0.5 rounded-md inline-block">
                            سماحية خروج مبكر
                          </span>
                        )}
                      </td>
                      <td className="p-4 font-mono font-bold text-slate-700">{req.date}</td>
                      <td className="p-4 font-bold text-amber-700 font-mono">{req.minutes} دقيقة</td>
                      <td className="p-4 max-w-[200px] truncate" title={req.reason}>
                        {req.reason || 'بدون سبب'}
                      </td>
                      <td className="p-4">{renderStatusBadge(req.status)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {req.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveGrace(req)}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>موافقة وإلغاء الخصم</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedGrace(req);
                                  setActionMode('reject');
                                  setRejectionReason('');
                                }}
                                className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedGrace(req);
                              setActionMode('details');
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all flex items-center gap-1 cursor-pointer text-[11px]"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>التفاصيل</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ACTION & DETAILS MODAL */}
      <AnimatePresence>
        {(selectedOvertime || selectedLeave || selectedGrace || selectedPauseTask) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
            >
              {/* Modal Header */}
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                    {selectedPauseTask ? (
                      <Pause className="w-4 h-4 text-rose-400" />
                    ) : selectedOvertime ? (
                      <Clock className="w-4 h-4" />
                    ) : selectedLeave ? (
                      <Calendar className="w-4 h-4" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm">
                      {selectedPauseTask
                        ? `طلب إيقاف مهمة مؤقتاً - ${selectedPauseTask.employeeName || employees.find(e => e.id === selectedPauseTask.employeeId)?.name || 'الفني'}`
                        : selectedOvertime
                        ? `طلب وقت إضافي - ${selectedOvertime.employeeName}`
                        : selectedLeave
                        ? `طلب إجازة - ${selectedLeave.employeeName}`
                        : `طلب سماحية - ${selectedGrace?.employeeName}`}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {actionMode === 'reject' ? 'رفض الطلب مع ذكر السبب الإجباري' : 'تفاصيل الطلب الكاملة'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeModal}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Feedback Error inside Modal */}
              {feedbackMessage && (
                <div
                  className={`p-3 m-4 mb-0 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                    feedbackMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-800 border-red-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{feedbackMessage.text}</span>
                </div>
              )}

              {/* Modal Content */}
              <div className="p-6 space-y-4 text-xs">
                
                {/* Pause Task Details */}
                {selectedPauseTask && (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">الفني:</span>
                        <span className="font-black text-slate-900 text-xs">
                          {selectedPauseTask.employeeName || employees.find(e => e.id === selectedPauseTask.employeeId)?.name || 'فني غير محدد'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">نوع المهمة:</span>
                        <span className="font-black text-slate-900 text-xs">{selectedPauseTask.taskType}</span>
                      </div>
                      {selectedPauseTask.subscriberName && (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">المشترك:</span>
                          <span className="font-bold text-slate-900 text-xs">{selectedPauseTask.subscriberName}</span>
                        </div>
                      )}
                      {selectedPauseTask.subscriberPhone && (
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">الهاتف:</span>
                          <span className="font-mono text-slate-800 text-xs">{selectedPauseTask.subscriberPhone}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">وقت الطلب:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {selectedPauseTask.pauseRequestedAt ? new Date(selectedPauseTask.pauseRequestedAt).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">حالة الطلب:</span>
                        <span>{renderStatusBadge((selectedPauseTask.pauseRequestStatus || (selectedPauseTask.pauseRequested ? 'pending' : 'approved')) as any)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">سبب طلب الإيقاف المؤقت:</span>
                      <p className="text-slate-800 font-bold bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-1">
                        💬 {selectedPauseTask.pauseRequestReason || 'بدون ذكر سبب'}
                      </p>
                    </div>

                    {selectedPauseTask.pauseRejectionReason && (
                      <div className="pt-2 border-t border-slate-200 text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        <span className="text-[10px] font-black block">سبب الرفض السابق:</span>
                        <p className="font-bold">{selectedPauseTask.pauseRejectionReason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Overtime Details */}
                {selectedOvertime && (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">اسم الموظف:</span>
                        <span className="font-black text-slate-900 text-xs">{selectedOvertime.employeeName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">تاريخ الطلب:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">{selectedOvertime.date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">وقت البداية:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {selectedOvertime.startTime ? new Date(selectedOvertime.startTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">وقت النهاية:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">
                          {selectedOvertime.endTime ? new Date(selectedOvertime.endTime).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">المدة الكلية:</span>
                        <span className="font-black text-slate-900 text-xs">{formatDuration(selectedOvertime.durationMinutes || 0)}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">المبلغ المستحق المتوقع:</span>
                        <span className="font-mono font-black text-emerald-700 text-xs">
                          {Math.round(((selectedOvertime.durationMinutes || 0) / 60) * overtimeHourlyRate).toLocaleString()} د.ع
                        </span>
                      </div>
                    </div>

                    {selectedOvertime.notes && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-[10px] text-slate-400 font-bold block">ملاحظات الطلب:</span>
                        <p className="text-slate-700 font-medium">{selectedOvertime.notes}</p>
                      </div>
                    )}

                    {selectedOvertime.rejectionReason && (
                      <div className="pt-2 border-t border-slate-200 text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        <span className="text-[10px] font-black block">سبب الرفض السابق:</span>
                        <p className="font-bold">{selectedOvertime.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Leave Details */}
                {selectedLeave && (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">اسم الموظف:</span>
                        <span className="font-black text-slate-900 text-xs">{selectedLeave.employeeName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">نوع الإجازة:</span>
                        <span className="font-black text-slate-900 text-xs">
                          {selectedLeave.type === 'paid' ? 'إجازة مدفوعة 🟣' : 'إجازة بدون راتب 🔵'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">تاريخ البداية:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">{selectedLeave.startDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">تاريخ النهاية:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">{selectedLeave.endDate}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">إجمالي الأيام:</span>
                        <span className="font-black text-slate-900 text-xs">{selectedLeave.totalDays} يوم</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">حالة الطلب الحالية:</span>
                        <span>{renderStatusBadge(selectedLeave.status)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">سبب تقديم الإجازة:</span>
                      <p className="text-slate-700 font-medium">{selectedLeave.reason || 'بدون ذكر سبب'}</p>
                    </div>

                    {selectedLeave.rejectionReason && (
                      <div className="pt-2 border-t border-slate-200 text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        <span className="text-[10px] font-black block">سبب الرفض السابق:</span>
                        <p className="font-bold">{selectedLeave.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Grace Details */}
                {selectedGrace && (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">اسم الموظف:</span>
                        <span className="font-black text-slate-900 text-xs">{selectedGrace.employeeName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">نوع السماحية:</span>
                        <span className="font-black text-slate-900 text-xs">
                          {selectedGrace.type === 'late_arrival' ? 'سماحية تأخير حضور 🟡' : 'سماحية خروج مبكر 🟣'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">التاريخ:</span>
                        <span className="font-mono font-bold text-slate-800 text-xs">{selectedGrace.date}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">عدد الدقائق:</span>
                        <span className="font-mono font-bold text-amber-700 text-xs">{selectedGrace.minutes} دقيقة</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block">حالة الطلب الحالية:</span>
                        <span>{renderStatusBadge(selectedGrace.status)}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-400 font-bold block">سبب طلب السماحية:</span>
                      <p className="text-slate-700 font-medium">{selectedGrace.reason || 'بدون ذكر سبب'}</p>
                    </div>

                    {selectedGrace.rejectionReason && (
                      <div className="pt-2 border-t border-slate-200 text-red-800 bg-red-50 p-2.5 rounded-xl border border-red-200">
                        <span className="text-[10px] font-black block">سبب الرفض السابق:</span>
                        <p className="font-bold">{selectedGrace.rejectionReason}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Rejection reason form input */}
                {actionMode === 'reject' && (
                  <div>
                    <label className="font-extrabold text-slate-800 block mb-1.5">
                      سبب الرفض <span className="text-red-600 font-black">* (إجباري)</span>:
                    </label>
                    <textarea
                      rows={3}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="اكتب سبب رفض الطلب هنا ليتم توثيقه للموظف..."
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-500 text-xs"
                    />
                  </div>
                )}

              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer text-xs"
                >
                  إغلاق
                </button>

                {actionMode === 'reject' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={() => {
                      if (selectedPauseTask) handleRejectPause(selectedPauseTask);
                      else if (selectedOvertime) handleRejectOvertime(selectedOvertime);
                      else if (selectedLeave) handleRejectLeave(selectedLeave);
                      else if (selectedGrace) handleRejectGrace(selectedGrace);
                    }}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                    <span>تأكيد الرفض</span>
                  </button>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal for Creating New Grace Request */}
      <AnimatePresence>
        {showCreateGraceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 relative text-right"
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-base">
                      تقديم طلب سماحية (تأخير / خروج مبكر)
                    </h3>
                    <p className="text-xs text-slate-400">
                      سيتم إدراج الطلب في الاستثناءات والمعالجة الفورية
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateGraceModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateGraceSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    اختر الموظف <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newGraceEmpId}
                    onChange={(e) => setNewGraceEmpId(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-slate-200 p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="">-- اختر الموظف --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.role || 'موظف'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                      نوع السماحية
                    </label>
                    <select
                      value={newGraceType}
                      onChange={(e) => setNewGraceType(e.target.value as any)}
                      className="w-full rounded-2xl border border-slate-200 p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      <option value="late_arrival">سماحية تأخير حضور</option>
                      <option value="early_departure">سماحية خروج مبكر</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                      التاريخ
                    </label>
                    <input
                      type="date"
                      value={newGraceDate}
                      onChange={(e) => setNewGraceDate(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 p-2 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    عدد الدقائق المطلوبة
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={360}
                    value={newGraceMinutes}
                    onChange={(e) => setNewGraceMinutes(Math.max(1, parseInt(e.target.value) || 15))}
                    className="w-full rounded-2xl border border-slate-200 p-2.5 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1.5">
                    سبب طلب السماحية <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={newGraceReason}
                    onChange={(e) => setNewGraceReason(e.target.value)}
                    placeholder="اكتب سبب طلب السماحية بالتفصيل..."
                    className="w-full rounded-2xl border border-slate-200 p-3 text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={creatingGrace || !newGraceReason.trim() || !newGraceEmpId}
                    className="flex-1 py-3 px-4 rounded-2xl text-xs font-black text-white bg-amber-600 hover:bg-amber-700 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creatingGrace ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-4 h-4" />
                    )}
                    <span>إرسال الطلب واعتماده</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateGraceModal(false)}
                    className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
