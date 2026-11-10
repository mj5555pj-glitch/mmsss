import React, { useState } from 'react';
import { Gift, AlertTriangle, UserCheck, ShieldAlert, Check, Plus, X, ChevronDown } from 'lucide-react';
import { Employee } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface ManualPointsCardProps {
  employees: Employee[];
  onExecuteManualPoints: (
    employeeId: string,
    type: 'gift' | 'penalty',
    points: number,
    reason: string
  ) => Promise<void>;
}

export default function ManualPointsCard({ employees, onExecuteManualPoints }: ManualPointsCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<'gift' | 'penalty'>('gift');
  const [points, setPoints] = useState<string>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const presetReasons = type === 'gift' 
    ? ['إنجاز مميز', 'تعاون مع الفريق', 'مساعدة في حل مشكلة', 'التزام ممتاز بالوقت']
    : ['مخالفة تعليمات', 'تأخير متكرر', 'عدم إكمال المهمة بدقة', 'إهمال الأجهزة والمعدات'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!employeeId) {
      setError('الرجاء اختيار الفني أولاً.');
      return;
    }

    const pointsNum = parseFloat(points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      setError('الرجاء إدخال عدد نقاط صحيح أكبر من الصفر.');
      return;
    }

    if (!reason.trim()) {
      setError('الرجاء كتابة سبب العملية (هذا الحقل إجباري).');
      return;
    }

    try {
      setLoading(true);
      await onExecuteManualPoints(employeeId, type, pointsNum, reason.trim());
      setSuccess(`تم تنفيذ العملية بنجاح! تم ${type === 'gift' ? 'إضافة نقاط الهدية لـ' : 'خصم نقاط العقوبة من'} الفني.`);
      setPoints('');
      setReason('');
      setEmployeeId('');
    } catch (err: any) {
      setError('فشل تنفيذ العملية. الرجاء المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <div id="manual-points-card" className="max-w-2xl mx-auto text-center" dir="rtl">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full sm:w-auto bg-white hover:bg-slate-50 text-slate-800 font-extrabold text-xs py-3.5 px-6 rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all cursor-pointer flex items-center justify-center gap-3 text-slate-700 hover:text-indigo-600 hover:border-indigo-200"
        >
          <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            🎁
          </div>
          <span className="text-sm font-black">إضافة / خصم نقاط</span>
          <Plus className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98, y: -5 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      id="manual-points-card" 
      className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden" 
      dir="rtl"
    >
      {/* Header with Close Button */}
      <div className="bg-slate-50 border-b border-slate-100 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold text-lg">
            🎁
          </div>
          <div>
            <h3 className="font-extrabold text-slate-800 text-sm md:text-base">إدارة النقاط اليدوية</h3>
            <p className="text-[11px] text-slate-500">إضافة مكافآت مباشرة أو خصم نقاط عقوبة للفنيين</p>
          </div>
        </div>
        
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError('');
            setSuccess('');
          }}
          className="p-2 bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-xl border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
        >
          <span>إغلاق</span>
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {/* Type selector */}
        <div>
          <label className="block text-xs font-extrabold text-slate-600 mb-2">نوع العملية</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setType('gift');
                setReason('');
                setError('');
                setSuccess('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                type === 'gift'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>إضافة نقاط هدية</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType('penalty');
                setReason('');
                setError('');
                setSuccess('');
              }}
              className={`py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                type === 'penalty'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              <span>خصم نقاط عقوبة</span>
            </button>
          </div>
        </div>

        {/* Technician selector */}
        <div>
          <label htmlFor="tech-select" className="block text-xs font-extrabold text-slate-600 mb-1.5">اختيار الفني</label>
          <div className="relative">
            <select
              id="tech-select"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setError('');
                setSuccess('');
              }}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer appearance-none"
            >
              <option value="">-- اختر الفني --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Points Field */}
        <div>
          <label htmlFor="points-input" className="block text-xs font-extrabold text-slate-600 mb-1.5">عدد النقاط</label>
          <div className="relative">
            <input
              id="points-input"
              type="number"
              min="0.5"
              step="any"
              placeholder="مثال: 5"
              value={points}
              onChange={(e) => {
                setPoints(e.target.value);
                setError('');
                setSuccess('');
              }}
              className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400 placeholder:font-normal"
            />
          </div>
        </div>

        {/* Reason field */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label htmlFor="reason-input" className="text-xs font-extrabold text-slate-600">سبب العملية (إجباري)</label>
            <span className="text-[10px] text-red-500 font-bold">مطلوب</span>
          </div>
          <textarea
            id="reason-input"
            rows={3}
            placeholder={type === 'gift' ? 'اكتب سبب منح هذه الهدية... (مثال: إنجاز رائع أو تعاون مميز)' : 'اكتب سبب فرض هذه العقوبة... (مثال: تأخير متكرر أو مخالفة للتعليمات)'}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError('');
              setSuccess('');
            }}
            className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400"
          />

          {/* Preset tags */}
          <div className="mt-2 flex flex-wrap gap-1.5 items-center">
            <span className="text-[10px] text-slate-400 ml-1">اقتراحات سريعة:</span>
            {presetReasons.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setReason(preset);
                  setError('');
                }}
                className={`text-[10px] px-2.5 py-1 rounded-full border font-bold transition-all cursor-pointer ${
                  reason === preset
                    ? type === 'gift'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Error / Success feedback with motion */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-3.5 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-2 font-semibold"
            >
              <ShieldAlert className="w-4.5 h-4.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-3.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-xs flex items-center gap-2 font-semibold"
            >
              <Check className="w-4.5 h-4.5 flex-shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Execute button */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3.5 rounded-xl font-extrabold text-xs text-white transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer ${
            loading
              ? 'bg-slate-400 cursor-not-allowed'
              : type === 'gift'
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100'
                : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
          }`}
        >
          {loading ? 'جاري التنفيذ...' : (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              <span>✔ تنفيذ العملية</span>
            </>
          )}
        </button>
      </form>
    </motion.div>
  );
}
