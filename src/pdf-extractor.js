/**
 * PDF.js text extraction.
 *
 * Uses CDN-loaded pdfjs-dist. Worker loaded from CDN for cross-origin support.
 */

let pdfjsLib = null;

/**
 * PDF.js is vendored locally (vendor/pdfjs/) — no CDN dependency, so extraction
 * works offline and isn't affected by CDN slowness/blocking. The +esm bundle is
 * self-contained; the worker is served as a static file.
 */
const PDFJS_WORKER = '/vendor/pdfjs/pdf.worker.min.mjs';

async function ensurePDFJS() {
  if (pdfjsLib) return pdfjsLib;

  // Import the vendored self-contained ESM bundle (345KB, no external imports).
  pdfjsLib = await import('../vendor/pdfjs/pdfjs.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

  return pdfjsLib;
}

/**
 * Extract text from a PDF.
 * @param {ArrayBuffer} arrayBuffer - PDF file data
 * @param {function} onProgress - ({ current, total }) => void
 * @returns {Promise<{fullText: string, pages: Array<{pageNumber: number, text: string}>, pageCount: number}>}
 */
export async function extractPDFText(arrayBuffer, onProgress) {
  const pdfjs = await ensurePDFJS();

  const pdf = await pdfjs.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  }).promise;

  const totalPages = pdf.numPages;
  const pages = [];
  let fullText = '';

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);

    // Get text content
    const content = await page.getTextContent();

    // Group text items by their Y position (descending Y = same line)
    const lines = groupTextItemsByLine(content.items);

    // Join lines into page text
    const pageText = lines
      .map((line) => line.map((item) => item.str).join(' '))
      .join('\n');

    pages.push({ pageNumber: i, text: pageText });
    fullText += pageText + '\n\n';

    onProgress?.({ current: i, total: totalPages });
  }

  // pageCount comes from the same getDocument handle — callers must NOT parse the
  // same ArrayBuffer a second time (PDF.js detaches it, throwing
  // "Cannot perform Construct on a detached ArrayBuffer").
  return { fullText: fullText.trim(), pages, pageCount: totalPages };
}

/**
 * Get page count without full extraction.
 */
export async function getPageCount(arrayBuffer) {
  const pdfjs = await ensurePDFJS();
  const pdf = await pdfjs.getDocument({
    data: arrayBuffer,
    useSystemFonts: true,
  }).promise;
  return pdf.numPages;
}

/**
 * Group text items by Y position (descending Y = same line).
 * Items on the same line are merged horizontally by X position.
 */
function groupTextItemsByLine(items) {
  if (!items || items.length === 0) return [];

  // Group by rounded Y position (allowing small variance for same line)
  const yThreshold = 5;
  const groups = [];

  for (const item of items) {
    const y = item.transform[5]; // Y position in PDF coordinates
    let placed = false;

    for (const group of groups) {
      if (Math.abs(group.y - y) <= yThreshold) {
        group.items.push(item);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push({ y, items: [item] });
    }
  }

  // Sort groups by Y (top to bottom in PDF coordinates = descending Y)
  groups.sort((a, b) => b.y - a.y);

  // Sort items within each group by X (left to right)
  for (const group of groups) {
    group.items.sort((a, b) => a.transform[4] - b.transform[4]);
  }

  return groups.map((g) => g.items);
}
