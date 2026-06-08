/**
 * cloudAutoSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs smartSyncFromCloud() automatically every minute, keeping the local DB
 * in sync with the cloud (TiDB) source. No-ops silently if CLOUD_DATABASE_URL
 * is not configured, or if a sync is already running (skips overlap).
 *
 * Can be paused/resumed at runtime (e.g. from the Settings page). The on/off
 * preference is persisted to a small JSON file so it survives server restarts.
 */
import fs from "fs";
import path from "path";
import { smartSyncFromCloud } from "./cloud-sync";

const INTERVAL_MS = 60 * 1000; // every 1 minute
const STATE_FILE = path.join(process.cwd(), ".cloud-auto-sync-state.json");

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;
let userEnabled = true;

function loadPersistedEnabled(): boolean {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed.enabled !== false;
  } catch {
    return true; // default: on
  }
}

function persistEnabled(enabled: boolean) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ enabled }), "utf-8");
  } catch (e) {
    console.warn("[CloudAutoSync] Could not persist on/off state:", e instanceof Error ? e.message : e);
  }
}

userEnabled = loadPersistedEnabled();

export interface AutoSyncStatus {
  configured: boolean;
  userEnabled: boolean;
  enabled: boolean;
  running: boolean;
  intervalMs: number;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastResult: { ok: boolean; tables: number; rows: number; durationMs: number; error?: string } | null;
  nextRunAt: string | null;
}

let lastRunAt: number | null = null;
let lastSuccessAt: number | null = null;
let lastResult: AutoSyncStatus["lastResult"] = null;

export function getAutoSyncStatus(): AutoSyncStatus {
  const configured = Boolean(process.env.CLOUD_DATABASE_URL);
  return {
    configured,
    userEnabled,
    enabled: configured && timer !== null,
    running: isRunning,
    intervalMs: INTERVAL_MS,
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
    lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
    lastResult,
    nextRunAt: lastRunAt && timer ? new Date(lastRunAt + INTERVAL_MS).toISOString() : null,
  };
}

async function runAutoSync() {
  if (isRunning) {
    console.log("[CloudAutoSync] Previous sync still running — skipping this tick.");
    return;
  }
  if (!process.env.CLOUD_DATABASE_URL) {
    return; // not configured — stay silent
  }

  isRunning = true;
  const startedAt = Date.now();
  lastRunAt = startedAt;
  try {
    const result = await smartSyncFromCloud();
    const totalRows = result.tables.reduce((sum, t) => sum + (t.rows || 0), 0);
    const durationMs = Date.now() - startedAt;
    lastSuccessAt = Date.now();
    lastResult = { ok: true, tables: result.tables.length, rows: totalRows, durationMs };
    console.log(
      `[CloudAutoSync] ✓ Synced ${result.tables.length} tables, ${totalRows} rows in ${(durationMs / 1000).toFixed(1)}s`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastResult = { ok: false, tables: 0, rows: 0, durationMs: Date.now() - startedAt, error: message };
    console.error("[CloudAutoSync] ✗ Sync failed:", message);
  } finally {
    isRunning = false;
  }
}

function armTimer() {
  if (timer) return; // already armed
  if (!process.env.CLOUD_DATABASE_URL) {
    console.log("[CloudAutoSync] CLOUD_DATABASE_URL not set — auto sync disabled.");
    return;
  }
  console.log("[CloudAutoSync] Starting — syncing from cloud every minute.");
  timer = setInterval(runAutoSync, INTERVAL_MS);
  // Run once shortly after startup too.
  setTimeout(runAutoSync, 10_000);
}

function disarmTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log("[CloudAutoSync] Stopped.");
  }
}

export function startCloudAutoSync() {
  if (!userEnabled) {
    console.log("[CloudAutoSync] Disabled by user preference — not starting.");
    return;
  }
  armTimer();
}

export function stopCloudAutoSync() {
  disarmTimer();
}

/** Toggle the auto-sync on/off at runtime, persisting the preference to disk. */
export function setAutoSyncEnabled(enabled: boolean) {
  userEnabled = enabled;
  persistEnabled(enabled);
  if (enabled) {
    armTimer();
  } else {
    disarmTimer();
  }
}
