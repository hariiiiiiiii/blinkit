const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);
const EXPECTED_MERCHANT = parseInt(process.env.EXPECTED_MERCHANT, 10);
const PRODUCT_URL = 'https://blinkit.com/prn/sprite-lime-flavored-soft-drink/prid/312';
const PRODUCT_ID = '312';
const LAYOUT_ID = '312';
const TARGET = 'available';
const INTERVAL = 2000; 

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

  // open product page once — keep it open forever
  console.log('Loading product page...');
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  console.log('Page loaded. Starting polling...');

  await bot.sendMessage(CHAT_ID, 'Monitor started');

  while (true) {
    try {
      const result = await page.evaluate(async (layoutId) => {
        try {
          const r = await fetch(`/v1/layout/product/${layoutId}`, {
            headers: {
              'accept': 'application/json',
              'app-client': 'consumer-website',
              'app-version': '3.0'
            }
          });
          const data = await r.json();
          return { ok: true, data };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }, LAYOUT_ID);

      if (!result.ok) {
        console.error('[Fetch Error]', result.error);
      } else {
        // dig state out — log raw once to find shape
        if (!locationChecked) {
          locationChecked = true;
          console.log('[Debug] raw response:', JSON.stringify(result.data).slice(0, 500));
          await bot.sendMessage(CHAT_ID, `[Debug] ${JSON.stringify(result.data).slice(0, 300)}`);
        }

        // try known shapes
        const state =
          result.data?.state ??
          result.data?.product?.state ??
          result.data?.data?.state ??
          result.data?.objects?.[0]?.state ??
          null;

        const inventory =
          result.data?.inventory ??
          result.data?.product?.inventory ??
          result.data?.data?.inventory ??
          null;

        if (state) {
          console.log(new Date().toISOString(), 'state:', state, 'inventory:', inventory);

          if (state !== lastState) {
            lastState = state;
            await bot.sendMessage(CHAT_ID, `Update:\nState: ${state}\nInventory: ${inventory}\n${PRODUCT_URL}`);
            if (state === TARGET) {
              await bot.sendMessage(CHAT_ID, `Target state hit: ${TARGET}\n${PRODUCT_URL}`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[Poll Error]', err.message);
    }

    await page.waitForTimeout(INTERVAL);
  }
})();