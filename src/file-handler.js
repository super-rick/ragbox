/**
 * File drag/drop, input selection, validation, and reading.
 */

const SUPPORTED_TYPES = ['.pdf', '.txt', '.md'];

const MAX_FILE_SIZE = 100 * 1024 * 1024;   // 100 MB

const TEXT_TYPES = ['.txt', '.md'];

function getExtension(filename) {
  const i = filename.lastIndexOf('.');
  return i > 0 ? filename.slice(i).toLowerCase() : '';
}

export function validateFile(file) {
  const ext = getExtension(file.name);

  if (!SUPPORTED_TYPES.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type "${ext}". Supported: ${SUPPORTED_TYPES.join(', ')}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export function setupDragDrop(dropZoneElement, validateFn) {
  dropZoneElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneElement.classList.add('drag-over');
  });

  dropZoneElement.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneElement.classList.remove('drag-over');
  });

  dropZoneElement.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZoneElement.classList.remove('drag-over');
    const files = [...(e.dataTransfer.files || [])];
    if (files.length > 0) {
      validateFn(files);
    }
  });
}

export function setupFileInput(inputElement, validateFn) {
  inputElement.addEventListener('change', () => {
    const files = [...(inputElement.files || [])];
    if (files.length > 0) {
      validateFn(files);
    }
    inputElement.value = ''; // Reset so same file can be picked again
  });
}

/**
 * Strip markdown syntax from text (headers, links, bold, italic, code fences).
 */
export function stripMarkdown(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')            // code blocks
    .replace(/`[^`]+`/g, '')                     // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')            // images
    .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')       // links → link text only
    .replace(/^###?\s+/gm, '')                   // headings
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')  // bold/italic/strikethrough
    .replace(/^-{3,}/gm, '')                     // horizontal rules
    .replace(/^>\s+/gm, '')                      // blockquotes
    .replace(/^[-*+]\s+/gm, '')                  // unordered list items
    .replace(/^\d+\.\s+/gm, '')                  // ordered list items
    .replace(/\n{3,}/g, '\n\n')                  // normalize whitespace
    .trim();
}
