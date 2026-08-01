/**
 * Search engine — hybrid keyword + semantic search over IndexedDB chunks.
 *
 * - **Keyword**: TF-weighted text matching (always works, no model needed)
 * - **Semantic**: cosine similarity over 384-dim embeddings
 * - **Hybrid**: RRF fusion of both scores
 *
 * Falls back to keyword-only when the embedding model isn't ready.
 */

import { getChunksByKB, getDocument } from './db.js';
import { embedSingle, cosineSimilarity, isModelReady } from './embedder.js';

const DEFAULT_TOP_K = 10;

// ─── Keyword Search ──────────────────────────────────────────────

/**
 * Keyword search — scores chunks by query term frequency (TF).
 * Always works, no model needed. Runs instantly over IndexedDB text.
 */
export async function keywordSearch(query, kbId, options = {}) {
  const topK = options.topK || DEFAULT_TOP_K;
  const terms = extractTerms(query);

  if (terms.length === 0) return [];

  const chunks = await getChunksByKB(kbId);
  if (chunks.length === 0) return [];

  const scored = [];
  for (const chunk of chunks) {
    const score = scoreChunkByTerms(chunk.text, terms);
    if (score > 0) {
      scored.push({ chunk, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return enrichResults(top);
}

/**
 * Extract meaningful search terms from a query string.
 * Supports both English (space-separated) and Chinese (bigram).
 */
function extractTerms(query) {
  const cleaned = query.toLowerCase().replace(/[^\w一-鿿\s]/g, ' ').trim();

  // Space-separated words (English) — keep multi-char words
  const words = cleaned.split(/\s+/).filter((t) => t.length > 1);

  // Chinese: emit bigrams for multi-char runs, and KEEP single CJK characters
  // as terms so one-character queries (e.g. "价") still find results. The old
  // line.length > 2 guard also dropped two-character queries (e.g. "价格").
  const lines = cleaned.split(/\s+/);
  for (const line of lines) {
    if (!/[一-鿿]/.test(line)) continue;
    if (line.length === 1) {
      if (!words.includes(line)) words.push(line);
      continue;
    }
    for (let i = 0; i < line.length - 1; i++) {
      const bigram = line.slice(i, i + 2);
      if (bigram.length === 2 && !words.includes(bigram)) {
        words.push(bigram);
      }
    }
  }

  return words;
}

/**
 * Score a chunk of text against search terms using TF weighting.
 */
function scoreChunkByTerms(text, terms) {
  const lower = text.toLowerCase();
  let score = 0;

  for (const term of terms) {
    // Exact word match (higher weight)
    const wordRegex = new RegExp('\\b' + escapeRegex(term) + '\\b', 'gi');
    let match;
    let count = 0;
    while ((match = wordRegex.exec(lower)) !== null) {
      count++;
    }
    if (count > 0) {
      score += count * 2;
      continue;
    }

    // Substring match (for Chinese characters or partial words)
    let pos = 0;
    let subCount = 0;
    while ((pos = lower.indexOf(term, pos)) !== -1) {
      subCount++;
      pos += term.length;
    }
    if (subCount > 0) score += subCount;

    // Bonus: term in first 50 chars (title/intro)
    if (lower.slice(0, 50).includes(term)) score += 1;
  }

  // Normalize by text length to avoid bias toward long chunks
  return score / Math.max(1, Math.sqrt(text.length));
}

// ─── Semantic Search ─────────────────────────────────────────────

/**
 * Semantic search — cosine similarity over all vectors in a KB.
 * Requires the embedding model to be loaded.
 */
export async function semanticSearch(query, kbId, options = {}) {
  const topK = options.topK || DEFAULT_TOP_K;
  const minScore = options.minScore || 0;

  const queryVec = await embedSingle(query);
  const chunks = await getChunksByKB(kbId);
  if (chunks.length === 0) return [];

  const scored = [];
  let mismatchedChunks = 0;
  for (const chunk of chunks) {
    if (!chunk.embedding) continue;
    // Dimension guard: stored vectors from a different embedding model would produce
    // NaN scores in cosineSimilarity. Skip them so keyword search keeps working, and
    // flag so the UI can tell the user to re-index.
    if (chunk.embedding.length !== queryVec.length) {
      mismatchedChunks++;
      continue;
    }
    const score = cosineSimilarity(queryVec, chunk.embedding);
    if (score >= minScore) {
      scored.push({ chunk, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);
  const results = await enrichResults(top);
  if (mismatchedChunks > 0) results.warning = 'model_changed';
  return results;
}

// ─── Hybrid Search ───────────────────────────────────────────────

/**
 * Hybrid search — combines keyword + semantic scores using RRF.
 * When the model isn't ready, falls back to keyword-only.
 *
 * @param {string} query - User's search query
 * @param {string} kbId - Knowledge base ID
 * @param {object} options - { topK, blend } blend: 0=keyword, 1=semantic
 * @returns {Promise<Array>}
 */
export async function hybridSearch(query, kbId, options = {}) {
  const topK = options.topK || DEFAULT_TOP_K;
  const blend = options.blend !== undefined ? options.blend : 0.5;

  // Keyword search (always works)
  const keywordResults = await keywordSearch(query, kbId, { topK: topK * 2 });

  // Semantic search (if model available)
  let semanticResults = [];
  let semanticWarning = null;
  if (isModelReady()) {
    try {
      semanticResults = await semanticSearch(query, kbId, { topK: topK * 2 });
      semanticWarning = semanticResults.warning || null;
    } catch {
      // Model failed — keyword only is fine
    }
  }

  const results = fuseResults(keywordResults, semanticResults, blend, topK);
  // Surface a model-change warning even when semantic results are empty (keyword fallback).
  if (semanticWarning) results.warning = semanticWarning;
  return results;
}

/**
 * Legacy search API — delegates to hybridSearch.
 */
export async function search(query, kbId, options = {}) {
  return hybridSearch(query, kbId, options);
}

/**
 * Fuse two ranked result sets using blended score.
 */
function fuseResults(keyword, semantic, blend, topK) {
  if (semantic.length === 0) return keyword.slice(0, topK).map(r => ({ ...r, kwScore: r.score, semScore: 0 }));
  if (keyword.length === 0) return semantic.slice(0, topK).map(r => ({ ...r, kwScore: 0, semScore: r.score }));

  const map = new Map();

  const kwMax = keyword[0].score;
  for (const r of keyword) {
    const id = r.chunkId || r.chunk?.id;
    map.set(id, {
      ...r,
      kwScore: r.score / kwMax,
      semScore: 0,
      blendScore: (r.score / kwMax) * (1 - blend),
    });
  }

  const semMax = semantic[0].score;
  for (const r of semantic) {
    const id = r.chunkId || r.chunk?.id;
    const normalized = r.score / semMax;
    if (map.has(id)) {
      const e = map.get(id);
      e.semScore = normalized;
      e.blendScore = normalized * blend + e.kwScore * (1 - blend);
    } else {
      map.set(id, {
        ...r,
        kwScore: 0,
        semScore: normalized,
        blendScore: normalized * blend,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.blendScore - a.blendScore)
    .slice(0, topK);
}

// ─── Helpers ─────────────────────────────────────────────────────

async function enrichResults(scored) {
  const docCache = new Map();
  const results = [];

  for (const { chunk, score } of scored) {
    const docId = chunk.docId;
    if (!docCache.has(docId)) {
      const doc = await getDocument(docId);
      docCache.set(docId, doc?.name || 'Unknown');
    }

    results.push({
      chunkId: chunk.id,
      docId,
      docName: docCache.get(docId),
      text: chunk.text,
      score,
      pageNumber: chunk.metadata?.pageNumber || null,
      charStart: chunk.metadata?.charStart || 0,
      charEnd: chunk.metadata?.charEnd || 0,
    });
  }

  return results;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Highlighting ────────────────────────────────────────────────

/**
 * Highlight matching terms in text.
 * Splits query into meaningful terms and wraps matches in <mark> tags.
 */
export function highlightMatches(text, query) {
  if (!query || !text) return text;

  // Use the SAME term extraction as search so highlights align with what matched.
  const terms = extractTerms(query);
  if (terms.length === 0) return text;

  // Longest-first so a bigram wins over its single chars in alternation.
  const escaped = terms.slice().sort((a, b) => b.length - a.length).map((t) => escapeRegex(t));
  const pattern = new RegExp('(' + escaped.join('|') + ')', 'gi');

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
    }
    parts.push({ text: match[0], highlight: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), highlight: false });
  }

  return parts;
}
