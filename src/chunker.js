/**
 * Recursive character text splitter.
 *
 * Strategy (LangChain-inspired):
 *   1. Split by paragraph (\n\n)
 *   2. If chunk > chunkSize, split by sentence (。！？.!?\n)
 *   3. If still > chunkSize, split by clause (，；,;)
 *   4. If still > chunkSize, split by word boundary (whitespace)
 *   5. If still > chunkSize, hard split at chunkSize
 * After splitting, merge small adjacent chunks with overlap.
 */

const DEFAULT_CHUNK_SIZE = 512;   // characters (not tokens — estimated ~1.3 chars/token for English/Chinese)
const DEFAULT_OVERLAP = 50;       // ~10% of chunkSize

// Chinese and English sentence-ending characters
const SENTENCE_SEPARATORS = ['。', '！', '？', '.', '!', '?', '\n'];
const CLAUSE_SEPARATORS = ['；', '，', ';', ',', '：', ':', '）', '）', ')', '」', '】', '》'];

/**
 * Chunk text into overlapping segments.
 * @param {string} text - Raw text to split
 * @param {object} options - { chunkSize, overlap }
 * @returns {Array<{text: string, metadata: {charStart: number, charEnd: number}}>}
 */
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap !== undefined ? options.overlap : Math.round(chunkSize * 0.1);
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawChunks = splitRecursive(normalized, chunkSize, 0);
  return mergeWithOverlap(rawChunks, chunkSize, overlap);
}

/**
 * Recursively split text using the best available separator.
 */
function splitRecursive(text, chunkSize, offset) {
  const results = [];

  if (text.length <= chunkSize) {
    results.push({ text, metadata: { charStart: offset, charEnd: offset + text.length } });
    return results;
  }

  // Try paragraph split
  const paraSplits = splitBySeparators(text, ['\n\n', '\n\r\n', '\r\n\r\n']);
  if (paraSplits.length > 1) {
    for (const part of paraSplits) {
      if (!part) continue;
      results.push(...splitRecursive(part, chunkSize, offset + text.indexOf(part)));
    }
    return results;
  }

  // Try sentence split
  const sentSplits = splitBySeparators(text, SENTENCE_SEPARATORS);
  if (sentSplits.length > 1) {
    for (const part of sentSplits) {
      if (!part) continue;
      results.push(...splitRecursive(part, chunkSize, offset + text.indexOf(part)));
    }
    return results;
  }

  // Try clause split
  const clauseSplits = splitBySeparators(text, CLAUSE_SEPARATORS);
  if (clauseSplits.length > 1) {
    for (const part of clauseSplits) {
      if (!part) continue;
      results.push(...splitRecursive(part, chunkSize, offset + text.indexOf(part)));
    }
    return results;
  }

  // Try word boundary
  const wordSplits = splitBySeparators(text, [' ']);
  if (wordSplits.length > 1) {
    for (const part of wordSplits) {
      if (!part) continue;
      results.push(...splitRecursive(part, chunkSize, offset + text.indexOf(part)));
    }
    return results;
  }

  // Hard split
  const hardSplits = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    const part = text.slice(i, i + chunkSize);
    if (part) {
      hardSplits.push({ text: part, metadata: { charStart: offset + i, charEnd: offset + i + part.length } });
    }
  }
  return hardSplits;
}

/**
 * Split text by an ordered list of separators, preserving separator in output for context.
 * Uses the FIRST separator found, preferring earlier ones in the list.
 */
function splitBySeparators(text, separators) {
  const pivot = findFirstSeparator(text, separators);
  if (pivot === -1) return [text];

  const results = [];
  let remaining = text;

  while (remaining.length > 0) {
    const idx = findFirstSeparator(remaining, separators);
    if (idx === -1) {
      results.push(remaining.trim());
      break;
    }

    // Include the separator in the segment for context
    const segment = remaining.slice(0, idx + 1).trim();
    if (segment) results.push(segment);
    remaining = remaining.slice(idx + 1);
  }

  return results.filter(Boolean);
}

/**
 * Find the earliest occurrence of any separator in text.
 * Returns index of the first match, or -1 if none found.
 */
function findFirstSeparator(text, separators) {
  let firstIdx = -1;
  for (const sep of separators) {
    const idx = text.indexOf(sep);
    if (idx !== -1 && (firstIdx === -1 || idx < firstIdx)) {
      firstIdx = idx;
    }
  }
  return firstIdx;
}

/**
 * Merge small chunks, adding overlap from previous chunks.
 */
function mergeWithOverlap(chunks, chunkSize, overlap) {
  if (chunks.length <= 1) return chunks;

  const result = [];
  let buffer = '';
  let bufferStart = 0;

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = chunk.text;
      bufferStart = chunk.metadata.charStart;
      continue;
    }

    const combined = buffer + ' ' + chunk.text;
    if (combined.length <= chunkSize) {
      buffer = combined;
      continue;
    }

    // Save current buffer as a chunk
    result.push({ text: buffer, metadata: { charStart: bufferStart, charEnd: bufferStart + buffer.length } });

    // Start new buffer with overlap from end of previous buffer
    const overlapStart = Math.max(0, buffer.length - overlap);
    const overlapText = buffer.slice(overlapStart);
    buffer = overlapText + chunk.text;
    bufferStart = chunk.metadata.charStart - overlapText.length;
  }

  // Flush remaining buffer
  if (buffer) {
    result.push({ text: buffer, metadata: { charStart: bufferStart, charEnd: bufferStart + buffer.length } });
  }

  return result;
}

/**
 * Estimate token count (rough: 1 token ≈ 4 chars for English, 1-2 for Chinese).
 * Used for display, not for actual chunking boundaries.
 */
export function estimateTokens(text) {
  // Chinese characters: roughly 1 token per 1.5 chars
  const cjk = (text.match(/[一-鿿㐀-䶿豈-﫿]/g) || []).length;
  // Everything else: roughly 1 token per 4 chars
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}
