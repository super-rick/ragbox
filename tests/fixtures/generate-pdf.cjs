/**
 * Minimal valid 2-page PDF for testing.
 * Generated manually — no PDF library needed.
 *
 * Page 1: "This is page one content for testing."
 * Page 2: "This is page two content with more text."
 */
const fs = require('fs');
const path = require('path');

// PDF structure helpers
function obj(n, content) {
  return `${n} 0 obj\n${content}\nendobj`;
}

function stream(content) {
  const data = Buffer.from(content, 'utf8');
  return `<< /Length ${data.length} >>\nstream\n${content}\nendstream`;
}

// Build a minimal 2-page PDF
const pages = [
  { text: 'This is page one content for testing PDF extraction.' },
  { text: 'This is page two content with more text for testing.' },
];

let pdf = '%PDF-1.4\n';

// Objects
pdf += obj(1, '<</Type /Catalog /Pages 2 0 R>>') + '\n';
pdf += obj(2, '<</Type /Pages /Kids [3 0 R 6 0 R] /Count 2>>') + '\n';

// Page 1
const page1Stream = stream(`BT /F1 12 Tf 100 700 Td(${pages[0].text})Tj ET`);
pdf += obj(3, `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources <</Font <</F1 5 0 R>>>>>>`) + '\n';
pdf += obj(4, page1Stream) + '\n';
pdf += obj(5, '<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>') + '\n';

// Page 2
const page2Stream = stream(`BT /F1 12 Tf 100 700 Td(${pages[1].text})Tj ET`);
pdf += obj(6, `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R /Resources <</Font <</F1 5 0 R>>>>>>`) + '\n';
pdf += obj(7, page2Stream) + '\n';

// Cross-reference table
const xrefOffset = Buffer.byteLength(pdf, 'utf8');
const offsets = [0];

// Find object offsets by looking for "N 0 obj" patterns
let searchFrom = 0;
for (let i = 1; i <= 7; i++) {
  const marker = `${i} 0 obj`;
  const idx = pdf.indexOf(marker, searchFrom);
  offsets.push(idx);
  searchFrom = idx + marker.length;
}

pdf += 'xref\n';
pdf += `0 ${offsets.length}\n`;
for (const off of offsets) {
  const line = String(off).padStart(10, '0') + ' 00000 n \n';
  pdf += off === 0 ? '0000000000 65535 f \n' : line;
}

pdf += 'trailer\n';
pdf += `<< /Size ${offsets.length} /Root 1 0 R >>\n`;
pdf += 'startxref\n';
pdf += xrefOffset + '\n';
pdf += '%%EOF';

const outPath = path.join(__dirname, 'sample-two-pages.pdf');
fs.writeFileSync(outPath, pdf);
console.log(`Generated ${outPath} (${fs.statSync(outPath).size} bytes)`);
