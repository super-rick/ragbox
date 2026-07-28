/**
 * Model management service — provides model info, cache inspection,
 * available model lists, and cache management utilities.
 *
 * Interacts with Service Worker's Cache Storage to report on-disk status.
 */

import { state } from './state.js';
import { getModelInfo, isModelReady } from './embedder.js';
import { isWebGPUSupported, getEngineStatus } from './qa.js';

const SW_MODEL_CACHE = 'rag-tools-models-v1';

// ─── Available Model Lists ─────────────────────────────────────────

/**
 * Available embedding models for semantic search.
 * All are Xenova models compatible with Transformers.js (ONNX WASM).
 */
const AVAILABLE_EMBEDDING_MODELS = [
  { id: 'Xenova/all-MiniLM-L6-v2',    name: 'all-MiniLM-L6-v2',    dims: 384, size: '23 MB',  speed: '⚡ Fast',   quality: 'Good' },
  { id: 'Xenova/all-MiniLM-L12-v2',   name: 'all-MiniLM-L12-v2',   dims: 384, size: '120 MB', speed: '⚡ Fast',   quality: 'Better' },
  { id: 'Xenova/all-mpnet-base-v2',   name: 'all-mpnet-base-v2',   dims: 768, size: '420 MB', speed: '🐢 Medium', quality: 'Best' },
];

/**
 * Available QA (conversation) models for RAG Q&A.
 * Requires WebGPU.
 */
const AVAILABLE_QA_MODELS = [
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',  display: 'Qwen2.5-0.5B-Instruct', name: 'Qwen2.5-0.5B',    size: '500 MB',  speed: '⚡ Fast',   quality: 'Basic' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', display: 'Qwen2.5-1.5B-Instruct', name: 'Qwen2.5-1.5B',   size: '1.5 GB',  speed: '🐢 Medium', quality: 'Better' },
];

// ─── Public API ────────────────────────────────────────────────────

/**
 * Get current embedding model information.
 */
export function getEmbeddingModelInfo() {
  const modelInfo = getModelInfo();
  return {
    current: AVAILABLE_EMBEDDING_MODELS.find(m => m.id === modelInfo.name) || AVAILABLE_EMBEDDING_MODELS[0],
    status: modelInfo.status,
  };
}

/**
 * Get current QA model information.
 */
export function getQAModelInfo() {
  // The current QA model is hard-coded in qa.js; for now we return static info.
  // In a future version this will be configurable.
  return {
    current: AVAILABLE_QA_MODELS[0],
    status: getEngineStatus(),
    webgpu: isWebGPUSupported(),
  };
}

/**
 * Get list of available embedding models.
 */
export function getAvailableEmbeddingModels() {
  return AVAILABLE_EMBEDDING_MODELS;
}

/**
 * Get list of available QA models.
 */
export function getAvailableQAModels() {
  return AVAILABLE_QA_MODELS;
}

/**
 * Get the active/in-use embedding model ID.
 */
export function getActiveEmbeddingModelId() {
  return getEmbeddingModelInfo().current.id;
}

// ─── Cache Inspection ──────────────────────────────────────────────

/**
 * Check if a given URL pattern is cached in the model cache.
 * Returns true if at least one cached entry matches the pattern.
 */
export async function checkModelCache(urlPattern) {
  if (!('caches' in window)) return false;

  try {
    const cache = await caches.open(SW_MODEL_CACHE);
    const keys = await cache.keys();
    return keys.some(req => req.url.includes(urlPattern));
  } catch {
    return false;
  }
}

/**
 * Get model cache statistics.
 */
export async function getCacheInfo() {
  if (!('caches' in window)) {
    return { entries: 0, size: 0, sizeFormatted: 'N/A' };
  }

  try {
    const cache = await caches.open(SW_MODEL_CACHE);
    const keys = await cache.keys();

    // Blob size estimation
    let totalSize = 0;
    for (const req of keys) {
      try {
        const response = await cache.match(req);
        if (response) {
          const blob = await response.clone().blob();
          totalSize += blob.size;
        }
      } catch {
        // Skip entries that can't be read
      }
    }

    return {
      entries: keys.length,
      size: totalSize,
      sizeFormatted: formatBytes(totalSize),
    };
  } catch {
    return { entries: 0, size: 0, sizeFormatted: 'N/A' };
  }
}

/**
 * Clear all model cache.
 */
export async function clearModelCache() {
  if (!('caches' in window)) return false;

  try {
    await caches.delete(SW_MODEL_CACHE);
    // Re-create the cache so it's still available for future requests
    await caches.open(SW_MODEL_CACHE);
    return true;
  } catch {
    return false;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0) + ' ' + units[i];
}
