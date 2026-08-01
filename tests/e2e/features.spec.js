/**
 * E2E tests for features added after the core suite:
 * - zh-CN localization
 * - Chinese single-character search
 * - Settings floating modal (main content + results preserved)
 * - Embedding model selection persistence
 * - .ragbak backup export
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

async function clearDB(page) {
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('rag-tools');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
}

async function createKB(page, name) {
  await page.click('#add-kb-btn');
  await page.waitForSelector('#kb-name-input', { state: 'visible' });
  await page.fill('#kb-name-input', name);
  await page.click('.modal-dialog .btn-primary');
  await page.waitForSelector('.kb-item', { timeout: 5000 });
  await page.waitForTimeout(300);
}

async function dismissModelOverlay(page) {
  await page.evaluate(() => document.getElementById('model-download-overlay').classList.remove('active'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#header', { timeout: 10000 });
  await page.waitForTimeout(500);
  await clearDB(page);
  await page.reload();
  await page.waitForSelector('#header', { timeout: 10000 });
  await page.waitForTimeout(500);
});

// ─── zh-CN localization ───────────────────────────────────────────

test('zh-CN locale renders the UI in Chinese', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('rag-locale', 'zh-CN'));
  await page.reload();
  await page.waitForSelector('#header');
  await page.waitForTimeout(500);

  await expect(page.locator('#sidebar-kb-title')).toHaveText('知识库');
  await expect(page.locator('#sidebar-docs-title')).toHaveText('文档');
  await expect(page.locator('#search-input')).toHaveAttribute('placeholder', '搜索你的文档...');

  // Settings dialog is localized too
  await page.click('#settings-toggle');
  await page.waitForTimeout(300);
  await expect(page.locator('#settings-title')).toContainText('设置');
  await expect(page.locator('.settings-tab[data-tab="models"]')).toContainText('模型');
});

// ─── Chinese single-character search ─────────────────────────────

test('single-char and two-char Chinese queries return results with highlights', async ({ page }) => {
  await createKB(page, '中文');
  await page.locator('#file-input').setInputFiles(path.join(FIXTURES, 'sample-zh.txt'));
  await page.waitForTimeout(2000);
  await dismissModelOverlay(page);

  // Single character
  await page.fill('#search-input', '价');
  await page.waitForTimeout(800);
  await dismissModelOverlay(page);
  await expect(page.locator('#results-container .result-item')).not.toHaveCount(0);
  await expect(page.locator('#results-container mark')).not.toHaveCount(0);

  // Two characters
  await page.fill('#search-input', '价格');
  await page.waitForTimeout(800);
  await dismissModelOverlay(page);
  await expect(page.locator('#results-container .result-item')).not.toHaveCount(0);
  await expect(page.locator('#results-container mark').first()).toContainText('价格');
});

// ─── Settings floating modal ──────────────────────────────────────

test('settings opens as a modal and search results survive close', async ({ page }) => {
  await createKB(page, 'Modal');
  await page.locator('#file-input').setInputFiles(path.join(FIXTURES, 'sample.txt'));
  await page.waitForTimeout(2000);
  await dismissModelOverlay(page);

  await page.fill('#search-input', 'vector');
  await page.waitForTimeout(800);
  await dismissModelOverlay(page);
  await expect(page.locator('#results-container .result-item')).not.toHaveCount(0);

  // Open settings — main content stays visible behind the modal
  await page.click('#settings-toggle');
  await page.waitForTimeout(300);
  const resultsAreaDisplay = await page.locator('#results-area').evaluate((el) => getComputedStyle(el).display);
  expect(resultsAreaDisplay).not.toBe('none');
  await expect(page.locator('#settings-page .settings-dialog')).toBeVisible();

  // Close via ✕ — results preserved
  await page.click('#settings-close');
  await page.waitForTimeout(300);
  await expect(page.locator('#results-container .result-item')).not.toHaveCount(0);
});

// ─── Embedding model selection (persist-on-load) ─────────────────

test('changing the model selection does not persist or download', async ({ page }) => {
  await page.click('#settings-toggle');
  await page.waitForTimeout(300);

  // Merely selecting a model is a preview — it must NOT be persisted
  // (persist-on-load), otherwise the next auto-init would download it.
  await page.selectOption('#embed-model-select', 'Xenova/all-MiniLM-L12-v2');
  await page.waitForTimeout(200);

  const saved = await page.evaluate(() => localStorage.getItem('rag-embed-model'));
  expect(saved).toBeNull();
});

test('model selection is restored from storage on reload', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('rag-embed-model', 'Xenova/all-mpnet-base-v2'));
  await page.reload();
  await page.waitForSelector('#header');
  await page.click('#settings-toggle');
  await page.waitForTimeout(400);
  await expect(page.locator('#embed-model-select')).toHaveValue('Xenova/all-mpnet-base-v2');
});

test('settings card shows the model download status', async ({ page }) => {
  await page.click('#settings-toggle');
  await page.waitForTimeout(500); // let the async cache check settle
  // In a fresh environment no model is downloaded yet.
  await expect(page.locator('#embed-status-badge')).toHaveText(/Not downloaded|未下载/);
  await expect(page.locator('#embed-download-btn')).toHaveText(/Download|下载/);
});

test('concurrent model inits share one download', async ({ page }) => {
  const downloads = await page.evaluate(async () => {
    const m = await import('./src/embedder.js');
    const s = await import('./src/state.js');
    let count = 0;
    s.state.subscribe('modelStatus', (v) => { if (v === 'downloading') count++; });
    const p1 = m.initModel({ modelId: 'Xenova/all-MiniLM-L6-v2' });
    const p2 = m.initModel({ modelId: 'Xenova/all-MiniLM-L6-v2' });
    await Promise.allSettled([p1, p2]);
    return count;
  });
  expect(downloads).toBe(1);
});

// ─── .ragbak backup export ────────────────────────────────────────

test('export produces a valid .ragbak backup', async ({ page }) => {
  await createKB(page, 'Backup');
  await page.locator('#file-input').setInputFiles(path.join(FIXTURES, 'sample.txt'));
  await page.waitForTimeout(2000);
  await dismissModelOverlay(page);

  await page.click('#settings-toggle');
  await page.waitForTimeout(300);
  await page.click('.settings-tab[data-tab="backup"]');
  await page.waitForTimeout(300);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#export-backup-btn'),
  ]);

  expect(download.suggestedFilename()).toMatch(/^ragbox-backup-.*\.ragbak$/);

  const stream = await download.createReadStream();
  let data = '';
  for await (const chunk of stream) data += chunk;
  const backup = JSON.parse(data);

  expect(backup.version).toBe(1);
  expect(Array.isArray(backup.knowledgeBases)).toBe(true);
  expect(Array.isArray(backup.documents)).toBe(true);
  expect(Array.isArray(backup.chunks)).toBe(true);
  expect(backup.knowledgeBases.length).toBeGreaterThanOrEqual(1);
  expect(backup.documents.length).toBeGreaterThanOrEqual(1);
});
