import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--headless=new',
  ],
  headless: true,
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Intercept API calls
const apiCalls = [];
page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('api') && response.headers()['content-type']?.includes('json')) {
    try {
      const json = await response.json();
      apiCalls.push({ url, data: json });
      console.log('API call:', url);
    } catch {}
  }
});

console.log('Navigating to Talabat...');
try {
  await page.goto('https://www.talabat.com/uae/restaurant/622413/nsr-restaurant', {
    waitUntil: 'networkidle2',
    timeout: 30000,
  });
  
  console.log('Page loaded, title:', await page.title());
  
  // Try to extract menu data from page
  const data = await page.evaluate(() => {
    // Look for Next.js data
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) return { type: 'nextData', data: JSON.parse(nextData.textContent) };
    
    // Look for window.__data
    if (window.__data) return { type: 'windowData', data: window.__data };
    
    // Look for restaurant name
    const h1 = document.querySelector('h1');
    return { type: 'h1', text: h1?.textContent, url: window.location.href };
  });
  
  console.log('Extracted data type:', data.type);
  if (data.type === 'nextData') {
    console.log(JSON.stringify(data.data, null, 2).substring(0, 2000));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  
  console.log('\nAPI calls intercepted:', apiCalls.length);
  apiCalls.slice(0, 5).forEach(c => {
    console.log('URL:', c.url);
    console.log('Data:', JSON.stringify(c.data).substring(0, 300));
    console.log('---');
  });
  
} catch (err) {
  console.error('Error:', err.message);
}

await browser.close();
