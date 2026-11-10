import React from 'react';
import { Award, ShieldCheck, Heart, AppWindow } from 'lucide-react';
import { motion } from 'motion/react';
import { APP_VERSION } from '../config/version';

export default function AboutCard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      {/* Visual Badge Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="md:col-span-5 bg-blue-700 rounded-2xl p-6 text-white text-center flex flex-col justify-between shadow-sm relative overflow-hidden"
      >
        {/* Background sparkles */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/5 -mr-10 -mt-10 blur-xl"></div>
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5 -ml-10 -mb-10 blur-xl"></div>

        <div>
          <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20 backdrop-blur-md">
            <Award className="w-10 h-10 text-white" />
          </div>

          <h3 className="text-2xl font-black tracking-wide">FutureX</h3>
          <p className="text-xs text-blue-100 font-medium mt-1">تطبيق تقييم الموظفين وحساب النقاط التلقائي</p>
          
          <div className="mt-4 inline-block bg-white/10 px-3.5 py-1 rounded-full text-[11px] font-bold border border-white/10">
            الإصدار {APP_VERSION} (PWA)
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-xs text-blue-100/80 space-y-2">
          <p className="font-bold">
            تم التطوير بواسطة المصمم: <span className="text-white font-black underline underline-offset-4">Hisham</span>
          </p>
          <p className="text-[10px]">جميع الحقوق محفوظة © {new Date().getFullYear()} FutureX.</p>
        </div>
      </motion.div>

      {/* App details card */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="md:col-span-7 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col justify-between"
      >
        <div className="space-y-4">
          <h3 className="text-base font-extrabold text-slate-800">تفاصيل تطبيق FutureX</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            تم تصميم هذا النظام خصيصاً لمشرفي شركة <span className="font-bold text-slate-800">FutureX</span> لمتابعة حركة وتقييم الموظفين الميدانيين الذين يقل عددهم عن 10 موظفين. يضمن النظام دقة متناهية في حساب النقاط بناءً على نوع العمل ونشاط الأفراد لتعزيز مبادئ الشفافية وبث الروح التنافسية الإيجابية.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs">أمان البيانات وحفظها</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">تُحفظ البيانات محلياً على هاتفك لتصفح سريع وأمن كامل بدون انترنت.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5">
              <AppWindow className="w-5 h-5 text-blue-700 shrink-0" />
              <div>
                <h4 className="font-bold text-slate-800 text-xs">تطبيق تقدمي PWA</h4>
                <p className="text-[10px] text-slate-400 mt-0.5">يمكنك تثبيته على هاتفك الأندرويد أو الآيفون والوصول له من الشاشة الرئيسية كأي تطبيق رسمي.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Developer controls / footer info */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
            <span>صمم بكل حب لـ FutureX من قبل هشام</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

