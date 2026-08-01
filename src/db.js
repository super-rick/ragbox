/**
 * IndexedDB CRUD layer for rag.always.tools.
 *
 * Schema:
 *   knowledgeBases — { id, name, createdAt, chunkCount, storageBytes }
 *   documents      — { id, kbId, name, type, size, pageCount, chunkCount, createdAt }
 *   chunks         — { id, docId, kbId, text, embedding (Float32Array[384]), metadata: { pageNumber, charStart, charEnd } }
 *
 * Indexes: documents by kbId, chunks by docId and kbId.
 */

const DB_NAME = 'rag-tools';
const DB_VERSION = 1;

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let _db = null;

export function openDB() {
  return new Promise((resolve, reject) => {
    if (_db) return resolve(_db);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains('knowledgeBases')) {
        const kbStore = db.createObjectStore('knowledgeBases', { keyPath: 'id' });
        kbStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('kbId', 'kbId', { unique: false });
        docStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('chunks')) {
        const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunkStore.createIndex('docId', 'docId', { unique: false });
        chunkStore.createIndex('kbId', 'kbId', { unique: false });
      }
    };

    req.onsuccess = (event) => {
      _db = event.target.result;

      _db.onversionchange = () => {
        _db.close();
        _db = null;
      };

      _db.onerror = (e) => {
        console.error('IndexedDB error:', e.target.error);
      };

      resolve(_db);
    };

    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked — close other tabs and retry.'));
  });
}

function getStore(db, name, mode = 'readonly') {
  const tx = db.transaction(name, mode);
  return tx.objectStore(name);
}

function runTransaction(storeName, mode, callback) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const result = callback(store, tx);

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  });
}

function runMultiStore(stores, mode, callback) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const storeMap = {};
      for (const s of stores) storeMap[s] = tx.objectStore(s);
      const result = callback(storeMap, tx);

      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  });
}

// ─── Knowledge Bases ──────────────────────────────────────────────

export function createKB({ name }) {
  const kb = {
    id: 'kb-' + genId(),
    name,
    createdAt: Date.now(),
    chunkCount: 0,
    storageBytes: 0,
  };
  return runTransaction('knowledgeBases', 'readwrite', (store) => {
    store.add(kb);
    return kb;
  });
}

export function listKBs() {
  return runTransaction('knowledgeBases', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const results = [];
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function getKB(id) {
  return runTransaction('knowledgeBases', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export function updateKB(id, updates) {
  return runMultiStore(['knowledgeBases'], 'readwrite', ({ knowledgeBases }) => {
    return new Promise((resolve, reject) => {
      const getReq = knowledgeBases.get(id);
      getReq.onsuccess = () => {
        const kb = getReq.result;
        if (!kb) { resolve(null); return; }
        Object.assign(kb, updates);
        knowledgeBases.put(kb);
        resolve(kb);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

export function deleteKB(id) {
  return runMultiStore(['knowledgeBases', 'documents', 'chunks'], 'readwrite', ({ knowledgeBases, documents, chunks }) => {
    return new Promise((resolve, reject) => {
      // Delete all chunks in this KB
      const chunkIndex = chunks.index('kbId');
      const chunkReq = chunkIndex.openCursor(IDBKeyRange.only(id));
      chunkReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete all documents in this KB
      const docIndex = documents.index('kbId');
      const docReq = docIndex.openCursor(IDBKeyRange.only(id));
      docReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete the KB itself
      knowledgeBases.delete(id);
      resolve(true);
    });
  });
}

export function getKBStats(kbId) {
  return runMultiStore(['documents', 'chunks'], 'readonly', ({ documents, chunks }) => {
    return new Promise((resolve, reject) => {
      let docCount = 0;
      let chunkCount = 0;
      let storageBytes = 0;
      let pending = 2;

      const docIdx = documents.index('kbId');
      const docReq = docIdx.count(IDBKeyRange.only(kbId));
      docReq.onsuccess = () => { docCount = docReq.result; pending--; if (pending === 0) resolve({ docCount, chunkCount, storageBytes }); };
      docReq.onerror = () => reject(docReq.error);

      const chunkIdx = chunks.index('kbId');
      const chunkReq = chunkIdx.openCursor(IDBKeyRange.only(kbId));
      chunkReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          chunkCount++;
          // Estimate: embedding (384 floats * 4 bytes) + text + overhead
          storageBytes += 384 * 4 + (cursor.value.text?.length || 0) + 200;
          cursor.continue();
        } else {
          pending--;
          if (pending === 0) resolve({ docCount, chunkCount, storageBytes });
        }
      };
      chunkReq.onerror = () => reject(chunkReq.error);
    });
  });
}

// ─── Documents ──────────────────────────────────────────────────

export function addDocument({ kbId, name, type, size, pageCount = 0, chunkCount = 0, fullText = null, pageTexts = null }) {
  const doc = {
    id: 'doc-' + genId(),
    kbId,
    name,
    type,
    size,
    pageCount,
    chunkCount,
    fullText,    // TXT/MD: full extracted text (for the source viewer)
    pageTexts,   // PDF: array of per-page text (page-accurate source viewer)
    createdAt: Date.now(),
  };
  return runTransaction('documents', 'readwrite', (store) => {
    store.add(doc);
    return doc;
  });
}

export function updateDocument(id, updates) {
  return runMultiStore(['documents'], 'readwrite', ({ documents }) => {
    return new Promise((resolve, reject) => {
      const getReq = documents.get(id);
      getReq.onsuccess = () => {
        const doc = getReq.result;
        if (!doc) { resolve(null); return; }
        Object.assign(doc, updates);
        documents.put(doc);
        resolve(doc);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

export function listDocuments(kbId) {
  return runTransaction('documents', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      if (kbId) {
        const index = store.index('kbId');
        const req = index.getAll(IDBKeyRange.only(kbId));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }
    });
  });
}

export function getDocument(id) {
  return runTransaction('documents', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

export function deleteDocument(id) {
  return runMultiStore(['documents', 'chunks'], 'readwrite', ({ documents, chunks }) => {
    return new Promise((resolve, reject) => {
      // Delete all chunks for this document
      const chunkIndex = chunks.index('docId');
      const chunkReq = chunkIndex.openCursor(IDBKeyRange.only(id));
      chunkReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      // Delete the document
      documents.delete(id);
      resolve(true);
    });
  });
}

export function getDocumentStats() {
  return runTransaction('documents', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const docs = req.result;
        resolve({
          totalDocs: docs.length,
          totalSize: docs.reduce((sum, d) => sum + (d.size || 0), 0),
        });
      };
      req.onerror = () => reject(req.error);
    });
  });
}

// ─── Chunks ─────────────────────────────────────────────────────

export function addChunks(chunks) {
  return runTransaction('chunks', 'readwrite', (store) => {
    for (const chunk of chunks) {
      store.add(chunk);
    }
    return chunks.length;
  });
}

export function getChunksByDoc(docId) {
  return runTransaction('chunks', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('docId');
      const req = index.getAll(IDBKeyRange.only(docId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

export function getChunksByKB(kbId) {
  return runTransaction('chunks', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('kbId');
      const req = index.getAll(IDBKeyRange.only(kbId));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Get a document's full text for the source viewer.
 * Prefers stored pageTexts (PDF) or fullText (TXT/MD); falls back to
 * reconstructing from chunks for documents ingested before these fields
 * existed (chunk ids are `chunk-<docId>-<i>`, i.e. ingestion order).
 */
export async function getDocumentText(docId) {
  const doc = await getDocument(docId);
  if (!doc) return { text: '', pageTexts: null };

  if (Array.isArray(doc.pageTexts) && doc.pageTexts.length) {
    return { text: doc.pageTexts.join('\n\n'), pageTexts: doc.pageTexts };
  }
  if (typeof doc.fullText === 'string' && doc.fullText.length) {
    return { text: doc.fullText, pageTexts: null };
  }

  const chunks = await getChunksByDoc(docId);
  chunks.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { text: chunks.map((c) => c.text).join('\n\n'), pageTexts: null };
}

export function deleteChunksByDoc(docId) {
  return runTransaction('chunks', 'readwrite', (store) => {
    return new Promise((resolve, reject) => {
      const index = store.index('docId');
      const req = index.openCursor(IDBKeyRange.only(docId));
      let count = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          count++;
          cursor.continue();
        } else {
          resolve(count);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Get all chunks with embeddings for a knowledge base.
 * Returns an array of { id, docId, text, embedding (Float32Array[384]), metadata }.
 */
export function getAllChunksWithEmbeddings(kbId) {
  return runTransaction('chunks', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const results = [];
      const index = store.index('kbId');
      const req = index.openCursor(IDBKeyRange.only(kbId));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const { id, docId, text, embedding, metadata } = cursor.value;
          // Ensure embedding is Float32Array (it is natively in IndexedDB)
          results.push({ id, docId, text, embedding, metadata });
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });
}

// ─── Maintenance ────────────────────────────────────────────────

export function getStorageEstimate() {
  if (navigator.storage && navigator.storage.estimate) {
    return navigator.storage.estimate();
  }
  return { usage: 0, quota: 0 };
}

export function closeDB() {
  if (_db) {
    _db.close();
    _db = null;
  }
}
