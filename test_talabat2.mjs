import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--headless=new',
    '--lang=en-US,en',
  ],
  headless: true,
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

// Set UAE location cookies
await page.setCookie(
  { name: 'language', value: 'en', domain: '.talabat.com' },
  { name: 'selected-country', value: 'uae', domain: '.talabat.com' },
  { name: 'countryId', value: '3', domain: '.talabat.com' },
);

// Intercept API calls
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  const ct = response.headers()['content-type'] || '';
  if (ct.includes('json') && (url.includes('restaurant') || url.includes('menu') || url.includes('item'))) {
    try {
      const json = await response.json();
      apiCalls.push({ url, data: json });
      console.log('JSON API:', url.substring(0, 100));
    } catch {}
  }
});

console.log('Navigating to Talabat restaurant...');
try {
  await page.goto('https://www.talabat.com/uae/restaurant/622413/nsr-restaurant', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  
  // Wait for menu items to load
  try {
    await page.waitForSelector('[data-testid="menu-category"], [class*="menu"], h1', { timeout: 15000 });
  } catch { console.log('Timeout waiting for menu selector'); }
  
  const title = await page.title();
  const url = page.url();
  console.log('Title:', title);
  console.log('URL:', url);
  
  // Extract restaurant name and menu
  const data = await page.evaluate(() => {
    const result = {
      title: document.title,
      url: window.location.href,
      h1: document.querySelector('h1')?.textContent?.trim(),
      h2s: Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim()).slice(0, 10),
    };
    
    // Try to find menu categories
    const categorySelectors = [
      '[data-testid="menu-category"]',
      '[class*="category-name"]',
      '[class*="CategoryName"]',
      '[class*="menu-section"]',
      'section h3',
    ];
    for (const sel of categorySelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        result.categories = Array.from(els).map(e => e.textContent.trim());
        result.categorySelector = sel;
        break;
      }
    }
    
    // Try to find items
    const itemSelectors = [
      '[data-testid="menu-item"]',
      '[class*="item-name"]',
      '[class*="ItemName"]',
      '[class*="dish-name"]',
    ];
    for (const sel of itemSelectors) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) {
        result.items = Array.from(els).map(e => e.textContent.trim()).slice(0, 10);
        result.itemSelector = sel;
        break;
      }
    }
    
    // Check Next.js data
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) {
      try {
        const d = JSON.parse(nextData.textContent);
        result.nextDataKeys = Object.keys(d?.props?.pageProps || {});
        result.hasMenuData = JSON.stringify(d).includes('categories') || JSON.stringify(d).includes('menuItems');
      } catch {}
    }
    
    return result;
  });
  
  console.log('\nExtracted:', JSON.stringify(data, null, 2));
  console.log('\nAPI calls:', apiCalls.length);
  apiCalls.forEach(c => {
    console.log('URL:', c.url.substring(0, 120));
    console.log('Data keys:', Object.keys(c.data).join(', '));
    console.log('---');
  });
  
} catch (err) {
  console.error('Error:', err.message);
}

await browser.close();
