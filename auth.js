const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false }); 
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://blinkit.com/');
  console.log("1. Log in with OTP.\n2. Set your address.\n3. Close the browser window manually.");

  // Waits for the browser window to be closed manually by you
  await new Promise(resolve => page.on('close', resolve)); 
  
  // Saves the authenticated session
  await context.storageState({ path: 'auth.json' });
  console.log("auth.json successfully created!");
  await browser.close();
})();