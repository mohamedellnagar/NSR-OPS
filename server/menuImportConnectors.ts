/**
 * Menu Import Connectors
 * Connector-based approach for extracting restaurant menus from delivery platforms.
 *
 * Strategy:
 * - Talabat: قراءة __NEXT_DATA__ JSON مباشرة من الصفحة (بيانات كاملة 100%)
 * - Keeta/Noon: Puppeteer + AI extraction
 */

import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedMenuItem {
  name: string;
  nameAr?: string;
  description?: string;
  price: number;
  currency: string;
  imageUrl?: string;
  categoryName: string;
  isAvailable: boolean;
}

export interface ExtractedMenu {
  platform: "talabat" | "keeta" | "noon" | "unknown";
  restaurantName: string;
  restaurantNameAr?: string;
  restaurantLogoUrl?: string;
  sourceUrl: string;
  categories: string[];
  items: ExtractedMenuItem[];
  extractedAt: number;
  rawHtmlLength?: number;
}

export interface ConnectorResult {
  success: boolean;
  data?: ExtractedMenu;
  error?: string;
}

// ─── Platform Detection ───────────────────────────────────────────────────────

export function detectPlatform(url: string): "talabat" | "keeta" | "noon" | "unknown" {
  const u = url.toLowerCase();
  if (u.includes("talabat.com")) return "talabat";
  if (u.includes("keeta") || u.includes("keeta-global")) return "keeta";
  if (u.includes("noon.com")) return "noon";
  return "unknown";
}

// ─── Browser Helper ───────────────────────────────────────────────────────────

async function fetchPageHtml(url: string, platform: string): Promise<string> {
  const puppeteer = await import("puppeteer-core");

  const chromePaths = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  const { existsSync } = await import("fs");
  const executablePath = chromePaths.find(p => existsSync(p)) ?? "/usr/bin/chromium";

  const browser = await puppeteer.default.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--headless=new",
      "--lang=en-US,en",
      "--window-size=1280,900",
    ],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "ar,en;q=0.9" });

    if (platform === "talabat") {
      await page.setCookie(
        { name: "language", value: "ar", domain: ".talabat.com" },
        { name: "selected-country", value: "uae", domain: ".talabat.com" },
        { name: "areaId", value: "2", domain: ".talabat.com" }
      );
    }

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await new Promise((r) => setTimeout(r, 3000));

    const html = await page.content();
    return html;
  } finally {
    await browser.close();
  }
}

// ─── Talabat: __NEXT_DATA__ Extractor ────────────────────────────────────────
/**
 * طلبات تضع كل بيانات القائمة في script#__NEXT_DATA__ كـ JSON.
 * هذا يعطينا البيانات الكاملة 100% بدون أي قطع أو pagination.
 *
 * البنية:
 *   __NEXT_DATA__.props.pageProps.initialMenuState.menuData.items  → كل الأصناف
 *   __NEXT_DATA__.props.pageProps.initialMenuState.menuData.categories → الفئات
 *   __NEXT_DATA__.props.pageProps.initialMenuState.restaurant → بيانات المطعم
 *   __NEXT_DATA__.props.pageProps.initialMenuState.baseUrl → base URL للصور
 */
function extractTalabatFromNextData(html: string, sourceUrl: string): ExtractedMenu | null {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return null;

    const nextData = JSON.parse(match[1]);
    const ims = nextData?.props?.pageProps?.initialMenuState;
    if (!ims) return null;

    const menuData = ims.menuData;
    const restaurant = ims.restaurant;
    const baseUrl: string = ims.baseUrl || "https://images.deliveryhero.io/image/talabat/";
    const currency: string = ims.currentCountry?.currency || "AED";

    if (!menuData || !restaurant) return null;

    // ── Build category map from categories array ──
    const categoryMap: Record<number, string> = {};
    const categoryNames: string[] = [];

    for (const cat of (menuData.categories || [])) {
      // Skip virtual categories (id < 0 = "اختيارات على ذوقك" / "العروض")
      if (cat.id > 0) {
        categoryMap[cat.id] = cat.name?.trim() || "أخرى";
        if (!categoryNames.includes(cat.name?.trim())) {
          categoryNames.push(cat.name?.trim());
        }
      }
    }

    // Also add virtual categories if they have items
    for (const cat of (menuData.categories || [])) {
      if (cat.id <= 0 && cat.items?.length > 0) {
        const name = cat.name?.trim() || "عروض";
        categoryMap[cat.id] = name;
        if (!categoryNames.includes(name)) {
          categoryNames.push(name);
        }
      }
    }

    // ── Extract items ──
    const items: ExtractedMenuItem[] = [];

    // Use categories array (each category has its own items list with correct category assignment)
    for (const cat of (menuData.categories || [])) {
      const catName = cat.name?.trim() || "أخرى";
      for (const item of (cat.items || [])) {
        // Build full image URL
        let imageUrl: string | undefined;
        if (item.image) {
          imageUrl = item.image.startsWith("http")
            ? item.image
            : `${baseUrl}${item.image}`;
        }

        // Detect if name has both Arabic and English (common pattern: "عربي/English")
        const rawName: string = item.name || "";
        let nameAr: string | undefined;
        let nameEn = rawName;

        // If name contains "/" try to split Arabic/English
        if (rawName.includes("/")) {
          const parts = rawName.split("/");
          // Detect Arabic part (contains Arabic chars)
          const arabicPart = parts.find(p => /[\u0600-\u06FF]/.test(p))?.trim();
          const englishPart = parts.find(p => !/[\u0600-\u06FF]/.test(p))?.trim();
          if (arabicPart && englishPart) {
            nameAr = arabicPart;
            nameEn = englishPart;
          } else if (arabicPart) {
            nameAr = arabicPart;
            nameEn = arabicPart;
          }
        } else if (/[\u0600-\u06FF]/.test(rawName)) {
          // Fully Arabic name
          nameAr = rawName;
          nameEn = rawName;
        }

        items.push({
          name: nameEn,
          nameAr: nameAr,
          description: item.description || undefined,
          price: typeof item.price === "number" ? item.price : parseFloat(item.price) || 0,
          currency,
          imageUrl,
          categoryName: catName,
          isAvailable: true,
        });
      }
    }

    // Remove duplicates (items appear in "اختيارات" + their real category)
    const seen = new Set<string>();
    const uniqueItems: ExtractedMenuItem[] = [];
    for (const item of items) {
      const key = `${item.name}__${item.price}__${item.categoryName}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    }

    // Build logo URL
    let logoUrl: string | undefined;
    if (restaurant.logo) {
      logoUrl = restaurant.logo.startsWith("http")
        ? restaurant.logo
        : `${baseUrl}${restaurant.logo}`;
    }

    return {
      platform: "talabat",
      restaurantName: restaurant.name || "مطعم",
      restaurantNameAr: /[\u0600-\u06FF]/.test(restaurant.name || "") ? restaurant.name : undefined,
      restaurantLogoUrl: logoUrl,
      sourceUrl,
      categories: categoryNames,
      items: uniqueItems,
      extractedAt: Date.now(),
      rawHtmlLength: html.length,
    };
  } catch (err) {
    console.error("[Talabat] __NEXT_DATA__ parse error:", err);
    return null;
  }
}

// ─── AI Extraction (fallback for Keeta/Noon/Unknown) ─────────────────────────

async function extractMenuWithAI(html: string, url: string, platform: string): Promise<ExtractedMenu> {
  const cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Limit to 80k chars for better coverage
  const truncatedHtml = cleanHtml.substring(0, 80000);

  const systemPrompt = `You are a menu extraction specialist. Extract restaurant menu data from HTML pages of food delivery platforms.
Return ONLY valid JSON matching the exact schema provided. Do not add any explanation or markdown.`;

  const userPrompt = `Extract the restaurant menu from this HTML page from ${platform} (URL: ${url}).

Return JSON with this exact structure:
{
  "restaurantName": "string",
  "restaurantNameAr": "string or null",
  "restaurantLogoUrl": "string or null",
  "categories": ["category1", "category2"],
  "items": [
    {
      "name": "item name",
      "nameAr": "item name in Arabic or null",
      "description": "description or null",
      "price": 0.00,
      "currency": "AED",
      "imageUrl": "full image URL or null",
      "categoryName": "category this item belongs to",
      "isAvailable": true
    }
  ]
}

Rules:
- Extract ALL menu items visible in the HTML
- Use the actual prices shown (numbers only, no currency symbols)
- If price is not found, use 0
- Match each item to its category
- Extract image URLs as full absolute URLs
- If Arabic names are present, include them

HTML:
${truncatedHtml}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "menu_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            restaurantName: { type: "string" },
            restaurantNameAr: { type: ["string", "null"] },
            restaurantLogoUrl: { type: ["string", "null"] },
            categories: { type: "array", items: { type: "string" } },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  nameAr: { type: ["string", "null"] },
                  description: { type: ["string", "null"] },
                  price: { type: "number" },
                  currency: { type: "string" },
                  imageUrl: { type: ["string", "null"] },
                  categoryName: { type: "string" },
                  isAvailable: { type: "boolean" },
                },
                required: ["name", "nameAr", "description", "price", "currency", "imageUrl", "categoryName", "isAvailable"],
                additionalProperties: false,
              },
            },
          },
          required: ["restaurantName", "restaurantNameAr", "restaurantLogoUrl", "categories", "items"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response");

  const parsed = typeof content === "string" ? JSON.parse(content) : content;

  return {
    platform: platform as ExtractedMenu["platform"],
    restaurantName: parsed.restaurantName || "Unknown Restaurant",
    restaurantNameAr: parsed.restaurantNameAr || undefined,
    restaurantLogoUrl: parsed.restaurantLogoUrl || undefined,
    sourceUrl: url,
    categories: parsed.categories || [],
    items: (parsed.items || []).map((item: ExtractedMenuItem) => ({
      ...item,
      currency: item.currency || "AED",
      isAvailable: item.isAvailable !== false,
    })),
    extractedAt: Date.now(),
    rawHtmlLength: html.length,
  };
}

// ─── Talabat Connector ────────────────────────────────────────────────────────

async function talabatConnector(url: string): Promise<ConnectorResult> {
  try {
    const html = await fetchPageHtml(url, "talabat");

    // Primary: extract from __NEXT_DATA__ JSON (complete data, no truncation)
    const nextDataMenu = extractTalabatFromNextData(html, url);
    if (nextDataMenu && nextDataMenu.items.length > 0) {
      console.log(`[Talabat] __NEXT_DATA__ extraction: ${nextDataMenu.items.length} items, ${nextDataMenu.categories.length} categories`);
      return { success: true, data: nextDataMenu };
    }

    // Fallback: AI extraction from HTML
    console.log("[Talabat] __NEXT_DATA__ not found or empty, falling back to AI extraction");
    const menu = await extractMenuWithAI(html, url, "talabat");
    return { success: true, data: menu };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Keeta Connector ──────────────────────────────────────────────────────────

async function keetaConnector(url: string): Promise<ConnectorResult> {
  try {
    const html = await fetchPageHtml(url, "keeta");
    const menu = await extractMenuWithAI(html, url, "keeta");
    return { success: true, data: menu };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Noon Connector ───────────────────────────────────────────────────────────

async function noonConnector(url: string): Promise<ConnectorResult> {
  try {
    const html = await fetchPageHtml(url, "noon");
    const menu = await extractMenuWithAI(html, url, "noon");
    return { success: true, data: menu };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function importMenuFromUrl(url: string): Promise<ConnectorResult> {
  const platform = detectPlatform(url);

  switch (platform) {
    case "talabat":
      return talabatConnector(url);
    case "keeta":
      return keetaConnector(url);
    case "noon":
      return noonConnector(url);
    default:
      try {
        const html = await fetchPageHtml(url, "unknown");
        const menu = await extractMenuWithAI(html, url, "unknown");
        return { success: true, data: { ...menu, platform: "unknown" } };
      } catch (err: unknown) {
        return {
          success: false,
          error: `Unsupported platform. Supported: Talabat, Keeta, Noon. Error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
  }
}
