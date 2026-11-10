import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error caught by ErrorBoundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHardReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
    } catch (e) {
      console.warn('Reset cache warning:', e);
    }
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 dir-rtl text-right font-sans">
          <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
              <AlertTriangle className="w-8 h-8" />
            </div>
            
            <h2 className="text-xl font-bold text-center text-white mb-2">
              حدث خطأ غير متوقع في التطبيق
            </h2>
            <p className="text-sm text-slate-300 text-center mb-6 leading-relaxed">
              تعذر تحميل بعض العناصر البرمجية. يمكنك محاولة إعادة تحميل الصفحة أو تنظيف الذاكرة المؤقتة للعودة للعمل.
            </p>

            {this.state.error && (
              <div className="mb-6 p-3 bg-slate-950/60 rounded-xl border border-slate-700/50 text-xs text-rose-300 font-mono break-words text-left dir-ltr max-h-32 overflow-y-auto">
                {this.state.error.toString()}
              </div>
            )}

            <div className="space-y-2">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:scale-98 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <RefreshCw className="w-5 h-5" />
                <span>إعادة تحميل الصفحة</span>
              </button>

              <button
                onClick={this.handleHardReset}
                className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-600 active:scale-98 text-slate-200 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>مسح الذاكرة المؤقتة والبدء من جديد</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
