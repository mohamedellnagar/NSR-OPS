import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  UtensilsCrossed, Salad, Coffee, Wine, IceCream, Soup,
  Sandwich, Pizza, Fish, Beef, Wheat, Cookie, Flame,
  Apple, Leaf, Star, Utensils, CupSoda, Cake, Egg,
  Drumstick, Milk, Carrot, Citrus, ChefHat, Shell, Search, X,
  Phone, MapPin, ChevronUp,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface MenuItem {
  id: number;
  name: string;
  price: number;
  calories?: number | null;
  descriptionAr?: string | null;
}
interface MenuSection {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  items: MenuItem[];
}
interface MenuData { sections: MenuSection[]; }

// ─── Icon Map ─────────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ReactNode> = {
  appetizers:   <Salad className="w-5 h-5" />,
  starters:     <Salad className="w-5 h-5" />,
  salads:       <Salad className="w-5 h-5" />,
  soups:        <Soup className="w-5 h-5" />,
  mains:        <UtensilsCrossed className="w-5 h-5" />,
  main_courses: <UtensilsCrossed className="w-5 h-5" />,
  main_dish:    <UtensilsCrossed className="w-5 h-5" />,
  grills:       <Flame className="w-5 h-5" />,
  grilled:      <Flame className="w-5 h-5" />,
  bbq:          <Flame className="w-5 h-5" />,
  charcoal:     <Flame className="w-5 h-5" />,
  sandwiches:   <Sandwich className="w-5 h-5" />,
  burgers:      <Sandwich className="w-5 h-5" />,
  pizza:        <Pizza className="w-5 h-5" />,
  seafood:      <Fish className="w-5 h-5" />,
  fish:         <Fish className="w-5 h-5" />,
  meat:         <Beef className="w-5 h-5" />,
  chicken:      <Drumstick className="w-5 h-5" />,
  poultry:      <Drumstick className="w-5 h-5" />,
  pasta:        <Wheat className="w-5 h-5" />,
  rice:         <Wheat className="w-5 h-5" />,
  bread:        <Wheat className="w-5 h-5" />,
  desserts:     <IceCream className="w-5 h-5" />,
  sweets:       <IceCream className="w-5 h-5" />,
  cakes:        <Cake className="w-5 h-5" />,
  pastry:       <Cookie className="w-5 h-5" />,
  beverages:    <Coffee className="w-5 h-5" />,
  drinks:       <CupSoda className="w-5 h-5" />,
  hot_drinks:   <Coffee className="w-5 h-5" />,
  cold_drinks:  <CupSoda className="w-5 h-5" />,
  juices:       <CupSoda className="w-5 h-5" />,
  coffee:       <Coffee className="w-5 h-5" />,
  tea:          <Coffee className="w-5 h-5" />,
  wine:         <Wine className="w-5 h-5" />,
  breakfast:    <Egg className="w-5 h-5" />,
  dairy:        <Milk className="w-5 h-5" />,
  vegan:        <Leaf className="w-5 h-5" />,
  vegetarian:   <Leaf className="w-5 h-5" />,
  healthy:      <Apple className="w-5 h-5" />,
  specials:     <Star className="w-5 h-5" />,
  special:      <Star className="w-5 h-5" />,
  sides:        <Carrot className="w-5 h-5" />,
  extras:       <Carrot className="w-5 h-5" />,
  sauces:       <Shell className="w-5 h-5" />,
  fruits:       <Citrus className="w-5 h-5" />,
};

function getSectionIcon(section: MenuSection): React.ReactNode {
  if (ICON_MAP[section.id]) return ICON_MAP[section.id];
  const iconKey = (section.icon || "").toLowerCase().trim();
  if (iconKey && ICON_MAP[iconKey]) return ICON_MAP[iconKey];
  const combined = `${section.id} ${section.nameEn}`.toLowerCase();
  for (const key of Object.keys(ICON_MAP)) {
    if (combined.includes(key.replace(/_/g, " "))) return ICON_MAP[key];
  }
  return <Utensils className="w-5 h-5" />;
}

function cleanName(name: string): string {
  return name.replace(/^\d+\s+/, "").trim();
}

// ─── Menu Item Card ───────────────────────────────────────────────────────────
function MenuItemCard({ item }: { item: MenuItem }) {
  const name = cleanName(item.name);
  const priceStr = item.price % 1 === 0 ? item.price.toFixed(0) : item.price.toFixed(2);
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "12px",
      padding: "14px 0",
      borderBottom: "1px solid rgba(180,120,40,0.12)",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'Cairo', sans-serif",
          fontWeight: 700,
          fontSize: "0.95rem",
          color: "#1a0e06",
          lineHeight: 1.3,
          marginBottom: item.descriptionAr ? "4px" : 0,
        }}>{name}</p>
        {item.descriptionAr && (
          <p style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: "0.78rem",
            color: "#8a6a50",
            lineHeight: 1.45,
          }}>{item.descriptionAr}</p>
        )}
        {item.calories && (
          <p style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: "0.68rem",
            color: "#b88040",
            marginTop: "3px",
          }}>{item.calories} سعرة حرارية</p>
        )}
      </div>
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        flexShrink: 0,
      }}>
        <div style={{
          background: "linear-gradient(135deg, #4a2008, #8B4513)",
          borderRadius: "20px",
          padding: "5px 14px",
          display: "flex",
          alignItems: "center",
          gap: "3px",
          boxShadow: "0 2px 8px rgba(74,32,8,0.25)",
        }}>
          <span style={{
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 800,
            fontSize: "0.95rem",
            color: "#ffd880",
            direction: "ltr",
            letterSpacing: "0.02em",
          }}>{priceStr}</span>
          <span style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: "0.68rem",
            color: "rgba(255,216,128,0.8)",
            fontWeight: 600,
          }}>د.إ</span>
        </div>
      </div>
    </div>
  );
}

// ─── Section Block ────────────────────────────────────────────────────────────
function SectionBlock({
  section,
  sectionRef,
}: {
  section: MenuSection;
  sectionRef: React.RefObject<HTMLDivElement>;
}) {
  const icon = getSectionIcon(section);
  const items = section.items.filter(i => i.price > 0);
  if (!items.length) return null;

  return (
    <div ref={sectionRef} style={{ marginBottom: "8px" }}>
      {/* Section Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "20px 20px 0",
        marginBottom: "4px",
      }}>
        <div style={{
          width: "42px",
          height: "42px",
          borderRadius: "12px",
          background: "linear-gradient(135deg, #fdf0d8, #f5d9a8)",
          border: "1.5px solid rgba(180,120,40,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7a3510",
          flexShrink: 0,
          boxShadow: "0 2px 8px rgba(120,60,16,0.12)",
        }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{
            fontFamily: "'Cairo', sans-serif",
            fontWeight: 800,
            fontSize: "1.1rem",
            color: "#3a1a06",
            lineHeight: 1.2,
          }}>{section.nameAr}</h2>
          <p style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: "0.65rem",
            color: "#b06020",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginTop: "1px",
          }}>{section.nameEn}</p>
        </div>
        <div style={{
          fontFamily: "'Cairo', sans-serif",
          fontSize: "0.72rem",
          color: "#b06020",
          background: "rgba(180,120,40,0.1)",
          borderRadius: "20px",
          padding: "2px 10px",
          flexShrink: 0,
        }}>{items.length} صنف</div>
      </div>

      {/* Decorative line */}
      <div style={{
        height: "2px",
        margin: "8px 20px 0",
        background: "linear-gradient(90deg, #c4722a, rgba(196,114,42,0.3), transparent)",
        borderRadius: "1px",
      }} />

      {/* Items */}
      <div style={{ padding: "0 20px" }}>
        {items.map(item => <MenuItemCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

// ─── Category Tab ─────────────────────────────────────────────────────────────
function CategoryTab({
  section,
  active,
  onClick,
}: {
  section: MenuSection;
  active: boolean;
  onClick: () => void;
}) {
  const icon = getSectionIcon(section);
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        padding: "10px 14px",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        flexShrink: 0,
        position: "relative",
        transition: "all 0.2s ease",
        minWidth: "70px",
      }}
    >
      <div style={{
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        background: active
          ? "linear-gradient(135deg, #4a2008, #8B4513)"
          : "rgba(180,120,40,0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: active ? "#ffd880" : "#8B4513",
        transition: "all 0.2s ease",
        boxShadow: active ? "0 3px 10px rgba(74,32,8,0.3)" : "none",
      }}>{icon}</div>
      <span style={{
        fontFamily: "'Cairo', sans-serif",
        fontSize: "0.65rem",
        fontWeight: active ? 700 : 500,
        color: active ? "#4a2008" : "#8a6a50",
        textAlign: "center",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        maxWidth: "70px",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>{section.nameAr}</span>
      {active && (
        <div style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "24px",
          height: "3px",
          borderRadius: "2px",
          background: "linear-gradient(90deg, #4a2008, #c8902a)",
        }} />
      )}
    </button>
  );
}

// ─── Main Public Menu Page ────────────────────────────────────────────────────
export default function PublicMenuPage() {
  const [matchLive, liveParams]    = useRoute("/menu/live/:token");
  const [matchDefault]             = useRoute("/m");
  const [, params]                 = useRoute("/menu/:token");

  const token  = (matchLive ? liveParams?.token : params?.token) ?? "";
  const isLive = !!matchLive;
  const isDefault = !!matchDefault; // /menu بدون token

  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>("");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const sectionRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});
  const tabsRef = useRef<HTMLDivElement>(null);

  // Default menu query (للرابط البسيط /menu)
  const { data: defaultMenu, isLoading: defaultLoading, error: defaultError } = trpc.menu.getDefault.useQuery(
    undefined,
    { enabled: isDefault, retry: 1, refetchInterval: 30000 }
  );
  const { data: liveMenu, isLoading: liveLoading, error: liveError } = trpc.menu.getByLiveToken.useQuery(
    { token },
    { enabled: !!token && isLive, retry: 1, refetchInterval: 30000 }
  );
  const { data: savedMenuData, isLoading: savedLoading, error: savedError } = trpc.menu.getPublic.useQuery(
    { token },
    { enabled: !!token && !isLive && !isDefault, retry: 1 }
  );

  const savedMenu = isDefault ? defaultMenu : isLive ? liveMenu : savedMenuData;
  const isLoading = isDefault ? defaultLoading : isLive ? liveLoading : savedLoading;
  const error     = isDefault ? defaultError   : isLive ? liveError   : savedError;

  const menuData: MenuData | null = useMemo(() => {
    if (!savedMenu?.menuData) return null;
    try { return JSON.parse(savedMenu.menuData) as MenuData; } catch { return null; }
  }, [savedMenu]);

  const sections = useMemo(() => {
    return (menuData?.sections ?? []).filter(s => s.items.some(i => i.price > 0));
  }, [menuData]);

  // Search filter
  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const q = search.toLowerCase().trim();
    return sections.map(s => ({
      ...s,
      items: s.items.filter(i =>
        cleanName(i.name).toLowerCase().includes(q) ||
        (i.descriptionAr ?? "").toLowerCase().includes(q)
      ),
    })).filter(s => s.items.length > 0);
  }, [sections, search]);

  // Build section refs
  useEffect(() => {
    sections.forEach(s => {
      if (!sectionRefs.current[s.id]) {
        sectionRefs.current[s.id] = { current: null } as unknown as React.RefObject<HTMLDivElement>;
      }
    });
    if (sections.length > 0 && !activeSection) {
      setActiveSection(sections[0].id);
    }
  }, [sections]);

  // Scroll spy — detect which section is in view
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
      // Find active section based on scroll position
      let current = "";
      for (const s of sections) {
        const ref = sectionRefs.current[s.id];
        if (ref?.current) {
          const rect = ref.current.getBoundingClientRect();
          if (rect.top <= 160) current = s.id;
        }
      }
      if (current && current !== activeSection) {
        setActiveSection(current);
        // Scroll the tab into view
        const tabEl = tabsRef.current?.querySelector(`[data-tab="${current}"]`);
        tabEl?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections, activeSection]);

  const scrollToSection = useCallback((id: string) => {
    setActiveSection(id);
    setSearch("");
    const ref = sectionRefs.current[id];
    if (ref?.current) {
      const top = ref.current.getBoundingClientRect().top + window.scrollY - 130;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  const restaurantName = savedMenu?.restaurantName || "قائمة الطعام";

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #fdf8f0 0%, #f5e8c8 100%)",
      gap: "20px",
      fontFamily: "'Cairo', sans-serif",
      direction: "rtl",
    }}>
      <style>{FONTS_CSS}</style>
      <div style={{
        width: "64px", height: "64px",
        borderRadius: "50%",
        border: "4px solid rgba(180,120,40,0.2)",
        borderTopColor: "#8B4513",
        animation: "spin 0.9s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#5c2d0a" }}>جاري تحميل القائمة...</p>
        <p style={{ fontSize: "0.8rem", color: "#b06020", marginTop: "4px" }}>يرجى الانتظار</p>
      </div>
    </div>
  );

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !savedMenu || !menuData) return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #fdf8f0 0%, #f5e8c8 100%)",
      gap: "16px",
      fontFamily: "'Cairo', sans-serif",
      direction: "rtl",
      padding: "20px",
      textAlign: "center",
    }}>
      <style>{FONTS_CSS}</style>
      <div style={{
        width: "80px", height: "80px",
        borderRadius: "50%",
        background: "rgba(180,120,40,0.1)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ChefHat style={{ width: "40px", height: "40px", color: "#8B4513" }} />
      </div>
      <p style={{ fontSize: "1.4rem", fontWeight: 700, color: "#5c2d0a" }}>القائمة غير متاحة</p>
      <p style={{ fontSize: "0.9rem", color: "#b06020" }}>هذا الرابط غير صالح أو تم حذفه</p>
    </div>
  );

  // ── Main Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{FONTS_CSS + PRINT_CSS}</style>

      <div style={{
        minHeight: "100vh",
        background: "#f7f0e6",
        direction: "rtl",
        fontFamily: "'Cairo', sans-serif",
      }}>

        {/* ── Sticky Header ── */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "linear-gradient(135deg, #3a1505 0%, #6b2c0a 40%, #a05018 75%, #c8902a 100%)",
          boxShadow: "0 4px 20px rgba(50,20,5,0.35)",
        }}>
          <div style={{
            maxWidth: "680px",
            margin: "0 auto",
            padding: "16px 20px 12px",
            textAlign: "center",
            position: "relative",
          }}>
            {/* Subtle pattern overlay */}
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: "radial-gradient(circle at 20% 50%, rgba(255,255,255,0.04) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.04) 0%, transparent 50%)",
              pointerEvents: "none",
            }} />

            {/* Restaurant Name */}
            <h1 style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              fontSize: "clamp(1.5rem, 5vw, 2rem)",
              color: "#ffd880",
              letterSpacing: "0.05em",
              textShadow: "0 2px 12px rgba(0,0,0,0.4)",
              lineHeight: 1.15,
              position: "relative",
            }}>{restaurantName}</h1>

            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: "0.62rem",
              color: "rgba(255,216,128,0.7)",
              letterSpacing: "0.28em",
              textTransform: "uppercase",
              marginTop: "3px",
              position: "relative",
            }}>RESTAURANT &amp; CUISINE</p>

            {/* Ornament */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "10px", marginTop: "10px", position: "relative",
            }}>
              <div style={{ flex: 1, maxWidth: "80px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,215,120,0.5))" }} />
              <span style={{ color: "#ffd880", fontSize: "0.55rem", letterSpacing: "0.3em" }}>◆ ◆ ◆</span>
              <div style={{ flex: 1, maxWidth: "80px", height: "1px", background: "linear-gradient(90deg, rgba(255,215,120,0.5), transparent)" }} />
            </div>
          </div>

          {/* ── Category Tabs ── */}
          {!search && sections.length > 1 && (
            <div
              ref={tabsRef}
              style={{
                display: "flex",
                overflowX: "auto",
                background: "rgba(255,255,255,0.97)",
                borderTop: "1px solid rgba(180,120,40,0.2)",
                scrollbarWidth: "none",
                padding: "0 4px",
                gap: "0",
              }}
            >
              <style>{`div::-webkit-scrollbar { display: none; }`}</style>
              {sections.map(s => (
                <div key={s.id} data-tab={s.id}>
                  <CategoryTab
                    section={s}
                    active={activeSection === s.id}
                    onClick={() => scrollToSection(s.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Search Bar ── */}
        <div style={{
          maxWidth: "680px",
          margin: "0 auto",
          padding: "14px 16px 4px",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "#fff",
            borderRadius: "14px",
            padding: "10px 16px",
            boxShadow: "0 2px 12px rgba(120,60,16,0.1)",
            border: "1.5px solid rgba(180,120,40,0.15)",
          }}>
            <Search style={{ width: "16px", height: "16px", color: "#b06020", flexShrink: 0 }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث عن صنف..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "'Cairo', sans-serif",
                fontSize: "0.9rem",
                color: "#3a1a06",
                direction: "rtl",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  border: "none", background: "transparent", cursor: "pointer",
                  color: "#b06020", padding: "0", display: "flex",
                }}
              >
                <X style={{ width: "15px", height: "15px" }} />
              </button>
            )}
          </div>
        </div>

        {/* ── Menu Sections ── */}
        <div style={{ maxWidth: "680px", margin: "0 auto", paddingBottom: "80px" }}>

          {filteredSections.length === 0 ? (
            <div style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "#b06020",
            }}>
              <UtensilsCrossed style={{ width: "48px", height: "48px", margin: "0 auto 16px", opacity: 0.3 }} />
              <p style={{ fontFamily: "'Cairo', sans-serif", fontSize: "1rem", fontWeight: 600 }}>
                لا توجد نتائج لـ "{search}"
              </p>
            </div>
          ) : filteredSections.map(section => (
            <div
              key={section.id}
              ref={(el) => {
                if (!sectionRefs.current[section.id]) {
                  sectionRefs.current[section.id] = { current: null } as unknown as React.RefObject<HTMLDivElement>;
                }
                (sectionRefs.current[section.id] as any).current = el;
              }}
              style={{
                background: "#fff",
                borderRadius: "16px",
                margin: "12px 16px 0",
                boxShadow: "0 2px 16px rgba(120,60,16,0.08)",
                border: "1px solid rgba(180,120,40,0.1)",
                overflow: "hidden",
              }}
            >
              <SectionBlock
                section={section}
                sectionRef={sectionRefs.current[section.id] as React.RefObject<HTMLDivElement>}
              />
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{
          background: "linear-gradient(135deg, #3a1505, #6b2c0a)",
          padding: "28px 20px",
          textAlign: "center",
          marginTop: "8px",
        }}>
          {/* Ornament */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "14px" }}>
            <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "linear-gradient(90deg, transparent, rgba(255,215,120,0.4))" }} />
            <span style={{ color: "#ffd880", fontSize: "0.55rem", letterSpacing: "0.3em" }}>◆ ◆ ◆</span>
            <div style={{ flex: 1, maxWidth: "60px", height: "1px", background: "linear-gradient(90deg, rgba(255,215,120,0.4), transparent)" }} />
          </div>

          <p style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "#ffd880",
            marginBottom: "6px",
          }}>بالهناء والشفاء</p>

          <p style={{
            fontFamily: "'Cairo', sans-serif",
            fontSize: "0.75rem",
            color: "rgba(255,215,120,0.6)",
            marginBottom: "4px",
          }}>جميع الأسعار بالدرهم الإماراتي وتشمل ضريبة القيمة المضافة</p>

          {isLive && (
            <p style={{
              fontFamily: "'Cairo', sans-serif",
              fontSize: "0.65rem",
              color: "rgba(255,215,120,0.4)",
              marginTop: "8px",
            }}>🔄 قائمة مباشرة — تتحدث تلقائياً</p>
          )}
        </div>

        {/* ── Back to Top Button ── */}
        {showBackToTop && (
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            style={{
              position: "fixed",
              bottom: "24px",
              left: "50%",
              transform: "translateX(-50%)",
              background: "linear-gradient(135deg, #4a2008, #8B4513)",
              border: "none",
              borderRadius: "24px",
              padding: "10px 20px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              cursor: "pointer",
              boxShadow: "0 4px 20px rgba(74,32,8,0.4)",
              color: "#ffd880",
              fontFamily: "'Cairo', sans-serif",
              fontSize: "0.8rem",
              fontWeight: 700,
              zIndex: 100,
              animation: "fadeIn 0.3s ease",
            }}
          >
            <ChevronUp style={{ width: "16px", height: "16px" }} />
            العودة للأعلى
          </button>
        )}
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
      </div>
    </>
  );
}

// ─── Fonts ────────────────────────────────────────────────────────────────────
const FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800;900&display=swap');
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap');
`;

// ─── Print CSS ────────────────────────────────────────────────────────────────
const PRINT_CSS = `
  @media print {
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

    html, body {
      background: white !important;
      margin: 0 !important; padding: 0 !important;
      width: 100% !important;
    }

    /* Hide interactive elements */
    button, input, [style*="position: fixed"] { display: none !important; }

    /* Hide sticky tabs bar but keep header */
    div[style*="position: sticky"] > div:last-child { display: none !important; }
    div[style*="position: sticky"] > div:first-child { display: block !important; }

    /* Layout: single column for print */
    div[style*="max-width: 680px"] {
      max-width: 100% !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    /* Section cards: remove shadows, make full width */
    div[style*="border-radius: 16px"] {
      border-radius: 0 !important;
      box-shadow: none !important;
      border: none !important;
      border-bottom: 1px solid rgba(200,144,42,0.15) !important;
      margin: 0 !important;
    }

    /* Background sections */
    div[style*="background: #f7f0e6"] {
      background: white !important;
      padding-bottom: 0 !important;
    }

    /* Page breaks */
    div[style*="marginBottom: 8px"] { break-inside: avoid !important; }

    @page {
      size: A4 portrait;
      margin: 1.2cm 1.4cm;
    }
  }
`;
