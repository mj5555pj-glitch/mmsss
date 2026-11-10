import React, { useState } from 'react';
import { Plus, Edit2, Trash2, UserPlus, Phone, Calendar, AlertCircle, X, Check } from 'lucide-react';
import { Employee } from '../types';
import { formatArabicDateOnly } from '../utils';
import { motion, AnimatePresence } from 'motion/react';

interface EmployeeManagerProps {
  employees: Employee[];
  onAddEmployee: (name: string, phone?: string) => void;
  onEditEmployee: (id: string, name: string, phone?: string) => void;
  onDeleteEmployee: (id: string) => void;
}

export default function EmployeeManager({
  employees,
  onAddEmployee,
  onEditEmployee,
  onDeleteEmployee,
}: EmployeeManagerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const MAX_EMPLOYEES = 9; // "Less than 10 employees"

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('يرجى إدخال اسم الموظف ثنائياً أو ثلاثياً على الأقل.');
      return;
    }

    if (employees.length >= MAX_EMPLOYEES) {
      setError(`عذراً، تم الوصول للحد الأقصى للنظام (${MAX_EMPLOYEES} موظفين).`);
      return;
    }

    // Check duplicate name
    if (employees.some(emp => emp.name.trim() === name.trim())) {
      setError('هذا الاسم مسجل بالفعل في قائمة الموظفين.');
      return;
    }

    onAddEmployee(name.trim(), phone.trim() || undefined);
    setName('');
    setPhone('');
    setShowAddForm(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!editingEmployee) return;

    if (!editingEmployee.name.trim()) {
      setError('لا يمكن حفظ الموظف بدون اسم.');
      return;
    }

    // Check duplicate name with other employees
    if (employees.some(emp => emp.id !== editingEmployee.id && emp.name.trim() === editingEmployee.name.trim())) {
      setError('هذا الاسم مسجل بالفعل لموظف آخر.');
      return;
    }

    onEditEmployee(editingEmployee.id, editingEmployee.name.trim(), editingEmployee.phone?.trim() || undefined);
    setEditingEmployee(null);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden" dir="rtl">
      {/* Card Header */}
      <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
        <div>
          <h2 className="text-lg font-extrabold text-slate-800">إدارة شؤون الموظفين</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            إضافة وتعديل بيانات الموظفين (المجموع الحالي:{' '}
            <span className="font-extrabold text-blue-700">{employees.length}</span> من{' '}
            <span className="font-bold text-slate-700">{MAX_EMPLOYEES}</span>)
          </p>
        </div>

        {employees.length < MAX_EMPLOYEES && (
          <button
            onClick={() => {
              setError('');
              setShowAddForm(true);
            }}
            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm cursor-pointer self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة موظف جديد</span>
          </button>
        )}
      </div>

      {/* Warnings & Limits info */}
      {employees.length >= MAX_EMPLOYEES && (
        <div className="mx-6 mt-4 p-3.5 bg-amber-50 text-amber-800 rounded-xl border border-amber-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-bold">تم الوصول للحد الأقصى للنظام!</span> لا يمكنك إضافة المزيد من الموظفين حالياً (أقل من 10 موظفين). لحذف موظف قم بالضغط على أيقونة الحذف أدناه.
          </div>
        </div>
      )}

      {/* Grid of Employees */}
      <div className="p-6">
        {employees.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <UserPlus className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="font-bold text-slate-700 text-sm">لا يوجد موظفون مسجلون</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              ابدأ بإضافة موظفك الأول لإسناد وتسجيل المهام ونقاط التقييم التلقائية له.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {employees.map((emp, idx) => {
              const isSubscribed = Boolean(
                emp.oneSignalSubscriptionId ||
                (emp.oneSignalSubscriptionIds && emp.oneSignalSubscriptionIds.length > 0) ||
                emp.fcmToken
              );

              return (
                <motion.div
                  key={emp.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className="bg-white rounded-xl p-4 border border-slate-100 hover:border-blue-100 hover:shadow-xs transition-all flex flex-col justify-between"
                >
                  {/* Employee Info Header */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 flex items-center justify-center font-black text-sm">
                          {emp.name.slice(0, 1)}
                        </div>
                        <div className="truncate">
                          <h4 className="font-black text-sm text-slate-800 truncate" title={emp.name}>
                            {emp.name}
                          </h4>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {emp.id}</p>
                        </div>
                      </div>

                      {/* Push Notification Status Badge */}
                      {isSubscribed ? (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0" title="الفني مسجل في خدمة الإشعارات OneSignal">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                          <span>إشعارات مفعلة</span>
                        </span>
                      ) : (
                        <span className="bg-slate-50 text-slate-500 border border-slate-200 text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0" title="الفني لم يفتح تطبيق OneSignal بعد">
                          <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                          <span>غير مسجل</span>
                        </span>
                      )}
                    </div>

                    {/* Body Specs */}
                    <div className="mt-4 space-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium font-mono text-slate-500">{emp.phone || 'بدون رقم هاتف'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium whitespace-nowrap">انضم: {formatArabicDateOnly(emp.joinedAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions bottom row */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        setError('');
                        setEditingEmployee(emp);
                      }}
                      className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-blue-700 border border-transparent transition-colors cursor-pointer"
                      title="تعديل الموظف"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setError('');
                        setShowDeleteConfirm(emp.id);
                      }}
                      className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-red-600 border border-transparent transition-colors cursor-pointer"
                      title="حذف الموظف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Employee Dialog Sheet */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="bg-blue-700 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-200" />
                  <h3 className="font-extrabold text-sm">إضافة موظف جديد</h3>
                </div>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="p-1 hover:bg-blue-600 rounded-lg text-blue-200 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف الثلاثي *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله المحمد"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XXXXXXXX"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono dir-ltr text-right"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ وتأكيد الإضافة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Employee Form Modal */}
      <AnimatePresence>
        {editingEmployee && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="bg-slate-800 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-slate-300" />
                  <h3 className="font-extrabold text-sm">تعديل بيانات الموظف</h3>
                </div>
                <button
                  onClick={() => setEditingEmployee(null)}
                  className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 text-red-700 rounded-xl text-xs flex items-center gap-2 border border-red-100 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم الموظف الثلاثي *</label>
                  <input
                    type="text"
                    required
                    value={editingEmployee.name}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف</label>
                  <input
                    type="tel"
                    value={editingEmployee.phone || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-mono dir-ltr text-right"
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <Check className="w-4 h-4" />
                    <span>حفظ التعديلات</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingEmployee(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Sheet */}
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
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-800 text-base">هل أنت متأكد من حذف الموظف؟</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                سيؤدي حذف الموظف إلى إزالة بياناته من النظام نهائياً. لن يتم تصفير نقاط المهام التاريخية المسجلة سابقاً بالكامل، ولكن لن يرتبط به مستقبلاً.
              </p>

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => {
                    onDeleteEmployee(showDeleteConfirm);
                    setShowDeleteConfirm(null);
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                  نعم، احذفه
                </button>
                <button
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
    </div>
  );
}
