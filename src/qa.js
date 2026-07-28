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

const MODEL_ID = 'Qwen2.5-0.5B-Instruct';
const MAX_CONTEXT_CHUNKS = 5;

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

/**
 * Initialize the WebLLM engine.
 * Downloads model (~500MB) on first call.
 */
export async function initQAEngine(onProgress) {
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

    engine = await webllm.CreateMLCEngine(MODEL_ID, {
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

  // 1. Search for relevant chunks
  const results = await hybridSearch(question, kbId, { topK: MAX_CONTEXT_CHUNKS, blend: 0.6 });

  if (results.length === 0) {
    yield 'I couldn\'t find any relevant information in your knowledge base to answer this question.';
    return;
  }

  // 2. Build context from chunks
  const contextParts = results.map((r, i) => {
    const source = r.docName + (r.pageNumber ? ` (p.${r.pageNumber})` : '');
    return `[Source ${i + 1}: ${source}]\n${r.text}`;
  });

  const context = contextParts.join('\n\n');

  // 3. Build prompt
  const messages = [
    {
      role: 'system',
      content: 'You are a helpful assistant that answers questions based ONLY on the provided context. '
        + 'If the context does not contain enough information to answer, say "The provided documents '
        + 'don\'t contain enough information to answer this question." Be concise. Cite sources when possible.',
    },
    {
      role: 'user',
      content: `Context:\n${context}\n\nQuestion: ${question}`,
    },
  ];

  // 4. Stream response
  const chunks = await engine.chat.completions.create({
    messages,
    stream: true,
  });

  for await (const chunk of chunks) {
    const content = chunk.choices?.[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}

/**
 * Reset the conversation context.
 */
export function resetConversation() {
  if (engine) {
    engine.resetChat();
  }
}
