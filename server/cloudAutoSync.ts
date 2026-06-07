/**
 * cloudAutoSync.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs smartSyncFromCloud() automatically every minute, keeping the local DB
 * in sync with the cloud (TiDB) source. No-ops silently if CLOUD_DATABASE_URL
 * is not configured, or if a sync is already running (skips overlap).
 */
import { smartSyncFromCloud } from "./cloud-sync";

const INTERVAL_MS = 60 * 1000; // every 1 minute

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

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
  try {
    const result = await smartSyncFromCloud();
    const totalRows = result.tables.reduce((sum, t) => sum + (t.rows || 0), 0);
    console.log(
      `[CloudAutoSync] ✓ Synced ${result.tables.length} tables, ${totalRows} rows in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
    );
  } catch (error) {
    console.error("[CloudAutoSync] ✗ Sync failed:", error instanceof Error ? error.message : error);
  } finally {
    isRunning = false;
  }
}

export function startCloudAutoSync() {
  if (timer) return; // already started
  if (!process.env.CLOUD_DATABASE_URL) {
    console.log("[CloudAutoSync] CLOUD_DATABASE_URL not set — auto sync disabled.");
    return;
  }

  console.log("[CloudAutoSync] Starting — syncing from cloud every minute.");
  timer = setInterval(runAutoSync, INTERVAL_MS);
  // Run once shortly after startup too.
  setTimeout(runAutoSync, 10_000);
}

export function stopCloudAutoSync() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
