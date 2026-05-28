const { chromium } = require('playwright');
require('dotenv').config();

const TARGET_LATITUDE = parseFloat(process.env.TARGET_LATITUDE);
const TARGET_LONGITUDE = parseFloat(process.env.TARGET_LONGITUDE);
const PRODUCT_URL = 'https://blinkit.com/prn/farmley-fard-omani-dates-kharjura/prid/540739';
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    storageState: 'auth.json',
    geolocation: { latitude: TARGET_LATITUDE, longitude: TARGET_LONGITUDE },
    permissions: ['geolocation'],
    userAgent: USER_AGENT,
  });
  const page = await context.newPage();

  console.log('Going to product page...');
  await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000); // let page settle

  // Screenshot 1: initial state
  await page.screenshot({ path: 'step1_initial.png', fullPage: false });
  console.log('📸 step1_initial.png');

  // Dump all button/text that could be ADD
  const buttons = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role="button"], div[class*="Add"], div[class*="add"]')];
    return els.slice(0, 30).map(el => ({
      tag: el.tagName,
      text: el.innerText?.trim().slice(0, 40),
      class: el.className?.slice(0, 60),
    }));
  });
  console.log('Buttons found:', JSON.stringify(buttons, null, 2));

  // Try clicking ADD
  try {
    const addBtn = page.getByText(/^ADD$|^Add to cart$/i).first();
    await addBtn.waitFor({ state: 'visible', timeout: 8000 });
    console.log('ADD button visible, clicking...');
    await addBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step2_after_add.png', fullPage: false });
    console.log('📸 step2_after_add.png');
  } catch (e) {
    console.log('❌ ADD click failed:', e.message);
    await page.screenshot({ path: 'step2_add_failed.png', fullPage: false });
    console.log('📸 step2_add_failed.png');
  }

  // Try opening cart
  try {
    const cartBtn = page.locator('div[class*="CartButton__Button"]').first();
    await cartBtn.waitFor({ state: 'visible', timeout: 5000 });
    await cartBtn.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step3_cart_open.png', fullPage: false });
    console.log('📸 step3_cart_open.png');
  } catch (e) {
    console.log('❌ Cart button failed:', e.message);
  }

  // Try Proceed
  try {
    const proceed = page.locator('text="Proceed"').first();
    await proceed.waitFor({ state: 'visible', timeout: 5000 });
    await proceed.click({ force: true });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'step4_proceed.png', fullPage: false });
    console.log('📸 step4_proceed.png');
  } catch (e) {
    console.log('❌ Proceed failed:', e.message);
    await page.screenshot({ path: 'step4_proceed_failed.png', fullPage: false });
    console.log('📸 step4_proceed_failed.png — check what is on screen');
  }

  console.log('\nDone. Check screenshots in current directory.');
  await page.waitForTimeout(30000); // keep open 30s to inspect
  await browser.close();
})();