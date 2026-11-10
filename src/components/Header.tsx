import React, { useState, useEffect } from 'react';
import { Award, Zap, LogOut, User, Code, Bell, Send, X, CheckCircle2, AlertCircle, Volume2, ChevronDown, ChevronUp, Triangle, Sparkles } from 'lucide-react';
import { Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { sendOneSignalToEmployee, sendOneSignalPushNotification } from '../lib/onesignalService';

interface HeaderProps {
  employeeCount: number;
  activeTasksCount: number;
  userRole: 'owner' | 'supervisor' | 'manager' | 'technician' | 'accountant' | string;
  employees?: Employee[];
  onLogout: () => void;
}

export default function Header({ employeeCount, activeTasksCount, userRole, employees = [], onLogout }: HeaderProps) {
  const [currentDate, setCurrentDate] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Notification Modal State
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [selectedEmpId, setSelectedEmpId] = useState<string>('all');
  const [notifTitle, setNotifTitle] = useState('تذكير بمتابعة المهام');
  const [notifBody, setNotifBody] = useState('يرجى مراجعة قائمة المهام الحالية وتحديث حالتها في التطبيق');
  const [notifSoundType, setNotifSoundType] = useState<'new_task' | 'completed' | 'accepted' | 'rejected'>('new_task');
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      };
      setCurrentDate(now.toLocaleDateString('ar-EG', options));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifBody.trim()) return;

    setIsSendingNotif(true);
    setNotifFeedback(null);

    try {
      if (selectedEmpId === 'all') {
        // Send to all technicians
        await sendOneSignalPushNotification({
          title: notifTitle.trim(),
          body: notifBody.trim(),
          soundType: notifSoundType
        });
        setNotifFeedback({
          type: 'success',
          message: 'تم إرسال الإشعار بنجاح إلى جميع الفنيين المسجلين!'
        });
      } else {
        // Send to selected technician
        const targetEmp = employees.find(e => e.id === selectedEmpId);
        await sendOneSignalToEmployee(
          selectedEmpId,
          notifTitle.trim(),
          notifBody.trim(),
          notifSoundType
        );
        setNotifFeedback({
          type: 'success',
          message: `تم إرسال الإشعار بنجاح إلى هاتف الفني (${targetEmp ? targetEmp.name : selectedEmpId})!`
        });
      }

      setTimeout(() => {
        setShowNotifModal(false);
        setNotifFeedback(null);
      }, 1800);
    } catch (err: any) {
      setNotifFeedback({
        type: 'error',
        message: err?.message || 'تعذر إرسال الإشعار، يرجى المحاولة لاحقاً.'
      });
    } finally {
      setIsSendingNotif(false);
    }
  };

  const roleLabel =
    userRole === 'owner'
      ? 'المالك والمشرف 👑'
      : userRole === 'supervisor' || userRole === 'manager'
      ? 'المشرف 🛡️'
      : 'الفني 👷';

  return (
    <>
      <header className="sticky top-0 z-40 bg-blue-800 text-white shadow-md border-b border-blue-950/80 transition-all duration-300" dir="rtl">
        {/* Very Thin Primary Bar */}
        <div className="max-w-7xl mx-auto px-3.5 py-1 flex items-center justify-between gap-2 h-10">
          
          {/* Right Side: FutureX Logo & Title */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center shadow-xs shrink-0">
              <Award className="w-4 h-4 text-blue-800 stroke-[2.5]" />
            </div>
            <h1 className="text-sm font-black tracking-tight italic leading-none">FutureX</h1>
            <span className="text-[9px] bg-blue-900/90 text-blue-200 font-bold px-2 py-0.5 rounded-full border border-blue-700/60 leading-none hidden sm:inline-block">
              {roleLabel}
            </span>
          </div>

          {/* Center: Live Date (Hidden on tiny screens) */}
          <div className="hidden md:flex items-center gap-2 text-[10px] text-blue-200/90 font-medium">
            <span>{currentDate}</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>

          {/* Left Side: Toggle Details Triangle Button + Quick Logout */}
          <div className="flex items-center gap-2">
            
            {/* Quick Active Tasks Indicator */}
            {activeTasksCount > 0 && (
              <span className="bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full text-[9px] font-black flex items-center gap-1 shadow-xs">
                <Zap className="w-2.5 h-2.5 fill-current" />
                <span>{activeTasksCount}</span>
              </span>
            )}

            {/* Triangle Dropdown Toggle Button */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold text-[10px] transition-all cursor-pointer border ${
                isExpanded
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                  : 'bg-blue-900/80 hover:bg-blue-700 text-blue-100 border-blue-700'
              }`}
              title="عرض باقي التفاصيل والخيارات"
            >
              <span>التفاصيل</span>
              <Triangle className={`w-2.5 h-2.5 fill-current transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-180'}`} />
            </button>
          </div>
        </div>

        {/* Collapsible Details Panel */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden bg-blue-900/95 border-t border-blue-700/80 backdrop-blur-md"
            >
              <div className="max-w-7xl mx-auto p-3.5 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs bg-blue-950/60 p-3 rounded-2xl border border-blue-800/80">
                  
                  {/* Account Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20 shadow-xs shrink-0">
                      <User className="w-4 h-4 text-amber-300 stroke-[2.5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-blue-200">حساب المستخدم:</span>
                        <span className="font-black text-white text-xs">{roleLabel}</span>
                      </div>
                      <p className="text-[10px] text-blue-300 mt-0.5">
                        {currentDate} • <span className="text-emerald-400 font-bold">متصل بـ Firebase</span>
                      </p>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager') && (
                      <span className="bg-blue-800/80 border border-blue-700 px-3 py-1 rounded-xl text-[10px] text-blue-100 font-bold">
                        👥 الكادر: {employeeCount} موظفاً
                      </span>
                    )}
                    <span className="bg-blue-800/80 border border-blue-700 px-3 py-1 rounded-xl text-[10px] text-blue-100 font-bold">
                      ⚡ المهام القائمة: {activeTasksCount}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-blue-800">
                    
                    {/* Send Notification Button */}
                    {(userRole === 'owner' || userRole === 'supervisor' || userRole === 'manager') && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifModal(true);
                          if (employees.length > 0 && selectedEmpId === 'all') {
                            setSelectedEmpId(employees[0].id);
                          }
                        }}
                        className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer shadow-xs shrink-0"
                      >
                        <Bell className="w-3.5 h-3.5 fill-current text-slate-950" />
                        <span>إرسال إشعار هاتف</span>
                      </button>
                    )}

                    {/* Developer Credit */}
                    <div className="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-[10px] text-blue-100 font-medium">
                      <Code className="w-3.5 h-3.5 text-amber-300" />
                      <span>تصميم وتطوير: هشام يحيى</span>
                    </div>

                    {/* Logout Button */}
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Send Notification Modal */}
      <AnimatePresence>
        {showNotifModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4" dir="rtl">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-800 to-indigo-900 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-amber-300 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm">إرسال تنبيه مباشر لهاتف الفني</h3>
                    <p className="text-[11px] text-blue-200">
                      سيصل الإشعار مباشرة لشاشة الهاتف حتى عند إغلاق التطبيق
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowNotifModal(false);
                    setNotifFeedback(null);
                  }}
                  className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Form */}
              <form onSubmit={handleSendNotification} className="p-6 space-y-4">
                {/* Technician Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر الفني المستهدف *</label>
                  <select
                    value={selectedEmpId}
                    onChange={(e) => setSelectedEmpId(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 font-bold bg-slate-50"
                  >
                    <option value="all">📢 جميع الفنيين (إرسال للجميع)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        👷 {emp.name} {emp.phone ? `(${emp.phone})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Presets */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">نماذج تنبيه جاهزة:</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNotifTitle('📋 تذكير بمتابعة المهام');
                        setNotifBody('يرجى الاطلاع على قائمة المهام المسندة إليك وتحديث حالتها في التطبيق.');
                        setNotifSoundType('new_task');
                      }}
                      className="p-2 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 hover:text-blue-900 transition-all text-center cursor-pointer"
                    >
                      📋 تذكير مهام
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifTitle('⚡ تنبيه عاجل من الإدارة');
                        setNotifBody('يرجى التواصل مع الإدارة أو متابعة المهام المطلوبة منك فوراً.');
                        setNotifSoundType('rejected');
                      }}
                      className="p-2 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 hover:text-blue-900 transition-all text-center cursor-pointer"
                    >
                      ⚡ تنبيه عاجل
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifTitle('👏 شكر وتقدير من الإدارة');
                        setNotifBody('نشكرك على سرعة ودقة إنجاز المهام اليوم، استمر بالتميز والتألق!');
                        setNotifSoundType('completed');
                      }}
                      className="p-2 bg-slate-100 hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 hover:text-blue-900 transition-all text-center cursor-pointer"
                    >
                      👏 شكر وتقدير
                    </button>
                  </div>
                </div>

                {/* Notification Title */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عنوان التنبيه *</label>
                  <input
                    type="text"
                    required
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="مثال: تذكير عاجل للفني"
                    className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800"
                  />
                </div>

                {/* Notification Body */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">محتوى التنبيه / الرسالة *</label>
                  <textarea
                    required
                    rows={3}
                    value={notifBody}
                    onChange={(e) => setNotifBody(e.target.value)}
                    placeholder="اكتب نص التنبيه المباشر الذي سيظهر في شاشة هاتف الفني..."
                    className="w-full text-xs p-3.5 rounded-xl border border-slate-200 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-slate-800 resize-none"
                  />
                </div>

                {/* Sound Type Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نغمة ونوع الإشعار الصوتي:</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${notifSoundType === 'new_task' ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        name="soundType"
                        value="new_task"
                        checked={notifSoundType === 'new_task'}
                        onChange={() => setNotifSoundType('new_task')}
                        className="hidden"
                      />
                      <Volume2 className="w-4 h-4 text-blue-600" />
                      <span>🔔 نغمة مهمة جديدة</span>
                    </label>

                    <label className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${notifSoundType === 'completed' ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold' : 'border-slate-200 text-slate-600'}`}>
                      <input
                        type="radio"
                        name="soundType"
                        value="completed"
                        checked={notifSoundType === 'completed'}
                        onChange={() => setNotifSoundType('completed')}
                        className="hidden"
                      />
                      <Volume2 className="w-4 h-4 text-emerald-600" />
                      <span>🎉 نغمة إنجاز / شكر</span>
                    </label>
                  </div>
                </div>

                {/* Feedback Message */}
                {notifFeedback && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${notifFeedback.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {notifFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <span className="font-bold">{notifFeedback.message}</span>
                  </div>
                )}

                {/* Form Actions */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSendingNotif}
                    className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold py-3 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSendingNotif ? 'جاري إرسال الإشعار...' : 'إرسال التنبيه الآن لهاتف الفني'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNotifModal(false);
                      setNotifFeedback(null);
                    }}
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
    </>
  );
}




