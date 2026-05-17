const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);
const EXPECTED_MERCHANT = parseInt(process.env.EXPECTED_MERCHANT, 10);

const PRODUCT_URL = 'https://blinkit.com/prn/x/prid/128379';
const PRODUCT_ID = '128379';
const TARGET = 'available';
const INTERVAL = 30_000;

if (!BOT_TOKEN || !CHAT_ID || !TARGET_LATITUDE) {
  console.error('[Error] Missing environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
let lastState = null;
let locationChecked = false;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox']
  });

  const context = await browser.newContext({
    geolocation: { latitude: TARGET_LATITUDE, longitude: TARGET_LONGITUDE },
    permissions: ['geolocation'],
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  });

  const page = await context.newPage();

  try {
    await page.goto('https://blinkit.com/');

    const detectBtn = page.getByText(/detect (my|current) location/i).first();

    try {
      await detectBtn.click({ timeout: 10000 });
    } catch (e) {
      const headerBtn = page.getByText(/delivery in|select location/i).first();
      await headerBtn.click({ timeout: 5000 });

      await page.waitForTimeout(1000);
      await detectBtn.click({ timeout: 5000 });
    }

    await page.waitForTimeout(5000);
  } catch (err) {
    console.error('[Location Error]', err.message);
  }

  page.on('requestfinished', async request => {
    if (request.url().includes('jumbo.blinkit.com') && request.method() === 'POST') {
      try {
        const postData = request.postData();
        if (!postData) return;

        const events = JSON.parse(postData)?.app_payload ?? [];

        for (const e of events) {
          const p = e?.payload?.value?.properties;
          if (!p) continue;
          if (p.product_id != PRODUCT_ID && p.page_id != PRODUCT_ID) continue;

          if (!locationChecked) {
            locationChecked = true;
            console.log(`📍 merchant_id: ${p.merchant_id}`);
            await bot.sendMessage(
              CHAT_ID,
              `📍 Merchant ID: ${p.merchant_id}\nExpected: ${EXPECTED_MERCHANT}\nMatch: ${p.merchant_id == EXPECTED_MERCHANT ? '✅' : '❌'}`
            );
          }

          const state = p.state;

          if (
            state === undefined || 
            state === null || 
            String(state).trim().toLowerCase() === 'undefined' || 
            String(state).trim() === ''
          ) {
            continue;
          }

          console.log(new Date().toISOString(), 'state:', state, 'inventory:', p.inventory);

          if (state !== lastState) {
            lastState = state;
            await bot.sendMessage(CHAT_ID, `Update:\nState: ${state}\nInventory: ${p.inventory}\n${PRODUCT_URL}`);

            if (state === TARGET) {
              await bot.sendMessage(CHAT_ID, `🎯 Target state hit: ${TARGET}\n${PRODUCT_URL}`);
            }
          }
        }
      } catch (err) {}
    }
  });

  console.log('Monitoring...');
  await bot.sendMessage(CHAT_ID, '🟢 Monitor started');

  while (true) {
    try {
      await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(5000);
    } catch (err) {
      console.error('[Network] Page reload failed:', err.message);
    }

    await page.waitForTimeout(INTERVAL - 5000);
  }
})();