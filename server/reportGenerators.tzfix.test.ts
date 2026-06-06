/**
 * Test: resolveVariables uses '+04:00' (Dubai calendar time) not business day offset
 * This ensures WhatsApp template preview numbers match the DashboardPage table numbers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('reportGenerators tzOffset fix', () => {
  it('resolveVariables should use +04:00 (not getBusinessDayTzOffset) for DB queries', () => {
    // Read the source file and verify the fix is in place
    const srcPath = path.resolve(__dirname, './reportGenerators.ts');
    const src = fs.readFileSync(srcPath, 'utf-8');

    // The tzOffset in resolveVariables should be hardcoded to '+04:00'
    expect(src).toContain("const tzOffset = '+04:00';");

    // It should NOT use getBusinessDayTzOffset() inside resolveVariables body
    // (it's still used in businessTodayStr which is fine)
    // Find the resolveVariables function body
    const resolveStart = src.indexOf('async function resolveVariables(');
    const resolveEnd = src.indexOf('\nexport async function applyTemplateAsync', resolveStart);
    const resolveBody = src.slice(resolveStart, resolveEnd);

    // Should NOT call getBusinessDayTzOffset inside resolveVariables
    expect(resolveBody).not.toContain('await getBusinessDayTzOffset()');

    // Should use '+04:00' hardcoded
    expect(resolveBody).toContain("'+04:00'");
  });

  it('resolveVariables should use calcKitchenPullRawCost for kitchen cost calculation', () => {
    const srcPath = path.resolve(__dirname, './reportGenerators.ts');
    const src = fs.readFileSync(srcPath, 'utf-8');

    const resolveStart = src.indexOf('async function resolveVariables(');
    const resolveEnd = src.indexOf('\nexport async function applyTemplateAsync', resolveStart);
    const resolveBody = src.slice(resolveStart, resolveEnd);

    // Should use calcKitchenPullRawCost (same as DashboardPage table)
    expect(resolveBody).toContain('calcKitchenPullRawCost');
  });

  it('calcKitchenPullRawCost should be imported from db', () => {
    const srcPath = path.resolve(__dirname, './reportGenerators.ts');
    const src = fs.readFileSync(srcPath, 'utf-8');

    // Check import statement includes calcKitchenPullRawCost
    expect(src).toContain('calcKitchenPullRawCost');
    const importLine = src.split('\n').find(l => l.includes("from \"./db\"") || l.includes("from './db'"));
    expect(importLine).toBeTruthy();
    expect(importLine).toContain('calcKitchenPullRawCost');
  });

  it('getMonthlyDailyPerformance in db.ts should use +04:00 for sales queries', () => {
    const dbPath = path.resolve(__dirname, './db.ts');
    const src = fs.readFileSync(dbPath, 'utf-8');

    const fnStart = src.indexOf('export async function getMonthlyDailyPerformance()');
    const fnEnd = src.indexOf('\nexport async function', fnStart + 10);
    const fnBody = src.slice(fnStart, fnEnd);

    // Dashboard table uses '+04:00'
    expect(fnBody).toContain("'+00:00', '+04:00'");
  });
});
