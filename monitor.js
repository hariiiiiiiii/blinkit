const { chromium } = require('playwright');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);
const PRODUCT_URL = 'https://blinkit.com/prn/x/prid/772615';
const LAYOUT_ID = '772615';
const PRODUCT_ID = '772615';
const TARGET = 'available';
const INTERVAL = 10_000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
let lastState = null;

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

  console.log('Loading product page once...');
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  await bot.sendMessage(CHAT_ID, '🟢 Monitor started (fast fetch mode)');
  console.log('Monitoring...');

  while (true) {
    try {
      const result = await page.evaluate(async ({ layoutId, productId }) => {
        try {
          const r = await fetch(`/v1/layout/product/${layoutId}`, {
            headers: {
              'accept': 'application/json',
              'app-client': 'consumer-website',
              'app-version': '3.0'
            }
          });
          if (!r.ok) return { error: `HTTP ${r.status}` };
          const data = await r.json();
          for (const snippet of data?.response?.snippets ?? []) {
            const ca = snippet?.tracking?.common_attributes;
            if (ca?.product_id == productId) {
              return { state: ca.state, inventory: ca.inventory, merchant_id: ca.merchant_id };
            }
          }
          return { error: 'product not found in snippets' };
        } catch (e) {
          return { error: e.message };
        }
      }, { layoutId: LAYOUT_ID, productId: PRODUCT_ID });

      if (result.error) {
        console.error(new Date().toISOString(), '[Fetch Error]', result.error);
      } else {
        console.log(new Date().toISOString(), 'state:', result.state, '| inventory:', result.inventory, '| merchant:', result.merchant_id);
        if (result.state !== lastState) {
          lastState = result.state;
          await bot.sendMessage(CHAT_ID, `Update:\nState: ${result.state}\nInventory: ${result.inventory}\nMerchant: ${result.merchant_id}\n${PRODUCT_URL}`);
          if (result.state === TARGET) {
            await bot.sendMessage(CHAT_ID, `🎯 IN STOCK!\n${PRODUCT_URL}`);
          }
        }
      }
    } catch (err) {
      console.error(new Date().toISOString(), '[Poll Error]', err.message);
    }

    await page.waitForTimeout(INTERVAL);
  }
})();