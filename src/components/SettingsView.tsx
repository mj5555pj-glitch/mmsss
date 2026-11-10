import React, { useState } from 'react';
import { 
  Settings, Lock, User, RefreshCw, Trash2, ShieldAlert, CheckCircle2, 
  Plus, Edit2, AlertCircle, Eye, EyeOff, Award, Sliders, Info, HelpCircle,
  Wrench, Phone, Truck, Play, Cpu, Clock, Layers, ClipboardList, CheckCircle,
  Users, UserCheck, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { DbTaskType, PointsRules, Task, SystemUser, Employee } from '../types';
import UserManagement from './UserManagement';

import * as LucideIcons from 'lucide-react';

// Safe dynamic lookup for task type icons
export function TaskTypeIcon({ name, className }: { name: string; className?: string }) {
  const camelName = name.charAt(0).toUpperCase() + name.slice(1);
  const IconComponent = (LucideIcons as any)[camelName] || (LucideIcons as any)[name] || HelpCircle;
  return <IconComponent className={className} />;
}

interface SettingsViewProps {
  adminUsername: string;
  adminPasswordKey: string;
  viewerUsername: string;
  viewerPasswordKey: string;
  onUpdateAdminCreds: (user: string, pass: string) => void;
  onUpdateViewerCreds: (user: string, pass: string) => void;
  onResetToDemo: () => void;
  onWipeAllData: () => void;
  
  // Dynamic task types and rules
  taskTypes: DbTaskType[];
  pointsRules: PointsRules;
  tasks: Task[];
  onSaveTaskType: (taskType: DbTaskType) => Promise<void>;
  onDeleteTaskType: (taskType: DbTaskType) => Promise<void>;
  onSavePointsRules: (rules: PointsRules) => Promise<void>;

  // User management props
  users: SystemUser[];
  onSaveUser: (user: SystemUser) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  userRole: 'owner' | 'supervisor' | 'manager' | 'technician';
  currentUsername: string;
  employees: Employee[];
  onSaveEmployee: (employee: Employee) => Promise<void>;
}

const PRESET_ICONS = [
  { value: 'wrench', label: 'مفك (صيانة)', icon: Wrench },
  { value: 'phone', label: 'هاتف (دعم)', icon: Phone },
  { value: 'truck', label: 'شاحنة (نقل/توصيل)', icon: Truck },
  { value: 'settings', label: 'ترس (إعدادات/منفذ)', icon: Settings },
  { value: 'play', label: 'تشغيل (تشغيل عن بعد)', icon: Play },
  { value: 'cpu', label: 'معالج (برمجة/سيرفر)', icon: Cpu },
  { value: 'clock', label: 'ساعة (متابعة زمنية)', icon: Clock },
  { value: 'layers', label: 'طبقات (تجميع/فئات)', icon: Layers },
  { value: 'clipboardList', label: 'مذكرة (تقرير/تدقيق)', icon: ClipboardList },
  { value: 'award', label: 'وسام (مكافأة)', icon: Award },
  { value: 'alertCircle', label: 'تنبيه (عطل/مستعجل)', icon: AlertCircle },
  { value: 'checkCircle', label: 'صح (تنصيب/منجز)', icon: CheckCircle }
];

const PRESET_COLORS = [
  { value: '#3B82F6', label: 'أزرق', bgClass: 'bg-blue-500' },
  { value: '#10B981', label: 'أخضر', bgClass: 'bg-emerald-500' },
  { value: '#F59E0B', label: 'أصفر', bgClass: 'bg-amber-500' },
  { value: '#8B5CF6', label: 'بنفسجي', bgClass: 'bg-violet-500' },
  { value: '#06B6D4', label: 'سماوي', bgClass: 'bg-cyan-500' },
  { value: '#EC4899', label: 'وردي', bgClass: 'bg-pink-500' },
  { value: '#EF4444', label: 'أحمر', bgClass: 'bg-red-500' },
  { value: '#F97316', label: 'برتقالي', bgClass: 'bg-orange-500' },
  { value: '#A855F7', label: 'ليلكي', bgClass: 'bg-purple-500' },
  { value: '#64748B', label: 'رمادي', bgClass: 'bg-slate-500' }
];

export default function SettingsView({
  adminUsername,
  adminPasswordKey,
  viewerUsername,
  viewerPasswordKey,
  onUpdateAdminCreds,
  onUpdateViewerCreds,
  onResetToDemo,
  onWipeAllData,
  taskTypes,
  pointsRules,
  tasks,
  onSaveTaskType,
  onDeleteTaskType,
  onSavePointsRules,
  users,
  onSaveUser,
  onDeleteUser,
  userRole,
  currentUsername,
  employees,
  onSaveEmployee
}: SettingsViewProps) {
  // Navigation inside settings
  const [activeSubTab, setActiveSubTab] = useState<'task_types' | 'users'>('task_types');
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showTaskTypesModal, setShowTaskTypesModal] = useState(false);

  // Security Credentials form states
  const [adminUser, setAdminUser] = useState(adminUsername);
  const [adminPass, setAdminPass] = useState(adminPasswordKey);
  const [adminSuccess, setAdminSuccess] = useState(false);

  const [viewerUser, setViewerUser] = useState(viewerUsername);
  const [viewerPass, setViewerPass] = useState(viewerPasswordKey);
  const [viewerSuccess, setViewerSuccess] = useState(false);

  // Task Types form states
  const [editingTaskType, setEditingTaskType] = useState<DbTaskType | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  // Task Type inputs
  const [tfName, setTfName] = useState('');
  const [tfPoints, setTfPoints] = useState<string>('10'); // Managed as string to allow completely clearing!
  const [tfColor, setTfColor] = useState('#3B82F6');
  const [tfDescription, setTfDescription] = useState('');
  const [tfOrder, setTfOrder] = useState<string>('1');
  const [tfStatus, setTfStatus] = useState<'active' | 'disabled'>('active');
  const [tfIcon, setTfIcon] = useState('wrench');
  const [tfVisibleToTech, setTfVisibleToTech] = useState(true);

  // Per-task points rules inputs
  const [tfDelayDeduction, setTfDelayDeduction] = useState<string>('0.5');
  const [tfMaxDeduction, setTfMaxDeduction] = useState<string>('10');
  const [tfAllowPause, setTfAllowPause] = useState<boolean>(true);
  const [tfFreeMinutes, setTfFreeMinutes] = useState<string>('45');
  const [tfFastBonusEnabled, setTfFastBonusEnabled] = useState<boolean>(false);
  const [tfFastBonusMinutes, setTfFastBonusMinutes] = useState<string>('15');
  const [tfFastBonusPoints, setTfFastBonusPoints] = useState<string>('5');
  const [tfCustomRules, setTfCustomRules] = useState<string>('');

  // Optional Graduated Points System inputs
  const [tfGraduatedEnabled, setTfGraduatedEnabled] = useState<boolean>(false);
  const [tfGraduatedInterval, setTfGraduatedInterval] = useState<string>('5');
  const [tfGraduatedPointsPerInterval, setTfGraduatedPointsPerInterval] = useState<string>('3');
  const [tfGraduatedMaxPoints, setTfGraduatedMaxPoints] = useState<string>('18');
  const [tfDeductionStartAfter, setTfDeductionStartAfter] = useState<string>('30');
  const [tfDeductionInterval, setTfDeductionInterval] = useState<string>('5');
  const [tfDeductionPointsPerInterval, setTfDeductionPointsPerInterval] = useState<string>('3');
  const [tfDeductionMinPoints, setTfDeductionMinPoints] = useState<string>('0');

  const handleSaveAdmin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUser.trim() || !adminPass.trim()) return;
    onUpdateAdminCreds(adminUser.trim(), adminPass.trim());
    setAdminSuccess(true);
    setTimeout(() => setAdminSuccess(false), 3000);
  };

  const handleSaveViewer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerUser.trim() || !viewerPass.trim()) return;
    onUpdateViewerCreds(viewerUser.trim(), viewerPass.trim());
    setViewerSuccess(true);
    setTimeout(() => setViewerSuccess(false), 3000);
  };

  // Open modal to add a new task type
  const openAddNewModal = () => {
    setTfName('');
    setTfPoints(''); // Start completely empty so they can write from scratch without a prefilled 0 forcing them
    setTfColor('#3B82F6');
    setTfDescription('');
    setTfOrder(String(taskTypes.length + 1));
    setTfStatus('active');
    setTfIcon('wrench');
    setTfVisibleToTech(true);
    setTfDelayDeduction('0.5');
    setTfMaxDeduction('10');
    setTfAllowPause(true);
    setTfFreeMinutes('45');
    setTfFastBonusEnabled(false);
    setTfFastBonusMinutes('15');
    setTfFastBonusPoints('5');
    setTfCustomRules('');
    setTfGraduatedEnabled(false);
    setTfGraduatedInterval('5');
    setTfGraduatedPointsPerInterval('3');
    setTfGraduatedMaxPoints('18');
    setTfDeductionStartAfter('30');
    setTfDeductionInterval('5');
    setTfDeductionPointsPerInterval('3');
    setTfDeductionMinPoints('0');
    setTaskFormError(null);
    setIsAddingNew(true);
  };

  // Open modal to edit existing task type
  const openEditModal = (tt: DbTaskType) => {
    setEditingTaskType(tt);
    setTfName(tt.name);
    setTfPoints(tt.points !== undefined ? String(tt.points) : '');
    setTfColor(tt.color);
    setTfDescription(tt.description || '');
    setTfOrder(String(tt.order));
    setTfStatus(tt.status);
    setTfIcon(tt.icon);
    setTfVisibleToTech(tt.visibleToTech);
    
    // load per-task points rules
    setTfDelayDeduction(tt.delayDeductionPerMinute !== undefined ? String(tt.delayDeductionPerMinute) : '0.5');
    setTfMaxDeduction(tt.maxDeduction !== undefined ? String(tt.maxDeduction) : '10');
    setTfAllowPause(tt.allowPause !== undefined ? tt.allowPause : true);
    setTfFreeMinutes(tt.freeMinutes !== undefined ? String(tt.freeMinutes) : '45');
    setTfFastBonusEnabled(!!tt.fastCompletionBonusEnabled);
    setTfFastBonusMinutes(tt.fastCompletionMinutes !== undefined ? String(tt.fastCompletionMinutes) : '15');
    setTfFastBonusPoints(tt.fastCompletionBonusPoints !== undefined ? String(tt.fastCompletionBonusPoints) : '5');
    setTfCustomRules(tt.customRules || '');
    
    // load optional graduated points system
    setTfGraduatedEnabled(!!tt.graduatedEnabled);
    setTfGraduatedInterval(tt.graduatedInterval !== undefined ? String(tt.graduatedInterval) : '5');
    setTfGraduatedPointsPerInterval(tt.graduatedPointsPerInterval !== undefined ? String(tt.graduatedPointsPerInterval) : '3');
    setTfGraduatedMaxPoints(tt.graduatedMaxPoints !== undefined ? String(tt.graduatedMaxPoints) : '18');
    setTfDeductionStartAfter(tt.deductionStartAfter !== undefined ? String(tt.deductionStartAfter) : '30');
    setTfDeductionInterval(tt.deductionInterval !== undefined ? String(tt.deductionInterval) : '5');
    setTfDeductionPointsPerInterval(tt.deductionPointsPerInterval !== undefined ? String(tt.deductionPointsPerInterval) : '3');
    setTfDeductionMinPoints(tt.deductionMinPoints !== undefined ? String(tt.deductionMinPoints) : '0');
    
    setTaskFormError(null);
  };

  // Save new or edited task type to Firebase
  const handleSaveTaskTypeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tfName.trim()) {
      setTaskFormError('اسم المهمة مطلوب.');
      return;
    }

    if (tfPoints.trim() === '') {
      setTaskFormError('يرجى إدخال عدد النقاط.');
      return;
    }

    const pointsNum = parseInt(tfPoints, 10);
    if (isNaN(pointsNum)) {
      setTaskFormError('يرجى إدخال عدد النقاط.');
      return;
    }

    const taskTypeId = isAddingNew ? `tt-${Date.now()}` : editingTaskType!.id;
    
    // Check if the name already exists elsewhere
    const nameExists = taskTypes.some(
      (tt) => tt.name.trim() === tfName.trim() && tt.id !== taskTypeId
    );
    if (nameExists) {
      setTaskFormError('نوع المهمة بهذا الاسم موجود بالفعل.');
      return;
    }

    const payload: DbTaskType = {
      id: taskTypeId,
      name: tfName.trim(),
      points: pointsNum,
      color: tfColor,
      status: tfStatus,
      description: tfDescription.trim() || undefined,
      order: Number(tfOrder) || 1,
      icon: tfIcon,
      visibleToTech: tfVisibleToTech,
      delayDeductionPerMinute: tfDelayDeduction.trim() !== '' ? Number(tfDelayDeduction) : 0.5,
      maxDeduction: tfMaxDeduction.trim() !== '' ? Number(tfMaxDeduction) : 10,
      allowPause: tfAllowPause,
      freeMinutes: tfFreeMinutes.trim() !== '' ? Number(tfFreeMinutes) : 45,
      fastCompletionBonusEnabled: tfFastBonusEnabled,
      fastCompletionMinutes: tfFastBonusMinutes.trim() !== '' ? Number(tfFastBonusMinutes) : 15,
      fastCompletionBonusPoints: tfFastBonusPoints.trim() !== '' ? Number(tfFastBonusPoints) : 5,
      customRules: tfCustomRules.trim() || undefined,
      graduatedEnabled: tfGraduatedEnabled,
      graduatedInterval: tfGraduatedInterval.trim() !== '' ? Number(tfGraduatedInterval) : 5,
      graduatedPointsPerInterval: tfGraduatedPointsPerInterval.trim() !== '' ? Number(tfGraduatedPointsPerInterval) : 3,
      graduatedMaxPoints: tfGraduatedMaxPoints.trim() !== '' ? Number(tfGraduatedMaxPoints) : 18,
      deductionStartAfter: tfDeductionStartAfter.trim() !== '' ? Number(tfDeductionStartAfter) : 30,
      deductionInterval: tfDeductionInterval.trim() !== '' ? Number(tfDeductionInterval) : 5,
      deductionPointsPerInterval: tfDeductionPointsPerInterval.trim() !== '' ? Number(tfDeductionPointsPerInterval) : 3,
      deductionMinPoints: tfDeductionMinPoints.trim() !== '' ? Number(tfDeductionMinPoints) : 0
    };

    try {
      await onSaveTaskType(payload);
      setIsAddingNew(false);
      setEditingTaskType(null);
    } catch (err: any) {
      setTaskFormError('حدث خطأ أثناء الحفظ بقاعدة البيانات.');
    }
  };

  // Delete task type from Firebase with soft delete protection
  const handleDeleteTaskTypeClick = async (tt: DbTaskType) => {
    try {
      await onDeleteTaskType(tt);
      setEditingTaskType(null);
    } catch (err: any) {
      setTaskFormError('فشل حذف نوع المهمة.');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Settings Navigation Header */}
      {userRole === 'owner' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-blue-200">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0 font-extrabold shadow-xs border border-blue-100">
              <Users className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-800 text-sm">بطاقة إدارة الحسابات والمستخدمين</h3>
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-blue-100">
                  {users.length} حساب نظام
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                إدارة حسابات النظام وتعيين كلمات المرور والصلاحيات للمشرفين والمدراء والفنيين. (مغلقة ومحمية ولا تظهر بشكل مباشر).
              </p>
              <div className="flex items-center gap-4 pt-1 text-[11px] font-bold text-slate-600">
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>الحسابات النشطة: {users.filter(u => u.status === 'active').length}</span>
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>الموظفين المسجلين: {employees.length}</span>
                </span>
              </div>
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => setShowUsersModal(true)}
            className="w-full sm:w-auto bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-3 px-5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            <Users className="w-4 h-4" />
            <span>عرض وإدارة الحسابات ←</span>
          </button>
        </div>
      )}

      {/* Task Types & Points Management Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-all hover:border-indigo-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 font-extrabold shadow-xs border border-indigo-100">
            <Sliders className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-slate-800 text-sm">بطاقة إدارة المهام والنقاط</h3>
              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-indigo-100">
                {taskTypes.length} أنواع مهام
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              تصفح وتعديل أنواع المهام الميدانية، وضبط الألوان وقوانين احتساب النقاط والخصومات لكل مهمة بشكل مستقل. (مغلقة ومحمية ولا تظهر بشكل مباشر).
            </p>
            <div className="flex items-center gap-4 pt-1 text-[11px] font-bold text-slate-600">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>المهام النشطة: {taskTypes.filter(tt => tt.status === 'active').length}</span>
              </span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>تظهر للفنيين: {taskTypes.filter(tt => tt.visibleToTech).length}</span>
              </span>
            </div>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => setShowTaskTypesModal(true)}
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs hover:shadow-md transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Sliders className="w-4 h-4" />
          <span>عرض وإدارة المهام والنقاط ←</span>
        </button>
      </div>


      {/* ======================== ADD/EDIT TASK TYPE & RULES DIALOG ======================== */}
      <AnimatePresence>
        {(isAddingNew || editingTaskType) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[60] p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-extrabold text-slate-800 text-sm">
                  {isAddingNew ? 'إضافة نوع مهمة جديد (+)' : `تعديل مهمة وقوانين: ${tfName}`}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingTaskType(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer font-bold"
                >
                  إغلاق
                </button>
              </div>

              {/* Modal Body - Scrollable */}
              <form onSubmit={handleSaveTaskTypeSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                {taskFormError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-[11px] font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{taskFormError}</span>
                  </div>
                )}

                {/* Section 1: Basic Information */}
                <div className="space-y-3.5">
                  <h4 className="text-xs font-black text-blue-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>1. البيانات الأساسية للخدمة الميدانية</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Task Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">اسم المهمة (مثال: صيانة، تنصيب، إلخ)</label>
                      <input
                        type="text"
                        required
                        value={tfName}
                        onChange={(e) => setTfName(e.target.value)}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold"
                      />
                    </div>

                    {/* Display Order */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">ترتيب الظهور في القائمة</label>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tfOrder}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setTfOrder(val);
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Visibility Switch */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">ظهور الخدمة للفني</label>
                      <select
                        value={tfVisibleToTech ? 'true' : 'false'}
                        onChange={(e) => setTfVisibleToTech(e.target.value === 'true')}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold"
                      >
                        <option value="true">تظهر للفني عند إنشاء مهمة</option>
                        <option value="false">مخفية عن الفني (يحددها المسؤول)</option>
                      </select>
                    </div>

                    {/* Activation status check */}
                    <div className="flex items-center gap-2 pt-6">
                      <input
                        type="checkbox"
                        id="tf_status_switch"
                        checked={tfStatus === 'active'}
                        onChange={(e) => setTfStatus(e.target.checked ? 'active' : 'disabled')}
                        className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                      />
                      <label htmlFor="tf_status_switch" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                        نوع الخدمة نشط ومتاح حالياً
                      </label>
                    </div>
                  </div>

                  {/* Optional description */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">وصف المهمة الميدانية (اختياري)</label>
                    <textarea
                      value={tfDescription}
                      onChange={(e) => setTfDescription(e.target.value)}
                      rows={2}
                      placeholder="شرح موجز لمتطلبات الخدمة الميدانية..."
                      className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none leading-relaxed"
                    />
                  </div>

                  {/* Icons Preset Grid */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">رمز الأيقونة التعبيري</label>
                    <div className="grid grid-cols-6 gap-2 max-h-24 overflow-y-auto border border-slate-100 p-2.5 rounded-xl bg-slate-50">
                      {PRESET_ICONS.map((iconItem) => {
                        const IconComp = iconItem.icon;
                        const isSelected = tfIcon === iconItem.value;
                        return (
                          <button
                            key={iconItem.value}
                            type="button"
                            onClick={() => setTfIcon(iconItem.value)}
                            className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all cursor-pointer ${
                              isSelected 
                                ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs' 
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            }`}
                            title={iconItem.label}
                          >
                            <IconComp className="w-4 h-4" />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Color Preset Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">لون خلفية المهمة والبطاقة</label>
                    <div className="flex flex-wrap gap-2.5 p-2.5 border border-slate-100 rounded-xl bg-slate-50">
                      {PRESET_COLORS.map((col) => {
                        const isSelected = tfColor === col.value;
                        return (
                          <button
                            key={col.value}
                            type="button"
                            onClick={() => setTfColor(col.value)}
                            className={`w-6 h-6 rounded-full transition-all relative cursor-pointer ${col.bgClass}`}
                            title={col.label}
                          >
                            {isSelected && (
                              <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-white shadow-xs" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Section 2: Points & Rules */}
                <div className="space-y-3.5 pt-2">
                  <h4 className="text-xs font-black text-blue-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-600" />
                    <span>2. قوانين ونقاط احتساب المهمة</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Task Points Field */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700 flex items-center gap-1">
                        <span>نقاط المهمة الأساسية</span>
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tfPoints}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setTfPoints(val);
                          }
                        }}
                        placeholder="أدخل عدد النقاط"
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-black text-slate-800"
                      />
                    </div>

                    {/* Standard Allowed Minutes (Free Minutes) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">عدد الدقائق القياسية (المجانية) قبل الخصم</label>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tfFreeMinutes}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setTfFreeMinutes(val);
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Delay Deduction Rate (Per Minute) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">خصم التأخير لكل دقيقة (نقاط)</label>
                      <input
                        type="text"
                        pattern="[0-9]*\.?[0-9]*"
                        inputMode="decimal"
                        value={tfDelayDeduction}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setTfDelayDeduction(val);
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold text-slate-800"
                      />
                    </div>

                    {/* Max Deduction Limit */}
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-700">الحد الأقصى المسموح للخصم (نقاط)</label>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        inputMode="numeric"
                        value={tfMaxDeduction}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setTfMaxDeduction(val);
                          }
                        }}
                        className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold text-slate-800"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2.1: Graduated Points System (Optional) */}
                <div className="space-y-3.5 pt-2 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <span>الاحتساب التدريجي للنقاط (اختياري)</span>
                    </h4>
                    
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="graduated_enable_checkbox"
                        checked={tfGraduatedEnabled}
                        onChange={(e) => setTfGraduatedEnabled(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                      />
                      <label htmlFor="graduated_enable_checkbox" className="text-xs font-bold text-indigo-700 cursor-pointer select-none">
                        تفعيل الاحتساب التدريجي
                      </label>
                    </div>
                  </div>

                  {tfGraduatedEnabled && (
                    <div className="space-y-4 pt-2 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {/* Calculate points every N minutes */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">احتساب النقاط كل (عدد الدقائق):</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfGraduatedInterval}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfGraduatedInterval(val);
                              }
                            }}
                            placeholder="مثال: 5 دقائق"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>

                        {/* Points earned per interval */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">النقاط المضافة في كل فترة:</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfGraduatedPointsPerInterval}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfGraduatedPointsPerInterval(val);
                              }
                            }}
                            placeholder="مثال: 3 نقاط"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>

                        {/* Maximum points */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">الحد الأقصى للنقاط:</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfGraduatedMaxPoints}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfGraduatedMaxPoints(val);
                              }
                            }}
                            placeholder="مثال: 18 نقطة"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        {/* Deduction starts after */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">يبدأ الخصم بعد (بالدقائق):</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfDeductionStartAfter}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfDeductionStartAfter(val);
                              }
                            }}
                            placeholder="مثال: 30 دقيقة"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>

                        {/* Deduction interval */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">الخصم كل (بالدقائق):</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfDeductionInterval}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfDeductionInterval(val);
                              }
                            }}
                            placeholder="مثال: 5 دقائق"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>

                        {/* Deduction points per interval */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">النقاط المخصومة في كل فترة:</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfDeductionPointsPerInterval}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfDeductionPointsPerInterval(val);
                              }
                            }}
                            placeholder="مثال: 3 نقاط"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>

                        {/* Minimum points limit */}
                        <div className="space-y-1">
                          <label className="block text-xs font-bold text-slate-600">الحد الأدنى للنقاط:</label>
                          <input
                            type="text"
                            pattern="[0-9]*"
                            inputMode="numeric"
                            value={tfDeductionMinPoints}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || /^\d+$/.test(val)) {
                                setTfDeductionMinPoints(val);
                              }
                            }}
                            placeholder="مثال: 0 نقطة"
                            className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-slate-800 font-bold bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 3: Fast Completion Bonus (Optional) */}
                <div className="space-y-3.5 pt-2 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-blue-800 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-600" />
                      <span>3. مكافأة الإنجاز السريع (اختياري)</span>
                    </h4>
                    
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        id="fast_bonus_enable_checkbox"
                        checked={tfFastBonusEnabled}
                        onChange={(e) => setTfFastBonusEnabled(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="fast_bonus_enable_checkbox" className="text-xs font-bold text-emerald-700 cursor-pointer select-none">
                        تفعيل المكافأة
                      </label>
                    </div>
                  </div>

                  {tfFastBonusEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 animate-fade-in">
                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-600">إذا أنجزت المهمة خلال أو أقل من (دقائق):</label>
                        <input
                          type="text"
                          pattern="[0-9]*"
                          inputMode="numeric"
                          value={tfFastBonusMinutes}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d+$/.test(val)) {
                              setTfFastBonusMinutes(val);
                            }
                          }}
                          className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 outline-none text-slate-800 font-bold"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-bold text-slate-600">يمنح مكافأة إضافية (نقاط):</label>
                        <input
                          type="text"
                          pattern="[0-9]*"
                          inputMode="numeric"
                          value={tfFastBonusPoints}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d+$/.test(val)) {
                              setTfFastBonusPoints(val);
                            }
                          }}
                          className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 outline-none text-slate-800 font-black"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 4: General Settings */}
                <div className="space-y-3.5 pt-2">
                  {/* Allow Pause toggle */}
                  <div className="space-y-1">
                    <label className="block text-xs font-bold text-slate-700">السماح للفني بإيقاف مؤقت للمهمة (Pause)</label>
                    <select
                      value={tfAllowPause ? 'true' : 'false'}
                      onChange={(e) => setTfAllowPause(e.target.value === 'true')}
                      className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-bold text-slate-800"
                    >
                      <option value="true">مسموح بالتوقف المؤقت لحالات الطوارئ وصلاة الظهر</option>
                      <option value="false">ممنوع التوقف (يجب إكمال المهمة دفعة واحدة)</option>
                    </select>
                  </div>
                </div>

                {/* Section 5: Special Custom Rules (Markdown text guidelines) */}
                <div className="space-y-1 pt-2">
                  <h4 className="text-xs font-black text-blue-800 border-b border-slate-100 pb-2 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-600" />
                    <span>5. أي قوانين خاصة بهذه المهمة فقط</span>
                  </h4>
                  <textarea
                    value={tfCustomRules}
                    onChange={(e) => setTfCustomRules(e.target.value)}
                    rows={3}
                    placeholder="أدخل أي ملاحظات، لوائح تشغيلية أو قواعد خاصة بالتحقق والضبط الجغرافي للمهمة الميدانية هنا..."
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none text-slate-800 leading-relaxed mt-2"
                  />
                </div>

                {/* Modal Actions */}
                <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-slate-100 shrink-0">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-3 rounded-xl text-xs transition-colors cursor-pointer shadow-xs hover:shadow-md"
                  >
                    حفظ المهمة والقوانين
                  </button>

                  {!isAddingNew && editingTaskType && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTaskTypeClick(editingTaskType)}
                      className="bg-red-50 hover:bg-red-100 text-red-600 font-bold py-3 px-5 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{tasks.some(t => t.taskType === editingTaskType.name) ? 'أرشفة المهمة' : 'حذف المهمة'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setEditingTaskType(null);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>

                {/* Soft-delete helper notice */}
                {!isAddingNew && editingTaskType && tasks.some(t => t.taskType === editingTaskType.name) && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2 text-amber-800 text-[10px] leading-relaxed shrink-0">
                    <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      <strong>تنبيه الأرشفة:</strong> هذه المهمة مستخدمة بالفعل في تقارير المهام السابقة. للضمان المالي وعدم تشويه التقارير الميدانية القديمة، سيتم <strong>أرشفتها (تعطيلها)</strong> فقط وإخفائها بدلاً من حذفها النهائي.
                    </span>
                  </div>
                )}
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================== ACCOUNTS & USER MANAGEMENT MODAL ======================== */}
      <AnimatePresence>
        {showUsersModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] border border-slate-100"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/30 border border-blue-500/30 flex items-center justify-center text-blue-400 font-black">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                      <span>إدارة الحسابات والمستخدمين</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">إدارة حسابات النظام وتعيين الصلاحيات وكلمات المرور</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUsersModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
                >
                  <span>إغلاق</span>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50">
                <UserManagement
                  users={users}
                  onSaveUser={onSaveUser}
                  onDeleteUser={onDeleteUser}
                  currentUsername={currentUsername}
                  userRole={userRole}
                  employees={employees}
                  onSaveEmployee={onSaveEmployee}
                  onResetToDemo={onResetToDemo}
                  onWipeAllData={onWipeAllData}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================== TASK TYPES & POINTS MANAGEMENT MODAL ======================== */}
      <AnimatePresence>
        {showTaskTypesModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh] border border-slate-100"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 bg-slate-900 text-white flex justify-between items-center shrink-0 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                      <span>إدارة المهام والنقاط</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">تعديل المهام الميدانية وقوانين احتساب النقاط والألوان</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTaskTypesModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
                >
                  <span>إغلاق</span>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-6">
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h4 className="font-extrabold text-slate-800 text-xs">قائمة أنواع المهام وقوانين احتساب النقاط</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">اضغط على أي مهمة لتعديل ألوانها أو أوقاتها القياسية وقوانين النقاط والخصومات.</p>
                  </div>
                  {userRole === 'owner' && (
                    <button
                      type="button"
                      onClick={openAddNewModal}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow-xs hover:shadow-sm transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>إضافة مهمة جديدة (+)</span>
                    </button>
                  )}
                </div>

                {/* Grid of Task Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {taskTypes.map((tt) => {
                    return (
                      <div 
                        key={tt.id}
                        onClick={userRole === 'owner' ? () => openEditModal(tt) : undefined}
                        className={`bg-white p-5 rounded-2xl border border-slate-100 shadow-xs transition-all flex flex-col justify-between group relative overflow-hidden ${
                          userRole === 'owner'
                            ? 'hover:border-indigo-200 hover:bg-slate-50/50 shadow-xs hover:shadow-md cursor-pointer'
                            : 'cursor-default'
                        }`}
                      >
                        <div className="space-y-4">
                          {/* Header: Icon, Color, Name, Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div 
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold shadow-sm"
                                style={{ backgroundColor: tt.color }}
                              >
                                <TaskTypeIcon name={tt.icon} className="w-5 h-5" />
                              </div>
                              <div>
                                <h3 className="font-extrabold text-xs text-slate-800 group-hover:text-indigo-600 transition-colors">{tt.name}</h3>
                                <span className="text-[10px] text-slate-400 font-bold">رقم الترتيب: {tt.order}</span>
                              </div>
                            </div>
                            
                            {/* Status badge */}
                            <span className={`text-[9px] font-extrabold py-1 px-2.5 rounded-full flex items-center gap-1 ${
                              tt.status === 'active' 
                                ? 'bg-emerald-50 text-emerald-600' 
                                : 'bg-slate-100 text-slate-500'
                            }`}>
                              <span 
                                className={`w-1.5 h-1.5 rounded-full ${
                                  tt.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'
                                }`}
                              />
                              {tt.status === 'active' ? 'نشطة' : 'معطلة'}
                            </span>
                          </div>

                          {/* Description */}
                          <p className="text-[10px] text-slate-500 leading-relaxed min-h-[32px] line-clamp-2">
                            {tt.description || <span className="italic text-slate-300">لا يوجد وصف مضاف...</span>}
                          </p>

                          {/* Quick Points Rules Summary inside the card */}
                          <div className="bg-slate-50 p-3 rounded-xl space-y-2 text-[10px] border border-slate-100">
                            <div className="flex justify-between items-center text-slate-600">
                              <span className="font-medium text-slate-500">النقاط الأساسية:</span>
                              <span className="font-extrabold text-slate-800">{tt.points} نقطة</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                              <span className="font-medium text-slate-500">الوقت القياسي المجاني:</span>
                              <span className="font-extrabold text-slate-800">{tt.freeMinutes ?? (tt.name === 'تنصيب' ? 45 : tt.name === 'صيانة' ? 30 : 60)} دقيقة</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                              <span className="font-medium text-slate-500">خصم التأخير / دقيقة:</span>
                              <span className="font-extrabold text-red-600">-{tt.delayDeductionPerMinute ?? 0.5} نقطة</span>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                              <span className="font-medium text-slate-500">الحد الأقصى للخصم:</span>
                              <span className="font-extrabold text-red-700">{tt.maxDeduction ?? 10} نقاط</span>
                            </div>
                            {tt.fastCompletionBonusEnabled && (
                              <div className="flex justify-between items-center text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-md mt-1">
                                <span>إنجاز سريع (&lt;= {tt.fastCompletionMinutes ?? 15} د):</span>
                                <span>+{tt.fastCompletionBonusPoints ?? 5} نقاط</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Footer: Visibility Info & Click Action Indicator */}
                        <div className="border-t border-slate-50 pt-2.5 mt-4 flex items-center justify-between text-[9px]">
                          <span className={`font-bold px-2 py-0.5 rounded-md ${
                            tt.visibleToTech ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                          }`}>
                            {tt.visibleToTech ? 'تظهر في لوحة الفني' : 'مخفية عن الفني'}
                          </span>
                          <span className="text-indigo-600 font-bold group-hover:underline flex items-center gap-0.5">
                            <span>إعدادات وقوانين المهمة</span>
                            <span>←</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
