import "dotenv/config";
import express from "express";
import { startScheduler } from "../whatsappScheduler";
import { startCloudAutoSync } from "../cloudAutoSync";
import { handleWhatsAppWebhook, handleWebhookHealthCheck, captureRawBody } from "../waWebhookController";
import { handleSseConnection } from "../sseBroadcaster";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

// ─── Security: JWT_SECRET enforcement ────────────────────────────────────────
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  console.error("[SECURITY] JWT_SECRET environment variable is required in production!");
  process.exit(1);
}

// ─── Security: In-memory Login Rate Limiter ───────────────────────────────────
// Max 5 failed attempts per IP in 15 minutes → lock for 15 minutes
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterSecs?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry?.lockedUntil) {
    if (now < entry.lockedUntil) {
      return { allowed: false, retryAfterSecs: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    loginAttempts.delete(ip);
  }

  return { allowed: true };
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return;
  }

  entry.count++;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    console.warn(`[Security] Login rate limit exceeded for IP: ${ip} — locked for 15 min`);
  }
}

export function recordLoginSuccess(ip: string): void {
  loginAttempts.delete(ip);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ⚠️ WhatsApp Webhook endpoints MUST be registered BEFORE express.json()
  // because captureRawBody reads the raw stream directly.
  // If express.json() runs first, it consumes the stream and captureRawBody hangs.
  app.post("/api/webhook/whatsapp/:instance", captureRawBody, handleWhatsAppWebhook);
  app.get("/api/webhook/whatsapp/:instance/health", handleWebhookHealthCheck);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // PDF export endpoint for invoices
  const STATUS_LABELS_PDF: Record<string, string> = { paid: "مدفوع", deferred: "مؤجل", partial: "جزئي", under_review: "التدقيق" };
  app.get("/api/pdf/invoices", async (req, res) => {
    try {
      const { listInvoices } = await import("../db");
      const { generateInvoicesPDF } = await import("../pdfGenerator");

      const { paymentStatus, supplierId, month, dateFrom, dateTo } = req.query as Record<string, string>;

      const filters: Parameters<typeof listInvoices>[0] = { limit: 10000 };
      if (paymentStatus && ["paid", "deferred", "partial", "under_review"].includes(paymentStatus))
        filters.paymentStatus = paymentStatus as any;
      if (supplierId) filters.supplierId = Number(supplierId);
      if (month) filters.month = month;
      if (dateFrom && !month) filters.dateFrom = new Date(dateFrom);
      if (dateTo && !month) filters.dateTo = new Date(dateTo);

      const invoicesList = await listInvoices(filters);

      // Build filter label for PDF header
      const parts: string[] = [];
      if (paymentStatus && paymentStatus !== "all") parts.push(STATUS_LABELS_PDF[paymentStatus] ?? paymentStatus);
      if (month) parts.push(`شهر ${month}`);
      if (dateFrom) parts.push(`من ${dateFrom}`);
      if (dateTo) parts.push(`إلى ${dateTo}`);
      const filterLabel = parts.join(" | ");

      const pdfBuffer = await generateInvoicesPDF(invoicesList as any, filterLabel);
      const filename = `invoices-${Date.now()}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Invoices PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });

  // Excel export endpoint for all invoices (supplier + free)
  app.get("/api/excel/invoices", async (req, res) => {
    try {
      const { generateInvoicesExcel } = await import("../excelGenerator");
      const { status, dateFrom, dateTo } = req.query as Record<string, string>;
      const filters: { dateFrom?: string; dateTo?: string; status?: string } = {};
      if (status && status !== "all") filters.status = status;
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;
      const excelBuffer = await generateInvoicesExcel(filters);
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, "0");
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const yyyy = today.getFullYear();
      const filename = `invoices-${yyyy}${mm}${dd}.xlsx`;
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(excelBuffer);
    } catch (err) {
      console.error("Invoices Excel generation error:", err);
      res.status(500).json({ error: "Failed to generate Excel" });
    }
  });

  // PDF export endpoint for semi-finished materials
  app.get("/api/pdf/semi-finished", async (_req, res) => {
    try {
      const { generateSemiFinishedPDF } = await import("../pdfGenerator");
      const pdfBuffer = await generateSemiFinishedPDF();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="semi-finished-materials.pdf"');
      res.send(pdfBuffer);
    } catch (err) {
      console.error("PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  });
  // PDF export endpoint for individual recipe cost card
  app.get("/api/pdf/recipe/:productId", async (req, res) => {
    try {
      const productId = parseInt(req.params.productId, 10);
      if (isNaN(productId)) return res.status(400).json({ error: "Invalid product ID" });
      const { generateRecipeCostCard } = await import("../pdfGenerator");
      const pdfBuffer = await generateRecipeCostCard(productId);
      const filename = `recipe-cost-card-${productId}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("Recipe PDF generation error:", err);
      res.status(500).json({ error: "Failed to generate recipe PDF" });
    }
  });

  // SSE endpoint for real-time dashboard updates
  app.get("/api/sse/wa-events", handleSseConnection);

  // ── Data Export endpoint (for offline sync) ───────────────────────────────
  // GET /api/export-sync-data?token=SYNC_TOKEN
  // Returns JSON with invoices, raw_materials quantities, kitchen_production, daily_accounts
  app.get("/api/export-sync-data", async (req, res) => {
    try {
      const { exportSyncData } = await import("../sync-export");
      const data = await exportSyncData();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="sync-${new Date().toISOString().slice(0,10)}.json"`);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start WhatsApp report scheduler
    startScheduler();
    // Start automatic cloud sync (every minute, if CLOUD_DATABASE_URL is set)
    startCloudAutoSync();
  });
}

startServer().catch(console.error);
