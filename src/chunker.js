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
 * @param {object} options - { chunkSize, overlap, pageNumber }
 * @returns {Array<{text: string, metadata: {charStart: number, charEnd: number, pageNumber: number|null}}>}
 */
export function chunkText(text, options = {}) {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap !== undefined ? options.overlap : Math.round(chunkSize * 0.1);
  const pageNumber = options.pageNumber ?? null;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rawChunks = splitRecursive(normalized, chunkSize, 0);
  const merged = mergeWithOverlap(rawChunks, chunkSize, overlap);
  for (const c of merged) {
    c.metadata.pageNumber = pageNumber;
  }
  return merged;
}

/**
 * Recursively split text using the best available separator.
 * Positions are tracked by each part's real offset — never text.indexOf(part),
 * which returns the FIRST occurrence and corrupts offsets for repeated substrings.
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
      results.push(...splitRecursive(part.text, chunkSize, offset + part.start));
    }
    return results;
  }

  // Try sentence split
  const sentSplits = splitBySeparators(text, SENTENCE_SEPARATORS);
  if (sentSplits.length > 1) {
    for (const part of sentSplits) {
      results.push(...splitRecursive(part.text, chunkSize, offset + part.start));
    }
    return results;
  }

  // Try clause split
  const clauseSplits = splitBySeparators(text, CLAUSE_SEPARATORS);
  if (clauseSplits.length > 1) {
    for (const part of clauseSplits) {
      results.push(...splitRecursive(part.text, chunkSize, offset + part.start));
    }
    return results;
  }

  // Try word boundary
  const wordSplits = splitBySeparators(text, [' ']);
  if (wordSplits.length > 1) {
    for (const part of wordSplits) {
      results.push(...splitRecursive(part.text, chunkSize, offset + part.start));
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
 * Returns parts with their real position (start index in `text`, after trimming) so
 * callers can compute accurate charStart/charEnd.
 * @returns {Array<{text: string, start: number}>}
 */
function splitBySeparators(text, separators) {
  const results = [];
  let remaining = text;
  let remainingStart = 0;

  while (remaining.length > 0) {
    const idx = findFirstSeparator(remaining, separators);
    if (idx === -1) {
      const trimmed = remaining.trim();
      if (trimmed) {
        const lead = remaining.length - remaining.trimStart().length;
        results.push({ text: trimmed, start: remainingStart + lead });
      }
      break;
    }

    // Include the separator in the segment for context
    const segment = remaining.slice(0, idx + 1);
    const trimmed = segment.trim();
    if (trimmed) {
      const lead = segment.length - segment.trimStart().length;
      results.push({ text: trimmed, start: remainingStart + lead });
    }
    remaining = remaining.slice(idx + 1);
    remainingStart += idx + 1;
  }

  return results;
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
  let bufferEnd = 0; // true end position (in the original text), from chunk metadata

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = chunk.text;
      bufferStart = chunk.metadata.charStart;
      bufferEnd = chunk.metadata.charEnd;
      continue;
    }

    const combined = buffer + ' ' + chunk.text;
    if (combined.length <= chunkSize) {
      buffer = combined;
      bufferEnd = chunk.metadata.charEnd;
      continue;
    }

    // Save current buffer as a chunk
    result.push({ text: buffer, metadata: { charStart: bufferStart, charEnd: bufferEnd } });

    // Start new buffer with overlap from end of previous buffer
    const overlapStart = Math.max(0, buffer.length - overlap);
    const overlapText = buffer.slice(overlapStart);
    buffer = overlapText + chunk.text;
    bufferStart = chunk.metadata.charStart - overlapText.length;
    bufferEnd = chunk.metadata.charEnd;
  }

  // Flush remaining buffer
  if (buffer) {
    result.push({ text: buffer, metadata: { charStart: bufferStart, charEnd: bufferEnd } });
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
