const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);
const UPI_ID = process.env.UPI_ID;

const PRODUCT_URL = 'https://blinkit.com/prn/farmley-fard-omani-dates-kharjura/prid/540739';
const LAYOUT_ID = '540739';
const PRODUCT_ID = '540739';
const TARGET = 'available';
const INTERVAL = 2_000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
let lastState = null;
let isCheckingOut = false;

async function aggressiveUiCart(page, productUrl) {
  console.log("🚨 INITIATING FULL AUTO-CHECKOUT 🚨");
  isCheckingOut = true; 
  
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText(/^ADD$|^Add to cart$/i).first().click({ force: true }); 
    await page.waitForTimeout(1000); 

    // Cart Panel
    await page.locator('div[class*="CartButton__Button"]').first().click({ force: true });
    await page.waitForTimeout(1500);

    // Initial Proceed
    await page.locator('text="Proceed"').first().click({ force: true });

    // Address
    const addressCard = page.locator('div[class*="AddressList__AddressDetails"]').filter({ hasText: /E29\/6|DRDO/i }).first();
    await addressCard.waitFor({ state: 'visible', timeout: 5000 });
    await addressCard.click({ force: true });

    // Confirm Address
    await page.locator('text=/Proceed To Pay|Proceed/i').first().click({ force: true });

    // COD First
    const codOption = page.locator('text=/Cash on Delivery|Pay on Delivery/i').first();
    if (await codOption.isVisible({ timeout: 3000 })) {
        await codOption.click({ force: true });
        console.log("✅ COD Selected");
    } else {
        // UPI Selection using the specific div role="button" you provided
        const upiButton = page.locator('div[role="button"][aria-label="UPI"]').first();
        await upiButton.waitFor({ state: 'visible', timeout: 5000 });
        await upiButton.click({ force: true });
        
        // Handle QR or Manual Entry
        const qrBtn = page.locator('text="Generate QR"').first();
        if (await qrBtn.isVisible({ timeout: 3000 })) {
            await qrBtn.click({ force: true });
            await bot.sendMessage(CHAT_ID, "⚠️ QR Generated. Scan it now!");
        } else {
            const upiInput = page.locator('input[type="text"]').first();
            await upiInput.fill(UPI_ID);
        }
    }

    // Pay Now
    await page.locator('text="Pay Now"').first().click({ force: true });
    await bot.sendMessage(CHAT_ID, "🔥 Checkout sequence triggered!");

    await page.waitForTimeout(300000); 
    process.exit(0);
    
  } catch (err) {
    console.error("❌ Error:", err.message);
    await bot.sendMessage(CHAT_ID, `⚠️ Failed: ${err.message}`);
    await page.waitForTimeout(300000); 
    process.exit(1);
  } 
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: 'auth.json',
    geolocation: { latitude: TARGET_LATITUDE, longitude: TARGET_LONGITUDE },
    permissions: ['geolocation'],
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' });
  console.log('Monitoring...');

  while (true) {
    if (isCheckingOut) { await page.waitForTimeout(1000); continue; }
    try {
      const result = await page.evaluate(async ({ layoutId, productId, lat, lon }) => {
          const r = await fetch(`/v1/layout/product/${layoutId}`, { method: 'POST', headers: { 'content-type': 'application/json', 'lat': lat, 'lon': lon }, body: '' });
          if (!r.ok) return { error: 'Fetch fail' };
          const data = await r.json();
          for (const s of data?.response?.snippets ?? []) {
            const ca = s?.tracking?.common_attributes;
            if (ca?.product_id == productId) return { state: ca.state };
          }
          return { error: 'Not found' };
      }, { layoutId: LAYOUT_ID, productId: PRODUCT_ID, lat: String(TARGET_LATITUDE), lon: String(TARGET_LONGITUDE) });

      if (result.state === TARGET) {
          await aggressiveUiCart(page, PRODUCT_URL);
      }
    } catch (err) { console.error('Poll Error'); }
    await page.waitForTimeout(INTERVAL);
  }
})();