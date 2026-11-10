import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  DollarSign,
  Calendar,
  Clock,
  FileText,
  Plus,
  Edit2,
  UserCheck,
  UserX,
  AlertCircle,
  X,
  Check,
  Search,
  ChevronRight,
  Briefcase,
  Phone,
  ShieldAlert,
  Award,
  TrendingUp,
  Building2,
  CalendarDays,
  UserPlus,
  Eye,
  Zap,
  Activity,
  CheckCircle2,
  XCircle,
  Lock,
  PauseCircle,
  PlayCircle,
  History,
  Settings,
  ShieldCheck,
  RefreshCw,
  Trash2
} from 'lucide-react';
import {
  Employee,
  Task,
  AttendanceRecord,
  OvertimeRecord,
  LeaveRequest,
  PayrollRecord,
  CompanySettings,
  EmployeeStatus,
  ManualPointsRecord
} from '../types';
import { formatArabicDateOnly, normalizeDateString } from '../utils';
import {
  saveEmployee,
  deleteEmployee,
  subscribeAttendanceRecords,
  subscribeOvertimeRecords,
  subscribeLeaveRequests,
  subscribePayrollRecords,
  subscribeCompanySettings,
  subscribeManualPoints,
  createOvertimeRecord,
  updateOvertimeRecord,
  softDeleteOvertimeRecord
} from '../lib/dbService';
import { isEmployeeOnDuty, getEffectiveLateMinutes } from '../lib/attendanceService';

// Embed existing components for Payroll, Attendance, HRSettings, and ProductionReadiness tabs
import PayrollManagement from './PayrollManagement';
import AttendanceManagement from './AttendanceManagement';
import HRSettings from './HRSettings';
import ProductionReadiness from './ProductionReadiness';
import FinancialAdjustmentsManagement from './FinancialAdjustmentsManagement';
import RewardsAndDeductionsCenter from './RewardsAndDeductionsCenter';

interface EmployeeHRCenterProps {
  employees: Employee[];
  tasks: Task[];
  userRole?: 'owner' | 'manager' | 'accountant' | 'supervisor' | 'technician';
  onAddEmployee?: (name: string, phone?: string, baseSalary?: number, role?: string, isExemptFromFingerprint?: boolean, employmentDate?: string) => void;
  onEditEmployee?: (id: string, name: string, phone?: string, baseSalary?: number, status?: EmployeeStatus, isExemptFromFingerprint?: boolean, employmentDate?: string) => void;
  onDeleteEmployee?: (id: string) => void;
}

export default function EmployeeHRCenter({
  employees,
  tasks,
  userRole = 'owner',
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee
}: EmployeeHRCenterProps) {
  const [activeTab, setActiveTab] = useState<'employees' | 'rewards' | 'financial_adjustments' | 'payroll' | 'attendance' | 'leaves' | 'overtime' | 'statement' | 'hr_settings' | 'production'>('employees');

  // Subscriptions State
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [overtimeRecords, setOvertimeRecords] = useState<OvertimeRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [manualPoints, setManualPoints] = useState<ManualPointsRecord[]>([]);

  // Reward Eligibility Modal State
  const [editingRewardEmployee, setEditingRewardEmployee] = useState<Employee | null>(null);
  const [editRewardStatus, setEditRewardStatus] = useState<'eligible' | 'excluded'>('eligible');
  const [editRewardReason, setEditRewardReason] = useState<string>('');
  const [isSavingReward, setIsSavingReward] = useState<boolean>(false);
  const [rewardSaveError, setRewardSaveError] = useState<string>('');

  // Employee Table Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals & Drawers State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingEmployee, setViewingEmployee] = useState<Employee | null>(null);
  const [statusConfirmEmployee, setStatusConfirmEmployee] = useState<{ emp: Employee; targetStatus: EmployeeStatus } | null>(null);
  const [deleteConfirmEmp, setDeleteConfirmEmp] = useState<Employee | null>(null);

  // Overtime Tab State
  const [otSearchTerm, setOtSearchTerm] = useState('');
  const [otStatusFilter, setOtStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [otEmployeeFilter, setOtEmployeeFilter] = useState<string>('all');
  const [showOtModal, setShowOtModal] = useState<boolean>(false);
  const [editingOtRecord, setEditingOtRecord] = useState<OvertimeRecord | null>(null);
  const [otModalEmpId, setOtModalEmpId] = useState<string>('');
  const [otModalDate, setOtModalDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [otModalDurationMinutes, setOtModalDurationMinutes] = useState<number>(60);
  const [otModalNotes, setOtModalNotes] = useState<string>('');
  const [otModalStatus, setOtModalStatus] = useState<'approved' | 'pending' | 'rejected'>('approved');
  const [isSavingOtModal, setIsSavingOtModal] = useState<boolean>(false);
  const [otModalMessage, setOtModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getEmployeeMinuteRate = (empId: string) => {
    const emp = employees.find(e => e.id === empId);
    const baseSalary = emp?.baseSalary || 0;
    const cycleDays = 30;
    const workHours = companySettings?.workHoursPerDay || 8;
    const dailyRate = baseSalary / cycleDays;
    const hourlyRate = dailyRate / workHours;
    return hourlyRate / 60;
  };

  const handleOpenAddOtModal = () => {
    setEditingOtRecord(null);
    setOtModalEmpId(employees[0]?.id || '');
    setOtModalDate(new Date().toISOString().split('T')[0]);
    setOtModalDurationMinutes(60);
    setOtModalNotes('');
    setOtModalStatus('approved');
    setOtModalMessage(null);
    setShowOtModal(true);
  };

  const handleOpenEditOtModal = (ot: OvertimeRecord) => {
    setEditingOtRecord(ot);
    setOtModalEmpId(ot.employeeId);
    setOtModalDate(ot.date);
    setOtModalDurationMinutes(ot.durationMinutes || 60);
    setOtModalNotes(ot.notes || '');
    setOtModalStatus(ot.status || 'approved');
    setOtModalMessage(null);
    setShowOtModal(true);
  };

  const handleSaveOtModal = async () => {
    if (!otModalEmpId) {
      setOtModalMessage({ type: 'error', text: 'يرجى اختيار الموظف.' });
      return;
    }
    if (!otModalDate) {
      setOtModalMessage({ type: 'error', text: 'يرجى تحديد التاريخ.' });
      return;
    }
    if (otModalDurationMinutes <= 0) {
      setOtModalMessage({ type: 'error', text: 'يرجى إدخال مدة صحيحة بالدقائق.' });
      return;
    }

    const emp = employees.find(e => e.id === otModalEmpId);
    setIsSavingOtModal(true);
    setOtModalMessage(null);
    try {
      if (editingOtRecord) {
        await updateOvertimeRecord(editingOtRecord.id, {
          employeeId: otModalEmpId,
          employeeName: emp?.name || editingOtRecord.employeeName,
          date: otModalDate,
          durationMinutes: Number(otModalDurationMinutes),
          notes: otModalNotes.trim(),
          status: otModalStatus,
        });
      } else {
        const newOtId = `ot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await createOvertimeRecord({
          id: newOtId,
          employeeId: otModalEmpId,
          employeeName: emp?.name || 'موظف',
          date: otModalDate,
          startTime: `${otModalDate}T17:00:00.000Z`,
          durationMinutes: Number(otModalDurationMinutes),
          status: otModalStatus,
          notes: otModalNotes.trim(),
          source: 'manual',
        });
      }
      setShowOtModal(false);
    } catch (err: any) {
      console.error('Error saving overtime:', err);
      setOtModalMessage({ type: 'error', text: err?.message || 'فشل حفظ الوقت الإضافي.' });
    } finally {
      setIsSavingOtModal(false);
    }
  };

  const handleQuickApproveOt = async (id: string) => {
    try {
      await updateOvertimeRecord(id, { status: 'approved' });
    } catch (err) {
      console.error('Failed to approve overtime', err);
    }
  };

  const handleQuickRejectOt = async (id: string) => {
    try {
      await updateOvertimeRecord(id, { status: 'rejected' });
    } catch (err) {
      console.error('Failed to reject overtime', err);
    }
  };

  const handleDeleteOt = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف سجل الوقت الإضافي هذا؟')) return;
    try {
      await softDeleteOvertimeRecord(id, userRole, 'حذف من مركز الموارد البشرية', true);
    } catch (err) {
      console.error('Failed to delete overtime record', err);
    }
  };

  // Form State for Add / Edit Employee
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState('فني');
  const [formBaseSalary, setFormBaseSalary] = useState<string>('800000');
  const [formStatus, setFormStatus] = useState<EmployeeStatus>('on_duty');
  const [formIsExemptFromFingerprint, setFormIsExemptFromFingerprint] = useState<boolean>(false);
  const [formEmploymentDate, setFormEmploymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Selected Employee for Statement / Slip Tab
  const [statementEmployeeId, setStatementEmployeeId] = useState<string>(employees[0]?.id || '');

  // Keep statementEmployeeId valid when employees list changes
  useEffect(() => {
    if (!statementEmployeeId && employees.length > 0) {
      setStatementEmployeeId(employees[0].id);
    }
  }, [employees, statementEmployeeId]);

  // Subscribe to real-time collections
  useEffect(() => {
    const unsubAttendance = subscribeAttendanceRecords((records) => setAttendanceRecords(records), () => {});
    const unsubOvertime = subscribeOvertimeRecords((records) => setOvertimeRecords(records), () => {});
    const unsubLeaves = subscribeLeaveRequests((reqs) => setLeaveRequests(reqs), () => {});
    const unsubPayroll = subscribePayrollRecords((records) => setPayrollRecords(records), () => {});
    const unsubSettings = subscribeCompanySettings((settings) => setCompanySettings(settings), () => {});
    const unsubManualPoints = subscribeManualPoints((pts) => setManualPoints(pts), () => {});

    return () => {
      unsubAttendance();
      unsubOvertime();
      unsubLeaves();
      unsubPayroll();
      unsubSettings();
      unsubManualPoints();
    };
  }, []);

  // Reward Eligibility Handlers
  const handleOpenRewardEditModal = (emp: Employee) => {
    setEditingRewardEmployee(emp);
    const isEx = emp.rewardStatus === 'excluded' || emp.excluded === true;
    setEditRewardStatus(isEx ? 'excluded' : 'eligible');
    setEditRewardReason(emp.rewardExclusionReason || '');
    setRewardSaveError('');
  };

  const handleSaveRewardEligibility = async () => {
    if (!editingRewardEmployee) return;
    setIsSavingReward(true);
    setRewardSaveError('');
    try {
      const oldStatus = editingRewardEmployee.rewardStatus || (editingRewardEmployee.excluded ? 'excluded' : 'eligible');
      const oldReason = editingRewardEmployee.rewardExclusionReason || '';

      const updatedEmp: Employee = {
        ...editingRewardEmployee,
        rewardStatus: editRewardStatus,
        eligible: editRewardStatus === 'eligible',
        excluded: editRewardStatus === 'excluded',
        rewardExclusionReason: editRewardStatus === 'excluded' ? editRewardReason : '',
      };

      // 1. Save to Firestore
      await saveEmployee(updatedEmp);

      setEditingRewardEmployee(null);
    } catch (err: any) {
      console.error('Error saving reward eligibility:', err);
      setRewardSaveError(err.message || 'حدث خطأ أثناء حفظ التعديلات');
    } finally {
      setIsSavingReward(false);
    }
  };

  // Filtered Employees List
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.phone && emp.phone.includes(searchTerm)) ||
        (emp.role && emp.role.toLowerCase().includes(searchTerm.toLowerCase()));

      const empStatus = emp.status || 'on_duty';
      const matchesStatus = statusFilter === 'all' || empStatus === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [employees, searchTerm, statusFilter]);

  // Helper for status badge
  const renderStatusBadge = (status?: EmployeeStatus) => {
    const st = status || 'on_duty';
    switch (st) {
      case 'on_duty':
        return (
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            نشط (على رأس العمل)
          </span>
        );
      case 'suspended':
        return (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit">
            <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
            موقوف عن العمل
          </span>
        );
      case 'terminated':
        return (
          <span className="bg-red-50 text-red-700 border border-red-200 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit">
            <UserX className="w-3.5 h-3.5 text-red-600" />
            منتهي الخدمة
          </span>
        );
      case 'long_leave':
        return (
          <span className="bg-purple-50 text-purple-700 border border-purple-200 text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-fit">
            <CalendarDays className="w-3.5 h-3.5 text-purple-600" />
            في إجازة طويلة
          </span>
        );
      default:
        return (
          <span className="bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold px-2.5 py-1 rounded-full w-fit">
            غير محدد
          </span>
        );
    }
  };

  // Open Modal for Add
  const handleOpenAddModal = () => {
    setFormName('');
    setFormPhone('');
    setFormRole('فني');
    setFormBaseSalary('800000');
    setFormStatus('on_duty');
    setFormIsExemptFromFingerprint(false);
    setFormEmploymentDate(new Date().toISOString().split('T')[0]);
    setFormError('');
    setShowAddModal(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormPhone(emp.phone || '');
    
    // Normalize role to one of the 3 canonical roles: فني, اداري, مدير
    const rawRole = (emp.role || '').toLowerCase().trim();
    let canonicalRole = 'فني';
    if (rawRole.includes('مدير') || rawRole.includes('manager') || rawRole.includes('owner') || rawRole.includes('supervisor') || rawRole.includes('مشرف') || rawRole.includes('مالك')) {
      canonicalRole = 'مدير';
    } else if (rawRole.includes('اداري') || rawRole.includes('إداري') || rawRole.includes('admin') || rawRole.includes('accountant') || rawRole.includes('محاسب') || rawRole.includes('hr')) {
      canonicalRole = 'اداري';
    } else {
      canonicalRole = 'فني';
    }
    setFormRole(canonicalRole);
    setFormBaseSalary(emp.baseSalary ? String(emp.baseSalary) : '800000');
    setFormStatus(emp.status || 'on_duty');
    setFormIsExemptFromFingerprint(Boolean(emp.isExemptFromFingerprint || emp.exemptFromFingerprint));
    const rawDate = emp.employmentDate || emp.joinDate || emp.joinedAt;
    const empDate = normalizeDateString(rawDate) || new Date().toISOString().split('T')[0];
    setFormEmploymentDate(empDate);
    setFormError('');
  };

  // Submit Add / Edit Form
  const handleSaveEmployeeForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('يرجى إدخال اسم الموظف.');
      return;
    }

    const parsedSalary = Number(formBaseSalary);
    if (isNaN(parsedSalary) || parsedSalary <= 0) {
      setFormError('يرجى إدخال الراتب الأساسي (Base Salary) بشكل صحيح وبقيمة أكبر من صفر.');
      return;
    }

    setIsSaving(true);
    try {
      const selectedDate = normalizeDateString(formEmploymentDate) || new Date().toISOString().split('T')[0];
      if (editingEmployee) {
        // Edit mode
        const updatedEmp: Employee = {
          ...editingEmployee,
          name: formName.trim(),
          phone: formPhone.trim() || undefined,
          role: formRole.trim(),
          baseSalary: parsedSalary,
          status: formStatus,
          isExemptFromFingerprint: formIsExemptFromFingerprint,
          exemptFromFingerprint: formIsExemptFromFingerprint,
          employmentDate: selectedDate,
          joinDate: selectedDate,
          joinedAt: selectedDate ? `${selectedDate}T00:00:00.000Z` : editingEmployee.joinedAt
        };

        if (onEditEmployee) {
          await onEditEmployee(
            updatedEmp.id,
            updatedEmp.name,
            updatedEmp.phone,
            updatedEmp.baseSalary,
            updatedEmp.status,
            formIsExemptFromFingerprint,
            selectedDate
          );
        }
        await saveEmployee(updatedEmp);
        setEditingEmployee(null);
      } else {
        // Add mode
        const newEmp: Employee = {
          id: `emp-${Date.now()}`,
          name: formName.trim(),
          phone: formPhone.trim() || undefined,
          role: formRole.trim(),
          baseSalary: parsedSalary,
          status: formStatus,
          isExemptFromFingerprint: formIsExemptFromFingerprint,
          exemptFromFingerprint: formIsExemptFromFingerprint,
          employmentDate: selectedDate,
          joinDate: selectedDate,
          joinedAt: `${selectedDate}T00:00:00.000Z`
        };

        if (onAddEmployee) {
          await onAddEmployee(
            formName.trim(),
            formPhone.trim() || undefined,
            parsedSalary,
            formRole.trim(),
            formIsExemptFromFingerprint,
            selectedDate
          );
        }
        await saveEmployee(newEmp);
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Error saving employee:', err);
      setFormError('حدث خطأ أثناء حفظ بيانات الموظف. يرجى إعادة المحاولة.');
    } finally {
      setIsSaving(false);
    }
  };

  // Change Employee Status (Suspend / Terminate / Activate)
  const handleChangeStatus = async (emp: Employee, targetStatus: EmployeeStatus) => {
    try {
      const updatedEmp: Employee = {
        ...emp,
        status: targetStatus
      };
      if (onEditEmployee) {
        await onEditEmployee(
          emp.id,
          emp.name,
          emp.phone,
          emp.baseSalary,
          targetStatus,
          emp.isExemptFromFingerprint,
          emp.employmentDate
        );
      } else {
        await saveEmployee(updatedEmp);
      }
      setStatusConfirmEmployee(null);
      if (viewingEmployee?.id === emp.id) {
        setViewingEmployee(updatedEmp);
      }
    } catch (err) {
      console.error('Error changing employee status:', err);
      alert('حدث خطأ أثناء تغيير حالة الموظف.');
    }
  };

  // Selected Employee Calculations for Details Drawer & Statement Tab
  const getEmployeeStats = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);

    // Attendance stats
    const empAttendance = attendanceRecords.filter((a) => a.employeeId === empId);
    const absenceCount = empAttendance.filter((a) => a.status === 'absent' && isEmployeeOnDuty(emp, a.date)).length;
    const lateCount = empAttendance.filter((a) => getEffectiveLateMinutes(a, companySettings?.workStartTime, companySettings?.lateToleranceMinutes) > 0).length;

    // Overtime stats
    const empOvertime = overtimeRecords.filter((o) => o.employeeId === empId && o.status === 'approved');
    const totalOvertimeMinutes = empOvertime.reduce((sum, o) => sum + (o.durationMinutes || 0), 0);
    const totalOvertimeHours = (totalOvertimeMinutes / 60).toFixed(1);

    // Leave stats
    const empLeaves = leaveRequests.filter((l) => l.employeeId === empId && l.status === 'approved');
    const approvedLeaveDays = empLeaves.reduce((sum, l) => sum + (l.totalDays || 0), 0);
    const defaultPaidLeaves = companySettings?.paidLeavesPerCycle || 21;
    const remainingLeaveBalance = Math.max(0, defaultPaidLeaves - approvedLeaveDays);

    // Payroll stats
    const empPayrollRecords = payrollRecords
      .filter((p) => p.employeeId === empId)
      .sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());

    const lastPayroll = empPayrollRecords[0];

    // Estimated Net Salary calculation
    const baseSalary = emp?.baseSalary || 800000;
    const overtimeHourlyRate = companySettings?.overtimeHourlyRate || 1.5;
    const hourlyRate = baseSalary / 30 / 8;
    const estimatedOvertimePay = Math.round(Number(totalOvertimeHours) * hourlyRate * overtimeHourlyRate);
    const estimatedAbsenceDeduction = Math.round(absenceCount * (baseSalary / 30));
    const estimatedNetSalary = Math.max(0, baseSalary + estimatedOvertimePay - estimatedAbsenceDeduction);

    return {
      emp,
      baseSalary,
      absenceCount,
      lateCount,
      totalOvertimeHours,
      approvedLeaveDays,
      remainingLeaveBalance,
      lastPayroll,
      estimatedOvertimePay,
      estimatedAbsenceDeduction,
      estimatedNetSalary
    };
  };

  return (
    <div className="space-y-6 text-right pb-12" dir="rtl">
      
      {/* Top Banner Header */}
      <div className="bg-slate-900 text-white p-6 md:p-8 rounded-3xl shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black px-3 py-1 rounded-full flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-blue-400" />
                الإصدار 1.0.1 - الموارد البشرية والعمليات
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
                FutureX HR Center
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              <span>الموظفون والرواتب (HR & Payroll Center)</span>
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-medium">
              المركز الموحد الشامل لإدارة الموظفين، مسيرات الرواتب، سجلات الحضور والانصراف، الإجازات، والوقت الإضافي
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-slate-800/90 border border-slate-700/80 px-4 py-2.5 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">إجمالي الموظفين</span>
                <span className="text-base font-black text-white font-mono">{employees.length} موظف</span>
              </div>
            </div>

            <div className="bg-slate-800/90 border border-slate-700/80 px-4 py-2.5 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-bold block">مكتمل المسيرات</span>
                <span className="text-base font-black text-emerald-400 font-mono">{payrollRecords.length} مسير</span>
              </div>
            </div>
          </div>
        </div>

        {/* 9 Tab Bar Navigation */}
        <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-800/80">
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'employees'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>1. الموظفون</span>
          </button>

          <button
            onClick={() => setActiveTab('rewards')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'rewards'
                ? 'bg-purple-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>2. المكافآت والحوافز</span>
          </button>

          <button
            onClick={() => setActiveTab('financial_adjustments')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'financial_adjustments'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <DollarSign className="w-4 h-4 text-amber-400" />
            <span>3. الخصومات والتعديلات المالية</span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>4. الحضور والإنصراف</span>
          </button>

          <button
            onClick={() => setActiveTab('leaves')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'leaves'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>5. الإجازات</span>
          </button>

          <button
            onClick={() => setActiveTab('overtime')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'overtime'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>6. الوقت الإضافي</span>
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'payroll'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>7. الرواتب</span>
          </button>

          <button
            onClick={() => setActiveTab('statement')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'statement'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>8. سجل الرواتب المسلمة</span>
          </button>

          <button
            onClick={() => setActiveTab('hr_settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'hr_settings'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>9. إعدادات HR</span>
          </button>

          <button
            onClick={() => setActiveTab('production')}
            className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'production'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>10. جاهزية النظام Production</span>
          </button>
        </div>
      </div>

      {/* TAB 1: EMPLOYEES (الموظفون) */}
      {activeTab === 'employees' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          
          {/* Action Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900">سجل الموظفين والكوادر الوظيفية</h3>
                <p className="text-xs text-slate-500 font-medium">عرض، إضافة، وتعديل بيانات الموظفين والرواتب الأساسية والحالات الوظيفية</p>
              </div>
            </div>

            {userRole === 'owner' && (
              <button
                onClick={handleOpenAddModal}
                className="bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-5 py-2.5 rounded-2xl transition-all shadow-md flex items-center gap-2 cursor-pointer self-start sm:self-auto"
              >
                <UserPlus className="w-4 h-4" />
                <span>إضافة موظف جديد</span>
              </button>
            )}
          </div>

          {/* Search & Status Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="البحث بالاسم، رقم الهاتف، أو الوظيفة..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">جميع الحالات الوظيفية</option>
              <option value="on_duty">نشط (على رأس العمل)</option>
              <option value="suspended">موقوف عن العمل</option>
              <option value="terminated">منتهي الخدمة</option>
              <option value="long_leave">في إجازة طويلة</option>
            </select>
          </div>

          {/* Employees Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3.5 font-black">الاسم</th>
                  <th className="p-3.5 font-black">رقم الهاتف</th>
                  <th className="p-3.5 font-black">الوظيفة</th>
                  <th className="p-3.5 font-black">الراتب الأساسي (Base Salary)</th>
                  <th className="p-3.5 font-black">حالة الموظف</th>
                  <th className="p-3.5 font-black">تاريخ التعيين</th>
                  <th className="p-3.5 font-black text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
                {filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-bold">
                      لا يوجد موظفون ينطبق عليهم معيار البحث المحدد.
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-black text-slate-900">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 font-black flex items-center justify-center shrink-0">
                            {emp.name.slice(0, 1)}
                          </div>
                          <span className="truncate max-w-[160px]" title={emp.name}>{emp.name}</span>
                          {(emp.isExemptFromFingerprint || emp.exemptFromFingerprint) && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 flex items-center gap-1" title="غير مشمول بالبصمة - حضور تلقائي">
                              <span>غير مشمول بالبصمة 🛡️</span>
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="p-3.5 font-mono text-slate-600 dir-ltr text-right">
                        {emp.phone || <span className="text-slate-300 font-sans">غير مسجل</span>}
                      </td>

                      <td className="p-3.5 font-bold text-slate-700">
                        {emp.role || 'فني'}
                      </td>

                      <td className="p-3.5 font-black text-emerald-700 font-mono">
                        {emp.baseSalary ? `${emp.baseSalary.toLocaleString()} د.ع` : '800,000 د.ع'}
                      </td>

                      <td className="p-3.5">
                        {renderStatusBadge(emp.status)}
                      </td>

                      <td className="p-3.5 text-slate-500 font-mono">
                        {formatArabicDateOnly(emp.joinedAt)}
                      </td>

                      <td className="p-3.5">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* View Details Button */}
                          <button
                            onClick={() => setViewingEmployee(emp)}
                            className="p-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5"
                            title="تفاصيل الموظف"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>تفاصيل</span>
                          </button>

                          {/* Edit Button */}
                          {userRole === 'owner' && (
                            <button
                              onClick={() => handleOpenEditModal(emp)}
                              className="p-1.5 bg-slate-100 hover:bg-amber-50 text-slate-700 hover:text-amber-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5"
                              title="تعديل الموظف"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>تعديل</span>
                            </button>
                          )}

                          {/* Suspend Button */}
                          {userRole === 'owner' && emp.status !== 'suspended' && (
                            <button
                              onClick={() => setStatusConfirmEmployee({ emp, targetStatus: 'suspended' })}
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-amber-200"
                              title="إيقاف الموظف"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                              <span>إيقاف</span>
                            </button>
                          )}

                          {/* Resume / Reactivate Button (إعادة للعمل) */}
                          {userRole === 'owner' && (emp.status === 'suspended' || emp.status === 'terminated') && (
                            <button
                              onClick={() => setStatusConfirmEmployee({ emp, targetStatus: 'on_duty' })}
                              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-emerald-200 shadow-2xs"
                              title="إعادة الموظف للعمل"
                            >
                              <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span>إعادة للعمل</span>
                            </button>
                          )}

                          {/* Terminate Button */}
                          {userRole === 'owner' && emp.status !== 'terminated' && (
                            <button
                              onClick={() => setStatusConfirmEmployee({ emp, targetStatus: 'terminated' })}
                              className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-red-200"
                              title="إنهاء خدمة"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>إنهاء خدمة</span>
                            </button>
                          )}

                          {/* Permanent Delete Button */}
                          {userRole === 'owner' && (
                            <button
                              onClick={() => setDeleteConfirmEmp(emp)}
                              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold px-2.5 border border-rose-200"
                              title="حذف الموظف نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف نهائياً</span>
                            </button>
                          )}

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

      {/* TAB 2: REWARDS & ELIGIBILITY (المكافآت والحوافز) */}
      {activeTab === 'rewards' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900">إدارة شمولية المكافآت والحوافز</h3>
                <p className="text-xs text-slate-500 font-medium">تحديد الموظفين المشمولين أو المستبعدين من محرك المكافآت وتدوين أسباب الاستبعاد</p>
              </div>
            </div>
          </div>

          {/* Table of Employees */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200/80">
                <tr>
                  <th className="p-3.5">اسم الموظف</th>
                  <th className="p-3.5">عدد النقاط المجمعة</th>
                  <th className="p-3.5">الحالة</th>
                  <th className="p-3.5">سبب الاستبعاد</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {employees.map((emp) => {
                  const empTasks = tasks.filter((t) => t.employeeId === emp.id && t.status === 'completed');
                  const taskPts = empTasks.reduce((sum, t) => sum + (t.points || 0), 0);
                  const empManual = manualPoints.filter((mp) => mp.employeeId === emp.id);
                  const manualPts = empManual.reduce((sum, mp) => mp.type === 'gift' ? sum + (mp.points || 0) : sum - (mp.points || 0), 0);
                  const accumulatedPts = Math.max(0, taskPts + manualPts);

                  const isExcluded = emp.rewardStatus === 'excluded' || emp.excluded === true;

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                            {emp.name.charAt(0)}
                          </div>
                          <div>
                            <span className="block">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 block">{emp.role || 'فني'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 border border-purple-100 px-2.5 py-1 rounded-xl">
                          {accumulatedPts} نقطة
                        </span>
                      </td>
                      <td className="p-3.5">
                        {isExcluded ? (
                          <span className="bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <UserX className="w-3.5 h-3.5 text-amber-600" />
                            غير مشمول
                          </span>
                        ) : (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                            مشمول
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-slate-600 max-w-xs truncate">
                        {isExcluded ? (emp.rewardExclusionReason || 'لم يحدد سبب') : '—'}
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenRewardEditModal(emp)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                          <span>تعديل</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FINANCIAL ADJUSTMENTS TAB (التعديلات والخصومات المالية) */}
      {activeTab === 'financial_adjustments' && (
        <FinancialAdjustmentsManagement employees={employees} userRole={userRole} />
      )}

      {/* TAB 2: PAYROLL (الرواتب) */}
      {activeTab === 'payroll' && (
        <PayrollManagement employees={employees} userRole={userRole as any} />
      )}

      {/* TAB 3: ATTENDANCE (الحضور) */}
      {activeTab === 'attendance' && (
        <AttendanceManagement employees={employees} userRole={userRole as any} />
      )}

      {/* TAB 4: LEAVES (الإجازات) */}
      {activeTab === 'leaves' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <CalendarDays className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900">سجل الإجازات والطلبات المعتمدة</h3>
                <p className="text-xs text-slate-500 font-medium">عرض جميع طلِبات الإجازات المدفوعة والغير مدفوعة للموظفين</p>
              </div>
            </div>
            <span className="bg-purple-50 text-purple-700 border border-purple-200 text-xs font-black px-3 py-1 rounded-full">
              {leaveRequests.length} طلب إجازة
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="p-3.5 font-black">الموظف</th>
                  <th className="p-3.5 font-black">نوع الإجازة</th>
                  <th className="p-3.5 font-black">تاريخ البداية</th>
                  <th className="p-3.5 font-black">تاريخ النهاية</th>
                  <th className="p-3.5 font-black">عدد الأيام</th>
                  <th className="p-3.5 font-black">الحالة</th>
                  <th className="p-3.5 font-black">السبب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
                {leaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-bold">
                      لا توجد طلبات إجازة مسجلة حتى الآن.
                    </td>
                  </tr>
                ) : (
                  leaveRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-black text-slate-900">{req.employeeName}</td>
                      <td className="p-3.5 font-bold">
                        {req.type === 'paid' ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">مدفوعة الأجر</span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">بدون أجر</span>
                        )}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">{req.startDate}</td>
                      <td className="p-3.5 font-mono text-slate-600">{req.endDate}</td>
                      <td className="p-3.5 font-black text-slate-900 font-mono">{req.totalDays} يوم</td>
                      <td className="p-3.5">
                        {req.status === 'approved' && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-full">معتمدة ✅</span>}
                        {req.status === 'pending' && <span className="bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2.5 py-1 rounded-full">قيد الانتظار ⏳</span>}
                        {req.status === 'rejected' && <span className="bg-red-50 text-red-700 border border-red-200 font-bold px-2.5 py-1 rounded-full">مرفوضة ❌</span>}
                      </td>
                      <td className="p-3.5 text-slate-500 max-w-xs truncate">{req.reason || 'بدون سبب'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: OVERTIME (الوقت الإضافي) */}
      {activeTab === 'overtime' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900">سجل وإدارة الوقت الإضافي (Overtime Center)</h3>
                <p className="text-xs text-slate-500 font-medium">
                  احتساب أجر الدقيقة بدقة ومطابقة تامة لدورة الرواتب مع إمكانية التعديل والإضافة المباشرة
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenAddOtModal}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة وقت إضافي جديد</span>
            </button>
          </div>

          {/* Overtime KPI Stats */}
          {(() => {
            const nonDeletedRecords = overtimeRecords.filter((ot) => !(ot as any).isDeleted);
            const approvedRecords = nonDeletedRecords.filter((ot) => ot.status === 'approved');
            const pendingRecords = nonDeletedRecords.filter((ot) => ot.status === 'pending');
            const rejectedRecords = nonDeletedRecords.filter((ot) => ot.status === 'rejected');

            const totalApprovedMinutes = approvedRecords.reduce((acc, ot) => acc + (ot.durationMinutes || 0), 0);
            const totalApprovedCost = approvedRecords.reduce((acc, ot) => {
              const minuteRate = getEmployeeMinuteRate(ot.employeeId);
              return acc + Math.round((ot.durationMinutes || 0) * minuteRate);
            }, 0);

            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-100 space-y-1">
                  <span className="text-[11px] text-amber-800 font-bold block">إجمالي الساعات المعتمدة</span>
                  <div className="text-xl font-black font-mono text-amber-950">
                    {(totalApprovedMinutes / 60).toFixed(1)} <span className="text-xs font-sans text-amber-700">ساعة ({totalApprovedMinutes} د)</span>
                  </div>
                </div>

                <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-100 space-y-1">
                  <span className="text-[11px] text-emerald-800 font-bold block">إجمالي المستحقات المعتمدة</span>
                  <div className="text-xl font-black font-mono text-emerald-950">
                    +{totalApprovedCost.toLocaleString()} <span className="text-xs font-sans text-emerald-700">د.ع</span>
                  </div>
                </div>

                <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-100 space-y-1">
                  <span className="text-[11px] text-blue-800 font-bold block">طلبات بانتظار الاعتماد</span>
                  <div className="text-xl font-black font-mono text-blue-950">
                    {pendingRecords.length} <span className="text-xs font-sans text-blue-700">طلب</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-1">
                  <span className="text-[11px] text-slate-600 font-bold block">إجمالي السجلات المسجلة</span>
                  <div className="text-xl font-black font-mono text-slate-900">
                    {nonDeletedRecords.length} <span className="text-xs font-sans text-slate-500">سجل</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث باسم الموظف أو الملاحظات..."
                value={otSearchTerm}
                onChange={(e) => setOtSearchTerm(e.target.value)}
                className="w-full pl-3 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>

            {/* Employee Filter */}
            <div>
              <select
                value={otEmployeeFilter}
                onChange={(e) => setOtEmployeeFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">جميع الموظفين ({employees.length})</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.department || 'عام'})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={otStatusFilter}
                onChange={(e) => setOtStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">جميع الحالات</option>
                <option value="approved">معتمد فقط ✅</option>
                <option value="pending">قيد الانتظار ⏳</option>
                <option value="rejected">مرفوض ❌</option>
              </select>
            </div>
          </div>

          {/* Table */}
          {(() => {
            const filteredRecords = overtimeRecords.filter((ot) => {
              if ((ot as any).isDeleted) return false;
              if (otStatusFilter !== 'all' && ot.status !== otStatusFilter) return false;
              if (otEmployeeFilter !== 'all' && ot.employeeId !== otEmployeeFilter) return false;
              if (otSearchTerm.trim()) {
                const term = otSearchTerm.toLowerCase();
                const matchName = ot.employeeName?.toLowerCase().includes(term);
                const matchNotes = ot.notes?.toLowerCase().includes(term);
                if (!matchName && !matchNotes) return false;
              }
              return true;
            });

            return (
              <div className="overflow-x-auto rounded-2xl border border-slate-200/80">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="p-3.5 font-black">الموظف</th>
                      <th className="p-3.5 font-black">التاريخ</th>
                      <th className="p-3.5 font-black">مدة الإضافي</th>
                      <th className="p-3.5 font-black">سعر الدقيقة</th>
                      <th className="p-3.5 font-black">المستحق المالي</th>
                      <th className="p-3.5 font-black">الحالة</th>
                      <th className="p-3.5 font-black">ملاحظات</th>
                      <th className="p-3.5 font-black text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800 bg-white">
                    {filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-400 font-bold">
                          لا توجد سجلات وقت إضافي مطابقة للبحث أو الفلتر.
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((ot) => {
                        const minuteRate = getEmployeeMinuteRate(ot.employeeId);
                        const amount = Math.round((ot.durationMinutes || 0) * minuteRate);

                        return (
                          <tr key={ot.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5">
                              <div className="font-black text-slate-900">{ot.employeeName}</div>
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {employees.find((e) => e.id === ot.employeeId)?.department || 'عام'}
                              </span>
                            </td>
                            <td className="p-3.5 font-mono text-slate-600">{ot.date}</td>
                            <td className="p-3.5 font-black text-amber-700 font-mono">
                              {(ot.durationMinutes / 60).toFixed(1)} س ({ot.durationMinutes} د)
                            </td>
                            <td className="p-3.5 font-mono text-slate-600">
                              {minuteRate.toFixed(2)} د.ع/د
                            </td>
                            <td className="p-3.5 font-mono font-black text-emerald-700">
                              {ot.status === 'approved' ? `+${amount.toLocaleString()} د.ع` : '0'}
                            </td>
                            <td className="p-3.5">
                              {ot.status === 'approved' && (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                  معتمد ✅
                                </span>
                              )}
                              {ot.status === 'pending' && (
                                <span className="bg-amber-50 text-amber-700 border border-amber-200 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                  قيد الانتظار ⏳
                                </span>
                              )}
                              {ot.status === 'rejected' && (
                                <span className="bg-red-50 text-red-700 border border-red-200 font-bold px-2.5 py-1 rounded-full text-[11px]">
                                  مرفوض ❌
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-slate-500 max-w-xs truncate">{ot.notes || 'بدون ملاحظات'}</td>
                            <td className="p-3.5 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  title="تعديل هذا السجل"
                                  onClick={() => handleOpenEditOtModal(ot)}
                                  className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg cursor-pointer transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>

                                {ot.status !== 'approved' && (
                                  <button
                                    type="button"
                                    title="اعتماد"
                                    onClick={() => handleQuickApproveOt(ot.id)}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                {ot.status !== 'rejected' && (
                                  <button
                                    type="button"
                                    title="رفض"
                                    onClick={() => handleQuickRejectOt(ot.id)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg cursor-pointer transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  type="button"
                                  title="حذف"
                                  onClick={() => handleDeleteOt(ot.id)}
                                  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg cursor-pointer transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
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
            );
          })()}
        </div>
      )}

      {/* TAB 6: EMPLOYEE STATEMENT (كشف الموظف) */}
      {activeTab === 'statement' && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900">كشف حساب الموظف التفصيلي (Employee Statement)</h3>
                <p className="text-xs text-slate-500 font-medium">ملخص كامل للرواتب الأساسية، الإضافات، الخصومات، والمسيرات المعتمدة</p>
              </div>
            </div>

            {/* Employee Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 shrink-0">اختر الموظف:</span>
              <select
                value={statementEmployeeId}
                onChange={(e) => setStatementEmployeeId(e.target.value)}
                className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-w-[200px]"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.role || 'فني'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Statement Content */}
          {(() => {
            const stats = getEmployeeStats(statementEmployeeId);
            const currentEmp = stats.emp;

            if (!currentEmp) {
              return (
                <div className="text-center py-12 text-slate-400 font-bold">
                  يرجى اختيار موظف لعرض كشف الحساب الخاص به.
                </div>
              );
            }

            return (
              <div className="space-y-6">
                
                {/* Top Employee Bio Summary Card */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white font-black text-lg flex items-center justify-center shadow-sm">
                      {currentEmp.name.slice(0, 1)}
                    </div>
                    <div>
                      <h4 className="font-black text-lg text-slate-900">{currentEmp.name}</h4>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">
                        الوظيفة: <span className="text-blue-700">{currentEmp.role || 'فني'}</span> | تاريخ التعيين: <span className="font-mono">{formatArabicDateOnly(currentEmp.joinedAt)}</span>
                      </p>
                    </div>
                  </div>

                  <div>{renderStatusBadge(currentEmp.status)}</div>
                </div>

                {/* Main Statement Metric Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  
                  <div className="p-4 bg-white rounded-2xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">الراتب الأساسي (Base Salary):</span>
                    <span className="text-lg font-black text-slate-900 font-mono block">
                      {stats.baseSalary.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">مسجل في العقد الفعلي</span>
                  </div>

                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-1">
                    <span className="text-[10px] text-emerald-800 font-bold block">إجمالي الإضافات (Overtime):</span>
                    <span className="text-lg font-black text-emerald-700 font-mono block">
                      +{stats.estimatedOvertimePay.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-emerald-600 font-bold">عن {stats.totalOvertimeHours} ساعة إضافي</span>
                  </div>

                  <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-1">
                    <span className="text-[10px] text-amber-800 font-bold block">خصومات الغياب والتأخير:</span>
                    <span className="text-lg font-black text-amber-800 font-mono block">
                      -{stats.estimatedAbsenceDeduction.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-amber-700 font-bold">عن {stats.absenceCount} يوم غياب | {stats.lateCount} تأخير</span>
                  </div>

                  <div className="p-4 bg-purple-50/60 rounded-2xl border border-purple-200/80 space-y-1">
                    <span className="text-[10px] text-purple-800 font-bold block">رصيد الإجازات المتبقي:</span>
                    <span className="text-lg font-black text-purple-800 font-mono block">
                      {stats.remainingLeaveBalance} يوم
                    </span>
                    <span className="text-[10px] text-purple-600 font-bold">من أصل {companySettings?.paidLeavesPerCycle || 21} يوم سنوياً</span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">السلف والمكافآت:</span>
                    <span className="text-lg font-black text-slate-900 font-mono block">
                      0 د.ع
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">لا توجد سلف نشطة</span>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">آخر راتب معتمد:</span>
                    <span className="text-lg font-black text-blue-700 font-mono block">
                      {stats.lastPayroll ? `${stats.lastPayroll.netSalary.toLocaleString()} د.ع` : 'لا يوجد مسير معتمد'}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">
                      {stats.lastPayroll ? `دورة ${stats.lastPayroll.periodId}` : 'لم يتم إغلاق مسير بعد'}
                    </span>
                  </div>

                  <div className="p-4 bg-slate-900 text-white rounded-2xl border border-slate-800 col-span-1 sm:col-span-2 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold block">الراتب الصافي المتوقع (Expected Net Salary):</span>
                    <span className="text-xl font-black text-emerald-400 font-mono block">
                      {stats.estimatedNetSalary.toLocaleString()} د.ع
                    </span>
                    <span className="text-[10px] text-slate-300 font-medium">
                      المعادلة: الأساسي + الإضافي - الخصومات
                    </span>
                  </div>

                </div>

              </div>
            );
          })()}
        </div>
      )}

      {/* MODAL: ADD / EDIT EMPLOYEE */}
      {(showAddModal || editingEmployee) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" />
                <span>{editingEmployee ? 'تعديل بيانات الموظف والراتب' : 'إضافة موظف جديد'}</span>
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingEmployee(null);
                }}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEmployeeForm} className="space-y-4">
              
              {/* Employee Name */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  اسم الموظف الكامل <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: أحمد علي محمد"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  required
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  رقم الهاتف (Phone Number)
                </label>
                <input
                  type="text"
                  placeholder="07700000000"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dir-ltr text-right"
                />
              </div>

              {/* Job / Role Type Selection (فني / اداري / مدير) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black text-slate-800">
                    تحديد نوع الوظيفة <span className="text-red-500">* (إلزامي)</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-400">
                    {formRole === 'فني' ? '🔧 مؤهل لاستلام المهام الميدانية' : '🔒 وظيفة مكتبية / إدارية'}
                  </span>
                </div>

                {/* 3 Role Selection Cards */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFormRole('فني')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer text-center ${
                      formRole === 'فني'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">🔧</span>
                    <span>فني</span>
                    <span className={`text-[9px] font-medium leading-tight ${formRole === 'فني' ? 'text-blue-100' : 'text-slate-400'}`}>
                      استلام المهام
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormRole('اداري')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer text-center ${
                      formRole === 'اداري'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm ring-2 ring-purple-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">📁</span>
                    <span>اداري</span>
                    <span className={`text-[9px] font-medium leading-tight ${formRole === 'اداري' ? 'text-purple-100' : 'text-slate-400'}`}>
                      عمل مكتبي
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormRole('مدير')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 cursor-pointer text-center ${
                      formRole === 'مدير'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-300'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-base">👑</span>
                    <span>مدير</span>
                    <span className={`text-[9px] font-medium leading-tight ${formRole === 'مدير' ? 'text-amber-100' : 'text-slate-400'}`}>
                      إدارة وإشراف
                    </span>
                  </button>
                </div>

                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="فني">فني (Technician - مؤهل لإرسال الطلبات والمهام له ويظهر في الجاهزون لمهام)</option>
                  <option value="اداري">اداري (Administrative - موظف إداري)</option>
                  <option value="مدير">مدير (Manager - إدارة وإشراف)</option>
                </select>
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  💡 تنبيه: فقط الموظف المصنف كـ <strong className="text-blue-700">فني</strong> يمكن إرسال الطلبات والمهام إليه ويظهر اسمه في قائمة <strong className="text-emerald-700">جاهزون منتظرون المهام</strong>.
                </p>
              </div>

              {/* Base Salary (إلزامي - Number - يحفظ بـ baseSalary) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  الراتب الأساسي (Base Salary) <span className="text-red-500">* (إلزامي)</span>
                </label>
                <input
                  type="number"
                  placeholder="800000"
                  value={formBaseSalary}
                  onChange={(e) => setFormBaseSalary(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  min="0"
                  step="1000"
                  required
                />
                <p className="text-[10px] text-slate-400 font-bold mt-1">
                  يحفظ هذا المبلغ داخل حقل <code className="font-mono text-blue-600">baseSalary</code> في ملف الموظف لاستخدامه التلقائي في حساب مسيرات الرواتب.
                </p>
              </div>

              {/* Employment Status */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  الحالة الوظيفية
                </label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as EmployeeStatus)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="on_duty">نشط (على رأس العمل)</option>
                  <option value="suspended">موقوف عن العمل</option>
                  <option value="terminated">منتهي الخدمة</option>
                  <option value="long_leave">في إجازة طويلة</option>
                </select>
              </div>

              {/* Employment Start Date (تاريخ المباشرة بالعمل) */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  تاريخ المباشرة بالعمل (Employment Start Date)
                </label>
                <div className="space-y-1.5">
                  <input
                    type="text"
                    value={formEmploymentDate}
                    onChange={(e) => setFormEmploymentDate(e.target.value)}
                    placeholder="مثال: 31/7 أو 31/07/2026 أو 2026-07-31"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                    required
                  />
                  {formEmploymentDate && (
                    <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-[11px] font-black text-emerald-800 flex items-center justify-between">
                      <span>📅 التاريخ المحسوب في النظام:</span>
                      <span className="font-mono text-emerald-900 font-bold underline dir-ltr">
                        {normalizeDateString(formEmploymentDate) || 'غير صالح'}
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-bold mt-1.5 leading-relaxed">
                  💡 يمكنك كتابة التاريخ بالصيغة السريعة مثل (31/7) أو (31/07/2026) أو اختيار التاريخ. الأيام السابقة لهذا التاريخ تُحسب تلقائياً كـ (غير على رأس العمل) ولا يُستقطع عليها أي غياب.
                </p>
              </div>

              {/* Fingerprint Exemption Option */}
              <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="exemptFingerprintToggle" className="text-xs font-black text-slate-900 flex items-center gap-2 cursor-pointer">
                    <span>غير مشمول بالبصمة الحيوية 🛡️</span>
                  </label>
                  <input
                    id="exemptFingerprintToggle"
                    type="checkbox"
                    checked={formIsExemptFromFingerprint}
                    onChange={(e) => setFormIsExemptFromFingerprint(e.target.checked)}
                    className="w-5 h-5 text-amber-600 rounded-lg border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-slate-600 font-bold leading-relaxed">
                  عند تفعيل هذا الخيار، لن يُطلب من الموظف البصمة اليومية بالهاتف، وسيقوم النظام بتسجيل وقته وحضوره تلقائياً.
                </p>
                {formIsExemptFromFingerprint && (
                  <div className="bg-amber-100/80 text-amber-950 p-2.5 rounded-xl text-[11px] font-black flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>تم تحديد الموظف كـ (غير مشمول بالبصمة) — يُحتسب حضوره وأوقاته تلقائياً دون تسجيل بصمة يدوي.</span>
                  </div>
                )}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingEmployee(null);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isSaving ? 'جاري الحفظ...' : 'حفظ بيانات الموظف'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL: VIEW EMPLOYEE DETAILS */}
      {viewingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-5 text-right max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white font-black text-base flex items-center justify-center">
                  {viewingEmployee.name.slice(0, 1)}
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">{viewingEmployee.name}</h3>
                  <p className="text-xs text-slate-500 font-bold">الملف الشخصي والبيانات الإدارية الكاملة</p>
                </div>
              </div>
              <button
                onClick={() => setViewingEmployee(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details Content */}
            {(() => {
              const details = getEmployeeStats(viewingEmployee.id);
              return (
                <div className="space-y-4 text-xs">
                  
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">الاسم الثلاثي:</span>
                      <span className="font-black text-slate-900 block mt-0.5">{viewingEmployee.name}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">رقم الهاتف:</span>
                      <span className="font-black text-slate-900 font-mono block mt-0.5 dir-ltr text-right">{viewingEmployee.phone || 'غير مسجل'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">الوظيفة:</span>
                      <span className="font-black text-blue-700 block mt-0.5">{viewingEmployee.role || 'فني'}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">الحالة الوظيفية:</span>
                      <div className="mt-0.5">{renderStatusBadge(viewingEmployee.status)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    
                    <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200">
                      <span className="text-[10px] text-emerald-800 font-bold block">الراتب الأساسي:</span>
                      <span className="text-sm font-black text-emerald-700 font-mono block mt-0.5">
                        {details.baseSalary.toLocaleString()} د.ع
                      </span>
                    </div>

                    <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200">
                      <span className="text-[10px] text-purple-800 font-bold block">رصيد الإجازات المتبقي:</span>
                      <span className="text-sm font-black text-purple-800 font-mono block mt-0.5">
                        {details.remainingLeaveBalance} يوم
                      </span>
                    </div>

                    <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                      <span className="text-[10px] text-amber-800 font-bold block">عدد التأخيرات:</span>
                      <span className="text-sm font-black text-amber-800 font-mono block mt-0.5">
                        {details.lateCount} مرة
                      </span>
                    </div>

                    <div className="p-3.5 bg-red-50 rounded-xl border border-red-200">
                      <span className="text-[10px] text-red-800 font-bold block">عدد الغيابات:</span>
                      <span className="text-sm font-black text-red-800 font-mono block mt-0.5">
                        {details.absenceCount} يوم
                      </span>
                    </div>

                    <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                      <span className="text-[10px] text-blue-800 font-bold block">ساعات الإضافي:</span>
                      <span className="text-sm font-black text-blue-800 font-mono block mt-0.5">
                        {details.totalOvertimeHours} ساعة
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-100 rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold block">آخر راتب معتمد:</span>
                      <span className="text-sm font-black text-slate-900 font-mono block mt-0.5">
                        {details.lastPayroll ? `${details.lastPayroll.netSalary.toLocaleString()} د.ع` : 'لا يوجد'}
                      </span>
                    </div>

                  </div>

                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    {userRole === 'owner' && (viewingEmployee.status === 'suspended' || viewingEmployee.status === 'terminated') && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatusConfirmEmployee({ emp: viewingEmployee, targetStatus: 'on_duty' });
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        <PlayCircle className="w-4 h-4" />
                        <span>إعادة للعمل</span>
                      </button>
                    )}
                    {userRole === 'owner' && viewingEmployee.status !== 'suspended' && viewingEmployee.status !== 'terminated' && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatusConfirmEmployee({ emp: viewingEmployee, targetStatus: 'suspended' });
                        }}
                        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <PauseCircle className="w-4 h-4 text-amber-600" />
                        <span>إيقاف الموظف</span>
                      </button>
                    )}
                    <button
                      onClick={() => setViewingEmployee(null)}
                      className="px-5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </div>

                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 9: HR SETTINGS (إعدادات HR) */}
      {activeTab === 'hr_settings' && (
        <HRSettings
          employees={employees}
          tasks={tasks}
          userRole={userRole}
        />
      )}

      {/* TAB 10: PRODUCTION READINESS (جاهزية النظام) */}
      {activeTab === 'production' && (
        <ProductionReadiness
          employees={employees}
          tasks={tasks}
          userRole={userRole}
        />
      )}

      {/* EDIT REWARD ELIGIBILITY MODAL */}
      {editingRewardEmployee && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-5 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto my-auto" dir="rtl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">تعديل حالة الشمول بالمكافآت</h3>
                  <p className="text-[11px] text-slate-500 font-medium">{editingRewardEmployee.name}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingRewardEmployee(null)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">حالة الشمول بالمكافآت والحوافز:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditRewardStatus('eligible')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      editRewardStatus === 'eligible'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs ring-2 ring-emerald-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    <span>مشمول بالمكافآت</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditRewardStatus('excluded')}
                    className={`py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      editRewardStatus === 'excluded'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs ring-2 ring-amber-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <UserX className="w-4 h-4 text-amber-600" />
                    <span>غير مشمول (مستبعد)</span>
                  </button>
                </div>
              </div>

              {editRewardStatus === 'excluded' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    سبب الاستبعاد من نظام المكافآت:
                  </label>
                  <textarea
                    rows={3}
                    value={editRewardReason}
                    onChange={(e) => setEditRewardReason(e.target.value)}
                    placeholder="اكتب سبب الاستبعاد ليحفظ في سجل الموظف وتدقيق النظام..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                  />
                </div>
              )}

              {rewardSaveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{rewardSaveError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRewardEmployee(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingReward}
                onClick={handleSaveRewardEligibility}
                className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-2 cursor-pointer shadow-xs"
              >
                {isSavingReward ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>حفظ التغييرات</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG FOR SUSPEND / TERMINATE / RESUME */}
      {statusConfirmEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-right" dir="rtl">
            <div className={`w-12 h-12 rounded-2xl ${
              statusConfirmEmployee.targetStatus === 'on_duty'
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            } flex items-center justify-center mx-auto`}>
              {statusConfirmEmployee.targetStatus === 'on_duty' ? (
                <UserCheck className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>

            <h3 className="font-black text-base text-slate-900 text-center">
              {statusConfirmEmployee.targetStatus === 'on_duty'
                ? 'تأكيد إعادة الموظف للعمل'
                : statusConfirmEmployee.targetStatus === 'suspended'
                ? 'تأكيد إيقاف الموظف عن العمل'
                : 'تأكيد إنهاء خدمة الموظف'}
            </h3>

            <p className="text-xs text-slate-600 font-medium text-center leading-relaxed">
              {statusConfirmEmployee.targetStatus === 'on_duty' ? (
                <>
                  هل أنت متأكد من رغبتك في إعادة الموظف{' '}
                  <span className="font-black text-slate-900">{statusConfirmEmployee.emp.name}</span> إلى{' '}
                  <span className="font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    على رأس العمل (نشط)
                  </span>
                  ؟
                  <br />
                  <span className="text-[11px] text-slate-500 mt-2 block font-normal leading-normal">
                    سيتمكن الموظف فوراً من استئناف تسجيل الحضور والانصراف، واستلام المهام والمشاركة في العمليات اليومية للنظام.
                  </span>
                </>
              ) : (
                <>
                  هل أنت بالتأكيد من رغبتك في تحويل حالة الموظف{' '}
                  <span className="font-black text-slate-900">{statusConfirmEmployee.emp.name}</span> إلى{' '}
                  <span className="font-black text-red-600">
                    {statusConfirmEmployee.targetStatus === 'suspended' ? 'موقوف عن العمل' : 'منتهي الخدمة'}
                  </span>
                  ؟
                </>
              )}
            </p>

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setStatusConfirmEmployee(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleChangeStatus(statusConfirmEmployee.emp, statusConfirmEmployee.targetStatus)}
                className={`px-5 py-2.5 ${
                  statusConfirmEmployee.targetStatus === 'on_duty'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                    : 'bg-red-600 hover:bg-red-700 shadow-red-200'
                } text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer flex items-center gap-1.5`}
              >
                {statusConfirmEmployee.targetStatus === 'on_duty' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد الإعادة للعمل</span>
                  </>
                ) : (
                  <span>تأكيد التغيير</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG FOR PERMANENT DELETE */}
      {deleteConfirmEmp && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4 text-center" dir="rtl">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="font-black text-base text-slate-900">
              تأكيد حذف الموظف نهائياً
            </h3>

            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              هل أنت متأكد من حذف الموظف <strong className="text-slate-900">({deleteConfirmEmp.name})</strong> نهائياً؟ سيتم مسح حسابه وسجله بشكل كامل ودائم من قاعدة البيانات.
            </p>

            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmEmp(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  const empId = deleteConfirmEmp.id;
                  setDeleteConfirmEmp(null);
                  if (onDeleteEmployee) {
                    await onDeleteEmployee(empId);
                  } else {
                    await deleteEmployee(empId);
                  }
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all shadow-md cursor-pointer"
              >
                نعم، حذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERTIME ADD / EDIT MODAL */}
      {showOtModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-900">
                    {editingOtRecord ? 'تعديل سجل الوقت الإضافي' : 'إضافة وقت إضافي جديد'}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    تسجيل الدقائق بدقة واحتساب المستحقات بسعر دقيقة دورة الرواتب
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOtModal(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {otModalMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                  otModalMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {otModalMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{otModalMessage.text}</span>
              </div>
            )}

            <div className="space-y-3.5 text-xs">
              {/* Employee selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">الموظف:</label>
                <select
                  value={otModalEmpId}
                  onChange={(e) => setOtModalEmpId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="" disabled>اختر الموظف...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department || 'عام'} - راتب: {(emp.baseSalary || 0).toLocaleString()} د.ع)
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Rate Info */}
              {(() => {
                const minuteRate = getEmployeeMinuteRate(otModalEmpId);
                const estimatedCost = Math.round((otModalDurationMinutes || 0) * minuteRate);
                return (
                  <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/80 flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-900">
                      سعر الدقيقة لهذا الموظف: <strong className="font-mono">{minuteRate.toFixed(2)} د.ع</strong>
                    </span>
                    <span className="font-mono font-black text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-amber-200">
                      المستحق: +{estimatedCost.toLocaleString()} د.ع
                    </span>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                {/* Date */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">التاريخ:</label>
                  <input
                    type="date"
                    value={otModalDate}
                    onChange={(e) => setOtModalDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Duration */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">المدة (بالدقائق):</label>
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={otModalDurationMinutes}
                    onChange={(e) => setOtModalDurationMinutes(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-black text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex gap-1.5 pt-0.5">
                {[30, 60, 90, 120, 180, 240].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setOtModalDurationMinutes(mins)}
                    className={`flex-1 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer transition-all ${
                      otModalDurationMinutes === mins
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {mins}د ({(mins / 60).toFixed(1)}س)
                  </button>
                ))}
              </div>

              {/* Status */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">حالة الاعتماد:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOtModalStatus('approved')}
                    className={`py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      otModalStatus === 'approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs ring-2 ring-emerald-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    معتمد ✅
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtModalStatus('pending')}
                    className={`py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      otModalStatus === 'pending'
                        ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs ring-2 ring-amber-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    قيد الانتظار ⏳
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtModalStatus('rejected')}
                    className={`py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      otModalStatus === 'rejected'
                        ? 'bg-red-50 border-red-300 text-red-800 shadow-xs ring-2 ring-red-400/20'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    مرفوض ❌
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">السبب / الملاحظات:</label>
                <input
                  type="text"
                  placeholder="مثال: تغطية شفت إضافي، صيانة طارئة..."
                  value={otModalNotes}
                  onChange={(e) => setOtModalNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowOtModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                disabled={isSavingOtModal}
                onClick={handleSaveOtModal}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingOtModal ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{editingOtRecord ? 'حفظ التعديلات' : 'إضافة السجل'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
