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
import { search, highlightMatches } from './search.js';

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

  state.subscribe('route', (route) => {
    // Route changes handled by hash router
  });
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
  const isPro = state.get('isPro');

  for (const file of files) {
    const result = validateFile(file, isPro);
    if (result.valid) {
      validFiles.push(file);
    } else {
      showToast(`${file.name}: ${result.error}`, 'error');
    }
  }

  if (validFiles.length === 0) return;

  // Ensure model is loaded
  if (!isModelReady()) {
    try {
      await initModel((progress) => {
        if (progress.status === 'downloading') {
          state.set('modelProgress', Math.round(progress.progress * 100));
        }
      });
    } catch (err) {
      showToast(t('model.error'), 'error');
      return;
    }
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
  const isPro = state.get('isPro');

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
    } else if ((ext === 'docx' || ext === 'epub') && isPro) {
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
    const estimatedTokens = estimateTokens(text);

    // ─── 3. Generate embeddings ─────────────────────────────
    statusText.textContent = t('ingestion.embedding');
    const texts = chunks.map((c) => c.text);
    const embeddings = await embed(texts);

    // ─── 4. Store in IndexedDB ──────────────────────────────
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
      embedding: embeddings[i],
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
  // Placeholder for DOCX/EPUB (V2 Pro feature)
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
    if (!kbId) {
      if (!state.get('knowledgeBases').length) {
        resultsContainer.innerHTML = '';
        renderEmptyState(resultsContainer, {
          icon: '📚',
          title: t('search.empty.title'),
        });
      }
    }
    return;
  }

  // Ensure model is loaded
  if (!isModelReady()) {
    renderLoadingState(resultsContainer, { message: 'Loading search model...' });
    try {
      await initModel();
    } catch {
      renderErrorState(resultsContainer, { message: t('model.error') });
      return;
    }
  }

  state.set('isSearching', true);
  renderLoadingState(resultsContainer, { message: 'Searching...' });

  try {
    const results = await search(query, kbId, { topK: 10 });

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
