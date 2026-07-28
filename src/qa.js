/**
 * RAG Q&A — local LLM question answering over knowledge base chunks.
 *
 * Uses WebLLM (Qwen2.5-0.5B-Instruct, ~500MB) for local inference.
 * Requires WebGPU (Chrome 113+) — Pro-only feature.
 *
 * Flow:
 *   1. User asks a question
 *   2. Search KB for top-5 relevant chunks (hybrid search)
 *   3. Build prompt with context chunks
 *   4. Stream LLM response token by token
 */

import { hybridSearch } from './search.js';
import { state } from './state.js';

let engine = null;
let engineStatus = 'idle'; // idle | loading | ready | error
let currentAbortController = null;
let currentModelId = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC';

const MAX_CONTEXT_CHUNKS = 3;
const MAX_CONTEXT_CHUNKS_SEARCH = 12;

/**
 * Check if WebGPU is available.
 */
export function isWebGPUSupported() {
  return !!navigator.gpu;
}

/**
 * Get current engine status.
 */
export function getEngineStatus() {
  return engineStatus;
}

export function getQAModelId() {
  return currentModelId;
}

/**
 * Initialize the WebLLM engine.
 * @param {object|function} [opts] - Options or progress callback
 * @param {function} [opts.onProgress] - Progress callback
 * @param {string} [opts.modelId] - Model ID to load
 */
export async function initQAEngine(opts = {}) {
  const onProgress = typeof opts === 'function' ? opts : opts.onProgress;
  const newModelId = (typeof opts === 'object' ? opts.modelId : null) || currentModelId;

  // If switching to a different model, unload current first
  if (newModelId !== currentModelId) {
    unloadQAEngine();
    currentModelId = newModelId;
  }

  if (engine) return;
  if (engineStatus === 'loading') return;

  try {
    engineStatus = 'loading';
    state.set('qaModelStatus', 'loading');
    state.set('qaModelProgress', 0);
    onProgress?.({ status: 'loading', progress: 0 });

    const webllm = await import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.67/+esm');

    const initProgressCallback = (report) => {
      if (report.status === 'progress') {
        const progress = report.progress || 0;
        state.set('qaModelProgress', Math.round(progress * 100));
        onProgress?.({
          status: 'downloading',
          progress,
          loaded: report.loaded || 0,
          total: report.total || 0,
          text: report.text || '',
        });
      }
    };

    engine = await webllm.CreateMLCEngine(currentModelId, {
      initProgressCallback,
    });

    engineStatus = 'ready';
    state.set('qaModelStatus', 'ready');
    state.set('qaModelProgress', 100);
    onProgress?.({ status: 'ready' });
  } catch (err) {
    engineStatus = 'error';
    state.set('qaModelStatus', 'error');
    onProgress?.({ status: 'error', error: err.message });
    throw err;
  }
}

/**
 * Unload the current QA engine.
 */
export function unloadQAEngine() {
  engine = null;
  engineStatus = 'idle';
  currentAbortController = null;
  state.set('qaModelStatus', 'idle');
  state.set('qaModelProgress', 0);
}

/**
 * Ask a question over the knowledge base.
 * Returns an async generator that yields response tokens.
 *
 * @param {string} question - User's question
 * @param {string} kbId - Knowledge base ID
 * @returns {AsyncGenerator<string>}
 */
export async function* askQuestion(question, kbId) {
  if (!engine) {
    throw new Error('QA engine not initialized');
  }

  // Create a new abort controller for this answer
  currentAbortController = new AbortController();
  const signal = currentAbortController.signal;

  try {
    // 1. Search for relevant chunks (fetch more for merging)
    const results = await hybridSearch(question, kbId, { topK: MAX_CONTEXT_CHUNKS_SEARCH, blend: 0.6 });

    if (results.length === 0) {
      yield 'I couldn\'t find any relevant information in your knowledge base to answer this question.';
      return;
    }

    // 2. Merge consecutive chunks from the same document
    const merged = [];
    for (const r of results) {
      const last = merged[merged.length - 1];
      if (last && last.docId === r.docId) {
        // Same document — merge text if chunks are near-consecutive
        const gap = r.charStart - last.charEnd;
        if (gap >= 0 && gap < 200) {
          last.text += '\n' + r.text;
          last.charEnd = r.charEnd;
          continue;
        }
      }
      merged.push({ ...r }); // clone to avoid mutation
      if (merged.length >= MAX_CONTEXT_CHUNKS * 2) break;
    }

    // 3. Take top N merged blocks
    const contextBlocks = merged.slice(0, MAX_CONTEXT_CHUNKS);

    // 4. Build context from merged blocks
    const contextParts = contextBlocks.map((r, i) => {
      const source = r.pageNumber ? `${r.docName} (p.${r.pageNumber})` : r.docName;
      return `[Source ${i + 1}: ${source}]\n${r.text}`;
    });

    const context = contextParts.join('\n\n');

    // 6. Build prompt — with concise instruction for small model
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers questions concisely based ONLY on the provided context. '
          + 'Rules:\n'
          + '- Summarize the key information. Do NOT list every source entry.\n'
          + '- If multiple sources say the same thing, mention it once.\n'
          + '- If the context lacks enough information, say so.\n'
          + '- Keep your answer brief (under 150 words).\n'
          + '- Cite sources by name when possible.',
      },
      {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${question}`,
      },
    ];

    // 5. Check abort before streaming
    if (signal.aborted) return;

    // 6. Stream response
    const chunks = await engine.chat.completions.create({
      messages,
      stream: true,
    });

    for await (const chunk of chunks) {
      if (signal.aborted) {
        yield '\n\n⏹️ Response stopped.';
        return;
      }
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  } finally {
    currentAbortController = null;
  }
}

/**
 * Abort the current answer generation.
 */
export function abortAnswer() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
}

/**
 * Check if an answer is currently being generated.
 */
export function isAnswering() {
  return currentAbortController !== null;
}

/**
 * Reset the conversation context.
 */
export function resetConversation() {
  if (engine) {
    engine.resetChat();
  }
}
