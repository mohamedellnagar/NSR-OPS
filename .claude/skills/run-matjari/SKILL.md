---
description: Launch and drive the matjari restaurant management app (Express + Vite on port 3000, MySQL)
---

# Run Matjari

## Stack
- **Backend**: Express + tRPC + Drizzle ORM (MySQL)
- **Frontend**: React + Vite — embedded inside Express via `setupVite()`
- **Single port**: everything runs on **http://localhost:3000**
- **Package manager**: npm (pnpm not installed)

## Prerequisites
- MySQL running on localhost:3306, database: `whatsapp_dashboard`
- Credentials in `.env`: `DB_USER=root`, `DB_PASSWORD=Mohamed@1234`
- Node modules installed: `node_modules/` present

## Launch command
```bash
cd /Users/mohamedelnagar/Downloads/matjari
NODE_ENV=development npx tsx watch server/_core/index.ts > /tmp/matjari-server.log 2>&1 &
```

## Verify running
```bash
sleep 5
grep "Server running" /tmp/matjari-server.log
curl -s http://localhost:3000 | head -3
```
Expected: `Server running on http://localhost:3000/`

## Login credentials
- **Email**: `mohamed.ellnajar@gmail.com`
- **Password**: `admin123`

## Drive with Playwright
```js
import { chromium } from '/Users/mohamedelnagar/Downloads/matjari/node_modules/playwright-core/index.mjs';
const b = await chromium.launch({ headless: true });
const p = await b.newPage();
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto('http://localhost:3000');
await p.waitForTimeout(1500);
await p.fill('input[type="email"]', 'mohamed.ellnajar@gmail.com');
await p.fill('input[type="password"]', 'admin123');
await p.click('button[type="submit"]');
await p.waitForTimeout(2500);
// Now navigate to any page
```

## Stop server
```bash
kill $(lsof -ti:3000) 2>/dev/null
```

## Key routes
| Route | Description |
|-------|-------------|
| `/` | Dashboard |
| `/materials` | Raw Materials |
| `/invoices` | Invoices |
| `/semi-finished` | Manufactured Item Recipes |
| `/recipes` | Product Recipes (Food Cost) |
| `/food-cost` | Food Cost Report |
| `/waste` | Waste Log |
| `/transactions` | Inventory Movement Ledger |
| `/kitchen` | Kitchen Production |
| `/food-cost` | Food Cost Tracking |

## Notes
- Playwright browser is already installed at `~/.claude/ms-playwright/`
- If port 3000 is busy: `kill $(lsof -ti:3000)` then relaunch
- Server log: `/tmp/matjari-server.log`
- tsx watch auto-reloads on file changes
