/**
 * Main application logic — wires all modules together.
 */

import { state } from './state.js';
import { $, $$, createElement, showToast, showModal, renderStats, renderEmptyState,
         renderErrorState, renderLoadingState, createProgressBar, createSpinner,
         sanitizeHTML, formatBytes } from './ui.js';
import { t, setLocale, getLocale } from './i18n.js';
import { openDB, createKB, listKBs, getKB, updateKB, deleteKB, getKBStats,
         addDocument, updateDocument, listDocuments, getDocument, deleteDocument,
         addChunks, getChunksByKB, getStorageEstimate, getDocumentText,
         updateChunkEmbedding } from './db.js';
import { chunkText, estimateTokens } from './chunker.js';
import { extractPDFText } from './pdf-extractor.js';
import { readFileAsArrayBuffer, readFileAsText, setupDragDrop, setupFileInput,
         validateFile, stripMarkdown } from './file-handler.js';
import { initModel, embed, embedSingle, isModelReady, getModelInfo } from './embedder.js';
import { hybridSearch, keywordSearch, highlightMatches } from './search.js';
import { updateTitle } from './router.js';
import { exportBackup, importBackup } from './backup.js';
import { initLicense } from './license.js';
import { initQAEngine, askQuestion, isWebGPUSupported, getEngineStatus, getQAModelId, abortAnswer, isAnswering, unloadQAEngine } from './qa.js';
import {
  getEmbeddingModelInfo, getQAModelInfo,
  getAvailableEmbeddingModels, getAvailableQAModels,
  checkModelCache, getCacheInfo, clearModelCache,
} from './models.js';

// ─── Embedding model selection ──────────────────────────────────

const EMBED_MODEL_KEY = 'rag-embed-model';
const DEFAULT_EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2';

/**
 * Active embedding model, persisted across sessions. Auto-init (ingestion/search)
 * uses this so a model chosen in Settings isn't silently overridden by the default.
 */
function getSavedEmbedModelId() {
  const saved = localStorage.getItem(EMBED_MODEL_KEY);
  const available = getAvailableEmbeddingModels().map(m => m.id);
  return saved && available.includes(saved) ? saved : DEFAULT_EMBED_MODEL;
}

// ─── Initialization ──────────────────────────────────────────────

export async function initApp() {
  // Wire up event listeners
  setupEventListeners();

  // Open IndexedDB
  await openDB();

  // Load KB list
  await refreshKBList();

  // Auto-select first KB if exists
  const kbs = state.get('knowledgeBases');
  if (kbs.length > 0) {
    state.set('currentKBId', kbs[0].id);
    await refreshDocList();
    await refreshStats();
  }

  // Apply locale to static placeholders and re-render dynamic sections.
  applyLocale();

  // Auto-init model on first search or ingestion
  console.log('RAG Box initialized.');
}

/**
 * Apply the current locale to static DOM text and re-render dynamic
 * content. Called on init (so a saved zh-CN locale is applied immediately)
 * and after a language switch.
 */
function applyLocale() {
  const searchInput = $('#search-input');
  if (searchInput) searchInput.placeholder = t('search.placeholder');

  const dropZoneText = $('#drop-zone-text');
  if (dropZoneText) dropZoneText.textContent = t('dropzone.text');

  const dropZoneHint = $('#drop-zone-hint');
  if (dropZoneHint) dropZoneHint.textContent = t('dropzone.hint');

  // QA panel
  const qaInput = $('#qa-input');
  if (qaInput) qaInput.placeholder = t('qa.placeholder');

  const qaToggle = $('#qa-toggle');
  if (qaToggle) { qaToggle.title = t('qa.toggle'); qaToggle.textContent = isQAMode ? t('qa.search_mode') : '🤖 ' + t('qa.toggle'); }

  const qaSend = $('#qa-send');
  if (qaSend) qaSend.textContent = t('qa.ask');
  const qaStop = $('#qa-stop');
  if (qaStop) qaStop.textContent = '⏹ ' + t('qa.stop');

  // Sidebar
  const kbTitle = $('#sidebar-kb-title');
  if (kbTitle) kbTitle.textContent = t('kb.title');
  const docsTitle = $('#sidebar-docs-title');
  if (docsTitle) docsTitle.textContent = t('docs.title');
  const addKbBtn = $('#add-kb-btn');
  if (addKbBtn) addKbBtn.title = t('kb.new');
  const kbEmpty = $('#kb-empty');
  if (kbEmpty) kbEmpty.textContent = t('kb.empty');

  // Settings dialog (static labels; dynamic status is set by the update fns below)
  const sTitle = $('#settings-title');
  if (sTitle) sTitle.textContent = t('settings.title');
  const tabModels = document.querySelector('.settings-tab[data-tab="models"]');
  if (tabModels) tabModels.textContent = t('settings.tab_models');
  const tabLang = document.querySelector('.settings-tab[data-tab="language"]');
  if (tabLang) tabLang.textContent = t('settings.tab_language');
  const embedTitle = $('#embed-model-title');
  if (embedTitle) embedTitle.textContent = t('settings.embedding_model');
  const qaModelTitle = $('#qa-model-title');
  if (qaModelTitle) qaModelTitle.textContent = t('settings.qa_model');
  const langTitle = $('#settings-lang-title');
  if (langTitle) langTitle.textContent = t('settings.language');
  const cacheTitle = $('#model-cache-title');
  if (cacheTitle) cacheTitle.textContent = t('settings.model_cache');
  const filesLabel = $('#cache-files-label');
  if (filesLabel) filesLabel.textContent = t('settings.cached_files');
  const totalLabel = $('#cache-total-label');
  if (totalLabel) totalLabel.textContent = t('settings.total_size');
  const clearBtn = $('#clear-cache-btn');
  if (clearBtn) clearBtn.textContent = t('settings.clear_cache');
  const cacheWarn = $('#cache-warning');
  if (cacheWarn) cacheWarn.textContent = t('settings.cache_warning');
  const webgpuNote = $('#qa-webgpu-note');
  if (webgpuNote) webgpuNote.textContent = t('settings.webgpu_unavailable');
  const embedDl = $('#embed-download-btn');
  if (embedDl) embedDl.textContent = t('settings.download');
  const embedRedl = $('#embed-redownload-btn');
  if (embedRedl) embedRedl.textContent = t('settings.redownload');
  const qaDl = $('#qa-download-btn');
  if (qaDl) qaDl.textContent = t('settings.download');

  // Backup panel
  const backupTab = document.querySelector('.settings-tab[data-tab="backup"]');
  if (backupTab) backupTab.textContent = t('backup.tab');
  const backupTitle = $('#backup-title');
  if (backupTitle) backupTitle.textContent = t('backup.title');
  const exportBtn = $('#export-backup-btn');
  if (exportBtn) exportBtn.textContent = t('backup.export');
  const importBtn = $('#import-backup-btn');
  if (importBtn) importBtn.textContent = t('backup.import');
  const backupDesc = $('#backup-desc');
  if (backupDesc) backupDesc.textContent = t('backup.desc');

  // Help modal
  const helpToggle = $('#help-toggle');
  if (helpToggle) helpToggle.title = t('help.title');
  const helpTitle = $('#help-title');
  if (helpTitle) helpTitle.textContent = '❓ ' + t('help.title');
  const helpPage = document.getElementById('help-page');
  if (helpPage && helpPage.classList.contains('active')) renderHelp();

  // If the settings dialog is open, refresh its dynamic status in the new locale.
  const settingsPage = document.getElementById('settings-page');
  if (settingsPage && settingsPage.classList.contains('active')) {
    updateEmbeddingCard(getEmbeddingModelInfo().status);
    updateQACard(getQAModelInfo().status);
    refreshCacheInfo();
  }

  // Model download overlay
  const ovTitle = $('#model-download-title');
  if (ovTitle) ovTitle.textContent = t('overlay.title');
  const ovDesc = $('#model-download-desc');
  if (ovDesc) ovDesc.innerHTML = t('overlay.desc').replace(/\n/g, '<br>');
  const ovDismiss = $('#model-download-dismiss');
  if (ovDismiss) ovDismiss.textContent = t('overlay.dismiss');

  // Browser title for the current route.
  const currentRoute = state.get('route');
  if (currentRoute) updateTitle(currentRoute);

  // Re-render dynamic sections that read from i18n (DB must be open).
  refreshKBList();
  refreshDocList();
  refreshStats();
}

// ─── Event Listeners ─────────────────────────────────────────────

function setupEventListeners() {
  // Search input
  const searchInput = $('#search-input');
  let searchTimeout = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => performSearch(searchInput.value.trim()), 300);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimeout);
      performSearch(searchInput.value.trim());
    }
  });

  // Drop zone
  const dropZone = $('#drop-zone');
  const fileInput = $('#file-input');

  setupDragDrop(dropZone, (files) => handleFiles(files));
  setupFileInput(fileInput, (files) => handleFiles(files));

  dropZone.addEventListener('click', () => fileInput.click());

  // Add KB button
  $('#add-kb-btn').addEventListener('click', () => {
    showModal({
      title: t('kb.new'),
      content: createElement('input', {
        type: 'text',
        id: 'kb-name-input',
        placeholder: t('kb.name.placeholder'),
        style: { width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)',
                 background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '0.875rem' },
      }),
      actions: [
        { label: t('kb.create'), variant: 'primary', onClick: () => {
          const input = $('#kb-name-input');
          const name = input?.value.trim();
          if (name) handleCreateKB(name);
        }},
        { label: t('common.cancel'), variant: 'secondary' },
      ],
    });
    // Auto-focus
    requestAnimationFrame(() => $('#kb-name-input')?.focus());
  });

  // State subscriptions for UI updates
  state.subscribe('currentKBId', async (kbId) => {
    updateSidebarActiveKB(kbId);
    await refreshDocList();
    await refreshStats();
    if (kbId) {
      renderSearchResults([]);
    } else {
      // No KB selected (e.g. all deleted) — return to the empty home state.
      const resultsContainer = $('#results-container');
      if (resultsContainer) resultsContainer.innerHTML = '';
      const dropZone = $('#drop-zone');
      if (dropZone) dropZone.style.display = 'block';
    }
  });

  // ─── Q&A ────────────────────────────────────────────────────
  const qaToggle = $('#qa-toggle');
  const qaPanel = $('#qa-panel');
  const qaInput = $('#qa-input');
  const qaSend = $('#qa-send');

  // Show QA toggle if WebGPU available (Pro check happens on click)
  if (isWebGPUSupported()) {
    qaToggle.style.display = 'inline-block';
  }

  qaToggle.addEventListener('click', () => toggleQAMode());
  qaSend.addEventListener('click', () => handleQAQuestion());
  qaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleQAQuestion();
    }
  });
  // Stop button
  $('#qa-stop').addEventListener('click', () => {
    abortAnswer();
    $('#qa-stop').style.display = 'none';
    $('#qa-send').style.display = 'inline-block';
  });

  state.subscribe('route', (route) => {
    if (route === 'settings') {
      showSettingsPage();
    } else {
      hideSettingsPage();
    }
  });

  // Backfill chunks stored without embeddings once the model is ready.
  state.subscribe('modelStatus', (status) => {
    if (status === 'ready') backfillNullEmbeddings();
  });

  // Settings button → toggle settings page
  $('#settings-toggle').addEventListener('click', () => {
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage.classList.contains('active')) {
      hideSettingsPage();
    } else {
      showSettingsPage();
    }
  });
  // Settings floating modal: close via ✕ or clicking the backdrop
  $('#settings-close').addEventListener('click', hideSettingsPage);
  document.getElementById('settings-page').addEventListener('click', (e) => {
    if (e.target.id === 'settings-page') hideSettingsPage();
  });
  // Help floating modal
  $('#help-toggle').addEventListener('click', showHelpPage);
  $('#help-close').addEventListener('click', hideHelpPage);
  document.getElementById('help-page').addEventListener('click', (e) => {
    if (e.target.id === 'help-page') hideHelpPage();
  });
  // Settings tab switching
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // Backup: export downloads a .ragbak; import reads one back in.
  $('#export-backup-btn').addEventListener('click', async () => {
    try {
      const r = await exportBackup();
      showToast(t('backup.exported', r), 'success');
    } catch (err) {
      showToast(t('backup.import_failed', { msg: err.message }), 'error');
    }
  });
  $('#import-backup-btn').addEventListener('click', () => $('#backup-file-input').click());
  $('#backup-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const content = await file.arrayBuffer();
      const r = await importBackup(content);
      showToast(t('backup.imported', r), 'success');
      await refreshKBList();
      await refreshDocList();
      await refreshStats();
    } catch (err) {
      showToast(t('backup.import_failed', { msg: err.message }), 'error');
    } finally {
      e.target.value = ''; // allow re-picking the same file
    }
  });
}

// ─── Q&A Mode ───────────────────────────────────────────────────

let isQAMode = false;
let qaEngineInitialized = false;

function toggleQAMode() {
  const kbId = state.get('currentKBId');
  if (!kbId) {
    showToast(t('kb.required'), 'warning');
    return;
  }

  isQAMode = !isQAMode;
  const qaPanel = $('#qa-panel');
  const searchInput = $('#search-input');
  const qaToggle = $('#qa-toggle');

  if (isQAMode) {
    // Switch to QA mode
    qaPanel.style.display = 'flex';
    qaToggle.textContent = '🔍 Search';
    searchInput.placeholder = t('qa.placeholder');
    qaInput.focus();

    // Ensure embedding model is loaded (needed for search behind QA)
    if (!isModelReady()) {
      initModel({
        modelId: getSavedEmbedModelId(),
        onProgress: (progress) => {
          if (progress.status === 'downloading') {
            state.set('modelProgress', Math.round(progress.progress * 100));
          }
        },
      }).catch(() => {});
    }

    // Init QA engine if first time
    if (!qaEngineInitialized) {
      initQAEngine((progress) => {
        if (progress.status === 'downloading') {
          addQAMessage('assistant', t('qa.loading_model', { pct: Math.round(progress.progress * 100) }), true);
        } else if (progress.status === 'ready') {
          qaEngineInitialized = true;
          addQAMessage('assistant', t('qa.model_ready'));
        } else if (progress.status === 'error') {
          addQAMessage('assistant', '❌ Failed to load AI model. WebGPU may not be available.');
        }
      }).catch((err) => {
        addQAMessage('assistant', '❌ ' + t('qa.error', { msg: err.message }));
      });
    }
  } else {
    // Switch back to search mode
    qaPanel.style.display = 'none';
    qaToggle.textContent = '🤖 Ask AI';
    searchInput.placeholder = t('search.placeholder');
  }
}

async function handleQAQuestion() {
  const input = $('#qa-input');
  const question = input.value.trim();
  if (!question) return;

  const kbId = state.get('currentKBId');
  if (!kbId) {
    showToast(t('kb.required'), 'warning');
    return;
  }

  // Check QA engine status
  const status = getEngineStatus();
  if (status === 'loading') {
    showToast(t('qa.loading_wait'), 'warning');
    return;
  }
  if (status === 'idle' || status === 'error') {
    // Try to init the engine
    showToast(t('qa.init'), 'info');
    try {
      await initQAEngine((progress) => {
        if (progress.status === 'downloading') {
          addQAMessage('assistant', t('qa.loading_model', { pct: Math.round(progress.progress * 100) }), true);
        } else if (progress.status === 'ready') {
          qaEngineInitialized = true;
          addQAMessage('assistant', t('qa.model_ready'));
        } else if (progress.status === 'error') {
          addQAMessage('assistant', '❌ Failed to load AI model. WebGPU may not be available.');
        }
      });
    } catch (err) {
      showToast(t('qa.init_failed', { msg: err.message }), 'error');
      return;
    }
  }

  // Show user question
  addQAMessage('user', question);
  input.value = '';

  // Show loading indicator with stop button
  const loadingMsg = addQAMessage('assistant', '', true);
  loadingMsg.classList.add('loading');
  const typingSpan = document.createElement('span');
  typingSpan.className = 'qa-typing';
  loadingMsg.appendChild(typingSpan);

  // Show stop button, hide send button
  $('#qa-send').style.display = 'none';
  $('#qa-stop').style.display = 'inline-block';

  try {
    let fullResponse = '';
    for await (const token of askQuestion(question, kbId)) {
      fullResponse += token;
      typingSpan.textContent = fullResponse;
      // Auto-scroll
      const messages = $('#qa-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
    loadingMsg.classList.remove('loading');
    typingSpan.classList.remove('qa-typing');
  } catch (err) {
    console.error('QA error:', err);
    loadingMsg.classList.remove('loading');
    typingSpan.textContent = '❌ ' + t('qa.error', { msg: err.message || t('qa.no_answer') });
  } finally {
    // Restore send button, hide stop button
    $('#qa-stop').style.display = 'none';
    $('#qa-send').style.display = 'inline-block';
  }
}

function addQAMessage(role, text, isLoading = false) {
  const container = $('#qa-messages');
  if (!container) return null;

  const msg = createElement('div', {
    className: `qa-message ${role}${isLoading ? ' loading' : ''}`,
    style: { display: 'flex', flexDirection: 'column' },
  });
  msg.textContent = text;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

// ─── File Handling / Ingestion Pipeline ──────────────────────────

let ingestionQueue = [];
let isIngesting = false;

async function handleFiles(files) {
  const kbId = state.get('currentKBId');
  if (!kbId) {
    showToast(t('kb.required'), 'warning');
    return;
  }

  const validFiles = [];

  for (const file of files) {
    const result = validateFile(file);
    if (result.valid) {
      validFiles.push(file);
    } else {
      showToast(`${file.name}: ${result.error}`, 'error');
    }
  }

  if (validFiles.length === 0) return;

  // Dedup: skip files already present in this KB (same name + size, including
  // files still queued) — re-uploading otherwise duplicates docs + chunks.
  const existing = await listDocuments(kbId);
  const newFiles = [];
  for (const file of validFiles) {
    const dup = existing.some((d) => d.name === file.name && d.size === file.size)
      || ingestionQueue.some((item) => item.kbId === kbId && item.file.name === file.name && item.file.size === file.size);
    if (dup) {
      showToast(t('ingestion.duplicate', { name: file.name }), 'warning');
    } else {
      newFiles.push(file);
    }
  }
  if (newFiles.length === 0) return;

  // Start model init in background (non-blocking for ingestion)
  if (!isModelReady() && state.get('modelStatus') === 'idle') {
    initModel({
      modelId: getSavedEmbedModelId(),
      onProgress: (progress) => {
        if (progress.status === 'downloading') {
          state.set('modelProgress', Math.round(progress.progress * 100));
        }
      },
    }).catch(() => {
      console.warn('Model failed to load — will embed chunks later');
    });
  }

  // Add to queue and process — each file carries its own target KB, so files
  // dropped after switching KBs route to the correct (new) KB, not the old one.
  ingestionQueue.push(...newFiles.map((file) => ({ file, kbId })));
  if (!isIngesting) {
    processIngestionQueue();
  }
}

async function processIngestionQueue() {
  isIngesting = true;
  const progressContainer = $('#ingestion-progress');
  progressContainer.classList.add('active');
  progressContainer.innerHTML = '';

  let succeeded = 0;
  let failed = 0;

  while (ingestionQueue.length > 0) {
    const item = ingestionQueue.shift();
    const ok = await processSingleFile(item.file, item.kbId, progressContainer);
    ok ? succeeded++ : failed++;
  }

  isIngesting = false;
  progressContainer.classList.remove('active');

  if (failed === 0) {
    showToast(t('ingestion.complete'), 'success');
  } else if (succeeded === 0) {
    showToast(t('ingestion.failed', { count: failed }), 'error');
  } else {
    showToast(t('ingestion.partial', { succeeded, failed }), 'warning');
  }

  await refreshDocList();
  await refreshStats();
}

let isBackfilling = false;

/**
 * Backfill chunks that were stored without embeddings (the model was still
 * downloading when they were ingested). Such chunks were silently invisible
 * to semantic search; this runs whenever the model becomes ready and embeds
 * them in batches, then refreshes KB stats.
 */
async function backfillNullEmbeddings() {
  if (isBackfilling || !isModelReady()) return;
  isBackfilling = true;
  let backfilled = 0;
  const touchedKBs = new Set();
  try {
    const kbs = await listKBs();
    for (const kb of kbs) {
      const chunks = await getChunksByKB(kb.id);
      const nullChunks = chunks.filter((c) => c.embedding == null);
      if (nullChunks.length === 0) continue;

      // Small batches so each WASM inference pass doesn't block the UI too long,
      // and yield between batches so the page stays responsive during backfill.
      const BATCH = 16;
      for (let i = 0; i < nullChunks.length; i += BATCH) {
        const batch = nullChunks.slice(i, i + BATCH);
        let vecs;
        try {
          vecs = await embed(batch.map((c) => c.text));
        } catch (err) {
          console.warn('Backfill embed failed:', err);
          break;
        }
        for (let j = 0; j < batch.length; j++) {
          if (vecs && vecs[j]) {
            await updateChunkEmbedding(batch[j].id, vecs[j]);
            backfilled++;
          }
        }
        await new Promise((r) => setTimeout(r, 0));
      }
      touchedKBs.add(kb.id);
    }

    if (backfilled > 0) {
      for (const kbId of touchedKBs) {
        const stats = await getKBStats(kbId);
        await updateKB(kbId, { chunkCount: stats.chunkCount, storageBytes: stats.storageBytes });
      }
      showToast(t('ingestion.backfilled', { count: backfilled }), 'success');
      // Results may now include semantic hits that were missing before.
      if (lastSearchQuery) performSearch(lastSearchQuery);
    }
  } catch (err) {
    console.warn('Backfill failed:', err);
  } finally {
    isBackfilling = false;
  }
}

async function processSingleFile(file, kbId, progressContainer) {
  const ext = file.name.split('.').pop().toLowerCase();

  // Create progress item
  const item = createElement('div', { className: 'progress-item' });
  const statusText = createElement('span', { className: 'progress-status' });
  item.append(createElement('span', {}, ['📄 ' + file.name]));
  item.append(statusText);
  progressContainer.append(item);

  try {
    // ─── 1. Extract text ────────────────────────────────────
    statusText.textContent = t('ingestion.extracting');
    let text = '';
    let pageCount = 0;
    let pageTexts = null;
    let pdfPages = null;

    if (ext === 'pdf') {
      const arrayBuf = await readFileAsArrayBuffer(file);
      // Single parse: PDF.js detaches the ArrayBuffer on first getDocument, so
      // pageCount must come from the same call (see pdf-extractor.js).
      const result = await extractPDFText(arrayBuf, (progress) => {
        statusText.textContent = `${t('ingestion.extracting')} (${progress.current}/${progress.total})`;
      });
      text = result.fullText;
      pageCount = result.pageCount;
      pdfPages = result.pages || null;
      pageTexts = pdfPages ? pdfPages.map((p) => p.text) : null;
    } else if (ext === 'txt') {
      text = await readFileAsText(file);
    } else if (ext === 'md') {
      text = stripMarkdown(await readFileAsText(file));
    } else if (ext === 'docx' || ext === 'epub') {
      text = await extractAdvancedFormat(file, ext);
    }

    if (!text || text.trim().length < 10) {
      statusText.textContent = '⚠️ ' + t('ingestion.too_little');
      return false;
    }

    // ─── 2. Chunk text ──────────────────────────────────────
    statusText.textContent = t('ingestion.chunking');
    // PDFs are chunked per page so chunks carry an accurate pageNumber and
    // never span page boundaries.
    let chunks;
    if (ext === 'pdf' && pdfPages && pdfPages.length > 0) {
      chunks = [];
      for (const page of pdfPages) {
        chunks.push(...chunkText(page.text, { pageNumber: page.pageNumber }));
      }
    } else {
      chunks = chunkText(text);
    }

    // ─── 3. Generate embeddings (if model ready) ───────────
    let embeddings = null;
    if (isModelReady()) {
      statusText.textContent = t('ingestion.embedding');
      try {
        const texts = chunks.map((c) => c.text);
        embeddings = await embed(texts);
      } catch {
        console.warn('Embedding failed — storing chunks without vectors');
      }
    } else {
      statusText.textContent = '⏳ ' + t('ingestion.text_only');
    }

    // ─── 4. Store in IndexedDB (with or without embeddings) ─
    statusText.textContent = t('ingestion.storing');
    const doc = await addDocument({
      kbId,
      name: file.name,
      type: ext,
      size: file.size,
      pageCount,
      chunkCount: chunks.length,
      fullText: ext === 'pdf' ? null : text,      // PDF stores pageTexts instead
      pageTexts: ext === 'pdf' ? pageTexts : null,
    });

    const chunkRecords = chunks.map((c, i) => ({
      id: 'chunk-' + doc.id + '-' + i,
      docId: doc.id,
      kbId,
      text: c.text,
      embedding: embeddings ? embeddings[i] : null,
      metadata: {
        pageNumber: c.metadata?.pageNumber || null,
        charStart: c.metadata?.charStart || 0,
        charEnd: c.metadata?.charEnd || 0,
      },
    }));

    await addChunks(chunkRecords);

    // Update KB stats
    const stats = await getKBStats(kbId);
    await updateKB(kbId, { chunkCount: stats.chunkCount, storageBytes: stats.storageBytes });

    statusText.textContent = '✅ ' + t('ingestion.chunks_done', { count: chunks.length });
    return true;

  } catch (err) {
    console.error('Ingestion error for', file.name, err);
    statusText.textContent = `❌ ${err.message || 'Error'}`;
    return false;
  }
}

async function extractAdvancedFormat(file, ext) {
  // DOCX/EPUB extraction is not implemented yet. The file validator rejects these
  // extensions before this is reached; throwing here is defense-in-depth so any
  // future wiring fails loudly instead of silently storing placeholder text.
  throw new Error(t('ingestion.unsupported_format', { ext }));
}

// ─── Search ──────────────────────────────────────────────────────

let lastSearchQuery = '';

async function performSearch(query) {
  lastSearchQuery = query;
  const kbId = state.get('currentKBId');
  const resultsContainer = $('#results-container');

  if (!query || !kbId) {
    // Clear results when search bar is empty
    resultsContainer.innerHTML = '';
    $('#drop-zone').style.display = 'block';

    if (!kbId) {
      if (!state.get('knowledgeBases').length) {
        renderEmptyState(resultsContainer, {
          icon: '📚',
          title: t('search.empty.title'),
        });
      }
    }
    return;
  }

  state.set('isSearching', true);

  // Try to init model in background (non-blocking)
  // search works via keyword even without model
  if (!isModelReady() && state.get('modelStatus') === 'idle') {
    initModel({ modelId: getSavedEmbedModelId() }).catch(() => {}); // fire-and-forget; model loads when it loads
  }

  // Show brief loading for search
  renderLoadingState(resultsContainer, { message: t('search.searching') });

  try {
    // Hybrid search: keyword always works, semantic adds on top when model is ready
    const results = await hybridSearch(query, kbId, { topK: 10, blend: 0.4 });

    if (results.length === 0) {
      renderEmptyState(resultsContainer, {
        icon: '🔍',
        title: t('search.no_results', { query }),
      });
    } else {
      renderSearchResults(results, query);
    }

    // Warn when stored embeddings were created with a different model — semantic
    // results are degraded for those documents until they are re-indexed.
    if (results.warning === 'model_changed') {
      renderModelChangeNotice(resultsContainer);
    }
  } catch (err) {
    console.error('Search error:', err);
    renderErrorState(resultsContainer, { message: t('error.generic') });
  } finally {
    state.set('isSearching', false);
  }
}

/**
 * Strip markdown table syntax from text for cleaner display.
 * Removes pipe separators, dashed separator lines, and trims whitespace.
 */
function cleanTableText(text) {
  return text
    .split('\n')
    .filter(line => !/^\|[- :|]+\|$/.test(line.trim()))  // remove |---:|---:|---| separator rows
    .map(line => line.replace(/^\||\|$/g, '').trim())       // remove leading/trailing pipes
    .join('\n')
    .trim();
}

/**
 * Render an inline notice that stored embeddings don't match the current model.
 * Semantic search is degraded for those documents until they are re-indexed.
 */
function renderModelChangeNotice(container) {
  const notice = createElement('div', {
    style: {
      display: 'flex', alignItems: 'center', gap: '0.5rem',
      padding: '0.625rem 0.875rem', marginBottom: '0.75rem',
      borderRadius: '8px', fontSize: '0.8125rem',
      background: 'var(--accent-light)', color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    },
  }, ['⚠️ ' + t('search.model_changed')]);
  container.prepend(notice);
}

/**
 * Open the full source text of a document in a modal viewer.
 * PDFs render per-page; TXT/MD show the full text; legacy documents (ingested
 * before fullText/pageTexts existed) are reconstructed from their chunks.
 */
async function openDocumentViewer(docId) {
  const doc = await getDocument(docId);
  const { text, pageTexts } = await getDocumentText(docId);

  const content = createElement('div', { className: 'doc-viewer-content' });

  if (pageTexts && pageTexts.length > 0) {
    pageTexts.forEach((page, i) => {
      content.append(createElement('h4', {
        style: { margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.8125rem', fontWeight: '600' },
      }, ['📄 ' + t('doc.page', { n: i + 1 })]));
      content.append(createElement('pre', {}, [page]));
    });
  } else if (text) {
    content.append(createElement('pre', {}, [text]));
  } else {
    content.append(createElement('p', { style: { color: 'var(--text-secondary)' } }, [t('doc.no_text')]));
  }

  showModal({ title: doc?.name || 'Document', content, size: 'wide' });
}

function renderSearchResults(results, query) {
  const container = $('#results-container');
  container.innerHTML = '';

  if (results.length === 0) {
    renderEmptyState(container, { icon: '🔍', title: t('search.no_results_title') });
    return;
  }

  // Results count
  const count = results.length;
  container.append(createElement('div', {
    style: { fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' },
  }, [t('search.results_count', { count })]));

  // Drop zone should not be shown while searching; hide it
  $('#drop-zone').style.display = 'none';

  for (const result of results) {
    const item = createElement('div', { className: 'result-item' });

    // Header (doc name + score)
    const header = createElement('div', { className: 'result-header' });
    const source = createElement('span', { className: 'result-source' });
    source.append(t('result.from') + ' ');
    const docLink = createElement('a', { href: '#', className: 'result-doc-link', title: t('doc.view_source') }, [result.docName]);
    docLink.addEventListener('click', (e) => {
      e.preventDefault();
      openDocumentViewer(result.docId);
    });
    source.append(docLink);
    if (result.pageNumber) {
      source.append(', p.' + result.pageNumber);
    }
    header.append(source);

    const scorePct = Math.round(result.score * 100);
    const scoreBadge = createElement('span', { className: 'result-score' });
    scoreBadge.textContent = scorePct + '%';
    header.append(scoreBadge);

    // Show search type badge (keyword vs semantic)
    if (result.semScore && result.semScore > 0) {
      const typeBadge = createElement('span', {
        style: {
          fontSize: '0.6875rem', padding: '1px 5px', borderRadius: '99px',
          background: 'var(--accent-light)', color: 'var(--accent)',
          marginLeft: '0.375rem',
        },
      }, ['AI']);
      header.append(typeBadge);
    }
    item.append(header);

    // Text with highlights
    const textEl = createElement('div', { className: 'result-text' });
    const cleanedText = cleanTableText(result.text);
    const parts = highlightMatches(cleanedText, query);
    for (const part of parts) {
      if (part.highlight) {
        textEl.append(createElement('mark', {}, [sanitizeHTML(part.text)]));
      } else {
        textEl.append(document.createTextNode(part.text));
      }
    }
    item.append(textEl);

    // Expand context button
    const expandBtn = createElement('button', { className: 'result-expand', dataset: { expanded: 'false' } }, [t('result.expand')]);
    const contextDiv = createElement('div', { className: 'result-context' }, [cleanTableText(result.text)]);
    expandBtn.addEventListener('click', () => {
      const isOpen = contextDiv.classList.toggle('open');
      expandBtn.textContent = isOpen ? t('result.collapse') : t('result.expand');
      expandBtn.dataset.expanded = isOpen.toString();
    });
    item.append(expandBtn);
    item.append(contextDiv);

    container.append(item);
  }
}

// ─── Knowledge Base Management ──────────────────────────────────

async function handleCreateKB(name) {
  try {
    const kb = await createKB({ name });
    showToast(`Knowledge base "${name}" created`, 'success');
    await refreshKBList();
    state.set('currentKBId', kb.id);
  } catch (err) {
    showToast(t('kb.create_failed'), 'error');
  }
}

async function handleDeleteKB(kbId) {
  showModal({
    title: t('kb.delete_title'),
    content: t('kb.delete.confirm'),
    actions: [
      { label: 'Delete', variant: 'danger', onClick: async () => {
        await deleteKB(kbId);
        showToast(t('kb.deleted'), 'success');
        await refreshKBList();
        const kbs = state.get('knowledgeBases');
        state.set('currentKBId', kbs.length > 0 ? kbs[0].id : null);
      }},
      { label: 'Cancel', variant: 'secondary' },
    ],
  });
}

async function refreshKBList() {
  const kbs = await listKBs();
  state.set('knowledgeBases', kbs);

  const list = $('#kb-list');
  const empty = $('#kb-empty');
  list.innerHTML = '';

  if (kbs.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  for (const kb of kbs) {
    const item = createElement('div', { className: 'kb-item', dataset: { kbId: kb.id } }, [
      createElement('span', { className: 'kb-item-name' }, ['📚 ' + kb.name]),
    ]);
    item.addEventListener('click', () => {
      state.set('currentKBId', kb.id);
    });

    const delBtn = createElement('button', { className: 'kb-item-delete', title: 'Delete' }, ['✕']);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteKB(kb.id);
    });
    item.append(delBtn);
    list.append(item);
  }

  updateSidebarActiveKB(state.get('currentKBId'));
}

function updateSidebarActiveKB(kbId) {
  $$('.kb-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.kbid === kbId || el.dataset.kbId === kbId);
  });
}

// ─── Document Management ────────────────────────────────────────

async function handleDeleteDocument(docId, kbId) {
  showModal({
    title: t('doc.delete_title'),
    content: t('docs.delete.confirm'),
    actions: [
      { label: 'Delete', variant: 'danger', onClick: async () => {
        await deleteDocument(docId);
        // Recalc KB stats
        const stats = await getKBStats(kbId);
        await updateKB(kbId, { chunkCount: stats.chunkCount, storageBytes: stats.storageBytes });
        showToast(t('doc.deleted'), 'success');
        await refreshDocList();
        await refreshStats();
      }},
      { label: 'Cancel', variant: 'secondary' },
    ],
  });
}

let _refreshDocListVersion = 0;
async function refreshDocList() {
  const kbId = state.get('currentKBId');
  const list = $('#doc-list');
  const empty = $('#doc-empty');

  const version = ++_refreshDocListVersion;

  list.innerHTML = '';

  if (!kbId) {
    empty.style.display = 'block';
    empty.textContent = t('docs.empty');
    return;
  }

  const docs = await listDocuments(kbId);
  // Discard stale results if refreshDocList was called again while loading
  if (version !== _refreshDocListVersion) return;

  state.set('documents', docs);

  if (docs.length === 0) {
    empty.style.display = 'block';
    empty.textContent = t('docs.empty');
    return;
  }

  empty.style.display = 'none';

  for (const doc of docs) {
    const item = createElement('div', { className: 'doc-item' });

    const nameSpan = createElement('span', { className: 'doc-item-name' });
    const icon = doc.type === 'pdf' ? '📕' : doc.type === 'md' ? '📝' : '📄';
    nameSpan.textContent = `${icon} ${doc.name}`;
    item.append(nameSpan);

    const viewBtn = createElement('button', { className: 'doc-item-view', title: t('doc.view_source') }, ['👁']);
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDocumentViewer(doc.id);
    });
    item.append(viewBtn);

    const delBtn = createElement('button', { className: 'doc-item-delete' }, ['✕']);
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteDocument(doc.id, kbId);
    });
    item.append(delBtn);

    list.append(item);
  }
}

// ─── Stats ───────────────────────────────────────────────────────

async function refreshStats() {
  const kbId = state.get('currentKBId');
  if (!kbId) {
    renderStats({ docCount: 0, chunkCount: 0, storageBytes: 0 });
    return;
  }

  const docs = await listDocuments(kbId);
  const stats = await getKBStats(kbId);
  renderStats({
    docCount: docs.length,
    chunkCount: stats.chunkCount,
    storageBytes: stats.storageBytes,
  });
}

// ─── Settings / Model Management ─────────────────────────────────

function showSettingsPage() {
  // Floating modal — the main content (search results) stays intact behind it,
  // so opening/closing settings can never wipe the current results.
  document.getElementById('settings-page').classList.add('active');
  renderSettingsPage();
}

function hideSettingsPage() {
  document.getElementById('settings-page').classList.remove('active');
}

// ─── Help Modal ─────────────────────────────────────────────────

/**
 * Render the localized help content into the help modal.
 * Sections come from i18n keys; each body is a newline-separated bullet list.
 */
function renderHelp() {
  const container = $('#help-content');
  if (!container) return;
  container.innerHTML = '';
  const sections = [
    { title: t('help.quick_title'), body: t('help.quick') },
    { title: t('help.search_title'), body: t('help.search') },
    { title: t('help.qa_title'), body: t('help.qa') },
    { title: t('help.kb_title'), body: t('help.kb') },
    { title: t('help.privacy_title'), body: t('help.privacy') },
  ];
  for (const s of sections) {
    container.append(createElement('h4', {}, [s.title]));
    const ul = createElement('ul', {});
    for (const line of s.body.split('\n')) {
      ul.append(createElement('li', {}, [line]));
    }
    container.append(ul);
  }
}

function showHelpPage() {
  renderHelp();
  document.getElementById('help-page').classList.add('active');
}

function hideHelpPage() {
  document.getElementById('help-page').classList.remove('active');
}

async function renderSettingsPage() {
  // ─── Embedding model info ────────────────────────────────
  const embedInfo = getEmbeddingModelInfo();
  const embedSelect = document.getElementById('embed-model-select');
  const availableEmbed = getAvailableEmbeddingModels();

  // Save current selection before recreating options
  const prevEmbedVal = embedSelect.value;
  embedSelect.innerHTML = '';
  for (const m of availableEmbed) {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} (${m.dims}d, ${m.size}) — ${m.quality}`;
    // Restore previous selection, or default to current active model
    if (prevEmbedVal ? m.id === prevEmbedVal : m.id === embedInfo.current.id) {
      opt.selected = true;
    }
    embedSelect.appendChild(opt);
  }

  // Update info
  if (!prevEmbedVal || embedSelect.value === embedInfo.current.id) {
    updateEmbeddingCard(embedInfo.status);
  } else {
    updateEmbeddingCardFromId(embedSelect.value);
  }

  // ─── QA model info ──────────────────────────────────────
  const qaInfo = getQAModelInfo();
  const qaSelect = document.getElementById('qa-model-select');
  const availableQA = getAvailableQAModels();
  const qaCard = document.getElementById('qa-model-card');

  // Show QA card only if WebGPU available
  const webgpuNote = document.getElementById('qa-webgpu-note');
  if (qaInfo.webgpu) {
    qaCard.style.display = 'block';
    webgpuNote.style.display = 'none';

    // Save current selection before recreating options
    const prevQAVal = qaSelect.value;
    qaSelect.innerHTML = '';
    for (const m of availableQA) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.size}) — ${m.quality}`;
      if (prevQAVal ? m.id === prevQAVal : m.id === qaInfo.current.id) {
        opt.selected = true;
      }
      qaSelect.appendChild(opt);
    }

    // Update info
    if (!prevQAVal || qaSelect.value === qaInfo.current.id) {
      updateQACard(qaInfo.status);
      document.getElementById('qa-model-name').textContent = qaInfo.current.display || qaInfo.current.name;
    } else {
      updateQACardFromId(qaSelect.value);
    }
  } else {
    qaCard.style.display = 'block';
    webgpuNote.style.display = 'flex';
    document.getElementById('qa-status-badge').textContent = t('settings.na');
    document.getElementById('qa-status-badge').className = 'model-status-badge idle';
    document.getElementById('qa-download-btn').disabled = true;
  }

  // ─── Cache info ─────────────────────────────────────────
  refreshCacheInfo();
  updateEmbedCacheStatus(embedSelect.value);
  if (qaInfo.webgpu) {
    checkModelCache('mlc-ai/Qwen2.5-0.5B').then(cached => {
      document.getElementById('qa-cache-status').textContent = cached ? t('settings.cache_cached') : t('settings.cache_not_cached');
    });
  }

  // ─── Model selector change → update card + cache ─────
  embedSelect.onchange = () => {
    const selected = embedSelect.value;
    localStorage.setItem(EMBED_MODEL_KEY, selected);
    updateEmbeddingCardFromId(selected);
    updateEmbedCacheStatus(selected);
  };

  // ─── Button event bindings (one-time) ───────────────────

  // Embed model download
  const embedDownloadBtn = document.getElementById('embed-download-btn');
  embedDownloadBtn.onclick = async () => {
    const selected = embedSelect.value;
    // Show selected model info immediately before download starts
    updateEmbeddingCardFromId(selected);
    updateEmbedCacheStatus(selected);
    if (selected !== getEmbeddingModelInfo().current.id) {
      // Different model selected — re-init needed
      showToast(t('settings.switching', { model: selected }), 'info');
    }
    embedDownloadBtn.disabled = true;
    embedDownloadBtn.textContent = t('settings.downloading');
    try {
      // Show progress section immediately
      document.getElementById('embed-progress-section').style.display = 'block';
      document.getElementById('embed-progress-fill').style.width = '0%';
      document.getElementById('embed-progress-label').textContent = '0%';

      await initModel({
        modelId: selected,
        onProgress: (progress) => {
          if (progress.status === 'downloading') {
            const pct = Math.round(progress.progress * 100);
            document.getElementById('embed-progress-fill').style.width = pct + '%';
            document.getElementById('embed-progress-label').textContent = pct + '%';
          } else if (progress.status === 'ready') {
            document.getElementById('embed-progress-section').style.display = 'none';
          }
        },
      });
      showToast(t('settings.embedding_ready'), 'success');
      // Refresh cache status and card info after download
      updateEmbedCacheStatus(selected);
      updateEmbeddingCard('ready');
      refreshCacheInfo();
    } catch (err) {
      showToast(t('settings.embedding_failed', { msg: err.message }), 'error');
    } finally {
      embedDownloadBtn.disabled = false;
      embedDownloadBtn.textContent = t('settings.download');
    }
  };

  // Embed model re-download (clear cache first)
  document.getElementById('embed-redownload-btn').onclick = async () => {
    await clearModelCache();
    document.getElementById('embed-cache-status').textContent = t('settings.cache_cleared');
    showToast(t('settings.cache_cleared_toast'), 'info');
  };

  // QA model selector change → update card + cache
  qaSelect.onchange = () => {
    const selected = qaSelect.value;
    updateQACardFromId(selected);
    checkModelCache(selected.split('-')[0]).then(cached => {
      document.getElementById('qa-cache-status').textContent = cached ? t('settings.cache_cached') : t('settings.cache_not_cached');
    });
  };

  // QA model download
  const qaDownloadBtn = document.getElementById('qa-download-btn');
  qaDownloadBtn.onclick = async () => {
    const selected = qaSelect.value;
    // Show selected info immediately
    updateQACardFromId(selected);
    document.getElementById('qa-progress-section').style.display = 'block';
    document.getElementById('qa-progress-fill').style.width = '0%';
    document.getElementById('qa-progress-label').textContent = '0%';
    qaDownloadBtn.disabled = true;
    qaDownloadBtn.textContent = t('settings.loading');
    try {
      await initQAEngine({
        modelId: selected,
        onProgress: (progress) => {
          if (progress.status === 'downloading') {
            const pct = Math.round(progress.progress * 100);
            document.getElementById('qa-progress-fill').style.width = pct + '%';
            document.getElementById('qa-progress-label').textContent = pct + '%';
          } else if (progress.status === 'ready') {
            document.getElementById('qa-progress-section').style.display = 'none';
          }
        },
      });
      showToast(t('settings.qa_ready'), 'success');
      updateQACard('ready');
      refreshCacheInfo();
    } catch (err) {
      showToast(t('settings.qa_failed', { msg: err.message }), 'error');
    } finally {
      qaDownloadBtn.disabled = false;
      qaDownloadBtn.textContent = t('settings.download');
    }
  };

  // Clear cache
  document.getElementById('clear-cache-btn').onclick = async () => {
    const ok = await clearModelCache();
    if (ok) {
      showToast(t('settings.cache_clear_success'), 'success');
      refreshCacheInfo();
      document.getElementById('embed-cache-status').textContent = t('settings.cache_not_cached');
      document.getElementById('qa-cache-status').textContent = t('settings.cache_not_cached');
    } else {
      showToast(t('settings.cache_clear_failed'), 'error');
    }
  };

  // Language buttons
  document.querySelectorAll('.settings-lang-btn').forEach(btn => {
    btn.onclick = () => {
      const lang = btn.dataset.lang;
      setLocale(lang);
      document.querySelectorAll('.settings-lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(t('settings.language_set', { name: lang === 'zh-CN' ? '简体中文' : 'English' }), 'success');
      // Re-render sidebar/search/stats so the switch takes effect immediately.
      applyLocale();
    };
  });
  // Highlight current language
  const currentLang = getLocale();
  document.querySelectorAll('.settings-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === currentLang);
  });

  // ─── State subscriptions (one-time setup) ────────────────
  state.subscribe('modelStatus', (status) => {
    if (document.getElementById('settings-page').classList.contains('active')) {
      updateEmbeddingCard(status);
    }
  });
  state.subscribe('modelProgress', (progress) => {
    const section = document.getElementById('embed-progress-section');
    if (document.getElementById('settings-page').classList.contains('active')) {
      section.style.display = progress < 100 ? 'block' : 'none';
      document.getElementById('embed-progress-fill').style.width = progress + '%';
      document.getElementById('embed-progress-label').textContent = progress + '%';
    }
  });
  state.subscribe('qaModelStatus', (status) => {
    if (document.getElementById('settings-page').classList.contains('active')) {
      updateQACard(status);
    }
  });
  state.subscribe('qaModelProgress', (progress) => {
    const section = document.getElementById('qa-progress-section');
    if (document.getElementById('settings-page').classList.contains('active')) {
      section.style.display = progress < 100 ? 'block' : 'none';
      document.getElementById('qa-progress-fill').style.width = progress + '%';
      document.getElementById('qa-progress-label').textContent = progress + '%';
    }
  });
}

function updateEmbeddingCard(status) {
  const info = getEmbeddingModelInfo();
  const badge = document.getElementById('embed-status-badge');
  badge.textContent = (STATUS_LABELS[status] || (() => status))();
  badge.className = 'model-status-badge ' + status;
  document.getElementById('embed-model-name').textContent = info.current.name;
  document.getElementById('embed-model-dims').textContent = info.current.dims + '-dim';
  document.getElementById('embed-model-size').textContent = info.current.size;
}

/**
 * Update the embedding model card to show info for a specific model ID
 * (used when user selects a model from dropdown but hasn't downloaded yet).
 */
function updateEmbeddingCardFromId(modelId) {
  const available = getAvailableEmbeddingModels();
  const model = available.find(m => m.id === modelId);
  if (!model) return;
  document.getElementById('embed-model-name').textContent = model.name;
  document.getElementById('embed-model-dims').textContent = model.dims + '-dim';
  document.getElementById('embed-model-size').textContent = model.size;
  document.getElementById('embed-status-badge').textContent = t('settings.idle');
  document.getElementById('embed-status-badge').className = 'model-status-badge idle';
}

const STATUS_LABELS = {
  idle: () => t('settings.idle'),
  ready: () => t('settings.status_ready'),
  error: () => t('settings.status_error'),
  downloading: () => t('settings.status_downloading'),
  loading: () => t('settings.status_loading'),
};

function updateQACard(status) {
  if (!status) return;
  const badge = document.getElementById('qa-status-badge');
  badge.textContent = (STATUS_LABELS[status] || (() => status))();
  badge.className = 'model-status-badge ' + status;
}

function updateQACardFromId(modelId) {
  const available = getAvailableQAModels();
  const model = available.find(m => m.id === modelId);
  if (!model) return;
  document.getElementById('qa-model-name').textContent = model.display || model.name;
  document.getElementById('qa-status-badge').textContent = t('settings.idle');
  document.getElementById('qa-status-badge').className = 'model-status-badge idle';
  document.getElementById('qa-cache-status').textContent = t('settings.cache_checking');
}

async function refreshCacheInfo() {
  try {
    const info = await getCacheInfo();
    document.getElementById('cache-file-count').textContent = info.entries;
    document.getElementById('cache-total-size').textContent = info.sizeFormatted;
  } catch {
    // Silent fallback
  }
}

function updateEmbedCacheStatus(modelId) {
  const pattern = modelId.includes('/') ? modelId.split('/')[1] : modelId;
  checkModelCache(pattern).then(cached => {
    document.getElementById('embed-cache-status').textContent = cached ? t('settings.cache_cached') : t('settings.cache_not_cached');
  });
}
