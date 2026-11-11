import React, { useState, useEffect } from 'react';
import {
  Package,
  Boxes,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Phone,
  Layers,
  Sparkles
} from 'lucide-react';
import { TechnicianStockItem, MaterialTransaction, Employee } from '../types';
import { getTechnicianInventory, getMaterialTransactions } from '../lib/dbService';

interface TechnicianInventoryViewProps {
  employee: Employee;
}

export default function TechnicianInventoryView({ employee }: TechnicianInventoryViewProps) {
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<TechnicianStockItem[]>([]);
  const [transactions, setTransactions] = useState<MaterialTransaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'balance' | 'consumption_history' | 'supplies'>('balance');

  const loadData = async () => {
    setLoading(true);
    try {
      const [techStocks, techTxns] = await Promise.all([
        getTechnicianInventory(employee.id),
        getMaterialTransactions({ employeeId: employee.id, limitCount: 60 })
      ]);
      setStocks(techStocks);
      setTransactions(techTxns);
    } catch (err) {
      console.warn('Error loading tech inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [employee.id]);

  const activeStockItems = stocks.filter(s => s.quantity > 0);
  const totalItemsCount = activeStockItems.reduce((acc, curr) => acc + curr.quantity, 0);

  const consumptions = transactions.filter(t => t.type === 'consumption');
  const supplies = transactions.filter(t => t.type === 'supply');

  const filteredStocks = stocks.filter(s =>
    (s.materialName || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="space-y-6 select-none" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-slate-900 via-blue-900 to-indigo-950 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden border border-blue-800/30">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-black mb-2 border border-blue-400/20">
              <Boxes className="w-3.5 h-3.5" />
              <span>عهدة المواد والمخزون الميداني</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-white">
              مخزون الفني: {employee.name}
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-lg">
              عرض المواد المسلمة لك من الإدارة، ورصيدك الحالي، وسجل الصرفيات الميدانية الموثقة مع كل مهمة مشترك.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5 pt-5 border-t border-white/10">
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-[11px] text-slate-300 font-bold block">الأصناف المتوفرة بعهدتك</span>
            <strong className="text-xl font-black text-white">{activeStockItems.length}</strong>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
            <span className="text-[11px] text-slate-300 font-bold block">إجمالي القطع والكوابل</span>
            <strong className="text-xl font-black text-emerald-400">{totalItemsCount}</strong>
          </div>
          <div className="bg-white/5 rounded-2xl p-3 border border-white/10 col-span-2 md:col-span-1">
            <span className="text-[11px] text-slate-300 font-bold block">صرفيات للمشتركين موثقة</span>
            <strong className="text-xl font-black text-amber-300">{consumptions.length} عملية</strong>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200/80 shadow-xs max-w-lg">
        <button
          type="button"
          onClick={() => setActiveTab('balance')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeTab === 'balance'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>رصيد المواد في عهدتي ({activeStockItems.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('consumption_history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeTab === 'consumption_history'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-amber-500" />
          <span>سجل الصرفيات للمشتركين ({consumptions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('supplies')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeTab === 'supplies'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
          <span>المواد المستلمة ({supplies.length})</span>
        </button>
      </div>

      {/* TAB 1: CURRENT BALANCE */}
      {activeTab === 'balance' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في المواد المسجلة..."
              className="w-full pr-9 pl-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium"
            />
          </div>

          {filteredStocks.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 text-slate-400 font-bold space-y-2">
              <Package className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm text-slate-600">لا توجد مواد مسجلة في عهدتك حالياً.</p>
              <p className="text-xs text-slate-400">ستظهر المواد هنا فور قيام الإدارة بتسليمك وجبة جديدة.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {filteredStocks.map(stock => {
                const isOutOfStock = stock.quantity <= 0;
                const isLow = stock.quantity > 0 && stock.quantity <= 2;

                return (
                  <div
                    key={stock.id}
                    className={`bg-white rounded-3xl p-4 border transition-all shadow-xs flex flex-col justify-between ${
                      isOutOfStock
                        ? 'border-slate-200 opacity-60'
                        : isLow
                        ? 'border-amber-200 bg-amber-50/20'
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {stock.unit}
                        </span>
                        {isOutOfStock ? (
                          <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                            نفذت الكمية
                          </span>
                        ) : isLow ? (
                          <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            رصيد منخفض
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            متوفر
                          </span>
                        )}
                      </div>

                      <h4 className="font-black text-sm text-slate-900 mt-1">{stock.materialName}</h4>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-baseline justify-between">
                      <span className="text-xs text-slate-400 font-bold">الرصيد المتاح:</span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black font-mono text-blue-700">
                          {stock.quantity}
                        </span>
                        <span className="text-xs font-bold text-slate-600">{stock.unit}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONSUMPTION HISTORY */}
      {activeTab === 'consumption_history' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h3 className="font-extrabold text-xs text-slate-800">
              سجل المواد التي قمت بصرفها للمشتركين عند إنجاز المهام
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {consumptions.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                لم تقم بصرف أي مواد للمشتركين حتى الآن. عند إكمال المهمة، يمكنك إضافة المواد المصروفة للمشترك.
              </div>
            ) : (
              consumptions.map(txn => (
                <div key={txn.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                      <ArrowDownLeft className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 font-black text-xs">{txn.materialName}</strong>
                        <span className="font-mono font-black text-amber-700 text-xs bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                          -{txn.quantity} {txn.unit}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium mt-1">
                        {txn.subscriberName && (
                          <span className="text-slate-700 font-bold">المشترك: {txn.subscriberName}</span>
                        )}
                        {txn.subscriberPhone && (
                          <span className="font-mono">({txn.subscriberPhone})</span>
                        )}
                        {txn.taskType && (
                          <span className="px-1.5 py-0.2 rounded-sm bg-slate-100 font-bold text-slate-600">
                            {txn.taskType}
                          </span>
                        )}
                      </div>

                      {txn.notes && (
                        <p className="text-[11px] text-slate-600 font-medium mt-1">
                          ملاحظة: {txn.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium sm:text-left shrink-0">
                    {new Date(txn.createdAt).toLocaleDateString('ar-EG', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIES RECEIVED */}
      {activeTab === 'supplies' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <h3 className="font-extrabold text-xs text-slate-800">
              سجل وجبات العهد والمواد المسلمة لك من الإدارة
            </h3>
          </div>

          <div className="divide-y divide-slate-100">
            {supplies.length === 0 ? (
              <div className="p-8 text-center text-slate-400 font-bold text-xs">
                لا توجد سجلات تسليم عهد بعد.
              </div>
            ) : (
              supplies.map(txn => (
                <div key={txn.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900 font-black text-xs">{txn.materialName}</strong>
                        <span className="font-mono font-black text-emerald-700 text-xs bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                          +{txn.quantity} {txn.unit}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                        <span>سُلّمت بواسطة: {txn.performedBy}</span>
                        {txn.notes && <span className="mr-2">({txn.notes})</span>}
                      </div>
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-400 font-medium">
                    {new Date(txn.createdAt).toLocaleDateString('ar-EG', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
