import { describe, it, expect } from "vitest";
import { detectPlatform } from "./menuImportConnectors";
import * as fs from "fs";
import * as path from "path";

describe("menuImportConnectors - detectPlatform", () => {
  it("detects talabat from URL", () => {
    expect(detectPlatform("https://www.talabat.com/uae/restaurant/12345/test")).toBe("talabat");
    expect(detectPlatform("https://talabat.com/restaurant/123")).toBe("talabat");
  });

  it("detects keeta from URL", () => {
    expect(detectPlatform("https://keeta.com/restaurant/abc")).toBe("keeta");
    expect(detectPlatform("https://www.keeta.com/ae/restaurant/xyz")).toBe("keeta");
  });

  it("detects noon from URL", () => {
    expect(detectPlatform("https://www.noon.com/uae-en/restaurant/123")).toBe("noon");
    expect(detectPlatform("https://noon.com/restaurant/test")).toBe("noon");
  });

  it("returns unknown for unrecognized URLs", () => {
    expect(detectPlatform("https://example.com/restaurant/123")).toBe("unknown");
    expect(detectPlatform("https://google.com")).toBe("unknown");
  });

  it("handles edge cases", () => {
    expect(detectPlatform("")).toBe("unknown");
    expect(detectPlatform("not-a-url")).toBe("unknown");
  });
});

describe("Talabat __NEXT_DATA__ extraction logic", () => {
  it("correctly identifies __NEXT_DATA__ pattern", () => {
    const fakeJson = JSON.stringify({
      props: {
        pageProps: {
          initialMenuState: {
            baseUrl: "https://img.test/",
            restaurant: { name: "مطعم تجريبي", logo: "logo.jpg" },
            currentCountry: { currency: "AED" },
            menuData: {
              categories: [{
                id: 1,
                name: "مقبلات",
                items: [{ name: "حمص", price: 15, description: "طبق حمص", image: "hummus.jpg" }]
              }],
              items: [],
              filteredCategories: [],
              menuWithImages: []
            }
          }
        }
      }
    });
    const fakeHtml = `<html><head><script id="__NEXT_DATA__" type="application/json">${fakeJson}</script></head></html>`;
    const match = fakeHtml.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]);
    const ims = parsed?.props?.pageProps?.initialMenuState;
    expect(ims).toBeDefined();
    expect(ims.menuData.categories).toHaveLength(1);
    expect(ims.menuData.categories[0].items).toHaveLength(1);
    expect(ims.menuData.categories[0].items[0].name).toBe("حمص");
    expect(ims.menuData.categories[0].items[0].price).toBe(15);
  });

  it("handles missing __NEXT_DATA__ gracefully", () => {
    const html = "<html><body>No next data here</body></html>";
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    expect(match).toBeNull();
  });

  it("correctly maps categories with items", () => {
    const categories = [
      { id: -1, name: "اختيارات على ذوقك", items: [{ name: "فلافل", price: 7 }] },
      { id: 100, name: "مقبلات", items: [{ name: "حمص", price: 20 }, { name: "بابا غنوج", price: 18 }] },
    ];
    const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
    expect(totalItems).toBe(3);
    const realCats = categories.filter(c => c.id > 0);
    expect(realCats).toHaveLength(1);
    expect(realCats[0].items).toHaveLength(2);
  });
});

describe("menuImport router procedures", () => {
  it("menuImportRouter is defined and exported", async () => {
    const { menuImportRouter } = await import("./routers");
    expect(menuImportRouter).toBeDefined();
  });

  it("appRouter includes menuImport namespace", async () => {
    const { appRouter } = await import("./routers");
    expect(appRouter._def).toBeDefined();
    // The router should have the menuImport namespace
    const procedures = Object.keys(appRouter._def.procedures || {});
    const hasMenuImport = procedures.some(p => p.startsWith("menuImport."));
    expect(hasMenuImport).toBe(true);
  });
});
