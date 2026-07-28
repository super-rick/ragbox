/**
 * Semantic search — cosine similarity over IndexedDB vectors.
 *
 * Since all embeddings are L2-normalized, cosine similarity = dot product.
 * For V1 this is a full scan over all chunks in a KB.
 */

import { getAllChunksWithEmbeddings, getDocument } from './db.js';
import { embedSingle, cosineSimilarity } from './embedder.js';

const DEFAULT_TOP_K = 10;

/**
 * Search a knowledge base for semantically similar chunks.
 * @param {string} query - User's search query
 * @param {string} kbId - Knowledge base ID
 * @param {object} options - { topK, minScore }
 * @returns {Promise<Array<{chunk: object, score: number, docName: string, pageNumber: number|null}>>}
 */
export async function search(query, kbId, options = {}) {
  const topK = options.topK || DEFAULT_TOP_K;
  const minScore = options.minScore || 0;

  // Get query embedding
  const queryVec = await embedSingle(query);

  // Get all chunks with embeddings from this KB
  const chunks = await getAllChunksWithEmbeddings(kbId);

  if (chunks.length === 0) return [];

  // Score all chunks
  const scored = [];
  for (const chunk of chunks) {
    const score = cosineSimilarity(queryVec, chunk.embedding);
    if (score >= minScore) {
      scored.push({ chunk, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top K
  const top = scored.slice(0, topK);

  // Enrich with document metadata
  const docCache = new Map();
  const results = [];

  for (const { chunk, score } of top) {
    let docName = 'Unknown';
    if (!docCache.has(chunk.docId)) {
      const doc = await getDocument(chunk.docId);
      docCache.set(chunk.docId, doc?.name || 'Unknown');
    }
    docName = docCache.get(chunk.docId);

    results.push({
      chunkId: chunk.id,
      docId: chunk.docId,
      docName,
      text: chunk.text,
      score,
      pageNumber: chunk.metadata?.pageNumber || null,
      charStart: chunk.metadata?.charStart || 0,
      charEnd: chunk.metadata?.charEnd || 0,
    });
  }

  return results;
}

/**
 * Highlight matching terms in text.
 * Splits query into meaningful terms (words/phrases) and wraps them in <mark>.
 * Does simple overlap resolution to avoid nested marks.
 */
export function highlightMatches(text, query) {
  if (!query || !text) return text;

  // Extract search terms (split by space, filter empty/short)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 1);

  if (terms.length === 0) return text;

  // Build case-insensitive regex from all terms
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');

  // Split text into match/non-match segments
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    // The match itself
    parts.push({ text: match[0], highlight: true });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return parts;
}
