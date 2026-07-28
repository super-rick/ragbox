/**
 * Embedding engine — Transformers.js wrapper for all-MiniLM-L6-v2.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (23MB, 384-dim embeddings)
 * Runs on ONNX Runtime Web WASM backend — no WebGPU needed.
 * Uses L2-normalized vectors (cosine similarity = dot product).
 */

import { state } from './state.js';

let extractor = null;
let modelName = 'Xenova/all-MiniLM-L6-v2';

async function loadTransformers() {
  return import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm');
}

/**
 * Initialize the embedding model.
 * Shows download progress via state updates.
 * @param {object} [opts] - Options
 * @param {function} [opts.onProgress] - Progress callback
 * @param {string} [opts.modelId] - Override model ID (switches model)
 */
export async function initModel(opts = {}) {
  const onProgress = typeof opts === 'function' ? opts : opts.onProgress;
  const newModelId = opts.modelId || opts;

  // If switching to a different model, unload current first
  if (newModelId && typeof newModelId === 'string' && newModelId !== modelName) {
    unloadModel();
    modelName = newModelId;
  }

  if (extractor) return;

  try {
    state.set('modelStatus', 'downloading');
    state.set('modelProgress', 0);

    const transformers = await loadTransformers();

    extractor = await transformers.pipeline('feature-extraction', modelName, {
      progress_callback: (info) => {
        if (info.status === 'progress') {
          const progress = Math.round((info.loaded / info.total) * 100);
          state.set('modelProgress', Math.min(progress, 99));
          onProgress?.({
            status: 'downloading',
            progress: info.loaded / info.total,
            loaded: info.loaded,
            total: info.total,
          });
        } else if (info.status === 'done') {
          state.set('modelProgress', 100);
        }
      },
    });

    state.set('modelStatus', 'ready');
    state.set('modelProgress', 100);
    onProgress?.({ status: 'ready' });
  } catch (err) {
    console.error('Model init failed:', err);
    state.set('modelStatus', 'error');
    onProgress?.({ status: 'error', error: err.message });
    throw err;
  }
}

/**
 * Embed one or more text strings.
 * Returns array of Float32Array(384) — L2-normalized vectors.
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
export async function embed(texts) {
  if (!extractor) throw new Error('Model not initialized. Call initModel() first.');

  const single = typeof texts === 'string';
  const input = single ? [texts] : texts;

  if (input.length === 0) return [];

  const output = await extractor(input, {
    pooling: 'mean',
    normalize: true,
  });

  // output is a Tensor or array of Tensors depending on Transformers.js version
  const embeddings = [];
  if (output.tolist) {
    // Single tensor: [batch, 384]
    const data = output.data; // Float32Array
    const dim = output.dims[1];
    const batch = output.dims[0];
    for (let i = 0; i < batch; i++) {
      embeddings.push(new Float32Array(data.slice(i * dim, (i + 1) * dim)));
    }
  } else if (output.length) {
    // Array of tensors
    for (const tensor of output) {
      embeddings.push(new Float32Array(tensor.data));
    }
  } else {
    // Single tensor for one input
    embeddings.push(new Float32Array(output.data));
  }

  return embeddings;
}

/**
 * Embed a single text string.
 * Convenience wrapper.
 */
export async function embedSingle(text) {
  const results = await embed([text]);
  return results[0];
}

export function isModelReady() {
  return extractor !== null;
}

/**
 * Unload the current embedding model (clears extractor, resets status).
 */
export function unloadModel() {
  extractor = null;
  state.set('modelStatus', 'idle');
  state.set('modelProgress', 0);
}

/**
 * Get current model name (the actual model ID being used).
 */
export function getModelName() {
  return modelName;
}

export function getModelInfo() {
  const dims = modelName.includes('mpnet') ? 768 : 384;
  return {
    name: modelName,
    size: modelName.includes('mpnet') ? '420 MB' : modelName.includes('L12') ? '120 MB' : '23 MB',
    status: extractor ? 'ready' : state.get('modelStatus') || 'idle',
    dimensions: dims,
  };
}

/**
 * Compute cosine similarity between two normalized vectors.
 * Since vectors are L2-normalized, this is a simple dot product.
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
