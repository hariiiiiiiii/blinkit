const puppeteer = require("puppeteer");
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = '8866861962:AAFYpphVO6Jo_53GSnTAcFVVUFR-61TXcbs';
const CHAT_ID = '5198333750';
const PRODUCT_URL = 'https://blinkit.com/prn/x/prid/128379';
const PRODUCT_ID = '128379';
const TARGET = 'available';
const INTERVAL = 30_000;

const bot = new TelegramBot(BOT_TOKEN, { polling: false });
let lastState = null;
let locationChecked = false;

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: './blinkit-session',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = browser.defaultBrowserContext();


  const page = await context.newPage();
 
  await page.setViewport({ width: 850, height: 650 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36");

  await page.setRequestInterception(true);
  page.on('request', req => req.continue());

  page.on('requestfinished', async req => {
    if (!req.url().includes('jumbo.blinkit.com')) return;
    try {
      const postData = req.postData();
      if (!postData) return;
      const events = JSON.parse(postData)?.app_payload ?? [];
      for (const e of events) {
        const p = e?.payload?.value?.properties;
        if (!p) continue;
        if (p.product_id != PRODUCT_ID && p.page_id != PRODUCT_ID) continue;

        if (!locationChecked) {
          locationChecked = true;
          console.log(`📍 merchant_id: ${p.merchant_id}`);
          await bot.sendMessage(CHAT_ID, `📍 Merchant ID: ${p.merchant_id}\nExpected: 45744\nMatch: ${p.merchant_id == 45744 ? '✅' : '❌'}`);
        }

        const state = p.state;
        console.log(new Date().toISOString(), 'state:', state, 'inventory:', p.inventory);

        if (state !== lastState) {
          lastState = state;
          await bot.sendMessage(CHAT_ID, `Update:\nState: ${state}\nInventory: ${p.inventory}\n${PRODUCT_URL}`);
        }
        if (state === TARGET) {
          await bot.sendMessage(CHAT_ID, `🎯 Target state hit: ${TARGET}\n${PRODUCT_URL}`);
        }
      }
    } catch {}
  });

  const check = async () => {
    await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 5000));
  };

  console.log('Monitoring...');
  await bot.sendMessage(CHAT_ID, '🟢 Monitor started');
  await check();
  setInterval(check, INTERVAL);
})();