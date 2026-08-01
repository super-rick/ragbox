/**
 * Backup / restore (.ragbak) — export all knowledge bases, documents and
 * chunks (including embeddings) to a JSON blob, and import them back.
 * Used for backup or transferring the knowledge base to another browser.
 */

import { listKBs, getAllDocuments, getAllChunks, createKB, addDocument, addChunks } from './db.js';

const BACKUP_VERSION = 1;

/**
 * Export the entire knowledge base to a .ragbak file (triggers a download).
 * @returns {Promise<{kbs: number, docs: number, chunks: number}>}
 */
export async function exportBackup() {
  const kbs = await listKBs();
  const docs = await getAllDocuments();
  const chunks = await getAllChunks();

  const data = {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    knowledgeBases: kbs.map((k) => ({ id: k.id, name: k.name, createdAt: k.createdAt })),
    documents: docs.map((d) => ({
      id: d.id, kbId: d.kbId, name: d.name, type: d.type, size: d.size,
      pageCount: d.pageCount, chunkCount: d.chunkCount,
      fullText: d.fullText || null, pageTexts: d.pageTexts || null, createdAt: d.createdAt,
    })),
    // Embeddings (Float32Array) serialize as plain arrays; seq reconstructs chunk ids on import.
    chunks: chunks.map((c) => ({
      id: c.id, docId: c.docId, kbId: c.kbId, text: c.text,
      embedding: c.embedding ? Array.from(c.embedding) : null,
      metadata: c.metadata || {},
      seq: parseInt(String(c.id).split('-').pop(), 10) || 0,
    })),
  };

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ragbox-backup-' + new Date().toISOString().slice(0, 10) + '.ragbak';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { kbs: kbs.length, docs: docs.length, chunks: chunks.length };
}

/**
 * Import a .ragbak backup into the current database.
 * Adds the backup's KBs/documents/chunks with fresh IDs (non-destructive — never
 * overwrites existing data; duplicate KB names simply appear as new KBs).
 * @param {ArrayBuffer|string} content - File content (JSON)
 * @returns {Promise<{kbs: number, docs: number, chunks: number}>}
 */
export async function importBackup(content) {
  let data;
  try {
    const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a valid .ragbak file (bad JSON).');
  }

  if (!data || data.version === undefined || !Array.isArray(data.knowledgeBases)
      || !Array.isArray(data.documents) || !Array.isArray(data.chunks)) {
    throw new Error('Not a valid .ragbak file (missing sections).');
  }

  const kbMap = {};   // oldKbId -> newKbId
  const docMap = {};  // oldDocId -> newDocId
  let kbs = 0;

  for (const kb of data.knowledgeBases) {
    const created = await createKB({ name: kb.name || 'Imported KB' });
    kbMap[kb.id] = created.id;
    kbs++;
  }

  let docs = 0;
  for (const doc of data.documents) {
    const newKbId = kbMap[doc.kbId];
    if (!newKbId) continue; // orphan doc — skip
    const created = await addDocument({
      kbId: newKbId,
      name: doc.name || 'Untitled',
      type: doc.type || 'txt',
      size: doc.size || 0,
      pageCount: doc.pageCount || 0,
      chunkCount: doc.chunkCount || 0,
      fullText: doc.fullText || null,
      pageTexts: doc.pageTexts || null,
    });
    docMap[doc.id] = created.id;
    docs++;
  }

  const chunks = data.chunks
    .map((c) => {
      const newDocId = docMap[c.docId];
      const newKbId = kbMap[c.kbId];
      if (!newDocId || !newKbId) return null; // orphan chunk — skip
      return {
        id: 'chunk-' + newDocId + '-' + (c.seq || 0),
        docId: newDocId,
        kbId: newKbId,
        text: c.text || '',
        embedding: c.embedding ? new Float32Array(c.embedding) : null,
        metadata: c.metadata || {},
      };
    })
    .filter(Boolean);

  await addChunks(chunks);

  return { kbs, docs, chunks: chunks.length };
}
