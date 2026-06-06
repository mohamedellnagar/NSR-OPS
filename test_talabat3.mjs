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

// Intercept API calls to find menu endpoint
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  const ct = response.headers()['content-type'] || '';
  if (ct.includes('json')) {
    try {
      const text = await response.text();
      if (text.includes('category') || text.includes('menu') || text.includes('item') || text.includes('price')) {
        apiCalls.push({ url: url.substring(0, 150), preview: text.substring(0, 300) });
        console.log('JSON with menu data:', url.substring(0, 100));
      }
    } catch {}
  }
});

console.log('Step 1: Set location to Dubai...');
try {
  // First go to homepage
  await page.goto('https://www.talabat.com/uae', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
  
  // Set location cookies manually
  await page.setCookie(
    { name: 'language', value: 'en', domain: '.talabat.com' },
    { name: 'selected-country', value: 'uae', domain: '.talabat.com' },
    { name: 'areaId', value: '2', domain: '.talabat.com' },  // Dubai area
    { name: 'lat', value: '25.2048', domain: '.talabat.com' },
    { name: 'lng', value: '55.2708', domain: '.talabat.com' },
  );
  
  console.log('Step 2: Navigate to restaurant...');
  await page.goto('https://www.talabat.com/uae/restaurant/622413/nsr-restaurant', {
    waitUntil: 'domcontentloaded',
    timeout: 25000,
  });
  
  // Wait a bit for JS to load
  await new Promise(r => setTimeout(r, 3000));
  
  const title = await page.title();
  const url = page.url();
  console.log('Title:', title);
  console.log('URL:', url);
  
  // Get full HTML
  const html = await page.content();
  console.log('HTML length:', html.length);
  
  // Check for menu data in HTML
  const hasCategories = html.includes('"categories"') || html.includes('category');
  const hasItems = html.includes('"items"') || html.includes('menuItem');
  const hasPrice = html.includes('"price"') || html.includes('AED');
  console.log('Has categories:', hasCategories);
  console.log('Has items:', hasItems);
  console.log('Has price:', hasPrice);
  
  // Extract text content
  const text = await page.evaluate(() => {
    const body = document.body;
    return {
      h1: document.querySelector('h1')?.textContent?.trim(),
      url: window.location.href,
      // Look for price patterns
      prices: Array.from(document.querySelectorAll('*')).filter(el => 
        el.children.length === 0 && /AED\s*\d+/.test(el.textContent)
      ).map(el => el.textContent.trim()).slice(0, 10),
    };
  });
  
  console.log('\nPage data:', JSON.stringify(text, null, 2));
  
  console.log('\nAPI calls with menu data:', apiCalls.length);
  apiCalls.slice(0, 10).forEach(c => {
    console.log('URL:', c.url);
    console.log('Preview:', c.preview);
    console.log('---');
  });
  
} catch (err) {
  console.error('Error:', err.message);
}

await browser.close();
