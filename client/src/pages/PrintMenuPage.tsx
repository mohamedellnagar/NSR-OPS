/**
 * PrintMenuPage — صفحة طباعة A4 نظيفة للمنيو
 * تُفتح في نافذة منفصلة بدون sidebar/navbar
 * ثم تُطبع تلقائياً
 */
import { useMemo, useEffect, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  UtensilsCrossed, Salad, Coffee, Wine, IceCream, Soup,
  Sandwich, Pizza, Fish, Beef, Wheat, Cookie, Flame,
  Apple, Leaf, Star, Utensils, CupSoda, Cake, Egg,
  Drumstick, Milk, Carrot, Citrus, ChefHat, Shell,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MenuItem {
  id: number; name: string; price: number;
  calories?: number | null; descriptionAr?: string | null;
}
interface MenuSection {
  id: string; nameAr: string; nameEn: string; icon: string;
  items: MenuItem[];
}
interface MenuData { sections: MenuSection[]; }

// ─── Icon Map ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  appetizers:<Salad size={13}/>, starters:<Salad size={13}/>, salads:<Salad size={13}/>,
  soups:<Soup size={13}/>, mains:<UtensilsCrossed size={13}/>,
  main_courses:<UtensilsCrossed size={13}/>, main_dish:<UtensilsCrossed size={13}/>,
  grills:<Flame size={13}/>, grilled:<Flame size={13}/>, bbq:<Flame size={13}/>, charcoal:<Flame size={13}/>,
  sandwiches:<Sandwich size={13}/>, burgers:<Sandwich size={13}/>,
  pizza:<Pizza size={13}/>, seafood:<Fish size={13}/>, fish:<Fish size={13}/>,
  meat:<Beef size={13}/>, chicken:<Drumstick size={13}/>, poultry:<Drumstick size={13}/>,
  pasta:<Wheat size={13}/>, rice:<Wheat size={13}/>, bread:<Wheat size={13}/>,
  desserts:<IceCream size={13}/>, sweets:<IceCream size={13}/>,
  cakes:<Cake size={13}/>, pastry:<Cookie size={13}/>,
  beverages:<Coffee size={13}/>, drinks:<CupSoda size={13}/>,
  hot_drinks:<Coffee size={13}/>, cold_drinks:<CupSoda size={13}/>,
  juices:<CupSoda size={13}/>, coffee:<Coffee size={13}/>, tea:<Coffee size={13}/>,
  wine:<Wine size={13}/>, breakfast:<Egg size={13}/>, dairy:<Milk size={13}/>,
  vegan:<Leaf size={13}/>, vegetarian:<Leaf size={13}/>, healthy:<Apple size={13}/>,
  specials:<Star size={13}/>, special:<Star size={13}/>,
  sides:<Carrot size={13}/>, extras:<Carrot size={13}/>,
  sauces:<Shell size={13}/>, fruits:<Citrus size={13}/>,
};
function getSectionIcon(s: MenuSection): React.ReactNode {
  if (ICON_MAP[s.id]) return ICON_MAP[s.id];
  const k = (s.icon || "").toLowerCase().trim();
  if (k && ICON_MAP[k]) return ICON_MAP[k];
  const c = `${s.id} ${s.nameEn}`.toLowerCase();
  for (const key of Object.keys(ICON_MAP))
    if (c.includes(key.replace(/_/g, " "))) return ICON_MAP[key];
  return <Utensils size={13} />;
}
function cleanName(n: string) { return n.replace(/^\d+\s+/, "").trim(); }

// ─── Split sections into two columns (balanced by item count) ─────────────────
function splitColumns(sections: MenuSection[]): [MenuSection[], MenuSection[]] {
  const total = sections.reduce((s, sec) => s + sec.items.length, 0);
  let acc = 0;
  for (let i = 0; i < sections.length; i++) {
    acc += sections[i].items.length;
    if (acc >= total / 2) return [sections.slice(0, i + 1), sections.slice(i + 1)];
  }
  return [sections, []];
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PrintMenuPage() {
  const [matchLive, liveP] = useRoute("/menu/print/live/:token");
  const [, p] = useRoute("/menu/print/:token");
  const token = (matchLive ? liveP?.token : p?.token) ?? "";
  const isLive = !!matchLive;

  const { data: liveMenu, isLoading: ll } = trpc.menu.getByLiveToken.useQuery({ token }, { enabled: !!token && isLive, retry: 1 });
  const { data: savedMenu, isLoading: sl } = trpc.menu.getPublic.useQuery({ token }, { enabled: !!token && !isLive, retry: 1 });

  const menu = isLive ? liveMenu : savedMenu;
  const isLoading = isLive ? ll : sl;

  const menuData: MenuData | null = useMemo(() => {
    if (!menu?.menuData) return null;
    try { return JSON.parse(menu.menuData) as MenuData; } catch { return null; }
  }, [menu]);

  const sections = useMemo(() => {
    return (menuData?.sections ?? []).filter(s => s.items.some(i => i.price > 0));
  }, [menuData]);

  const [leftCol, rightCol] = useMemo(() => splitColumns(sections), [sections]);
  const restName = menu?.restaurantName || "قائمة الطعام";
  const [printed, setPrinted] = useState(false);

  // Auto-print once data is ready (not on first load skeleton)
  useEffect(() => {
    if (!isLoading && menu && menuData && sections.length > 0 && !printed) {
      setPrinted(true);
      // Small delay to let fonts/icons render
      setTimeout(() => window.print(), 800);
    }
  }, [isLoading, menu, menuData, sections.length, printed]);

  if (isLoading) return (
    <div style={{ fontFamily: "'Cairo', sans-serif", textAlign: "center", padding: "60px", direction: "rtl", color: "#4a2008" }}>
      <div style={{ fontSize: "1.5rem", marginBottom: "8px" }}>🍽</div>
      <p style={{ fontSize: "1rem", fontWeight: 600 }}>جاري تحميل القائمة...</p>
    </div>
  );
  if (!menu || !menuData) return (
    <div style={{ fontFamily: "sans-serif", textAlign: "center", padding: "40px", direction: "rtl" }}>
      القائمة غير متاحة
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        html, body {
          background: #f5ede0;
          direction: rtl;
          font-family: 'Cairo', sans-serif;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .print-root {
          max-width: 21cm;
          margin: 0 auto;
          background: white;
        }

        /* ── Header ── */
        .print-header {
          background: #120700;
          padding: 0;
          text-align: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-header-bar {
          height: 5px;
          background: linear-gradient(90deg,
            transparent 0%, #6b2c0a 8%, #c8902a 30%,
            #f0c060 50%, #c8902a 70%, #6b2c0a 92%, transparent 100%);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-header-inner {
          padding: 14px 40px 12px;
          background: radial-gradient(ellipse at 50% 40%, rgba(200,144,42,0.1) 0%, transparent 70%);
        }
        .print-name {
          font-family: 'Playfair Display', serif;
          font-size: 2rem;
          font-weight: 700;
          color: #f0c060;
          letter-spacing: 0.12em;
          line-height: 1;
          text-shadow: 0 0 40px rgba(240,192,96,0.3);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-sub {
          font-family: 'Playfair Display', serif;
          font-size: 0.62rem;
          color: rgba(240,192,96,0.55);
          letter-spacing: 0.5em;
          text-transform: uppercase;
          margin-top: 3px;
        }
        .print-ornament {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-top: 10px;
        }
        .print-ornament-line {
          flex: 1;
          max-width: 130px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(240,192,96,0.45), transparent);
        }
        .print-ornament-dots {
          color: rgba(240,192,96,0.65);
          font-size: 0.55rem;
          letter-spacing: 0.6em;
        }

        /* ── Two-column body ── */
        .print-body {
          display: grid;
          grid-template-columns: 1fr 1px 1fr;
          padding: 12px 0 14px;
          background: white;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-divider {
          background: linear-gradient(to bottom,
            transparent 0%, rgba(200,144,42,0.2) 5%,
            rgba(200,144,42,0.2) 95%, transparent 100%);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-col { padding: 0 16px; }

        /* ── Section ── */
        .print-section { margin-bottom: 11px; page-break-inside: avoid; break-inside: avoid; }
        .print-section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 6px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(200,144,42,0.3);
          position: relative;
        }
        .print-section-header::before {
          content: '';
          position: absolute;
          bottom: -1px; right: 0;
          width: 36px; height: 2px;
          background: #c8902a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-section-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px; height: 22px;
          border-radius: 6px;
          background: #1a0a02;
          border: 1px solid rgba(200,144,42,0.4);
          color: #c8902a;
          flex-shrink: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-section-name-ar {
          font-size: 0.85rem;
          font-weight: 800;
          color: #1a0a02;
          line-height: 1.2;
        }
        .print-section-name-en {
          font-family: 'Playfair Display', serif;
          font-size: 0.52rem;
          color: #c8902a;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          opacity: 0.85;
        }

        /* ── Item ── */
        .print-item { padding: 3px 0; border-bottom: 1px solid rgba(200,144,42,0.08); }
        .print-item:last-child { border-bottom: none; }
        .print-item-row { display: flex; align-items: baseline; }
        .print-item-name {
          font-size: 0.79rem;
          font-weight: 600;
          color: #1a0a02;
          flex-shrink: 0;
          max-width: 72%;
          line-height: 1.3;
        }
        .print-item-dots {
          flex: 1;
          border-bottom: 1px dotted rgba(200,144,42,0.25);
          margin: 0 5px 2px;
          min-width: 8px;
        }
        .print-item-price {
          font-family: 'Playfair Display', serif;
          font-size: 0.81rem;
          font-weight: 700;
          color: #4a1e00;
          flex-shrink: 0;
          white-space: nowrap;
          letter-spacing: 0.02em;
        }
        .print-item-currency { font-size: 0.62rem; color: #c8902a; font-weight: 600; margin-right: 1px; }
        .print-item-desc {
          font-size: 0.63rem;
          color: #705040;
          margin-top: 0;
          line-height: 1.3;
        }

        /* ── Footer ── */
        .print-footer {
          background: #120700;
          padding: 10px 40px;
          text-align: center;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-footer-main {
          font-family: 'Cairo', sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          color: #f0c060;
          letter-spacing: 0.06em;
        }
        .print-footer-sub {
          font-family: 'Playfair Display', serif;
          font-size: 0.6rem;
          color: rgba(240,192,96,0.5);
          letter-spacing: 0.2em;
          margin-top: 4px;
        }

        /* ── Screen preview wrapper ── */
        @media screen {
          body { padding: 20px; }
          .print-root {
            box-shadow: 0 8px 40px rgba(0,0,0,0.15);
          }
        }

        /* ── Print ── */
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: white !important; padding: 0 !important; }
          .no-print-btn { display: none !important; }
          .print-root { max-width: 100% !important; box-shadow: none !important; }
          .print-section { break-inside: avoid !important; }
          @page { size: A4 portrait; margin: 1cm 1.2cm; }
        }
      `}</style>

      {/* زر الطباعة اليدوي — يختفي عند الطباعة */}
      <div style={{
        position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, display: "flex", gap: "8px",
      }} className="no-print-btn">
        <button
          onClick={() => window.print()}
          style={{
            background: "linear-gradient(135deg, #4a2008, #8B4513)",
            color: "#ffd880", border: "none", borderRadius: "24px",
            padding: "10px 28px", fontSize: "0.9rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "'Cairo', sans-serif",
            boxShadow: "0 4px 16px rgba(74,32,8,0.4)",
            letterSpacing: "0.02em",
          }}
        >
          🖨️ طباعة / حفظ PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{
            background: "rgba(0,0,0,0.1)", color: "#555", border: "none",
            borderRadius: "24px", padding: "10px 16px", fontSize: "0.85rem",
            cursor: "pointer", fontFamily: "'Cairo', sans-serif",
          }}
        >
          ✕
        </button>
      </div>

      <div className="print-root">
        {/* Header */}
        <div className="print-header">
          <div className="print-header-bar" />
          <div className="print-header-inner">
            <p className="print-name">{restName}</p>
            <p className="print-sub">Restaurant &amp; Cuisine</p>
            <div className="print-ornament">
              <div className="print-ornament-line" />
              <span className="print-ornament-dots">◆ ◆ ◆</span>
              <div className="print-ornament-line" />
            </div>
          </div>
          <div className="print-header-bar" />
        </div>

        {/* Two-column body */}
        <div className="print-body">
          {/* Right column (RTL = first) */}
          <div className="print-col">
            {rightCol.map(section => <PrintSection key={section.id} section={section} />)}
          </div>
          {/* Divider */}
          <div className="print-divider" />
          {/* Left column */}
          <div className="print-col">
            {leftCol.map(section => <PrintSection key={section.id} section={section} />)}
          </div>
        </div>

        {/* Footer */}
        <div className="print-footer">
          <div className="print-header-bar" style={{ marginBottom: "12px" }} />
          <p className="print-footer-main">بالهناء والشفاء</p>
          <p className="print-footer-sub">جميع الأسعار شاملة ضريبة القيمة المضافة • All prices include VAT</p>
        </div>
      </div>
    </>
  );
}

// ─── Section Component ────────────────────────────────────────────────────────
function PrintSection({ section }: { section: MenuSection }) {
  const items = section.items.filter(i => i.price > 0);
  if (!items.length) return null;
  return (
    <div className="print-section">
      <div className="print-section-header">
        <div className="print-section-icon">{getSectionIcon(section)}</div>
        <div>
          <p className="print-section-name-ar">{section.nameAr}</p>
          <p className="print-section-name-en">{section.nameEn}</p>
        </div>
      </div>
      {items.map(item => {
        const name = cleanName(item.name);
        const price = item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2);
        return (
          <div key={item.id} className="print-item">
            <div className="print-item-row">
              <span className="print-item-name">{name}</span>
              <span className="print-item-dots" />
              <span className="print-item-price">
                {price}<span className="print-item-currency"> د.إ</span>
              </span>
            </div>
            {item.descriptionAr && <p className="print-item-desc">{item.descriptionAr}</p>}
          </div>
        );
      })}
    </div>
  );
}
