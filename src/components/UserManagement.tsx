import React, { useState } from 'react';
import { 
  Users, UserPlus, Shield, Check, X, Edit2, Trash2, Key, AlertCircle, 
  ToggleLeft, ToggleRight, CheckCircle2, UserCheck, ShieldAlert, Search,
  Power, LogOut, Smartphone, Database, RefreshCw, Trash, User, Lock, Unlock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SystemUser, Employee } from '../types';

interface UserManagementProps {
  users: SystemUser[];
  onSaveUser: (user: SystemUser) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  currentUsername: string;
  userRole: 'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant';
  employees: Employee[];
  onSaveEmployee: (employee: Employee) => Promise<void>;
  
  // Database maintenance props from SettingsView
  onResetToDemo: () => void;
  onWipeAllData: () => void;
}

export default function UserManagement({
  users,
  onSaveUser,
  onDeleteUser,
  currentUsername,
  userRole,
  employees,
  onSaveEmployee,
  onResetToDemo,
  onWipeAllData
}: UserManagementProps) {
  // General view states
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Modal states
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [showPasswordResetModal, setShowPasswordResetModal] = useState<SystemUser | null>(null);
  const [showRoleModal, setShowRoleModal] = useState<SystemUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<SystemUser | null>(null);

  // Form input states
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant'>('technician');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant'>('technician');

  // Alert message states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Helper: Format DateTime
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'لم يسجل دخول بعد';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('ar-EG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Helper: Filter & Search logic
  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = 
      (u.username || '').toLowerCase().includes(term) ||
      (u.displayName || '').toLowerCase().includes(term);
    
    const matchesRole = roleFilter === 'all' || u.role === roleFilter || (roleFilter === 'supervisor' && u.role === 'manager');
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  // Counters
  const totalUsers = users.length;
  const ownerCount = users.filter(u => u.role === 'owner').length;
  const supervisorCount = users.filter(u => u.role === 'supervisor' || u.role === 'manager').length;
  const viewerCount = users.filter(u => u.role === 'technician').length;
  const activeCount = users.filter(u => u.status === 'active').length;
  const disabledCount = users.filter(u => u.status === 'disabled').length;

  // Actions
  const openAddModal = () => {
    setDisplayName('');
    setUsername('');
    setPassword('');
    setPhone('');
    setRole('technician');
    setSelectedEmployeeId('');
    setStatus('active');
    setErrorMsg(null);
    setIsAddingNew(true);
  };

  const openEditModal = (u: SystemUser) => {
    setEditingUser(u);
    setDisplayName(u.displayName || '');
    setUsername(u.username);
    setPassword(u.password || '');
    setPhone(u.phone || '');
    setRole(u.role);
    setSelectedEmployeeId(u.employeeId || '');
    setStatus(u.status);
    setErrorMsg(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim().toLowerCase();
    const cleanDisplayName = displayName.trim();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      setErrorMsg('اسم المستخدم مطلوب.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setErrorMsg('اسم المستخدم يجب أن يحتوي على أحرف وأرقام إنجليزية فقط (بدون مسافات).');
      return;
    }

    if (isAddingNew && !cleanPassword) {
      setErrorMsg('كلمة المرور مطلوبة للمستخدم الجديد.');
      return;
    }

    const targetId = isAddingNew ? `u-${Date.now()}` : editingUser!.id;
    
    // Username duplicate check
    const usernameExists = users.some(u => u.username === cleanUsername && u.id !== targetId);
    if (usernameExists) {
      setErrorMsg('اسم المستخدم مسجل بالفعل لحساب آخر.');
      return;
    }

    let empId = undefined;
    let empName = undefined;

    if (role === 'technician') {
      if (!selectedEmployeeId) {
        setErrorMsg('يجب اختيار فني لربط الحساب به.');
        return;
      }

      // Check if another account is already linked to this technician
      const alreadyLinked = users.some(
        u => u.role === 'technician' && u.employeeId === selectedEmployeeId && u.id !== targetId
      );
      if (alreadyLinked) {
        const linkedUser = users.find(
          u => u.role === 'technician' && u.employeeId === selectedEmployeeId && u.id !== targetId
        );
        setErrorMsg(`هذا الفني مرتبط بالفعل بحساب آخر (${linkedUser?.username}). لا يمكن ربط أكثر من حساب بنفس الفني.`);
        return;
      }

      const selectedEmp = employees.find(e => e.id === selectedEmployeeId);
      if (!selectedEmp) {
        setErrorMsg('الفني المختار غير موجود.');
        return;
      }

      empId = selectedEmp.id;
      empName = selectedEmp.name;
    }

    const payload: SystemUser = {
      id: targetId,
      username: cleanUsername,
      displayName: role === 'technician' ? empName : (cleanDisplayName || undefined),
      password: cleanPassword || undefined,
      role,
      status,
      createdAt: isAddingNew ? new Date().toISOString() : (editingUser?.createdAt || new Date().toISOString()),
      lastDevice: isAddingNew ? undefined : editingUser?.lastDevice,
      lastLogin: isAddingNew ? undefined : editingUser?.lastLogin,
      sessionKey: isAddingNew ? undefined : editingUser?.sessionKey,
      locked: isAddingNew ? undefined : editingUser?.locked,
      employeeId: role === 'technician' ? empId : undefined,
      employeeName: role === 'technician' ? empName : undefined,
      phone: role === 'technician' && phone.trim() ? phone.trim() : undefined
    };

    try {
      await onSaveUser(payload);
      setIsAddingNew(false);
      setEditingUser(null);
      setPhone('');
      setSuccessMsg(isAddingNew ? 'تم إضافة المستخدم بنجاح 🎉' : 'تم تحديث بيانات المستخدم بنجاح ✨');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('فشل حفظ التغييرات في قاعدة البيانات.');
    }
  };

  const handlePasswordResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) return;

    if (showPasswordResetModal) {
      try {
        await onSaveUser({
          ...showPasswordResetModal,
          password: newPassword.trim()
        });
        setShowPasswordResetModal(null);
        setNewPassword('');
        setSuccessMsg(`تم تحديث كلمة مرور الحساب (${showPasswordResetModal.username}) بنجاح 🔑`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (err) {
        setErrorMsg('فشل إعادة تعيين كلمة المرور.');
      }
    }
  };

  const handleRoleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (showRoleModal) {
      try {
        await onSaveUser({
          ...showRoleModal,
          role: newRole
        });
        setShowRoleModal(null);
        setSuccessMsg(`تم تغيير رتبة الحساب (${showRoleModal.username}) إلى ${newRole} 👑`);
        setTimeout(() => setSuccessMsg(null), 3000);
      } catch (err) {
        setErrorMsg('فشل تغيير الصلاحيات.');
      }
    }
  };

  const handleToggleStatus = async (u: SystemUser) => {
    setErrorMsg(null);
    if (u.username === currentUsername) {
      setErrorMsg('لا يمكنك تعطيل حسابك الحالي النشط.');
      return;
    }
    if (u.role === 'owner' && u.id === 'u-1') {
      setErrorMsg('لا يمكن تعطيل المالك الرئيسي للنظام.');
      return;
    }

    const newStatus = u.status === 'active' ? 'disabled' : 'active';
    try {
      await onSaveUser({
        ...u,
        status: newStatus
      });
      setSuccessMsg(`تم ${newStatus === 'active' ? 'تفعيل 🟢' : 'تعطيل 🔴'} حساب المستخدم بنجاح.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('فشل تعديل حالة الحساب.');
    }
  };


  const handleToggleLock = async (u: SystemUser) => {
    setErrorMsg(null);
    if (u.username === currentUsername) {
      setErrorMsg('لا يمكنك قفل حسابك الحالي.');
      return;
    }

    const newLockState = !u.locked;
    try {
      await onSaveUser({
        ...u,
        locked: newLockState
      });
      setSuccessMsg(`تم ${newLockState ? 'قفل الحساب مؤقتاً 🔒' : 'إلغاء قفل الحساب 🔓'} بنجاح.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('فشل تغيير حالة قفل الحساب.');
    }
  };

  const executeDelete = async () => {
    if (!userToDelete) return;
    setErrorMsg(null);

    if (userToDelete.username === currentUsername) {
      setErrorMsg('لا يمكنك حذف حسابك الذي تسجل به حالياً.');
      setUserToDelete(null);
      return;
    }

    if (userToDelete.role === 'owner' && userToDelete.id === 'u-1') {
      setErrorMsg('غير مسموح بحذف حساب المالك الرئيسي للنظام.');
      setUserToDelete(null);
      return;
    }

    try {
      await onDeleteUser(userToDelete.id);
      setSuccessMsg(`تم حذف حساب المستخدم (${userToDelete.username}) بنجاح 🗑`);
      setUserToDelete(null);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg('فشل حذف المستخدم من قاعدة البيانات.');
      setUserToDelete(null);
    }
  };



  const getRoleBadge = (r: 'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant') => {
    switch (r) {
      case 'owner':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200/60 font-bold px-2.5 py-1 rounded-full text-[10px]">
            <Shield className="w-3 h-3 text-red-600" />
            المالك (Owner)
          </span>
        );
      case 'supervisor':
      case 'manager':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200/60 font-bold px-2.5 py-1 rounded-full text-[10px]">
            <UserCheck className="w-3 h-3 text-blue-600" />
            المشرف (Supervisor)
          </span>
        );
      case 'accountant':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold px-2.5 py-1 rounded-full text-[10px]">
            <UserCheck className="w-3 h-3 text-emerald-600" />
            المحاسب (Accountant)
          </span>
        );
      case 'technician':
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 font-bold px-2.5 py-1 rounded-full text-[10px]">
            <User className="w-3 h-3 text-slate-500" />
            الفني (Technician)
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Title Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-blue-700" />
            <span>إدارة النظام والمستخدمين</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            لوحة تحكم المالك المطلقة: إدارة الحسابات، تفويض الصلاحيات، مراقبة أجهزة تسجيل الدخول، حماية الأمن وعمليات قاعدة البيانات.
          </p>
        </div>

        {userRole === 'owner' && (
          <button
            type="button"
            onClick={openAddModal}
            className="bg-blue-700 hover:bg-blue-800 text-white font-extrabold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            <span>إنشاء مستخدم جديد</span>
          </button>
        )}
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Stats Counters */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-slate-400 font-bold block">إجمالي المستخدمين</span>
          <span className="text-2xl font-black text-slate-800 mt-1">{totalUsers}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-red-100 bg-red-50/5 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-red-500 font-bold block">👑 الملاك</span>
          <span className="text-2xl font-black text-red-700 mt-1">{ownerCount}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-blue-100 bg-blue-50/5 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-blue-500 font-bold block">🛡️ المشرفين</span>
          <span className="text-2xl font-black text-blue-700 mt-1">{supervisorCount}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 bg-slate-50/30 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-slate-500 font-bold block">👷 الفنيين</span>
          <span className="text-2xl font-black text-slate-600 mt-1">{viewerCount}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-emerald-100 bg-emerald-50/5 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-emerald-500 font-bold block">🟢 الحسابات النشطة</span>
          <span className="text-2xl font-black text-emerald-700 mt-1">{activeCount}</span>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-amber-100 bg-amber-50/5 shadow-xs flex flex-col justify-center">
          <span className="text-[10px] text-amber-500 font-bold block">🔴 الحسابات المعطلة</span>
          <span className="text-2xl font-black text-amber-700 mt-1">{disabledCount}</span>
        </div>
      </div>

      {/* Filters & Search Control Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="البحث عن مستخدم بالاسم أو اسم الحساب..."
            className="w-full text-xs px-3.5 py-2.5 pr-9 rounded-xl border border-slate-200 focus:border-blue-700 outline-none font-medium text-slate-800"
          />
          <Search className="absolute right-3 top-3 w-4.5 h-4.5 text-slate-400" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none font-bold text-slate-700"
          >
            <option value="all">كل الرتب والصلاحيات</option>
            <option value="owner">المالك (Owner)</option>
            <option value="supervisor">المشرف (Supervisor)</option>
            <option value="technician">الفني (Technician)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-slate-200 outline-none font-bold text-slate-700"
          >
            <option value="all">كل الحالات</option>
            <option value="active">الحسابات النشطة</option>
            <option value="disabled">الحسابات المعطلة</option>
          </select>
        </div>
      </div>

      {/* Users Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full bg-slate-50 p-12 text-center rounded-2xl border border-dashed border-slate-200">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-extrabold">لا يوجد مستخدمين يطابقون خيارات البحث الحالية.</p>
          </div>
        ) : (
          filteredUsers.map((u) => (
            <div 
              key={u.id}
              className={`bg-white rounded-2xl border p-5 shadow-xs transition-all relative flex flex-col justify-between ${
                u.status === 'disabled' 
                  ? 'border-red-100 bg-red-50/10' 
                  : u.locked 
                  ? 'border-amber-100 bg-amber-50/10' 
                  : 'border-slate-100 hover:shadow-md'
              }`}
            >
              <div className="space-y-4">
                {/* Header card info */}
                <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm text-white ${
                      u.role === 'owner' 
                        ? 'bg-red-500' 
                        : u.role === 'manager' 
                        ? 'bg-blue-600' 
                        : 'bg-slate-500'
                    }`}>
                      {(u.displayName || u.username).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                        <span>{u.displayName || 'بدون اسم ظاهر'}</span>
                        {u.username === currentUsername && (
                          <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">حسابك</span>
                        )}
                      </h3>
                      <p className="text-[10px] text-slate-400 font-mono">@{u.username}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {getRoleBadge(u.role)}
                    <div className="flex items-center gap-1">
                      {u.locked && (
                        <span className="bg-amber-100 text-amber-800 text-[8px] font-bold px-1.5 py-0.5 rounded-full">مقفل مؤقتاً</span>
                      )}
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${
                        u.status === 'active' 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-red-50 text-red-700'
                      }`}>
                        {u.status === 'active' ? 'نشط' : 'معطل'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Body Details list */}
                <div className="space-y-2.5 text-xs text-slate-600 font-semibold bg-slate-50/50 p-3 rounded-xl border border-slate-50">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[10px]">👤 الاسم الكامل:</span>
                    <span className="text-slate-800 font-black">{u.displayName || u.username}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[10px]">🔑 اسم المستخدم:</span>
                    <span className="text-slate-800 font-mono font-bold">{u.username}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[10px]">📱 آخر جهاز:</span>
                    <span className="text-slate-700 font-bold flex items-center gap-1">
                      <Smartphone className="w-3 h-3 text-slate-400" />
                      <span>{u.lastDevice || 'غير معروف'}</span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-[10px]">🕒 آخر دخول:</span>
                    <span className="text-slate-700 text-[10px] font-bold">{formatDateTime(u.lastLogin)}</span>
                  </div>
                  {u.role === 'technician' && (
                    <div className="flex justify-between items-center border-t border-dashed border-slate-150 pt-2 mt-1">
                      <span className="text-slate-400 text-[10px]">👷 الفني المرتبط:</span>
                      <span className="text-blue-700 font-extrabold">{u.employeeName || 'غير مرتبط'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons for Owner */}
              {userRole === 'owner' && (
                <div className="mt-4 pt-3 border-t border-slate-50 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(u)}
                      className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black border border-slate-100 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      title="تعديل بيانات الحساب"
                    >
                      <Edit2 className="w-3 h-3 text-blue-600" />
                      <span>تعديل</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordResetModal(u);
                        setNewPassword('');
                      }}
                      className="py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black border border-slate-100 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      title="تحديث كلمة المرور"
                    >
                      <Key className="w-3 h-3 text-amber-500" />
                      <span>كلمة المرور</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowRoleModal(u);
                        setNewRole(u.role);
                      }}
                      disabled={u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')}
                      className={`py-1.5 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg text-[10px] font-black border border-slate-100 flex items-center justify-center gap-1 transition-colors ${
                        u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')
                          ? 'opacity-40 cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                      title="تعديل رتبة وصلاحية المستخدم"
                    >
                      <Shield className="w-3 h-3 text-violet-600" />
                      <span>الصلاحية</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(u)}
                      disabled={u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-extrabold border flex items-center justify-center gap-1 transition-colors ${
                        u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')
                          ? 'opacity-40 bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                          : u.status === 'active'
                          ? 'bg-red-50 hover:bg-red-100 border-red-100 text-red-700 cursor-pointer'
                          : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-700 cursor-pointer'
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{u.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleLock(u)}
                      disabled={u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-extrabold border flex items-center justify-center gap-1 transition-colors ${
                        u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')
                          ? 'opacity-40 bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                          : u.locked
                          ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-700 cursor-pointer'
                          : 'bg-amber-50 hover:bg-amber-100 border-amber-100 text-amber-700 cursor-pointer'
                      }`}
                      title={u.locked ? 'فك قفل الحساب' : 'قفل الحساب مؤقتاً لعدم تمكينه من الدخول'}
                    >
                      {u.locked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      <span>{u.locked ? 'فك القفل' : 'قفل مؤقت'}</span>
                    </button>
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setUserToDelete(u)}
                      disabled={u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')}
                      className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-extrabold border flex items-center justify-center gap-1 transition-colors ${
                        u.username === currentUsername || (u.role === 'owner' && u.id === 'u-1')
                          ? 'opacity-40 bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 border-red-600 text-white cursor-pointer'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>حذف الحساب</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dialogs / Modals Section */}
      <AnimatePresence>
        {/* ADD / EDIT USER DIALOG */}
        {(isAddingNew || editingUser) && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col border border-slate-100"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-700" />
                  <span>{isAddingNew ? 'إضافة مستخدم جديد' : 'تعديل بيانات الحساب'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNew(false);
                    setEditingUser(null);
                  }}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSave} className="p-6 space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Display Name Input */}
                {role !== 'technician' && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-700">الاسم الظاهر للمستخدم</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="مثال: المهندس حسن يوسف"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
                    />
                  </div>
                )}

                {/* Username Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">اسم المستخدم للولوج (مفتاح فريد)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="مثال: hassan_yusuf"
                    disabled={!isAddingNew}
                    className={`w-full text-xs px-3.5 py-2.5 rounded-xl border outline-none font-medium ${
                      !isAddingNew 
                        ? 'bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed' 
                        : 'border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 text-slate-800'
                    }`}
                  />
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    {isAddingNew ? 'كلمة المرور' : 'تغيير كلمة المرور (اتركه فارغاً للاحتفاظ بالقديمة)'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة مرور قوية"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
                  />
                </div>

                {/* Select Role */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">نوع الحساب والصلاحيات</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as any)}
                    disabled={!isAddingNew && editingUser?.username === 'owner' && editingUser?.id === 'u-1'}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-extrabold"
                  >
                    <option value="owner">المالك (Owner - كافة الصلاحيات)</option>
                    <option value="supervisor">المشرف (Supervisor - إرسال ومتابعة وقاعدة بيانات المشتركين)</option>
                    <option value="technician">الفني (Technician - لوحة تحكم ومهام شخصية)</option>
                  </select>
                </div>

                {/* Link to Technician Dropdown */}
                {role === 'technician' && (
                  <div className="space-y-1.5 animate-fade-in bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                    <label className="block text-xs font-bold text-blue-800">👷 ربط الحساب بالفني</label>
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => {
                        setSelectedEmployeeId(e.target.value);
                        const emp = employees.find(em => em.id === e.target.value);
                        if (emp) {
                          setDisplayName(emp.name);
                        }
                      }}
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-blue-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-extrabold bg-white"
                    >
                      <option value="">اختر الفني</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Phone number input - visible only if role is technician */}
                {role === 'technician' && (
                  <div className="space-y-1.5 animate-fade-in">
                    <label className="block text-xs font-bold text-slate-700">رقم الهاتف (اختياري)</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="مثال: 0501234567"
                      className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
                    />
                  </div>
                )}

                {/* Select Status */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">حالة الحساب</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    disabled={editingUser?.username === currentUsername || (editingUser?.username === 'owner' && editingUser?.id === 'u-1')}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-bold"
                  >
                    <option value="active">نشط (مسموح له بالدخول)</option>
                    <option value="disabled">معطل (ممنوع تماماً من تسجيل الدخول)</option>
                  </select>
                </div>

                {/* Form Buttons */}
                <div className="flex gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    {isAddingNew ? 'إنشاء الحساب' : 'حفظ التعديلات'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setEditingUser(null);
                    }}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* PASSWORD RESET DIALOG */}
        {showPasswordResetModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-100"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-700" />
                  <span>تحديث كلمة المرور</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowPasswordResetModal(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handlePasswordResetSubmit} className="p-6 space-y-4">
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-[11px] font-semibold leading-relaxed">
                  أنت بصدد تعديل كلمة مرور الحساب للمستخدم: <strong>@{showPasswordResetModal.username}</strong>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">كلمة المرور الجديدة</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="أدخل كلمة مرور جديدة للحساب"
                    required
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none text-slate-800 font-mono font-bold"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    تحديث كلمة المرور
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordResetModal(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* PRIVILEGE / ROLE EDIT DIALOG */}
        {showRoleModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-100"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-700" />
                  <span>تعديل الصلاحيات</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowRoleModal(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRoleSubmit} className="p-6 space-y-4">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-[11px] font-semibold leading-relaxed">
                  أنت تقوم بتغيير رتبة المستخدم: <strong>@{showRoleModal.username}</strong>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">الرتبة الجديدة</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-700 outline-none text-slate-800 font-bold"
                  >
                    <option value="owner">المالك (Owner)</option>
                    <option value="supervisor">المشرف (Supervisor)</option>
                    <option value="technician">الفني (Technician)</option>
                  </select>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    تغيير الرتبة
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRoleModal(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* CUSTOM DELETE CONFIRMATION DIALOG */}
        {userToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl shadow-xl overflow-hidden border border-slate-100"
            >
              <div className="bg-red-50 p-6 flex items-start gap-3 border-b border-red-100">
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-red-800 text-sm font-black leading-none">تأكيد حذف الحساب</h4>
                  <p className="text-[10px] text-red-600 font-bold mt-1.5 leading-relaxed">
                    أنت بصدد حذف حساب المستخدم: <strong>@{userToDelete.username}</strong>
                  </p>
                </div>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                  هل أنت متأكد من حذف هذا الحساب؟
                  <br />
                  <span className="text-red-600 font-extrabold mt-1 block">
                    لن يتم حذف بيانات المهام والتقارير السابقة، وإنما سيتم حذف إمكانية تسجيل الدخول فقط.
                  </span>
                </p>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={executeDelete}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    حذف
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserToDelete(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
