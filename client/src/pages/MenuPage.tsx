import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Printer, RefreshCw, Sparkles, ChefHat, Loader2,
  UtensilsCrossed, Salad, Coffee, Wine, IceCream, Soup,
  Sandwich, Pizza, Fish, Beef, Wheat, Cookie, Flame,
  Apple, Leaf, Star, Utensils, CupSoda, Cake, Egg,
  Drumstick, Milk, Shell, Carrot, Citrus,
  Save, Link2, Copy, Trash2, ExternalLink, BookOpen,
  QrCode, Smartphone, Monitor, Share2, Download, X,
  MessageCircle, Flame as FlameIcon,
} from "lucide-react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

interface MenuItem {
  id: number;
  name: string;
  price: number;
  calories: number | null;
  description: string | null;
  descriptionAr: string;
  recipeSource: string | null;
  recipeCost: number;
  ingredientCount: number;
}

interface MenuSection {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  items: MenuItem[];
}

// ── Icon mapping ──────────────────────────────────────────────────────────────
// Maps section id/icon string returned by AI → lucide-react component
const ICON_SIZE = "w-5 h-5";
const ICON_COLOR = "text-amber-700";

const iconMap: Record<string, React.ReactNode> = {
  // by section id
  appetizers:   <Salad className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  starters:     <Salad className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  salads:       <Salad className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  soups:        <Soup className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  mains:        <UtensilsCrossed className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  main_courses: <UtensilsCrossed className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  main_dish:    <UtensilsCrossed className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  grills:       <Flame className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  grilled:      <Flame className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  bbq:          <Flame className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  sandwiches:   <Sandwich className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  burgers:      <Sandwich className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  pizza:        <Pizza className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  seafood:      <Fish className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  fish:         <Fish className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  meat:         <Beef className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  chicken:      <Drumstick className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  poultry:      <Drumstick className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  pasta:        <Wheat className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  rice:         <Wheat className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  bread:        <Wheat className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  desserts:     <IceCream className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  sweets:       <Cookie className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  cakes:        <Cake className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  pastries:     <Cookie className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  drinks:       <Coffee className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  beverages:    <Coffee className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  hot_drinks:   <Coffee className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  cold_drinks:  <CupSoda className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  juices:       <Citrus className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  smoothies:    <Citrus className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  cocktails:    <Wine className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  wine:         <Wine className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  breakfast:    <Egg className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  brunch:       <Egg className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  dairy:        <Milk className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  vegan:        <Leaf className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  vegetarian:   <Carrot className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  healthy:      <Apple className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  specials:     <Star className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  special:      <Star className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  signature:    <Star className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  kids:         <Shell className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  // icon name strings the AI might return
  main_dish_icon:       <UtensilsCrossed className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  appetizer_icon:       <Salad className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  soup_icon:            <Soup className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  salad_icon:           <Salad className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  dessert_icon:         <IceCream className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  drink_icon:           <Coffee className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  grill_icon:           <Flame className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  sandwich_icon:        <Sandwich className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  seafood_icon:         <Fish className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  chicken_icon:         <Drumstick className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  pasta_icon:           <Wheat className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  breakfast_icon:       <Egg className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  special_icon:         <Star className={`${ICON_SIZE} ${ICON_COLOR}`} />,
  vegetarian_icon:      <Leaf className={`${ICON_SIZE} ${ICON_COLOR}`} />,
};

/** Resolve an icon for a section – tries id first, then icon string, then keywords in nameAr/nameEn */
function getSectionIcon(section: MenuSection): React.ReactNode {
  // 1. Try exact match on section.id
  if (iconMap[section.id]) return iconMap[section.id];

  // 2. Try exact match on section.icon string
  const iconKey = (section.icon || "").toLowerCase().trim();
  if (iconKey && iconMap[iconKey]) return iconMap[iconKey];

  // 3. Try partial keyword match on id + nameEn
  const combined = `${section.id} ${section.nameEn}`.toLowerCase();
  for (const key of Object.keys(iconMap)) {
    if (combined.includes(key.replace("_icon", "").replace(/_/g, " "))) {
      return iconMap[key];
    }
  }

  // 4. Fallback
  return <Utensils className={`${ICON_SIZE} ${ICON_COLOR}`} />;
}

// ── Column splitter ───────────────────────────────────────────────────────────
function splitIntoColumns(sections: MenuSection[]): [MenuSection[], MenuSection[]] {
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const target = totalItems / 2;
  let leftItems = 0;
  let splitIdx = 0;
  for (let i = 0; i < sections.length; i++) {
    leftItems += sections[i].items.length;
    splitIdx = i + 1;
    if (leftItems >= target) break;
  }
  return [sections.slice(0, splitIdx), sections.slice(splitIdx)];
}

// ── SectionBlock ──────────────────────────────────────────────────────────────
function SectionBlock({
  section,
  isEditMode = false,
  editingItem,
  editForm,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteItem,
  onMoveItem,
  onMoveUp,
  onMoveDown,
}: {
  section: MenuSection;
  isEditMode?: boolean;
  editingItem?: { sectionId: string; itemId: number } | null;
  editForm?: { name: string; price: string; description: string };
  onEditFormChange?: (f: { name: string; price: string; description: string }) => void;
  onStartEdit?: (item: MenuItem) => void;
  onSaveEdit?: () => void;
  onCancelEdit?: () => void;
  onDeleteItem?: (id: number) => void;
  onMoveItem?: (item: MenuItem) => void;
  onMoveUp?: (id: number) => void;
  onMoveDown?: (id: number) => void;
}) {
  const icon = getSectionIcon(section);
  const visibleItems = section.items.filter(i => i.price > 0);

  return (
    <div className="menu-section mb-6 break-inside-avoid">
      {/* Section Header */}
      <div className="section-title flex items-center gap-2 mb-3">
        <span className="section-icon flex items-center justify-center w-7 h-7 rounded-full bg-amber-50 border border-amber-200 flex-shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="section-name-ar">{section.nameAr}</h2>
          <p className="section-name-en">{section.nameEn}</p>
        </div>
        <div className="section-line" />
      </div>

      {/* Items */}
      <div className="section-items">
        {visibleItems.map((item, idx) => {
          const isEditing = isEditMode && editingItem?.sectionId === section.id && editingItem?.itemId === item.id;
          const isPopular = idx === 0 && visibleItems.length > 5;
          const isNew = item.recipeSource === "ai" && idx < 2;

          // ── Edit mode: inline form ──────────────────────────────────────
          if (isEditing && editForm) {
            return (
              <div key={item.id} className="no-print" style={{
                padding: "8px", marginBottom: "4px",
                background: "#eff6ff", border: "1.5px solid #93c5fd",
                borderRadius: "8px",
              }}>
                <input
                  value={editForm.name}
                  onChange={e => onEditFormChange?.({ ...editForm, name: e.target.value })}
                  placeholder="اسم الصنف"
                  style={{ width: "100%", fontSize: "0.85rem", fontWeight: 700, border: "1px solid #bfdbfe", borderRadius: "6px", padding: "4px 8px", marginBottom: "4px", fontFamily: "inherit", direction: "rtl" }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    value={editForm.price}
                    onChange={e => onEditFormChange?.({ ...editForm, price: e.target.value })}
                    placeholder="السعر"
                    type="number"
                    style={{ width: "90px", fontSize: "0.82rem", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "4px 8px", fontFamily: "inherit" }}
                  />
                  <input
                    value={editForm.description}
                    onChange={e => onEditFormChange?.({ ...editForm, description: e.target.value })}
                    placeholder="الوصف (اختياري)"
                    style={{ flex: 1, fontSize: "0.78rem", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "4px 8px", fontFamily: "inherit", direction: "rtl" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "6px", justifyContent: "flex-end" }}>
                  <button onClick={onSaveEdit} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 12px", fontSize: "0.75rem", cursor: "pointer" }}>✓ حفظ</button>
                  <button onClick={onCancelEdit} style={{ background: "#e5e7eb", color: "#374151", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer" }}>إلغاء</button>
                </div>
              </div>
            );
          }

          // ── Edit mode: item row with controls ─────────────────────────
          if (isEditMode) {
            return (
              <div key={item.id} className="menu-item no-print" style={{ position: "relative", paddingRight: "4px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {/* Reorder */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", flexShrink: 0 }}>
                    <button onClick={() => onMoveUp?.(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", fontSize: "10px", padding: "0 2px", lineHeight: 1 }}>▲</button>
                    <button onClick={() => onMoveDown?.(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#9ca3af", fontSize: "10px", padding: "0 2px", lineHeight: 1 }}>▼</button>
                  </div>
                  <div style={{ flex: 1 }} className="menu-item-dots">
                    <span className="item-name">{item.name}</span>
                    <span className="item-dots" />
                    <span className="item-price">
                      {item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}
                      <span className="item-currency"> د.إ</span>
                    </span>
                  </div>
                  {/* Actions */}
                  <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                    <button onClick={() => onStartEdit?.(item)} title="تعديل"
                      style={{ border: "none", background: "#dbeafe", color: "#1d4ed8", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "0.65rem" }}>✏️</button>
                    <button onClick={() => onMoveItem?.(item)} title="نقل"
                      style={{ border: "none", background: "#fef3c7", color: "#92400e", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "0.65rem" }}>⇄</button>
                    <button onClick={() => { if (confirm(`حذف "${item.name}"؟`)) onDeleteItem?.(item.id); }} title="حذف"
                      style={{ border: "none", background: "#fee2e2", color: "#dc2626", borderRadius: "4px", padding: "3px 6px", cursor: "pointer", fontSize: "0.65rem" }}>✕</button>
                  </div>
                </div>
                {item.descriptionAr && <p className="item-desc">{item.descriptionAr}</p>}
              </div>
            );
          }

          // ── Normal view mode ──────────────────────────────────────────
          return (
            <div key={item.id} className="menu-item">
              <div className="menu-item-dots">
                <span style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                  <span className="item-name">{item.name}</span>
                  {isPopular && (
                    <span style={{
                      fontSize: "0.55rem", fontWeight: 700, padding: "1px 5px",
                      borderRadius: "8px", background: "linear-gradient(135deg, #c8902a, #e8b840)",
                      color: "#fff", letterSpacing: "0.03em", whiteSpace: "nowrap",
                    }}>⭐ الأكثر طلباً</span>
                  )}
                  {isNew && (
                    <span style={{
                      fontSize: "0.55rem", fontWeight: 700, padding: "1px 5px",
                      borderRadius: "8px", background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      color: "#fff", letterSpacing: "0.03em", whiteSpace: "nowrap",
                    }}>✨ جديد</span>
                  )}
                </span>
                <span className="item-dots" />
                <span className="item-price">
                  {item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2)}
                  <span className="item-currency"> د.إ</span>
                </span>
              </div>
              {item.descriptionAr && <p className="item-desc">{item.descriptionAr}</p>}
              {item.calories && <span className="item-cal">{item.calories} سعرة حرارية</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const [forceRefresh, setForceRefresh] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showLinksDialog, setShowLinksDialog] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [menuName, setMenuName] = useState("قائمة الطعام");
  const [isSaving, setIsSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [previewMode, setPreviewMode] = useState<"print" | "mobile">("print");
  const qrRef = useRef<HTMLDivElement>(null);

  // ── Edit mode state ────────────────────────────────────────────────────────
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableSections, setEditableSections] = useState<MenuSection[]>([]);
  const [editingItem, setEditingItem] = useState<{ sectionId: string; itemId: number } | null>(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", description: "" });
  const [moveItemState, setMoveItemState] = useState<{ item: MenuItem; fromSectionId: string } | null>(null);

  const utils = trpc.useUtils();

  // Load live menu: current products merged with saved classification (always up-to-date, no AI)
  const { data: liveData, isLoading: isLoadingLive } = trpc.menu.getLiveProducts.useQuery(
    undefined,
    { staleTime: 1000 * 60 * 5 }
  );

  // AI generation - only triggered when user explicitly requests it
  const { data: aiData, isLoading: isAILoading, error, refetch } = trpc.menu.generate.useQuery(
    { forceRefresh },
    { enabled: aiEnabled, staleTime: 1000 * 60 * 30, retry: 1 }
  );

  // Use AI data if triggered, otherwise show live products (always current)
  const data = aiEnabled ? aiData : liveData;
  const isLoading = aiEnabled ? isAILoading : isLoadingLive;

  const { data: savedMenusList = [] } = trpc.menu.list.useQuery();
  const { data: liveToken } = trpc.menu.getLiveToken.useQuery();
  // الرابط البسيط /m — واضح وقصير
  const simpleMenuUrl = `${window.location.origin}/m`;
  const liveMenuUrl = liveToken ? simpleMenuUrl : null;

  const saveMenuMutation = trpc.menu.save.useMutation({
    onSuccess: () => {
      utils.menu.list.invalidate();
      utils.menu.getLiveToken.invalidate();
      setShowSaveDialog(false);
      setIsSaving(false);
      toast.success("تم حفظ المنيو وتحديث الرابط الثابت!", {
        description: liveMenuUrl || "الرابط الثابت جاهز للمشاركة",
        action: liveMenuUrl ? { label: "نسخ الرابط", onClick: () => { navigator.clipboard.writeText(liveMenuUrl); toast.success("تم نسخ الرابط"); } } : undefined,
      });
    },
    onError: (e) => { setIsSaving(false); toast.error(e.message); },
  });

  const deleteMenuMutation = trpc.menu.delete.useMutation({
    onSuccess: () => { utils.menu.list.invalidate(); toast.success("تم حذف الرابط"); },
    onError: (e) => toast.error(e.message),
  });

  // Sync editableSections when data loads
  useEffect(() => {
    if (data?.sections) setEditableSections(JSON.parse(JSON.stringify(data.sections)));
  }, [data?.sections]);

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const startEditItem = (sectionId: string, item: MenuItem) => {
    setEditingItem({ sectionId, itemId: item.id });
    setEditForm({ name: item.name, price: String(item.price), description: item.descriptionAr ?? "" });
  };

  const saveEditItem = () => {
    if (!editingItem) return;
    const price = parseFloat(editForm.price) || 0;
    setEditableSections((prev: MenuSection[]) => prev.map((s: MenuSection) =>
      s.id !== editingItem.sectionId ? s : ({
        ...s,
        items: s.items.map((i: MenuItem) => i.id !== editingItem.itemId ? i : ({
          ...i,
          name: editForm.name.trim() || i.name,
          price,
          descriptionAr: editForm.description.trim() || null,
        } as MenuItem)),
      } as MenuSection)) as MenuSection[]
    );
    setEditingItem(null);
    toast.success("تم تعديل الصنف");
  };

  const deleteItem = (sectionId: string, itemId: number) => {
    setEditableSections(prev => prev.map(s =>
      s.id !== sectionId ? s : { ...s, items: s.items.filter(i => i.id !== itemId) }
    ));
    toast.success("تم حذف الصنف");
  };

  const moveItemToSection = (targetSectionId: string) => {
    if (!moveItemState) return;
    const { item, fromSectionId } = moveItemState;
    setEditableSections(prev => {
      const updated = prev.map(s => {
        if (s.id === fromSectionId) return { ...s, items: s.items.filter(i => i.id !== item.id) };
        if (s.id === targetSectionId) return { ...s, items: [...s.items, item] };
        return s;
      });
      return updated;
    });
    setMoveItemState(null);
    toast.success("تم نقل الصنف");
  };

  const moveItemUp = (sectionId: string, itemId: number) => {
    setEditableSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const idx = s.items.findIndex(i => i.id === itemId);
      if (idx <= 0) return s;
      const items = [...s.items];
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      return { ...s, items };
    }));
  };

  const moveItemDown = (sectionId: string, itemId: number) => {
    setEditableSections(prev => prev.map(s => {
      if (s.id !== sectionId) return s;
      const idx = s.items.findIndex(i => i.id === itemId);
      if (idx < 0 || idx >= s.items.length - 1) return s;
      const items = [...s.items];
      [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
      return { ...s, items };
    }));
  };

  // Sections to display: editable in edit mode, server data otherwise
  const displaySections: MenuSection[] = isEditMode ? editableSections : (data?.sections || []);

  const handleRefresh = () => {
    setAiEnabled(true);
    setForceRefresh(true);
    setTimeout(() => {
      refetch().then(() => {
        setForceRefresh(false);
        toast.success("تم تحديث المنيو بالذكاء الاصطناعي");
      });
    }, 100);
  };

  const handleSave = () => {
    const sectionsToSave = isEditMode && editableSections.length ? editableSections : data?.sections;
    if (!sectionsToSave?.length) { toast.error("لا يوجد منيو لحفظه"); return; }
    setIsSaving(true);
    saveMenuMutation.mutate({
      name: menuName,
      menuData: JSON.stringify({ ...data, sections: sectionsToSave }),
    });
  };

  const copyLink = (token: string) => {
    const link = `${window.location.origin}/menu/${token}`;
    navigator.clipboard.writeText(link);
    toast.success("تم نسخ الرابط");
  };

  const sections: MenuSection[] = displaySections;
  const [leftCol, rightCol] = useMemo(() => splitIntoColumns(sections), [sections]);

  const hasNoMenu = !isLoading && !data?.sections?.length;

  if (isLoading && aiEnabled) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5" style={{ background: "#fdf6ec" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Dubai:wght@300;400;500;700&display=swap');`}</style>
        <div className="relative w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-amber-200 border-t-amber-700 animate-spin" />
          <ChefHat className="absolute inset-0 m-auto w-10 h-10 text-amber-700" />
        </div>
        <div className="text-center" style={{ fontFamily: "'Dubai', sans-serif" }}>
          <p className="text-2xl font-bold text-amber-900">الذكاء الاصطناعي يُصمّم القائمة</p>
          <p className="text-amber-600 mt-1">جاري تصنيف الأصناف وترتيبها...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-600">حدث خطأ في تحميل المنيو</p>
        <Button onClick={() => refetch()}>إعادة المحاولة</Button>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dubai:wght@300;400;500;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap');

        /* ── Base ─────────────────────────────────────────────── */
        .menu-wrap { font-family: 'Dubai', 'Segoe UI', Tahoma, sans-serif; }

        /* ── Print A4 ───────────────────────────────────────── */
        @media print {
          /* ① إخفاء كل عناصر واجهة المستخدم */
          .no-print,
          nav, aside, header:not(.menu-header-band),
          [class*="sidebar"], [class*="Sidebar"],
          [class*="nav"], [class*="Nav"],
          [class*="toolbar"], [class*="Toolbar"] {
            display: none !important;
          }

          /* ② إعادة ضبط الـ body والـ layout */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            background: white !important;
            width: 100% !important;
          }

          /* ③ إخفاء كل شيء ما عدا صفحة المنيو */
          body > * { display: none !important; }
          body > * .menu-wrap { display: block !important; }
          .menu-wrap { display: block !important; }

          /* ④ تصميم الصفحة */
          .menu-page {
            display: block !important;
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
            min-height: unset !important;
          }
          .max-w-5xl { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .menu-paper {
            box-shadow: none !important;
            border-radius: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .menu-paper::after { display: none !important; }

          /* ⑤ Header */
          .menu-header-band {
            background: #120700 !important;
            -webkit-print-color-adjust: exact !important;
          }
          .menu-header-band::before, .menu-header-band::after {
            background: linear-gradient(90deg, transparent 0%, #8B4513 10%, #c8902a 35%, #f0c060 50%, #c8902a 65%, #8B4513 90%, transparent 100%) !important;
            -webkit-print-color-adjust: exact !important;
          }
          .menu-header-inner { padding: 22px 40px 18px !important; }
          .menu-restaurant-name { font-size: 2.4rem !important; color: #f0c060 !important; }

          /* ⑥ Columns */
          .menu-columns {
            display: grid !important;
            grid-template-columns: 1fr 1px 1fr !important;
            padding: 16px 0 !important;
            background: white !important;
          }
          .menu-col { padding: 0 20px !important; }
          .menu-col-divider {
            background: linear-gradient(to bottom, transparent, rgba(200,144,42,0.25), transparent) !important;
          }

          /* ⑦ Sections & items */
          .menu-section { break-inside: avoid !important; orphans: 3 !important; widows: 3 !important; }
          .section-icon {
            background: linear-gradient(135deg, #1a0a02, #3d1a05) !important;
            border: 1px solid rgba(200,144,42,0.45) !important;
            color: #c8902a !important;
            -webkit-print-color-adjust: exact !important;
          }

          /* ⑧ Footer */
          .menu-footer { background: #120700 !important; -webkit-print-color-adjust: exact !important; }
          .menu-footer::before {
            background: linear-gradient(90deg, transparent 0%, #8B4513 10%, #c8902a 35%, #f0c060 50%, #c8902a 65%, #8B4513 90%, transparent 100%) !important;
            -webkit-print-color-adjust: exact !important;
          }

          @page { size: A4 portrait; margin: 1cm 1.2cm; }
        }

        /* ── Page background ──────────────────────────────────── */
        .menu-page {
          background: #1a0e06;
          background-image: radial-gradient(ellipse at 50% 0%, rgba(200,144,42,0.18) 0%, transparent 60%);
          min-height: 100vh;
          direction: rtl;
        }
        /* ── Toolbar ──────────────────────────────────────────── */
        .menu-toolbar {
          background: rgba(15,8,2,0.92);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(200,144,42,0.3);
          box-shadow: 0 2px 20px rgba(0,0,0,0.4);
        }
        /* ── Menu paper ───────────────────────────────────────── */
        .menu-paper {
          background: #fffdf8;
          box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.3);
          border-radius: 4px;
          overflow: hidden;
          position: relative;
        }
        .menu-paper::after {
          content: '';
          position: absolute;
          inset: 10px;
          border: 1px solid rgba(200,144,42,0.2);
          pointer-events: none;
          z-index: 1;
        }
        /* ── Header ───────────────────────────────────────────── */
        .menu-header-band {
          background: #120700;
          padding: 0;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .menu-header-band::before {
          content: '';
          display: block;
          height: 5px;
          background: linear-gradient(90deg, transparent 0%, #8B4513 10%, #c8902a 35%, #f0c060 50%, #c8902a 65%, #8B4513 90%, transparent 100%);
        }
        .menu-header-band::after {
          content: '';
          display: block;
          height: 5px;
          background: linear-gradient(90deg, transparent 0%, #8B4513 10%, #c8902a 35%, #f0c060 50%, #c8902a 65%, #8B4513 90%, transparent 100%);
          position: absolute;
          bottom: 0; left: 0; right: 0;
        }
        .menu-header-inner {
          padding: 30px 52px 26px;
          background: radial-gradient(ellipse at 50% 30%, rgba(200,144,42,0.12) 0%, transparent 65%);
        }
        .menu-restaurant-name {
          font-family: "Playfair Display", serif;
          font-size: 3rem;
          font-weight: 700;
          color: #f0c060;
          letter-spacing: 0.14em;
          line-height: 1;
          text-shadow: 0 0 50px rgba(240,192,96,0.35), 0 2px 4px rgba(0,0,0,0.6);
        }
        .menu-restaurant-sub {
          font-family: "Playfair Display", serif;
          font-size: 0.68rem;
          color: rgba(240,192,96,0.55);
          letter-spacing: 0.48em;
          text-transform: uppercase;
          margin-top: 6px;
        }
        .menu-ornament-line {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin: 16px 0 0;
        }
        .menu-ornament-line .line {
          height: 1px;
          flex: 1;
          max-width: 140px;
          background: linear-gradient(90deg, transparent, rgba(240,192,96,0.5), transparent);
        }
        .menu-ornament-line .diamond {
          color: rgba(240,192,96,0.7);
          font-size: 0.6rem;
          letter-spacing: 0.6em;
        }
        /* ── Two-column layout ────────────────────────────────── */
        .menu-columns {
          display: grid;
          grid-template-columns: 1fr 1px 1fr;
          gap: 0;
          padding: 24px 0 28px;
          background: #fffdf8;
        }
        .menu-col-divider {
          background: linear-gradient(to bottom,
            transparent 0%,
            rgba(200,144,42,0.18) 6%,
            rgba(200,144,42,0.18) 94%,
            transparent 100%);
        }
        .menu-col { padding: 0 24px; }
        /* ── Section ──────────────────────────────────────────── */
        .menu-section { margin-bottom: 18px; break-inside: avoid; }
        .section-title {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 9px;
          padding-bottom: 9px;
          position: relative;
        }
        .section-title::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 1px;
          background: linear-gradient(90deg, #c8902a 0%, rgba(200,144,42,0.3) 60%, transparent 100%);
        }
        .section-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 7px;
          background: linear-gradient(135deg, #1a0a02, #3d1a05);
          border: 1px solid rgba(200,144,42,0.45);
          color: #c8902a;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .section-name-ar {
          font-family: "Dubai", sans-serif;
          font-size: 0.98rem;
          font-weight: 700;
          color: #180800;
          line-height: 1.2;
        }
        .section-name-en {
          font-family: "Playfair Display", serif;
          font-size: 0.58rem;
          color: #c8902a;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          opacity: 0.85;
        }
        .section-line { flex: 1; }
        /* ── Menu item ────────────────────────────────────────── */
        .menu-item { padding: 5.5px 0; border-bottom: 1px solid rgba(200,144,42,0.09); }
        .menu-item:last-child { border-bottom: none; }
        .menu-item-dots { display: flex; align-items: baseline; }
        .item-name {
          font-family: "Dubai", sans-serif;
          font-size: 0.845rem;
          font-weight: 600;
          color: #180800;
          flex-shrink: 0;
          max-width: 70%;
          line-height: 1.3;
        }
        .item-dots {
          flex: 1;
          border-bottom: 1px dotted rgba(200,144,42,0.28);
          margin: 0 5px 3px;
          min-width: 10px;
        }
        .item-price {
          font-family: "Playfair Display", serif;
          font-size: 0.875rem;
          font-weight: 700;
          color: #4a1e00;
          white-space: nowrap;
          flex-shrink: 0;
          letter-spacing: 0.03em;
        }
        .item-currency {
          font-size: 0.65rem;
          font-weight: 600;
          color: #c8902a;
          margin-right: 1px;
        }
        .item-desc {
          font-family: "Dubai", sans-serif;
          font-size: 0.69rem;
          color: #705040;
          margin-top: 1px;
          line-height: 1.35;
        }
        .item-cal {
          font-size: 0.6rem;
          color: #a07850;
          opacity: 0.7;
        }


        /* ── Footer ───────────────────────────────────────────── */
        .menu-footer {
          background: #120700;
          padding: 0;
          text-align: center;
          position: relative;
        }
        .menu-footer::before {
          content: '';
          display: block;
          height: 4px;
          background: linear-gradient(90deg, transparent 0%, #8B4513 10%, #c8902a 35%, #f0c060 50%, #c8902a 65%, #8B4513 90%, transparent 100%);
        }
        .menu-footer-inner {
          padding: 16px 48px;
        }
        .menu-footer p {
          color: rgba(240,192,96,0.75);
          font-family: 'Dubai', sans-serif;
          font-size: 0.78rem;
          margin: 2px 0;
        }
        .menu-footer .footer-tagline {
          font-family: 'Playfair Display', serif;
          font-size: 0.62rem;
          color: rgba(240,192,96,0.45);
          letter-spacing: 0.2em;
        }
        /* ── Toolbar text colors for dark bg ── */
        .menu-toolbar .text-amber-900 { color: #f0c060 !important; }
        .menu-toolbar .text-amber-700 { color: #c8902a !important; }
        .menu-toolbar .border-amber-300 { border-color: rgba(200,144,42,0.4) !important; }
      `}</style>

      <div className="menu-wrap menu-page">
        {/* ── Toolbar ── */}
        <div className="no-print menu-toolbar sticky top-0 z-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <ChefHat className="w-5 h-5 text-amber-700" />
            <span className="font-bold text-amber-900 text-base" style={{ fontFamily: "'Dubai', sans-serif" }}>
              قائمة الطعام
            </span>
            {data?.generatedAt && (
              <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 gap-1">
                <Sparkles className="w-3 h-3" />
                مُصنَّف بالذكاء الاصطناعي
              </Badge>
            )}
            {/* Stats */}
            {sections.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {sections.length} قسم
                </span>
                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {sections.reduce((s, sec) => s + sec.items.filter(i => i.price > 0).length, 0)} صنف
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Preview mode toggle */}
            <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setPreviewMode("print")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === "print" ? "bg-white shadow text-amber-800" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Monitor className="w-3.5 h-3.5" /> طباعة
              </button>
              <button
                onClick={() => setPreviewMode("mobile")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${previewMode === "mobile" ? "bg-white shadow text-amber-800" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Smartphone className="w-3.5 h-3.5" /> موبايل
              </button>
            </div>

            {/* QR Code */}
            {liveMenuUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowQrDialog(true)}
                className="border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
                title="عرض QR Code للمنيو"
              >
                <QrCode className="w-4 h-4" />
                QR Code
              </Button>
            )}

            {/* WhatsApp share */}
            {liveMenuUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent("قائمة طعامنا 🍽\n" + liveMenuUrl)}`, "_blank")}
                className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
                title="مشاركة عبر واتساب"
              >
                <MessageCircle className="w-4 h-4" />
                واتساب
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="border-amber-300 text-amber-800 hover:bg-amber-50 gap-1.5"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              تحديث بالذكاء الاصطناعي
            </Button>
            {liveMenuUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(liveMenuUrl); toast.success("تم نسخ الرابط الثابت"); }}
                className="border-purple-300 text-purple-700 hover:bg-purple-50 gap-1.5"
                title="رابط ثابت لا يتغير أبداً"
              >
                <Link2 className="w-4 h-4" />
                نسخ الرابط الثابت
              </Button>
            )}
            {savedMenusList.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLinksDialog(true)}
                className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
              >
                <BookOpen className="w-4 h-4" />
                الروابط المحفوظة ({savedMenusList.length})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSaveDialog(true)}
              disabled={!sections.length}
              className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
            >
              <Save className="w-4 h-4" />
              حفظ ومشاركة
            </Button>
            {/* Edit mode toggle */}
            {sections.length > 0 && (
              <Button
                size="sm"
                variant={isEditMode ? "default" : "outline"}
                onClick={() => {
                  if (!isEditMode) {
                    setEditableSections(JSON.parse(JSON.stringify(data?.sections || [])));
                  }
                  setIsEditMode(e => !e);
                  setEditingItem(null);
                }}
                className={isEditMode
                  ? "bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                  : "border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"}
              >
                {isEditMode ? "✓ حفظ التعديلات" : "✏️ تعديل المنيو"}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                // Build the dedicated print URL (no sidebar/navbar)
                const printUrl = liveToken
                  ? `${window.location.origin}/menu/print/live/${liveToken}`
                  : savedMenusList.length > 0
                    ? `${window.location.origin}/menu/print/${(savedMenusList as any[])[0].token}`
                    : null;
                if (printUrl) {
                  // Open print page — it auto-prints after data loads
                  window.open(printUrl, "_blank", "width=860,height=900,scrollbars=yes");
                } else {
                  toast.error("احفظ المنيو أولاً لتتمكن من طباعته");
                }
              }}
              className="bg-amber-800 hover:bg-amber-900 text-white gap-1.5"
            >
              <Printer className="w-4 h-4" />
              طباعة
            </Button>
          </div>
        </div>

        {/* Menu Paper */}
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="menu-paper">

            {/* Header Band */}
            <div className="menu-header-band">
              <div className="menu-header-inner">
                <p className="menu-restaurant-name">NSR</p>
                <p className="menu-restaurant-sub">Restaurant &amp; Cuisine</p>
                <div className="menu-ornament-line">
                  <span className="line" />
                  <span className="diamond">◆ ◆ ◆</span>
                  <span className="line" />
                </div>
              </div>
            </div>

            {/* Edit mode banner */}
            {isEditMode && (
              <div className="no-print flex items-center justify-center gap-2 bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-700">
                <span>✏️ وضع التعديل — اضغط على أي صنف لتعديله أو نقله أو حذفه</span>
                <button onClick={() => setIsEditMode(false)} className="mr-auto text-blue-500 hover:text-blue-700">✕ إغلاق</button>
              </div>
            )}

            {/* Two-column content */}
            {sections.length > 0 ? (
              <div className="menu-columns">
                {/* Right column (Arabic RTL = right = first) */}
                <div className="menu-col">
                  {rightCol.map(section => (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      isEditMode={isEditMode}
                      editingItem={editingItem}
                      editForm={editForm}
                      onEditFormChange={setEditForm}
                      onStartEdit={(item) => startEditItem(section.id, item)}
                      onSaveEdit={saveEditItem}
                      onCancelEdit={() => setEditingItem(null)}
                      onDeleteItem={(itemId) => deleteItem(section.id, itemId)}
                      onMoveItem={(item) => setMoveItemState({ item, fromSectionId: section.id })}
                      onMoveUp={(itemId) => moveItemUp(section.id, itemId)}
                      onMoveDown={(itemId) => moveItemDown(section.id, itemId)}
                    />
                  ))}
                </div>
                {/* Vertical divider */}
                <div className="menu-col-divider" />
                {/* Left column */}
                <div className="menu-col">
                  {leftCol.map(section => (
                    <SectionBlock
                      key={section.id}
                      section={section}
                      isEditMode={isEditMode}
                      editingItem={editingItem}
                      editForm={editForm}
                      onEditFormChange={setEditForm}
                      onStartEdit={(item) => startEditItem(section.id, item)}
                      onSaveEdit={saveEditItem}
                      onCancelEdit={() => setEditingItem(null)}
                      onDeleteItem={(itemId) => deleteItem(section.id, itemId)}
                      onMoveItem={(item) => setMoveItemState({ item, fromSectionId: section.id })}
                      onMoveUp={(itemId) => moveItemUp(section.id, itemId)}
                      onMoveDown={(itemId) => moveItemDown(section.id, itemId)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-16" style={{ fontFamily: "'Dubai', sans-serif" }}>
                <ChefHat className="w-16 h-16 text-amber-300 mx-auto mb-4" />
                <p className="text-xl font-bold text-amber-800 mb-2">لا يوجد منيو محفوظ حتى الآن</p>
                <p className="text-amber-600 mb-6">اضغط على "إنشاء منيو بالذكاء الاصطناعي" لتصميم قائمتك تلقائياً</p>
                <Button
                  onClick={handleRefresh}
                  className="bg-amber-800 hover:bg-amber-900 text-white gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  إنشاء منيو بالذكاء الاصطناعي
                </Button>
              </div>
            )}

            {/* Footer */}
            <div className="menu-footer">
              <div className="menu-footer-inner">
              <p className="font-semibold" style={{ fontSize: "1rem", letterSpacing: "0.05em" }}>بالهناء والشفاء</p>
              <p className="footer-tagline">جميع الأسعار شاملة ضريبة القيمة المضافة • All prices include VAT</p>
              </div>
            </div>

          </div>
        </div>
      </div>
      {/* ── QR Code Dialog ── */}
      <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-900">
              <QrCode className="w-5 h-5" />
              QR Code المنيو
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground text-center">
              ضعه على الطاولات — العميل يمسحه ويشوف المنيو مباشرة
            </p>
            {liveMenuUrl && (
              <div ref={qrRef} className="flex justify-center">
                <div className="p-4 bg-white border-4 border-amber-200 rounded-2xl shadow-inner">
                  <QRCodeSVG
                    value={liveMenuUrl}
                    size={200}
                    fgColor="#4a2008"
                    bgColor="#ffffff"
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>
            )}
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground">رابط المنيو</p>
              <code className="text-[10px] bg-muted px-2 py-1 rounded break-all block">{liveMenuUrl}</code>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigator.clipboard.writeText(liveMenuUrl!); toast.success("تم نسخ الرابط"); }}
                className="gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> نسخ الرابط
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent("قائمة طعامنا 🍽\n" + liveMenuUrl)}`, "_blank")}
                className="gap-1.5 text-green-700 border-green-300"
              >
                <MessageCircle className="w-3.5 h-3.5" /> واتساب
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Preview Dialog */}
      {previewMode === "mobile" && liveMenuUrl && (
        <div
          className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4 no-print"
          onClick={() => setPreviewMode("print")}
        >
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewMode("print")}
              className="absolute -top-10 left-0 text-white flex items-center gap-2 text-sm hover:text-amber-300 transition-colors"
            >
              <X className="w-4 h-4" /> إغلاق المعاينة
            </button>
            {/* Phone frame */}
            <div style={{
              width: "375px",
              height: "812px",
              background: "#fff",
              borderRadius: "44px",
              border: "10px solid #1a1a1a",
              boxShadow: "0 0 0 2px #333, 0 30px 80px rgba(0,0,0,0.6)",
              overflow: "hidden",
              position: "relative",
            }}>
              {/* Phone notch */}
              <div style={{
                position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                width: "120px", height: "28px", background: "#1a1a1a",
                borderRadius: "0 0 18px 18px", zIndex: 10,
              }} />
              <iframe
                src={liveMenuUrl}
                style={{
                  width: "100%", height: "100%",
                  border: "none",
                  borderRadius: "34px",
                  paddingTop: "28px",
                }}
                title="Mobile Menu Preview"
              />
            </div>
            <p className="text-center text-white/60 text-xs mt-3">
              معاينة المنيو على الموبايل — {liveMenuUrl}
            </p>
          </div>
        </div>
      )}

      {/* ── Move Item Dialog ── */}
      <Dialog open={!!moveItemState} onOpenChange={(o) => !o && setMoveItemState(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-900">نقل الصنف إلى قسم آخر</DialogTitle>
          </DialogHeader>
          {moveItemState && (
            <div className="space-y-3 py-2">
              <p className="text-sm font-medium bg-amber-50 rounded-lg p-2 border border-amber-200">
                {moveItemState.item.name}
              </p>
              <p className="text-xs text-muted-foreground">اختر القسم الهدف:</p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {editableSections
                  .filter(s => s.id !== moveItemState.fromSectionId)
                  .map(s => (
                    <button
                      key={s.id}
                      onClick={() => moveItemToSection(s.id)}
                      className="w-full text-right px-3 py-2.5 rounded-lg border border-border hover:bg-amber-50 hover:border-amber-300 transition-colors text-sm font-medium flex items-center gap-2"
                    >
                      <span>{getSectionIcon(s)}</span>
                      {s.nameAr}
                      <span className="text-xs text-muted-foreground mr-auto">{s.items.length} صنف</span>
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setMoveItemState(null)}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-1"
              >
                إلغاء
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="w-5 h-5 text-green-600" />
              حفظ المنيو ومشاركته
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-1.5 block">اسم المنيو</label>
              <Input
                value={menuName}
                onChange={(e) => setMenuName(e.target.value)}
                placeholder="مثال: قائمة الطعام الرئيسية"
              />
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700">
              <div className="flex items-start gap-2">
                <Link2 className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">رابط ثابت لا يتغير أبداً</p>
                  <p className="mt-0.5">سيتم تحديث الرابط الثابت تلقائياً بالمنيو الجديد. شارك الرابط مرة واحدة وسيظل محدثاً دائماً.</p>
                  {liveMenuUrl && (
                    <p className="mt-1 font-mono text-xs bg-white rounded px-2 py-1 border border-purple-200 truncate">{liveMenuUrl}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>إلغاء</Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !menuName.trim()}
              className="bg-green-600 hover:bg-green-700 text-white gap-1.5"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ وإنشاء الرابط
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Links Dialog */}
      <Dialog open={showLinksDialog} onOpenChange={setShowLinksDialog}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              الروابط المحفوظة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-y-auto py-1">
            {savedMenusList.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">لا توجد روابط محفوظة</p>
            ) : (
              savedMenusList.map((menu: any) => (
                <div key={menu.id} className="flex items-center gap-2 p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{menu.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(menu.createdAt).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    title="نسخ الرابط"
                    onClick={() => copyLink(menu.token)}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                    title="فتح الرابط"
                    onClick={() => window.open(`/menu/${menu.token}`, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50"
                    title="حذف"
                    onClick={() => deleteMenuMutation.mutate({ id: menu.id })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinksDialog(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
