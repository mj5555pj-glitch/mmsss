import React, { useState } from 'react';
import { Award, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginViewProps {
  onLogin: (username: string, password: string) => { success: boolean; role?: 'owner' | 'admin' | 'viewer'; error?: string };
}

export default function LoginView({ onLogin }: LoginViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !password.trim()) {
      setErrorMsg('الرجاء إدخال اسم المستخدم وكلمة المرور.');
      return;
    }

    setIsLoading(true);

    // Simulate small delays for premium feel
    setTimeout(() => {
      const result = onLogin(username.trim(), password.trim());
      setIsLoading(false);
      if (!result.success) {
        setErrorMsg(result.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-xl overflow-hidden p-6 sm:p-8 space-y-6"
      >
        {/* App Logo & Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-blue-700 text-white rounded-2xl flex items-center justify-center shadow-lg mx-auto transform -rotate-3 hover:rotate-0 transition-transform duration-300">
            <Award className="w-8 h-8 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">بوابة الدخول | FutureX</h1>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              نظام المتابعة الميدانية وحساب النقاط الذكي للكوادر الفنية والمبيعات
            </p>
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs font-bold flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">اسم المستخدم</label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                disabled={isLoading}
                className="w-full text-xs px-3.5 py-3 pr-10 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
              />
              <User className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                disabled={isLoading}
                className="w-full text-xs px-3.5 py-3 pr-10 pl-10 rounded-xl border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-100 outline-none text-slate-800 font-medium"
              />
              <Lock className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 w-5 h-5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white font-bold py-3 px-4 rounded-xl text-xs transition-colors shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>جاري التحقق من الهوية...</span>
              </>
            ) : (
              <span>تسجيل الدخول</span>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
