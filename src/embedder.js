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

// Hugging Face is often unreachable from some networks (especially CN), which
// made model-file requests (config.json, tokenizer.json, ...) hang or 404 and
// freeze the page. Fetch the model files from a mirror first, falling back to
// the official host. Each attempt has a timeout so a hanging host can't block.
const MODEL_REMOTE_HOSTS = ['https://hf-mirror.com/', 'https://huggingface.co/'];
// Stall watchdog: a fixed whole-download timeout would cut off slow-but-working
// downloads, so the timer is reset on every progress event and only fires when a
// host stops sending data entirely.
const MODEL_IDLE_TIMEOUT = 25_000;

// jsdelivr's +esm bundle can be unreachable/flaky on some networks, so try
// unpkg's real dist file as a fallback. import() is cached per-URL, so each
// CDN is attempted fresh.
const TRANSFORMERS_LIBRARIES = [
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm',
  'https://unpkg.com/@xenova/transformers@2.17.2/dist/transformers.min.js',
];

async function loadTransformers(remoteHost) {
  let lastErr = null;
  for (const libUrl of TRANSFORMERS_LIBRARIES) {
    try {
      const transformers = await import(libUrl);
      if (remoteHost) transformers.env.remoteHost = remoteHost;
      return transformers;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Failed to load Transformers.js');
}

/**
 * Load the model via Transformers.js with a stall watchdog.
 * The idle timer resets on every progress event, so a slow-but-progressing
 * download is never cut off; only a host that stops sending data for
 * MODEL_IDLE_TIMEOUT is treated as stalled.
 */
async function loadModel(remoteHost, onProgress) {
  const transformers = await loadTransformers(remoteHost);
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = (msg) => { if (!done) { done = true; reject(new Error(msg)); } };
    let idleTimer = setTimeout(() => fail('Model download stalled on ' + remoteHost), MODEL_IDLE_TIMEOUT);

    transformers.pipeline('feature-extraction', modelName, {
      progress_callback: (info) => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => fail('Model download stalled on ' + remoteHost), MODEL_IDLE_TIMEOUT);
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
    }).then((ext) => {
      if (!done) { done = true; clearTimeout(idleTimer); resolve(ext); }
    }).catch((err) => {
      if (!done) { done = true; clearTimeout(idleTimer); reject(err); }
    });
  });
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

  if (extractor) {
    // Requested model is already loaded. Report ready so the UI settles instead
    // of sitting at a fake "downloading" state.
    state.set('modelStatus', 'ready');
    onProgress?.({ status: 'ready' });
    return;
  }

  try {
    state.set('modelStatus', 'downloading');
    state.set('modelProgress', 0);

    let lastErr = null;
    for (const remoteHost of MODEL_REMOTE_HOSTS) {
      try {
        extractor = await loadModel(remoteHost, onProgress);
        state.set('modelStatus', 'ready');
        state.set('modelProgress', 100);
        onProgress?.({ status: 'ready' });
        return;
      } catch (err) {
        console.warn('Embedding model load failed on', remoteHost, ':', err);
        lastErr = err;
        extractor = null;
      }
    }
    throw lastErr || new Error('Failed to load embedding model on all hosts');
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
  // Dimension guard: vectors produced by different embedding models (e.g. 384-dim
  // MiniLM vs 768-dim mpnet) must not be compared — the loop would read `undefined`
  // past the shorter vector and yield NaN. Return 0 so mismatched chunks score 0.
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}
