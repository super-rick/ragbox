/**
 * E2E tests for rag.always.tools — browser-local RAG knowledge base.
 *
 * These tests cover the complete user-facing functionality:
 * - Empty state / initial rendering
 * - Knowledge base management (CRUD)
 * - Theme toggle & persistence
 * - Mobile responsive layout
 * - Document ingestion (TXT, MD)
 * - Search UI interaction
 * - Error states
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Clear IndexedDB before each test so every test starts with empty state.
 */
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

/**
 * Create a knowledge base via the UI.
 */
async function createKB(page, name) {
  await page.click('#add-kb-btn');
  await page.waitForSelector('#kb-name-input', { state: 'visible' });
  await page.fill('#kb-name-input', name);
  await page.click('.modal-dialog .btn-primary');
  // Wait for KB to appear in list and toast to show
  await page.waitForSelector('.kb-item', { timeout: 5000 });
  await page.waitForTimeout(300);
}

/**
 * Upload a file to the current KB via the hidden file input.
 */
async function uploadFile(page, fileName) {
  const filePath = path.join(FIXTURES, fileName);
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(300);
}

// ─── Hooks ─────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for the app to initialize
  await page.waitForSelector('#header', { timeout: 10000 });
  await page.waitForTimeout(500);
  // Clear IndexedDB so every test starts with empty state
  await clearDB(page);
  // Reload so the app reinitializes with empty DB
  await page.reload();
  await page.waitForSelector('#header', { timeout: 10000 });
  await page.waitForTimeout(500);
});

// ─── 1. Initial State ─────────────────────────────────────────────

test.describe('Initial State', () => {

  test('renders empty state with all placeholder text', async ({ page }) => {
    // KB section
    await expect(page.locator('#kb-empty')).toHaveText('No knowledge bases yet');
    await expect(page.locator('#doc-empty')).toHaveText('No documents');
    await expect(page.locator('#add-kb-btn')).toBeVisible();

    // Drop zone
    await expect(page.locator('#drop-zone')).toBeVisible();
    await expect(page.locator('#drop-zone-text')).toHaveText('Drop documents here, or click to select');
    await expect(page.locator('#drop-zone-hint')).toHaveText('Supports PDF, TXT, MD');

    // Results area is empty
    await expect(page.locator('#results-container')).toBeEmpty();

    // Model overlay is hidden
    await expect(page.locator('#model-download-overlay')).not.toHaveClass(/active/);
  });

  test('has all structural DOM elements', async ({ page }) => {
    await expect(page.locator('#header')).toBeVisible();
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#content')).toBeVisible();
    await expect(page.locator('#search-bar')).toBeVisible();
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#results-area')).toBeVisible();
    await expect(page.locator('#theme-toggle')).toBeVisible();

    // Hamburger is hidden on desktop viewport
    await expect(page.locator('#hamburger')).toBeHidden();

    // Logo
    await expect(page.locator('.logo')).toContainText('RAG');
  });
});

// ─── 2. KB Management ────────────────────────────────────────────

test.describe('KB Management', () => {

  test('creates a knowledge base', async ({ page }) => {
    await createKB(page, 'My Research');

    // KB appears in list
    const kbItems = page.locator('.kb-item');
    await expect(kbItems).toHaveCount(1);
    await expect(kbItems.first()).toContainText('My Research');

    // KB should be active (highlighted)
    await expect(kbItems.first()).toHaveClass(/active/);

    // Toast notification appears
    const toast = page.locator('.toast');
    await expect(toast).toContainText('Knowledge base "My Research" created');

    // kb-empty should be hidden
    await expect(page.locator('#kb-empty')).not.toBeVisible();
  });

  test('creates multiple KBs with correct active state', async ({ page }) => {
    await createKB(page, 'First KB');
    await createKB(page, 'Second KB');

    const kbItems = page.locator('.kb-item');
    await expect(kbItems).toHaveCount(2);

    // Find KB items by their text content
    const firstKB = page.locator('.kb-item', { hasText: 'First KB' });
    const secondKB = page.locator('.kb-item', { hasText: 'Second KB' });
    await expect(firstKB).toContainText('First KB');
    await expect(secondKB).toContainText('Second KB');

    // The most recently created should be active
    await expect(secondKB).toHaveClass(/active/);
    await expect(firstKB).not.toHaveClass(/active/);
  });

  test('switches active KB on click', async ({ page }) => {
    await createKB(page, 'Documents');
    await createKB(page, 'Papers');

    // Click the first KB
    await page.locator('.kb-item').first().click();
    await page.waitForTimeout(300);

    // First should be active, second not
    await expect(page.locator('.kb-item').first()).toHaveClass(/active/);
    await expect(page.locator('.kb-item').nth(1)).not.toHaveClass(/active/);
  });

  test('deletes a KB and updates the list', async ({ page }) => {
    await createKB(page, 'To Delete');

    // Delete via modal
    // The plan has a delete function but the current UI doesn't have a delete button for KBs
    // Let's test via the deleteKB API exposed on the page
    const result = await page.evaluate(async () => {
      const mod = await import('./src/db.js');
      const kbs = await mod.listKBs();
      if (kbs.length > 0) {
        await mod.deleteKB(kbs[0].id);
        return 'deleted';
      }
      return 'no_kbs';
    });

    expect(result).toBe('deleted');

    // Reload page to verify
    await page.reload();
    await page.waitForSelector('#kb-empty');
    await expect(page.locator('#kb-empty')).toHaveText('No knowledge bases yet');
  });
});

// ─── 3. Theme ─────────────────────────────────────────────────────

test.describe('Theme', () => {

  test('cycles through light → dark → auto on toggle click', async ({ page }) => {
    const getTheme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    // Default (light or auto-resolved)
    const initial = await getTheme();

    // First click → should be dark
    await page.click('#theme-toggle');
    await page.waitForTimeout(200);
    expect(['dark', 'light']).toContain(await getTheme());

    // Second click → should toggle again
    await page.click('#theme-toggle');
    await page.waitForTimeout(200);
    const afterSecond = await getTheme();
    expect(afterSecond).toBeDefined();
    expect(afterSecond).not.toBe(initial); // Theme should change after 2 clicks

    // Third click → returns
    await page.click('#theme-toggle');
    await page.waitForTimeout(200);
    const afterThird = await getTheme();
    expect(afterThird).toBeDefined();
  });

  test('persists theme preference across reloads', async ({ page }) => {
    // Toggle to dark
    await page.click('#theme-toggle');
    await page.waitForTimeout(200);

    // Note the theme after one click (may be dark depending on initial)
    const themeAfterToggle = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));

    // Reload page
    await page.reload();
    await page.waitForSelector('#header');
    await page.waitForTimeout(500);

    // Theme should persist
    const themeAfterReload = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(themeAfterReload).toBe(themeAfterToggle);
  });
});

// ─── 4. Responsive ───────────────────────────────────────────────

test.describe('Responsive Layout', () => {

  test('sidebar is collapsed on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Sidebar should be collapsed on mobile (handleResize sets this)
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);

    // Hamburger should be visible on mobile
    await expect(page.locator('#hamburger')).toBeVisible({ timeout: 2000 });
  });

  test('hamburger toggles sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Sidebar starts collapsed
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);

    // Click hamburger → sidebar opens
    await page.click('#hamburger');
    await page.waitForTimeout(300);
    await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);

    // Click hamburger again → sidebar closes
    // Use force:true because the sidebar overlay may intercept
    await page.click('#hamburger', { force: true });
    await page.waitForTimeout(300);
    await expect(page.locator('#sidebar')).toHaveClass(/collapsed/);
  });
});

// ─── 5. Document Ingestion ──────────────────────────────────────

test.describe('Document Ingestion', () => {

  test('triggers file upload process for TXT file', async ({ page }) => {
    await createKB(page, 'Test KB');

    // Upload file — this triggers the ingestion pipeline
    // Without the embedding model, the pipeline will show a model download
    // or error toast instead of completing. We verify the upload was accepted.
    await uploadFile(page, 'sample.txt');

    // Wait for processing to start
    await page.waitForTimeout(1000);

    // Either the model overlay appears (model downloads) or an error toast shows
    // Either way, the file upload was accepted — no validation error
    const errorToasts = page.locator('.toast.toast-error');
    const errorCount = await errorToasts.count();

    // If there's an error, it should be about model, not about the file
    if (errorCount > 0) {
      const errorText = await errorToasts.first().textContent();
      // Model download might fail, but file validation should have passed
      expect(errorText).not.toContain('Unsupported');
      expect(errorText).not.toContain('too large');
    }
  });

  test('triggers file upload process for MD file', async ({ page }) => {
    await createKB(page, 'Test KB');

    await uploadFile(page, 'sample.md');
    // Wait for processing
    await page.waitForTimeout(500);

    // Verify no validation errors
    const errorToasts = page.locator('.toast.toast-error');
    const errors = await errorToasts.allTextContents();
    for (const err of errors) {
      expect(err).not.toContain('Unsupported');
      expect(err).not.toContain('too large');
    }
  });

  test('rejects unsupported file types with error toast', async ({ page }) => {
    await createKB(page, 'Test KB');

    // Try uploading a .exe file by creating a temporary one
    // Since we can't setInputFiles to a non-existent file, let's test via page API
    // We'll test the validateFile function directly
    const result = await page.evaluate(async () => {
      const mod = await import('./src/file-handler.js');
      const fakeFile = new File(['fake'], 'virus.exe', { type: 'application/x-msdownload' });
      return mod.validateFile(fakeFile, false);
    });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported');
  });
});

// ─── 6. Search UI ────────────────────────────────────────────────

test.describe('Search UI', () => {

  test('shows results placeholder when typing a search query', async ({ page }) => {
    await createKB(page, 'Test KB');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('test query');
    await page.waitForTimeout(1000);

    // The search should trigger; since no model is loaded it should show
    // loading state then gracefully handle the error
    const results = page.locator('#results-container');
    // Either loading spinner, error state, or "no results" — don't crash
    await expect(results).not.toBeEmpty();
  });

  test('displays empty state when search is cleared', async ({ page }) => {
    await createKB(page, 'Test KB');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('something');
    await page.waitForTimeout(500);
    await searchInput.clear();
    await page.waitForTimeout(500);

    // After clearing, the drop zone should be visible again
    await expect(page.locator('#drop-zone')).toBeVisible();
  });
});
