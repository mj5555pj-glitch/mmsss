import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Boxes,
  Plus,
  Minus,
  Search,
  Filter,
  User,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  Phone,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  Printer,
  ChevronDown,
  X,
  Clock,
  ArrowRight,
  Warehouse,
  ShieldAlert
} from 'lucide-react';
import {
  Employee,
  MaterialItem,
  TechnicianStockItem,
  MaterialTransaction,
  ConsumedMaterial
} from '../types';
import {
  getMaterialItems,
  saveMaterialItem,
  deleteMaterialItem,
  adjustWarehouseStock,
  getTechnicianInventory,
  supplyMaterialsToTechnician,
  returnMaterialsFromTechnician,
  adjustTechnicianStock,
  getMaterialTransactions
} from '../lib/dbService';

interface InventoryManagementViewProps {
  employees: Employee[];
  userRole: string;
  currentUsername?: string;
  onNavigateTab?: (tab: string) => void;
}

export default function InventoryManagementView({
  employees,
  userRole,
  currentUsername = 'الإدارة',
  onNavigateTab
}: InventoryManagementViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'technicians' | 'transactions' | 'catalog'>('technicians');
  const [loading, setLoading] = useState(true);

  // Data states
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [technicianStocks, setTechnicianStocks] = useState<TechnicianStockItem[]>([]);
  const [transactions, setTransactions] = useState<MaterialTransaction[]>([]);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTechFilter, setSelectedTechFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // Modals state
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [selectedTechForSupply, setSelectedTechForSupply] = useState<string>('');
  const [supplyItems, setSupplyItems] = useState<Array<{ materialId: string; quantity: number }>>([
    { materialId: '', quantity: 1 }
  ]);
  const [supplyNotes, setSupplyNotes] = useState('');
  const [isSubmittingSupply, setIsSubmittingSupply] = useState(false);

  // Material item modal (Add / Edit)
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('قطعة');
  const [itemCategory, setItemCategory] = useState('أجهزة');
  const [itemDesc, setItemDesc] = useState('');
  const [itemThreshold, setItemThreshold] = useState<number>(3);
  const [itemWarehouseStock, setItemWarehouseStock] = useState<number>(0);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);

  // Warehouse direct stock adjustment modal (Add / Deduct warehouse pieces)
  const [showWarehouseStockModal, setShowWarehouseStockModal] = useState(false);
  const [warehouseTargetItem, setWarehouseTargetItem] = useState<MaterialItem | null>(null);
  const [warehouseStockMode, setWarehouseStockMode] = useState<'add' | 'deduct'>('add');
  const [warehouseStockQty, setWarehouseStockQty] = useState<number>(1);
  const [warehouseStockReason, setWarehouseStockReason] = useState<string>('');
  const [isSubmittingWarehouseStock, setIsSubmittingWarehouseStock] = useState(false);

  // In-app Delete Confirmation Modal (NO window.confirm!)
  const [deleteCandidate, setDeleteCandidate] = useState<MaterialItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);

  // Adjust / Return modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustTargetStock, setAdjustTargetStock] = useState<TechnicianStockItem | null>(null);
  const [adjustNewQty, setAdjustNewQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false);

  // Feedback banner
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Only consider technicians
  const technicianEmployees = useMemo(() => {
    return employees.filter(e => !e.role || e.role.toLowerCase() === 'technician' || e.role === 'فني');
  }, [employees]);

  // Load all inventory data
  const loadInventoryData = async (force = false) => {
    setLoading(true);
    try {
      const [mats, stocks, txns] = await Promise.all([
        getMaterialItems(force),
        getTechnicianInventory(),
        getMaterialTransactions({ limitCount: 100 })
      ]);
      setMaterials(mats);
      setTechnicianStocks(stocks);
      setTransactions(txns);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
      setFeedback({ type: 'error', message: 'تعذر تحميل بيانات المخزون' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventoryData();
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  // Group stocks by technician
  const technicianStockMap = useMemo(() => {
    const map: Record<string, TechnicianStockItem[]> = {};
    for (const tech of technicianEmployees) {
      map[tech.id] = [];
    }
    for (const stock of technicianStocks) {
      if (!map[stock.employeeId]) {
        map[stock.employeeId] = [];
      }
      map[stock.employeeId].push(stock);
    }
    return map;
  }, [technicianEmployees, technicianStocks]);

  // Helper: total allocated for a material across all technicians
  const getTechAllocatedForMaterial = (materialId: string) => {
    return technicianStocks
      .filter(s => s.materialId === materialId)
      .reduce((sum, s) => sum + Number(s.quantity || 0), 0);
  };

  // Overall Stats
  const stats = useMemo(() => {
    const totalDisbursedCount = transactions
      .filter(t => t.type === 'consumption')
      .reduce((sum, t) => sum + Number(t.quantity || 0), 0);

    const totalSuppliedCount = transactions
      .filter(t => t.type === 'supply')
      .reduce((sum, t) => sum + Number(t.quantity || 0), 0);

    const activeTechsWithStock = (Object.values(technicianStockMap) as TechnicianStockItem[][]).filter(
      stocks => stocks.some(s => s.quantity > 0)
    ).length;

    const totalWarehouseStock = materials.reduce(
      (sum, m) => sum + Number(m.warehouseStock || 0),
      0
    );

    const totalTechnicianStock = technicianStocks.reduce(
      (sum, s) => sum + Number(s.quantity || 0),
      0
    );

    return {
      totalMaterials: materials.length,
      totalWarehouseStock,
      totalTechnicianStock,
      totalDisbursedCount,
      totalSuppliedCount,
      activeTechsWithStock
    };
  }, [materials, transactions, technicianStocks, technicianStockMap]);

  // Low stock materials in warehouse (items running out or out of stock)
  const lowStockMaterials = useMemo(() => {
    return materials.filter(m => {
      const stock = Number(m.warehouseStock ?? 0);
      const threshold = Number(m.minAlertThreshold ?? 3);
      return stock <= threshold;
    });
  }, [materials]);

  // Handle supply submission
  const handleConfirmSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTechForSupply) {
      showNotification('يرجى اختيار الفني المستلم', 'error');
      return;
    }

    const validItems = supplyItems.filter(i => i.materialId && i.quantity > 0);
    if (validItems.length === 0) {
      showNotification('يرجى تحديد مادة واحدة وكمية صحيحة على الأقل', 'error');
      return;
    }

    setIsSubmittingSupply(true);
    try {
      const tech = employees.find(e => e.id === selectedTechForSupply);
      const techName = tech ? tech.name : 'فني غير محدد';

      const enrichedItems = validItems.map(item => {
        const mat = materials.find(m => m.id === item.materialId);
        return {
          materialId: item.materialId,
          materialName: mat ? mat.name : 'مادة',
          unit: mat ? mat.unit : 'قطعة',
          quantity: item.quantity
        };
      });

      await supplyMaterialsToTechnician({
        employeeId: selectedTechForSupply,
        employeeName: techName,
        items: enrichedItems,
        notes: supplyNotes.trim(),
        suppliedBy: currentUsername
      });

      showNotification(`تم تسليم العهدة بنجاح إلى الفني (${techName}) وتحديث رصيد المستودع`);
      setShowSupplyModal(false);
      setSelectedTechForSupply('');
      setSupplyItems([{ materialId: '', quantity: 1 }]);
      setSupplyNotes('');
      await loadInventoryData(true);
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || 'فشل تسليم العهدة', 'error');
    } finally {
      setIsSubmittingSupply(false);
    }
  };

  // Handle Save Material Catalog Item
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showNotification('يرجى كتابة اسم المادة', 'error');
      return;
    }

    setIsSubmittingItem(true);
    try {
      const id = editingItem ? editingItem.id : `mat-${Date.now()}`;
      const itemToSave: MaterialItem = {
        id,
        name: itemName.trim(),
        unit: itemUnit.trim() || 'قطعة',
        category: itemCategory.trim() || 'أجهزة',
        description: itemDesc.trim(),
        minAlertThreshold: Number(itemThreshold) || 3,
        warehouseStock: Math.max(0, Number(itemWarehouseStock) || 0),
        createdAt: editingItem?.createdAt || new Date().toISOString()
      };

      await saveMaterialItem(itemToSave);
      showNotification(editingItem ? 'تم تحديث المادة ورصيد المخزن بنجاح' : 'تم إضافة المادة الجديدة وتعيين رصيد المخزن بنجاح');
      setShowItemModal(false);
      setEditingItem(null);
      setItemName('');
      setItemDesc('');
      setItemWarehouseStock(0);
      await loadInventoryData(true);
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || 'فشل حفظ المادة', 'error');
    } finally {
      setIsSubmittingItem(false);
    }
  };

  // Trigger in-app delete modal (NO window.confirm!)
  const handleDeleteItemClick = (item: MaterialItem) => {
    setDeleteCandidate(item);
  };

  // Confirm in-app deletion
  const handleConfirmDelete = async () => {
    if (!deleteCandidate) return;
    setIsDeletingItem(true);
    try {
      const targetId = deleteCandidate.id;
      const targetName = deleteCandidate.name;
      await deleteMaterialItem(targetId);
      setMaterials(prev => prev.filter(m => m.id !== targetId));
      showNotification(`تم حذف المادة (${targetName}) بنجاح`);
      setDeleteCandidate(null);
      await loadInventoryData(true);
    } catch (err: any) {
      console.error(err);
      showNotification('تعذر حذف المادة، يرجى المحاولة مجدداً', 'error');
    } finally {
      setIsDeletingItem(false);
    }
  };

  // Handle Warehouse Stock Quick Add/Deduct
  const handleConfirmWarehouseStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseTargetItem) return;
    if (warehouseStockQty <= 0) {
      showNotification('يرجى إدخال كمية صحيحة أكبر من الصفر', 'error');
      return;
    }

    setIsSubmittingWarehouseStock(true);
    try {
      const newStock = await adjustWarehouseStock({
        materialId: warehouseTargetItem.id,
        materialName: warehouseTargetItem.name,
        unit: warehouseTargetItem.unit,
        mode: warehouseStockMode,
        quantity: warehouseStockQty,
        reason: warehouseStockReason.trim() || (warehouseStockMode === 'add' ? 'إضافة وتوريد للمخزن الرئيسي' : 'سحب أو إنقاص من المخزن الرئيسي'),
        performedBy: currentUsername
      });

      showNotification(
        warehouseStockMode === 'add'
          ? `تمت إضافة ${warehouseStockQty} ${warehouseTargetItem.unit} لرصيد المستودع (الرصيد الحالي: ${newStock})`
          : `تم خصم ${warehouseStockQty} ${warehouseTargetItem.unit} من رصيد المستودع (الرصيد الحالي: ${newStock})`
      );

      setShowWarehouseStockModal(false);
      setWarehouseTargetItem(null);
      setWarehouseStockQty(1);
      setWarehouseStockReason('');
      await loadInventoryData(true);
    } catch (err: any) {
      console.error(err);
      showNotification(err?.message || 'فشل تحديث رصيد المخزن', 'error');
    } finally {
      setIsSubmittingWarehouseStock(false);
    }
  };

  // Handle Adjust Stock
  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTargetStock) return;
    if (!adjustReason.trim()) {
      showNotification('يرجى كتابة سبب التسوية / الجرد', 'error');
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      await adjustTechnicianStock({
        employeeId: adjustTargetStock.employeeId,
        employeeName: adjustTargetStock.employeeName,
        materialId: adjustTargetStock.materialId,
        materialName: adjustTargetStock.materialName,
        unit: adjustTargetStock.unit,
        newQuantity: Number(adjustNewQty),
        reason: adjustReason.trim(),
        adjustedBy: currentUsername
      });

      showNotification(`تمت تسوية رصيد (${adjustTargetStock.materialName}) للفني ${adjustTargetStock.employeeName}`);
      setShowAdjustModal(false);
      setAdjustTargetStock(null);
      setAdjustReason('');
      await loadInventoryData(true);
    } catch (err: any) {
      console.error(err);
      showNotification('فشلت تسوية الرصيد', 'error');
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  // Print Transactions report
  const handlePrintTransactions = () => {
    window.print();
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (selectedTechFilter !== 'all' && t.employeeId !== selectedTechFilter) return false;
      if (selectedTypeFilter !== 'all' && t.type !== selectedTypeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (t.employeeName || '').toLowerCase().includes(q);
        const matchesMat = (t.materialName || '').toLowerCase().includes(q);
        const matchesSub = (t.subscriberName || '').toLowerCase().includes(q);
        const matchesPhone = (t.subscriberPhone || '').includes(q);
        const matchesNotes = (t.notes || '').toLowerCase().includes(q);
        if (!matchesName && !matchesMat && !matchesSub && !matchesPhone && !matchesNotes) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, selectedTechFilter, selectedTypeFilter, searchQuery]);

  return (
    <div className="space-y-6 select-none" dir="rtl">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 text-sm font-black border transition-all animate-in fade-in slide-in-from-top-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-l from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden border border-blue-800/40">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-black mb-3 border border-blue-400/20">
              <Boxes className="w-4 h-4 text-blue-400" />
              <span>إدارة المخزون وعهد المواد</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
              مخزون الفنيين وصرفيات المشتركين
            </h1>
            <p className="text-xs md:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
              متابعة عهدة كل فني لحظياً، تسليم وشحن المواد، وصرفيات الأجهزة والأسلاك المسجلة تلقائياً عند إكمال مهام المشتركين.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <button
              type="button"
              onClick={() => {
                setSelectedTechForSupply(technicianEmployees[0]?.id || '');
                setSupplyItems([{ materialId: materials[0]?.id || '', quantity: 1 }]);
                setShowSupplyModal(true);
              }}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-600/30 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>تسليم عهدة للفني</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingItem(null);
                setItemName('');
                setItemUnit('قطعة');
                setItemCategory('أجهزة');
                setItemDesc('');
                setItemThreshold(3);
                setShowItemModal(true);
              }}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-black text-xs border border-white/15 backdrop-blur-sm transition-all cursor-pointer"
            >
              <Package className="w-4 h-4 text-blue-300" />
              <span>إضافة مادة للدليل</span>
            </button>

            <button
              type="button"
              onClick={() => loadInventoryData(true)}
              className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all cursor-pointer"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* بطاقة القطع التي على وشك النفاذ فقط */}
        <div className="mt-6 pt-6 border-t border-white/10">
          {lowStockMaterials.length > 0 ? (
            <div className="bg-amber-500/15 backdrop-blur-md rounded-3xl p-4 md:p-5 border border-amber-400/35 text-white shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/25 text-amber-300 flex items-center justify-center shrink-0 border border-amber-400/40">
                    <AlertTriangle className="w-5 h-5 text-amber-300 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm md:text-base text-amber-200">
                        القطع التي على وشك النفاذ بالمستودع
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-500/25 text-rose-200 border border-rose-400/30">
                        {lowStockMaterials.length} مواد قاربت أو نفذت
                      </span>
                    </div>
                    <p className="text-xs text-amber-100/80 mt-0.5 font-medium">
                      المواد التي وصل عددها المتوفر بالمخزن إلى حد التنبيه أو أقل وبحاجة لتوريد عاجل
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSubTab('catalog')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 text-xs font-bold border border-white/15 transition-colors cursor-pointer"
                >
                  <Warehouse className="w-3.5 h-3.5" />
                  <span>دليل المستودع</span>
                </button>
              </div>

              {/* Grid of low stock items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {lowStockMaterials.map(m => {
                  const stock = Number(m.warehouseStock ?? 0);
                  const isOut = stock <= 0;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isOut
                          ? 'bg-rose-950/50 border-rose-500/50'
                          : 'bg-black/25 border-amber-400/20 hover:border-amber-400/40'
                      }`}
                    >
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOut ? 'bg-rose-500 animate-ping' : 'bg-amber-400'}`}></span>
                          <span className="font-black text-xs text-white truncate">{m.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${isOut ? 'bg-rose-500 text-white' : 'bg-amber-400/20 text-amber-300'}`}>
                            {isOut ? 'نفذ تماماً' : 'منخفض'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1 flex items-center gap-2">
                          <span>المتوفر بالمخزن: <strong className={`font-mono ${isOut ? 'text-rose-400 font-black' : 'text-amber-300 font-black'}`}>{stock} {m.unit}</strong></span>
                          <span className="text-slate-400">|</span>
                          <span className="text-slate-400">حد التنبيه: {m.minAlertThreshold || 3}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseTargetItem(m);
                          setWarehouseStockMode('add');
                          setWarehouseStockQty(1);
                          setWarehouseStockReason('توريد رصيد لمادة قاربت على النفاذ');
                          setShowWarehouseStockModal(true);
                        }}
                        className="shrink-0 px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 hover:text-white border border-amber-400/30 text-xs font-black transition-all cursor-pointer flex items-center gap-1"
                        title="توريد رصيد جديد للمخزن"
                      >
                        <Plus className="w-3 h-3" />
                        <span>توريد</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-emerald-500/10 backdrop-blur-md rounded-3xl p-4 border border-emerald-400/20 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 border border-emerald-400/30">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-emerald-200">
                    بطاقة التنبيه: لا توجد قطع على وشك النفاذ
                  </h3>
                  <p className="text-xs text-emerald-100/75 font-medium">
                    جميع المواد والقطع متوفرة برصيد آمن في المستودع الرئيسي أعلى من حد التنبيه.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveSubTab('catalog')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 text-xs font-bold border border-white/15 transition-colors cursor-pointer"
              >
                <Warehouse className="w-3.5 h-3.5" />
                <span>عرض أرصدة المواد</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex bg-white p-1 rounded-2xl border border-slate-200/80 shadow-xs max-w-2xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('technicians')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeSubTab === 'technicians'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <User className="w-4 h-4" />
          <span>مخزون وعهد الفنيين ({technicianEmployees.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('transactions')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeSubTab === 'transactions'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>سجل الحركات والصرفيات ({transactions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('catalog')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-black text-xs transition-all cursor-pointer ${
            activeSubTab === 'catalog'
              ? 'bg-blue-700 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>المستودع ودليل المواد ({materials.length})</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: TECHNICIAN STOCKS OVERVIEW                         */}
      {/* ========================================================= */}
      {activeSubTab === 'technicians' && (
        <div className="space-y-6">
          {/* Technicians Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {technicianEmployees.map(tech => {
              const stocks = technicianStockMap[tech.id] || [];
              const activeItems = stocks.filter(s => s.quantity > 0);
              const totalPieces = activeItems.reduce((acc, curr) => acc + curr.quantity, 0);

              const totalSuppliedLifetime = transactions
                .filter(t => t.type === 'supply' && t.employeeId === tech.id)
                .reduce((acc, t) => acc + (Number(t.quantity) || 0), 0);

              const totalDisbursedLifetime = transactions
                .filter(t => t.type === 'consumption' && t.employeeId === tech.id)
                .reduce((acc, t) => acc + (Number(t.quantity) || 0), 0);

              return (
                <div
                  key={tech.id}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col"
                >
                  {/* Card Header */}
                  <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-sm">
                        {tech.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">{tech.name}</h3>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                          {tech.phone ? (
                            <span className="font-mono">{tech.phone}</span>
                          ) : (
                            <span>فني معتمد</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          <span className="px-2 py-0.5 rounded-lg bg-blue-50 text-blue-800 border border-blue-200/80 font-black text-[10px]">
                            الرصيد بعهدته: {totalPieces} قطعة
                          </span>
                          {totalSuppliedLifetime > 0 && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-bold text-[10px]">
                              المسلّم له: {totalSuppliedLifetime}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTechForSupply(tech.id);
                        setSupplyItems([{ materialId: materials[0]?.id || '', quantity: 1 }]);
                        setShowSupplyModal(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black transition-colors cursor-pointer shadow-xs"
                      title="تسليم وجبة مواد جديدة للفني"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>تسليم عهدة</span>
                    </button>
                  </div>

                  {/* Stock Items List */}
                  <div className="p-4 flex-1 space-y-2.5">
                    {activeItems.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs font-medium bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                        <Package className="w-6 h-6 mx-auto mb-1 text-slate-300" />
                        <span>لا توجد مواد مسجلة في عهدة الفني حالياً</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {activeItems.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2 truncate pr-1">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                              <span className="font-black text-slate-800 truncate">{item.materialName}</span>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                                  {item.quantity} {item.unit}
                                </span>
                              </div>

                              {/* Adjust button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setAdjustTargetStock(item);
                                  setAdjustNewQty(item.quantity);
                                  setAdjustReason('');
                                  setShowAdjustModal(true);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                                title="تعديل / تسوية الرصيد"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="p-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-bold px-4">
                    <span>عدد الأصناف بحوزته: {activeItems.length}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTechFilter(tech.id);
                        setActiveSubTab('transactions');
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors cursor-pointer flex items-center gap-1 font-extrabold"
                    >
                      <span>عرض سجل الصرفيات</span>
                      <ArrowRight className="w-3 h-3 rotate-180" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: TRANSACTIONS AND CONSUMPTION LOG                   */}
      {/* ========================================================= */}
      {activeSubTab === 'transactions' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Filters Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              {/* Search */}
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث باسم المشترك، الفني، المادة..."
                  className="w-full pr-9 pl-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Technician Filter */}
              <select
                value={selectedTechFilter}
                onChange={(e) => setSelectedTechFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">جميع الفنيين</option>
                {technicianEmployees.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>

              {/* Movement Type Filter */}
              <select
                value={selectedTypeFilter}
                onChange={(e) => setSelectedTypeFilter(e.target.value)}
                className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">كافة أنواع الحركات</option>
                <option value="consumption">صرف لمشترك (مهمة)</option>
                <option value="supply">تسليم عهدة (من الإدارة)</option>
                <option value="return">إرجاع للإدارة</option>
                <option value="adjustment">تسوية / جرد</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handlePrintTransactions}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير</span>
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100 font-black">
                <tr>
                  <th className="p-3.5">النوع</th>
                  <th className="p-3.5">الفني</th>
                  <th className="p-3.5">المادة</th>
                  <th className="p-3.5">الكمية</th>
                  <th className="p-3.5">المشترك / المهمة</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">المسؤول / الملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">
                      لا توجد سجلات مطابقة للبحث أو الفلتر المختار
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map(txn => {
                    const isConsumption = txn.type === 'consumption';
                    const isSupply = txn.type === 'supply';
                    const isReturn = txn.type === 'return';

                    return (
                      <tr key={txn.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5">
                          {isConsumption && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-black text-[11px]">
                              <ArrowDownLeft className="w-3.5 h-3.5 text-amber-600" />
                              <span>صرف لمشترك</span>
                            </span>
                          )}
                          {isSupply && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-black text-[11px]">
                              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                              <span>تسليم عهدة</span>
                            </span>
                          )}
                          {isReturn && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-black text-[11px]">
                              <RefreshCw className="w-3 h-3 text-blue-600" />
                              <span>إرجاع</span>
                            </span>
                          )}
                          {!isConsumption && !isSupply && !isReturn && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-black text-[11px]">
                              <Edit2 className="w-3 h-3 text-purple-600" />
                              <span>تسوية جرد</span>
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 font-black text-slate-900">
                          {txn.employeeName}
                        </td>

                        <td className="p-3.5 font-bold text-slate-800">
                          {txn.materialName}
                        </td>

                        <td className="p-3.5 font-mono font-black text-sm">
                          <span className={isConsumption ? 'text-amber-700' : 'text-emerald-700'}>
                            {isConsumption ? '-' : '+'}{txn.quantity} {txn.unit}
                          </span>
                        </td>

                        <td className="p-3.5">
                          {txn.subscriberName ? (
                            <div>
                              <strong className="text-slate-900 block font-black">{txn.subscriberName}</strong>
                              {txn.subscriberPhone && (
                                <span className="text-[11px] text-slate-500 font-mono">{txn.subscriberPhone}</span>
                              )}
                              {txn.taskType && (
                                <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded-sm bg-slate-100 text-[10px] text-slate-600 font-bold">
                                  {txn.taskType}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">—</span>
                          )}
                        </td>

                        <td className="p-3.5 text-slate-500 font-medium">
                          {new Date(txn.createdAt).toLocaleDateString('ar-EG', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>

                        <td className="p-3.5">
                          <div className="text-[11px]">
                            <span className="text-slate-500 font-bold">{txn.performedBy}</span>
                            {txn.notes && (
                              <p className="text-slate-700 font-medium truncate max-w-xs">{txn.notes}</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: MATERIALS CATALOG & CENTRAL WAREHOUSE              */}
      {/* ========================================================= */}
      {activeSubTab === 'catalog' && (
        <div className="space-y-6">
          {/* Header Action & Summary */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-blue-600" />
                <h3 className="font-black text-base text-slate-900">المستودع المركزي ودليل المواد</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                متابعة عدد القطع المتوفرة بالمخزن الرئيسي، توريد كميات جديدة، سحب التوالف، وإضافة وحذف الأصناف.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={() => {
                  setEditingItem(null);
                  setItemName('');
                  setItemUnit('قطعة');
                  setItemCategory('أجهزة');
                  setItemDesc('');
                  setItemThreshold(3);
                  setItemWarehouseStock(0);
                  setShowItemModal(true);
                }}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs cursor-pointer shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة صنف / مادة جديدة</span>
              </button>
            </div>
          </div>

          {/* Catalog & Warehouse Items Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {materials.map(item => {
              const whStock = Number(item.warehouseStock || 0);
              const techAllocated = getTechAllocatedForMaterial(item.id);
              const totalCompanyStock = whStock + techAllocated;
              const threshold = Number(item.minAlertThreshold || 3);
              const isOutOfStock = whStock === 0;
              const isLowStock = !isOutOfStock && whStock <= threshold;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between relative overflow-hidden"
                >
                  {/* Category & Unit Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black border border-slate-200/60">
                        {item.category || 'عام'}
                      </span>
                      <span className="text-xs font-mono font-bold text-slate-400">
                        الوحدة: {item.unit}
                      </span>
                    </div>

                    <h4 className="font-black text-base text-slate-900 mt-2.5">{item.name}</h4>
                    {item.description && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{item.description}</p>
                    )}

                    {/* Prominent Warehouse Stock Display */}
                    <div className="mt-4 p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                          <Warehouse className="w-4 h-4 text-slate-500" />
                          <span>المتوفر بالمخزن:</span>
                        </span>
                        
                        <div className="flex items-center gap-1.5">
                          <span className={`text-base font-black font-mono ${
                            isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-emerald-700'
                          }`}>
                            {whStock.toLocaleString('ar-EG')}
                          </span>
                          <span className="text-xs font-bold text-slate-500">{item.unit}</span>
                        </div>
                      </div>

                      {/* Stock Status Pill */}
                      <div className="flex items-center justify-between">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-black">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                            <span>نفذ من المخزن الرئيسي</span>
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-black">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>رصيد منخفض (تحت حد {threshold})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-black">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>متوفر ومكتمل</span>
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 font-medium">
                          حد التنبيه: {threshold} {item.unit}
                        </span>
                      </div>

                      {/* Distribution breakdown */}
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-[11px]">
                        <div className="bg-white p-2 rounded-xl border border-slate-100">
                          <span className="text-slate-400 block font-medium">بعهدة الفنيين:</span>
                          <strong className="text-blue-700 font-mono font-black">{techAllocated} {item.unit}</strong>
                        </div>
                        <div className="bg-white p-2 rounded-xl border border-slate-100">
                          <span className="text-slate-400 block font-medium">إجمالي الشركة:</span>
                          <strong className="text-slate-900 font-mono font-black">{totalCompanyStock} {item.unit}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Quick Warehouse Stock Adjustment Buttons */}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseTargetItem(item);
                          setWarehouseStockMode('add');
                          setWarehouseStockQty(1);
                          setWarehouseStockReason('');
                          setShowWarehouseStockModal(true);
                        }}
                        className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="إضافة وتوريد كميات جديدة للمخزن"
                      >
                        <Plus className="w-3.5 h-3.5 text-emerald-600" />
                        <span>+ إضافة للمخزن</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setWarehouseTargetItem(item);
                          setWarehouseStockMode('deduct');
                          setWarehouseStockQty(1);
                          setWarehouseStockReason('');
                          setShowWarehouseStockModal(true);
                        }}
                        className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-black text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="إنقاص أو سحب تالف من المخزن"
                      >
                        <Minus className="w-3.5 h-3.5 text-amber-600" />
                        <span>- سحب / إنقاص</span>
                      </button>
                    </div>
                  </div>

                  {/* Card Footer: Edit and Delete Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-medium">
                      المعرف: #{item.id.replace('mat-', '')}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(item);
                          setItemName(item.name);
                          setItemUnit(item.unit);
                          setItemCategory(item.category || 'أجهزة');
                          setItemDesc(item.description || '');
                          setItemThreshold(item.minAlertThreshold || 3);
                          setItemWarehouseStock(item.warehouseStock || 0);
                          setShowItemModal(true);
                        }}
                        className="p-2 text-slate-600 hover:text-blue-600 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
                        title="تعديل بيانات المادة ورصيدها"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItemClick(item)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
                        title="حذف المادة من المخزن والدليل"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SUPPLY MATERIALS TO TECHNICIAN                     */}
      {/* ========================================================= */}
      {showSupplyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className="bg-blue-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-200" />
                <h3 className="font-extrabold text-sm">تسليم عهدة مواد للفني</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSupplyModal(false)}
                className="p-1 hover:bg-blue-800 rounded-lg text-blue-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSupply} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  اختر الفني المستلم <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={selectedTechForSupply}
                  onChange={(e) => setSelectedTechForSupply(e.target.value)}
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-slate-800"
                >
                  <option value="">-- اضغط لاختيار الفني --</option>
                  {technicianEmployees.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.phone || 'بدون هاتف'})</option>
                  ))}
                </select>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-800">
                    المواد والكميات المراد تسليمها <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSupplyItems([...supplyItems, { materialId: materials[0]?.id || '', quantity: 1 }])}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف آخر</span>
                  </button>
                </div>

                {supplyItems.map((row, idx) => {
                  const currentMat = materials.find(m => m.id === row.materialId);
                  const whStock = Number(currentMat?.warehouseStock ?? 0);

                  return (
                    <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2.5">
                      {/* Material selector header */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-[11px] font-black text-slate-600 block mb-1">
                            المادة المراد تسليمها للفني:
                          </label>
                          <select
                            required
                            value={row.materialId}
                            onChange={(e) => {
                              const updated = [...supplyItems];
                              updated[idx].materialId = e.target.value;
                              setSupplyItems(updated);
                            }}
                            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
                          >
                            <option value="">-- اضغط لاختيار المادة --</option>
                            {materials.map(m => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.unit}) — متوفر بالمخزن: {m.warehouseStock ?? 0}
                              </option>
                            ))}
                          </select>
                        </div>

                        {supplyItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = supplyItems.filter((_, i) => i !== idx);
                              setSupplyItems(updated);
                            }}
                            className="p-2 text-slate-400 hover:text-rose-600 rounded-xl transition-colors cursor-pointer hover:bg-rose-50 mt-5"
                            title="حذف هذا الصنف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Stock availability & Delivered pieces counter */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/60">
                        <div className="text-[11px] text-slate-500 font-bold flex items-center gap-1.5">
                          <span>المتوفر بالمخزن:</span>
                          <span className={`font-mono font-black ${whStock <= 0 ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-emerald-700 bg-emerald-50 border-emerald-200'} px-2 py-0.5 rounded-lg border text-xs`}>
                            {whStock} {currentMat?.unit || 'قطعة'}
                          </span>
                        </div>

                        {/* Delivered pieces stepper */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-700">عدد القطع المسلّمة:</span>
                          <div className="flex items-center border border-slate-300 rounded-xl bg-white overflow-hidden shadow-2xs">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...supplyItems];
                                updated[idx].quantity = Math.max(1, (Number(updated[idx].quantity) || 1) - 1);
                                setSupplyItems(updated);
                              }}
                              className="p-1.5 px-2 hover:bg-slate-100 text-slate-600 font-black cursor-pointer transition-colors"
                              title="إنقاص قطعة واحدة"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <input
                              type="number"
                              min="1"
                              step="1"
                              required
                              value={row.quantity}
                              onChange={(e) => {
                                const updated = [...supplyItems];
                                updated[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                setSupplyItems(updated);
                              }}
                              className="w-16 text-xs py-1.5 text-center font-mono font-black text-blue-700 outline-none"
                              placeholder="العدد"
                            />

                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...supplyItems];
                                updated[idx].quantity = (Number(updated[idx].quantity) || 0) + 1;
                                setSupplyItems(updated);
                              }}
                              className="p-1.5 px-2 hover:bg-slate-100 text-slate-600 font-black cursor-pointer transition-colors"
                              title="زيادة قطعة واحدة"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <span className="text-xs text-slate-500 font-bold">
                            {currentMat ? currentMat.unit : 'قطعة'}
                          </span>
                        </div>
                      </div>

                      {/* Quick preset increments */}
                      <div className="flex items-center gap-1.5 pt-1 text-[11px] flex-wrap">
                        <span className="text-slate-400 font-bold">إضافة سريعة للقطع:</span>
                        {[1, 5, 10, 20].map(addVal => (
                          <button
                            key={addVal}
                            type="button"
                            onClick={() => {
                              const updated = [...supplyItems];
                              updated[idx].quantity = (Number(updated[idx].quantity) || 0) + addVal;
                              setSupplyItems(updated);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-slate-200/70 hover:bg-blue-100 hover:text-blue-800 text-slate-700 font-bold transition-colors cursor-pointer"
                          >
                            +{addVal}
                          </button>
                        ))}
                        {whStock > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...supplyItems];
                              updated[idx].quantity = whStock;
                              setSupplyItems(updated);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-bold transition-colors cursor-pointer mr-auto"
                            title="صرف كامل الرصيد المتوفر بالمخزن"
                          >
                            كامل الرصيد ({whStock})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Total Pieces Delivered Summary Box */}
              {(() => {
                const totalPiecesDelivered = supplyItems.reduce(
                  (acc, r) => acc + (Number(r.quantity) || 0),
                  0
                );
                return (
                  <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black">
                        <Boxes className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-black text-blue-950 block">
                          إجمالي عدد القطع المسلّمة للفني:
                        </span>
                        <span className="text-[11px] text-blue-700 font-medium">
                          سيتم تسجيلها كعهدة مستلمة للفني وخصمها من رصيد المستودع
                        </span>
                      </div>
                    </div>
                    <div className="font-mono">
                      <span className="text-base md:text-lg font-black text-blue-800 bg-white px-3 py-1 rounded-xl border border-blue-200 shadow-2xs">
                        {totalPiecesDelivered} قطعة
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">ملاحظات تسليم العهدة (اختياري)</label>
                <textarea
                  rows={2}
                  value={supplyNotes}
                  onChange={(e) => setSupplyNotes(e.target.value)}
                  placeholder="مثال: تسليم وجبة مواد جديدة لبدء دوام الأسبوع / عهدة تنصيب..."
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-medium text-slate-800"
                ></textarea>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSupplyModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSupply}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs transition-colors shadow-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingSupply ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جارٍ الحفظ...</span>
                    </>
                  ) : (
                    <span>
                      تأكيد تسليم ({supplyItems.reduce((acc, r) => acc + (Number(r.quantity) || 0), 0)}) قطعة إلى الفني
                    </span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT CATALOG ITEM                            */}
      {/* ========================================================= */}
      {showItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-400" />
                <h3 className="font-extrabold text-sm">{editingItem ? 'تعديل بيانات مادة' : 'إضافة مادة جديدة للدليل'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowItemModal(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  اسم المادة أو الجهاز <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="مثال: راوتر واي فاي / كابل ألياف ضوئية / كونكتر"
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5">وحدة القياس</label>
                  <select
                    value={itemUnit}
                    onChange={(e) => setItemUnit(e.target.value)}
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-bold text-slate-800"
                  >
                    <option value="قطعة">قطعة</option>
                    <option value="متر">متر</option>
                    <option value="حبة">حبة</option>
                    <option value="لفة">لفة</option>
                    <option value="كيس">كيس</option>
                    <option value="علبة">علبة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5">التصنيف</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-bold text-slate-800"
                  >
                    <option value="أجهزة">أجهزة</option>
                    <option value="كوابل">كوابل</option>
                    <option value="ملحقات وتوصيلات">ملحقات وتوصيلات</option>
                    <option value="أدوات">أدوات</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">الوصف والخصائص (اختياري)</label>
                <textarea
                  rows={2}
                  value={itemDesc}
                  onChange={(e) => setItemDesc(e.target.value)}
                  placeholder="مواصفات المادة أو الموديل..."
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-medium text-slate-800"
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5">
                    الكمية المتوفرة بالمخزن <span className="text-emerald-600 font-bold">({itemUnit})</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={itemWarehouseStock}
                    onChange={(e) => setItemWarehouseStock(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-mono font-bold text-emerald-700 bg-emerald-50/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 mb-1.5">حد التنبيه لانخفاض الرصيد</label>
                  <input
                    type="number"
                    min="0"
                    value={itemThreshold}
                    onChange={(e) => setItemThreshold(parseInt(e.target.value) || 0)}
                    className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingItem}
                  className="flex-1 py-3 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-xs cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmittingItem ? 'جارٍ الحفظ...' : 'حفظ المادة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADJUST / RECONCILE STOCK                           */}
      {/* ========================================================= */}
      {showAdjustModal && adjustTargetStock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className="bg-indigo-700 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-200" />
                <h3 className="font-extrabold text-sm">تسوية رصيد عهدة / جرد</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="p-1 hover:bg-indigo-800 rounded-lg text-indigo-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjust} className="p-6 space-y-4">
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">الفني:</span>
                  <strong className="text-slate-900 font-black">{adjustTargetStock.employeeName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">المادة:</span>
                  <strong className="text-slate-900 font-black">{adjustTargetStock.materialName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">الرصيد الحالي المسجل:</span>
                  <strong className="text-blue-700 font-mono font-black">{adjustTargetStock.quantity} {adjustTargetStock.unit}</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  الرصيد الفعلي الجديد بعد الجرد <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-mono font-black text-indigo-700 text-center text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  سبب التسوية / ملاحظة الجرد <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="مثال: مطابقة الجرد الميداني الأسبوعي / تصحيح خطأ إدخال سابق..."
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-indigo-500 outline-none font-medium text-slate-800"
                ></textarea>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdjust}
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-black text-xs cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmittingAdjust ? 'جارٍ الحفظ...' : 'تأكيد التسوية'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: DIRECT WAREHOUSE STOCK ADJUST (ADD / DEDUCT)       */}
      {/* ========================================================= */}
      {showWarehouseStockModal && warehouseTargetItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className={`p-4 text-white flex items-center justify-between ${
              warehouseStockMode === 'add' ? 'bg-emerald-700' : 'bg-amber-700'
            }`}>
              <div className="flex items-center gap-2">
                {warehouseStockMode === 'add' ? (
                  <Plus className="w-5 h-5 text-emerald-200" />
                ) : (
                  <Minus className="w-5 h-5 text-amber-200" />
                )}
                <h3 className="font-extrabold text-sm">
                  {warehouseStockMode === 'add' ? 'إضافة رصيد للمخزن الرئيسي' : 'سحب / إنقاص رصيد من المخزن الرئيسي'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowWarehouseStockModal(false)}
                className="p-1 hover:bg-black/20 rounded-lg text-white/80 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmWarehouseStock} className="p-6 space-y-4">
              {/* Mode Selector */}
              <div className="flex p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setWarehouseStockMode('add')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    warehouseStockMode === 'add'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة وتوريد للمخزن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWarehouseStockMode('deduct')}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    warehouseStockMode === 'deduct'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Minus className="w-3.5 h-3.5" />
                  <span>- سحب / إنقاص من المخزن</span>
                </button>
              </div>

              {/* Target Material Details Box */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">المادة المحددة:</span>
                  <strong className="text-slate-900 font-black text-sm">{warehouseTargetItem.name}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">الرصيد الحالي المتوفر بالمخزن:</span>
                  <strong className="text-emerald-700 font-mono font-black text-sm">
                    {(warehouseTargetItem.warehouseStock || 0).toLocaleString('ar-EG')} {warehouseTargetItem.unit}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-bold">الرصيد بعد الحركة المتوقع:</span>
                  <strong className={`font-mono font-black text-sm ${
                    warehouseStockMode === 'add' ? 'text-emerald-600' : 'text-amber-600'
                  }`}>
                    {(warehouseStockMode === 'add'
                      ? (warehouseTargetItem.warehouseStock || 0) + Number(warehouseStockQty || 0)
                      : Math.max(0, (warehouseTargetItem.warehouseStock || 0) - Number(warehouseStockQty || 0))
                    ).toLocaleString('ar-EG')}{' '}
                    {warehouseTargetItem.unit}
                  </strong>
                </div>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  {warehouseStockMode === 'add' ? 'الكمية المراد إضافتها للمخزن' : 'الكمية المراد سحبها أو إنقاصها'} <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={warehouseStockQty}
                    onChange={(e) => setWarehouseStockQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="flex-1 text-base p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-mono font-black text-center text-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0 px-2">
                    {warehouseTargetItem.unit}
                  </span>
                </div>

                {/* Quick Add Presets */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 font-bold ml-1">كميات سريعة:</span>
                  {[5, 10, 25, 50, 100].map(amount => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setWarehouseStockQty(amount)}
                      className="px-2.5 py-1 text-[11px] font-mono font-black rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                    >
                      {amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5">
                  سبب الحركة / الملاحظة (اختياري)
                </label>
                <input
                  type="text"
                  value={warehouseStockReason}
                  onChange={(e) => setWarehouseStockReason(e.target.value)}
                  placeholder={warehouseStockMode === 'add' ? 'مثال: توريد شحنة جديدة من المورد...' : 'مثال: جهاز تالف / إرجاع للمورد...'}
                  className="w-full text-xs p-3 rounded-2xl border border-slate-200 focus:border-blue-500 outline-none font-medium text-slate-800"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowWarehouseStockModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWarehouseStock}
                  className={`flex-1 py-3 px-4 rounded-xl text-white font-black text-xs cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    warehouseStockMode === 'add'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {isSubmittingWarehouseStock ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جارٍ التحديث...</span>
                    </>
                  ) : warehouseStockMode === 'add' ? (
                    <span>تأكيد الإضافة للمخزن</span>
                  ) : (
                    <span>تأكيد السحب من المخزن</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: IN-APP DELETE ITEM CONFIRMATION (NO window.confirm) */}
      {/* ========================================================= */}
      {deleteCandidate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 my-auto animate-in fade-in zoom-in-95">
            <div className="bg-rose-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <h3 className="font-extrabold text-sm">تأكيد حذف المادة من النظام</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="p-1 hover:bg-rose-700 rounded-lg text-rose-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black text-rose-900">هل أنت متأكد من حذف هذه المادة؟</h4>
                  <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                    سيتم إزالة المادة نهائياً من دليل المواد والمستودع المركزي.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">اسم المادة:</span>
                  <strong className="text-slate-900 font-black text-sm">{deleteCandidate.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">التصنيف:</span>
                  <span className="text-slate-700 font-bold">{deleteCandidate.category || 'عام'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-bold">الرصيد الحالي بالمخزن:</span>
                  <span className="text-slate-900 font-mono font-bold">
                    {(deleteCandidate.warehouseStock || 0).toLocaleString('ar-EG')} {deleteCandidate.unit}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={() => setDeleteCandidate(null)}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs cursor-pointer"
                >
                  إلغاء التراجع
                </button>
                <button
                  type="button"
                  disabled={isDeletingItem}
                  onClick={handleConfirmDelete}
                  className="flex-1 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-md disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isDeletingItem ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>جارٍ الحذف...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>تأكيد الحذف النهائي</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
