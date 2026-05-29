const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);

const PRODUCT_URL = 'https://blinkit.com/prn/farmley-fard-omani-dates-kharjura/prid/540739';
const LAYOUT_ID = '540739';
const PRODUCT_ID = '540739';
const TARGET = 'available';
const INTERVAL = 2_000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
let lastState = null;
let isCheckingOut = false;

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

async function aggressiveUiCart(productUrl) {
  console.log("🚨 INITIATING AUTO-CHECKOUT 🚨");
  isCheckingOut = true;

  const checkoutBrowser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await checkoutBrowser.newContext({
    storageState: 'auth.json',
    geolocation: { latitude: TARGET_LATITUDE, longitude: TARGET_LONGITUDE },
    permissions: ['geolocation'],
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();

  try {
    // 1. Go to product page
    await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // 2. Click "Add to cart" button (green button top right of product)
    const addBtn = page.getByRole('button', { name: /add to cart/i }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 10000 });
    await addBtn.click({ force: true });
    console.log("✅ Added to cart");
    await page.waitForTimeout(1500);

    // 3. Open cart — top right "My Cart" / "1 item ₹224" button
    const cartBtn = page.locator('header').getByText(/item|my cart/i).first();
    await cartBtn.waitFor({ state: 'visible', timeout: 8000 });
    await cartBtn.click({ force: true });
    console.log("✅ Cart opened");
    await page.waitForTimeout(1500);

    // 4. Click "Proceed" at bottom of cart panel
    const proceedBtn = page.locator('text=/^Proceed/i').last();
    await proceedBtn.waitFor({ state: 'visible', timeout: 8000 });
    await proceedBtn.click({ force: true });
    console.log("✅ Proceed clicked");
    await page.waitForTimeout(3000);

    // Screenshot — see what appeared after Proceed

    // 5. Click the E29/DRDO address card (entire row, not just label)
    const addressCard = page.locator('[class*="AddressList__Address"]')
      .filter({ hasText: /E29\/6/i }).first();
    await addressCard.waitFor({ state: 'visible', timeout: 8000 });
    await addressCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await addressCard.click({ force: true });
    console.log("✅ Address clicked");
    await page.waitForTimeout(3000);


    // 6. Click "Proceed to pay"
    const proceedToPayBtn = page.locator('text=/Proceed to pay/i').last();
    await proceedToPayBtn.waitFor({ state: 'visible', timeout: 10000 });
    await proceedToPayBtn.click({ force: true });
    console.log("✅ Proceed to pay clicked");
    await page.waitForTimeout(1000);

    // 🛑 HUMAN TAKES OVER — payment page is open
    console.log("✅ At payment page. YOU handle it. Browser stays open.");
    await bot.sendMessage(CHAT_ID, "🛑 At payment page — go click and pay now!");

    // Keep browser open 10 minutes
    await page.waitForTimeout(600_000);
    process.exit(0);

  } catch (err) {
    console.error("❌ Checkout error:", err.message);
    await bot.sendMessage(CHAT_ID, `⚠️ Checkout failed: ${err.message}`);
    await checkoutBrowser.close();
    isCheckingOut = false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: 'auth.json',
    geolocation: { latitude: TARGET_LATITUDE, longitude: TARGET_LONGITUDE },
    permissions: ['geolocation'],
    userAgent: USER_AGENT,
  });

  const page = await context.newPage();
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' });
  console.log('👀 Monitoring...');
  await bot.sendMessage(CHAT_ID, "👀 Bot started — monitoring for stock...");

  setInterval(() => {
    if (!isCheckingOut) {
      bot.sendMessage(CHAT_ID, `⏱ Still watching... ${new Date().toLocaleTimeString()}`)
        .catch(e => console.log("Telegram heartbeat failed, ignoring..."));
    }
  }, 5 * 60 * 1000);

  while (true) {
    if (isCheckingOut) {
      await page.waitForTimeout(1000);
      continue;
    }

    try {
      const result = await page.evaluate(
        async ({ layoutId, productId, lat, lon }) => {
          const r = await fetch(`/v1/layout/product/${layoutId}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', lat, lon },
            body: '',
          });
          if (!r.ok) return { error: 'Fetch fail' };
          const data = await r.json();
          for (const s of data?.response?.snippets ?? []) {
            const ca = s?.tracking?.common_attributes;
            if (ca?.product_id == productId) return { state: ca.state };
          }
          return { error: 'Not found' };
        },
        {
          layoutId: LAYOUT_ID,
          productId: PRODUCT_ID,
          lat: String(TARGET_LATITUDE),
          lon: String(TARGET_LONGITUDE),
        }
      );

      if (result.state !== lastState) {
        console.log(`State: ${result.state ?? result.error}`);
        lastState = result.state;
      }

      if (result.state === TARGET) {
        await bot.sendMessage(CHAT_ID, "🟢 Product available! Starting checkout...");
        aggressiveUiCart(PRODUCT_URL); // not awaited
      }

    } catch (err) {
      console.error('Poll error:', err.message);
    }

    await page.waitForTimeout(INTERVAL);
  }
})();