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
         addChunks, getChunksByKB, getStorageEstimate } from './db.js';
import { chunkText, estimateTokens } from './chunker.js';
import { extractPDFText, getPageCount } from './pdf-extractor.js';
import { readFileAsArrayBuffer, readFileAsText, setupDragDrop, setupFileInput,
         validateFile, stripMarkdown } from './file-handler.js';
import { initModel, embed, embedSingle, isModelReady, getModelInfo } from './embedder.js';
import { hybridSearch, keywordSearch, highlightMatches } from './search.js';
import { initLicense } from './license.js';
import { initQAEngine, askQuestion, isWebGPUSupported, getEngineStatus, getQAModelId, abortAnswer, isAnswering, unloadQAEngine } from './qa.js';
import {
  getEmbeddingModelInfo, getQAModelInfo,
  getAvailableEmbeddingModels, getAvailableQAModels,
  checkModelCache, getCacheInfo, clearModelCache,
} from './models.js';

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

  // Auto-init model on first search or ingestion
  console.log('RAG Tools initialized.');
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
        { label: 'Cancel', variant: 'secondary' },
      ],
    });
    // Auto-focus
    requestAnimationFrame(() => $('#kb-name-input')?.focus());
  });

  // State subscriptions for UI updates
  state.subscribe('currentKBId', async (kbId) => {
    updateSidebarActiveKB(kbId);
    if (kbId) {
      await refreshDocList();
      await refreshStats();
      renderSearchResults([]);
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

  // Settings button → toggle settings page
  $('#settings-toggle').addEventListener('click', () => {
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage.classList.contains('active')) {
      hideSettingsPage();
    } else {
      showSettingsPage();
    }
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
}

// ─── Q&A Mode ───────────────────────────────────────────────────

let isQAMode = false;
let qaEngineInitialized = false;

function toggleQAMode() {
  const kbId = state.get('currentKBId');
  if (!kbId) {
    showToast('Please select a knowledge base first.', 'warning');
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
    searchInput.placeholder = 'Ask AI about your documents...';
    qaInput.focus();

    // Ensure embedding model is loaded (needed for search behind QA)
    if (!isModelReady()) {
      initModel((progress) => {
        if (progress.status === 'downloading') {
          state.set('modelProgress', Math.round(progress.progress * 100));
        }
      }).catch(() => {});
    }

    // Init QA engine if first time
    if (!qaEngineInitialized) {
      initQAEngine((progress) => {
        if (progress.status === 'downloading') {
          addQAMessage('assistant', `⏳ Loading AI model (${Math.round(progress.progress * 100)}%)...`, true);
        } else if (progress.status === 'ready') {
          qaEngineInitialized = true;
          addQAMessage('assistant', '✅ AI model ready! Ask me anything about your documents.');
        } else if (progress.status === 'error') {
          addQAMessage('assistant', '❌ Failed to load AI model. WebGPU may not be available.');
        }
      }).catch((err) => {
        addQAMessage('assistant', '❌ Error: ' + err.message);
      });
    }
  } else {
    // Switch back to search mode
    qaPanel.style.display = 'none';
    qaToggle.textContent = '🤖 Ask AI';
    searchInput.placeholder = 'Search your documents...';
  }
}

async function handleQAQuestion() {
  const input = $('#qa-input');
  const question = input.value.trim();
  if (!question) return;

  const kbId = state.get('currentKBId');
  if (!kbId) {
    showToast('Please select a knowledge base first.', 'warning');
    return;
  }

  // Check QA engine status
  const status = getEngineStatus();
  if (status === 'loading') {
    showToast('AI model is still loading, please wait...', 'warning');
    return;
  }
  if (status === 'idle' || status === 'error') {
    // Try to init the engine
    showToast('Initializing AI model...', 'info');
    try {
      await initQAEngine((progress) => {
        if (progress.status === 'downloading') {
          addQAMessage('assistant', `⏳ Loading AI model (${Math.round(progress.progress * 100)}%)...`, true);
        } else if (progress.status === 'ready') {
          qaEngineInitialized = true;
          addQAMessage('assistant', '✅ AI model ready! Ask me anything about your documents.');
        } else if (progress.status === 'error') {
          addQAMessage('assistant', '❌ Failed to load AI model. WebGPU may not be available.');
        }
      });
    } catch (err) {
      showToast('Failed to initialize AI model: ' + err.message, 'error');
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
    typingSpan.textContent = '❌ Error: ' + (err.message || 'Failed to get answer');
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
    showToast('Please create or select a knowledge base first.', 'warning');
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

  // Start model init in background (non-blocking for ingestion)
  if (!isModelReady() && state.get('modelStatus') === 'idle') {
    initModel((progress) => {
      if (progress.status === 'downloading') {
        state.set('modelProgress', Math.round(progress.progress * 100));
      }
    }).catch(() => {
      console.warn('Model failed to load — will embed chunks later');
    });
  }

  // Add to queue and process
  ingestionQueue.push(...validFiles);
  if (!isIngesting) {
    processIngestionQueue(kbId);
  }
}

async function processIngestionQueue(kbId) {
  isIngesting = true;
  const progressContainer = $('#ingestion-progress');
  progressContainer.classList.add('active');
  progressContainer.innerHTML = '';

  while (ingestionQueue.length > 0) {
    const file = ingestionQueue.shift();
    await processSingleFile(file, kbId, progressContainer);
  }

  isIngesting = false;
  progressContainer.classList.remove('active');
  showToast(t('ingestion.complete'), 'success');
  await refreshDocList();
  await refreshStats();
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

    if (ext === 'pdf') {
      const arrayBuf = await readFileAsArrayBuffer(file);
      pageCount = await getPageCount(arrayBuf);
      const result = await extractPDFText(arrayBuf, (progress) => {
        statusText.textContent = `${t('ingestion.extracting')} (${progress.current}/${progress.total})`;
      });
      text = result.fullText;
    } else if (ext === 'txt') {
      text = await readFileAsText(file);
    } else if (ext === 'md') {
      text = stripMarkdown(await readFileAsText(file));
    } else if (ext === 'docx' || ext === 'epub') {
      text = await extractAdvancedFormat(file, ext);
    }

    if (!text || text.trim().length < 10) {
      statusText.textContent = '⚠️ Too little text extracted';
      // But still continue to avoid letting the error block the queue
      return;
    }

    // ─── 2. Chunk text ──────────────────────────────────────
    statusText.textContent = t('ingestion.chunking');
    const chunks = chunkText(text);

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
      statusText.textContent = '⏳ Model loading, storing text only...';
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

    statusText.textContent = '✅ ' + chunks.length + ' chunks';

  } catch (err) {
    console.error('Ingestion error for', file.name, err);
    statusText.textContent = `❌ ${err.message || 'Error'}`;
  }
}

async function extractAdvancedFormat(file, ext) {
  // Placeholder for DOCX/EPUB
  const arrayBuf = await readFileAsArrayBuffer(file);

  if (ext === 'docx') {
    // DOCX is a ZIP of XML — will implement in V2 with JSZip
    return `[DOCX support requires Pro — file: ${file.name}]`;
  } else if (ext === 'epub') {
    // EPUB is a ZIP of HTML — will implement in V2 with JSZip
    return `[EPUB support requires Pro — file: ${file.name}]`;
  }
  return '';
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
    initModel().catch(() => {}); // fire-and-forget; model loads when it loads
  }

  // Show brief loading for search
  renderLoadingState(resultsContainer, { message: 'Searching...' });

  try {
    // Hybrid search: keyword always works, semantic adds on top when model is ready
    const results = await hybridSearch(query, kbId, { topK: 10, blend: 0.4 });

    if (results.length === 0) {
      renderEmptyState(resultsContainer, {
        icon: '🔍',
        title: t('search.no_results', { query }),
      });
      return;
    }

    renderSearchResults(results, query);
  } catch (err) {
    console.error('Search error:', err);
    renderErrorState(resultsContainer, { message: t('error.generic') });
  } finally {
    state.set('isSearching', false);
  }
}

function renderSearchResults(results, query) {
  const container = $('#results-container');
  container.innerHTML = '';

  if (results.length === 0) {
    renderEmptyState(container, { icon: '🔍', title: 'No results' });
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
    source.textContent = result.pageNumber
      ? `${t('result.from')} ${result.docName}, p.${result.pageNumber}`
      : `${t('result.from')} ${result.docName}`;
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
    const parts = highlightMatches(result.text, query);
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
    const contextDiv = createElement('div', { className: 'result-context' }, [result.text]);
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
    showToast('Failed to create knowledge base', 'error');
  }
}

async function handleDeleteKB(kbId) {
  showModal({
    title: 'Delete Knowledge Base',
    content: t('kb.delete.confirm'),
    actions: [
      { label: 'Delete', variant: 'danger', onClick: async () => {
        await deleteKB(kbId);
        showToast('Knowledge base deleted', 'success');
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
      createElement('span', {}, ['📚 ' + kb.name]),
    ]);
    item.addEventListener('click', () => {
      state.set('currentKBId', kb.id);
    });
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
    title: 'Delete Document',
    content: t('docs.delete.confirm'),
    actions: [
      { label: 'Delete', variant: 'danger', onClick: async () => {
        await deleteDocument(docId);
        // Recalc KB stats
        const stats = await getKBStats(kbId);
        await updateKB(kbId, { chunkCount: stats.chunkCount, storageBytes: stats.storageBytes });
        showToast('Document deleted', 'success');
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
  document.getElementById('results-area').style.display = 'none';
  document.getElementById('search-bar').style.display = 'none';
  document.getElementById('ingestion-progress').style.display = 'none';
  document.getElementById('qa-panel').style.display = 'none';
  document.getElementById('settings-page').classList.add('active');

  renderSettingsPage();
}

function hideSettingsPage() {
  document.getElementById('settings-page').classList.remove('active');
  document.getElementById('results-area').style.display = 'flex';
  document.getElementById('search-bar').style.display = 'block';
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
    document.getElementById('qa-status-badge').textContent = 'N/A';
    document.getElementById('qa-status-badge').className = 'model-status-badge idle';
    document.getElementById('qa-download-btn').disabled = true;
  }

  // ─── Cache info ─────────────────────────────────────────
  refreshCacheInfo();
  updateEmbedCacheStatus(embedSelect.value);
  if (qaInfo.webgpu) {
    checkModelCache('mlc-ai/Qwen2.5-0.5B').then(cached => {
      document.getElementById('qa-cache-status').textContent = cached ? '📦 Cache: cached' : '📦 Cache: not cached';
    });
  }

  // ─── Model selector change → update card + cache ─────
  embedSelect.onchange = () => {
    const selected = embedSelect.value;
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
      showToast(`Switching to ${selected}. Re-index documents after download.`, 'info');
    }
    embedDownloadBtn.disabled = true;
    embedDownloadBtn.textContent = '⏳ Downloading...';
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
      showToast('Embedding model ready!', 'success');
      // Refresh cache status and card info after download
      updateEmbedCacheStatus(selected);
      updateEmbeddingCard('ready');
      refreshCacheInfo();
    } catch (err) {
      showToast('Failed to load model: ' + err.message, 'error');
    } finally {
      embedDownloadBtn.disabled = false;
      embedDownloadBtn.textContent = '⬇ Download';
    }
  };

  // Embed model re-download (clear cache first)
  document.getElementById('embed-redownload-btn').onclick = async () => {
    await clearModelCache();
    document.getElementById('embed-cache-status').textContent = '📦 Cache: cleared';
    showToast('Cache cleared. Click Download to re-download.', 'info');
  };

  // QA model selector change → update card + cache
  qaSelect.onchange = () => {
    const selected = qaSelect.value;
    updateQACardFromId(selected);
    checkModelCache(selected.split('-')[0]).then(cached => {
      document.getElementById('qa-cache-status').textContent = cached ? '📦 Cache: cached' : '📦 Cache: not cached';
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
    qaDownloadBtn.textContent = '⏳ Loading...';
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
      showToast('QA model ready!', 'success');
      updateQACard('ready');
      refreshCacheInfo();
    } catch (err) {
      showToast('Failed to load QA model: ' + err.message, 'error');
    } finally {
      qaDownloadBtn.disabled = false;
      qaDownloadBtn.textContent = '⬇ Download';
    }
  };

  // Clear cache
  document.getElementById('clear-cache-btn').onclick = async () => {
    const ok = await clearModelCache();
    if (ok) {
      showToast('Model cache cleared', 'success');
      refreshCacheInfo();
      document.getElementById('embed-cache-status').textContent = '📦 Cache: not cached';
      document.getElementById('qa-cache-status').textContent = '📦 Cache: not cached';
    } else {
      showToast('Failed to clear cache', 'error');
    }
  };

  // Language buttons
  document.querySelectorAll('.settings-lang-btn').forEach(btn => {
    btn.onclick = () => {
      const lang = btn.dataset.lang;
      setLocale(lang);
      document.querySelectorAll('.settings-lang-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Language set to ${lang === 'zh-CN' ? '中文' : 'English'}`, 'success');
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
  badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
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
  document.getElementById('embed-status-badge').textContent = 'Idle';
  document.getElementById('embed-status-badge').className = 'model-status-badge idle';
}

function updateQACard(status) {
  if (!status) return;
  const badge = document.getElementById('qa-status-badge');
  badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  badge.className = 'model-status-badge ' + status;
}

function updateQACardFromId(modelId) {
  const available = getAvailableQAModels();
  const model = available.find(m => m.id === modelId);
  if (!model) return;
  document.getElementById('qa-model-name').textContent = model.display || model.name;
  document.getElementById('qa-status-badge').textContent = 'Idle';
  document.getElementById('qa-status-badge').className = 'model-status-badge idle';
  document.getElementById('qa-cache-status').textContent = '📦 Cache: checking...';
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
    document.getElementById('embed-cache-status').textContent = cached ? '📦 Cache: cached' : '📦 Cache: not cached';
  });
}
