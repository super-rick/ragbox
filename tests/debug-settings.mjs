import { chromium } from 'playwright';
const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
await page.goto('http://localhost:8080/');
await page.waitForSelector('#header');
await page.waitForTimeout(500);
const btn = await page.$('#settings-toggle');
console.log('Settings button exists:', !!btn);
if (btn) {
  const visible = await btn.isVisible();
  console.log('Settings button visible:', visible);
  const rect = await btn.boundingBox();
  console.log('Settings button rect:', rect);
  await btn.click({force: true});
  await page.waitForTimeout(500);
  const hash = await page.evaluate(() => window.location.hash);
  console.log('Hash after click:', hash);
  const settingsActive = await page.evaluate(() => document.getElementById('settings-page')?.classList.contains('active'));
  console.log('Settings page active:', settingsActive);
  const resultsHidden = await page.evaluate(() => document.getElementById('results-area')?.style.display);
  console.log('Results area display:', resultsHidden);
}
await browser.close();
