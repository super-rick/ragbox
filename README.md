# RAG Tools

> **Browser-local RAG knowledge base.** Drag in documents, the browser vectorizes them locally, and semantic search runs entirely client-side. Zero data leaves your device.

**🇨🇳 [中文版](README.zh-CN.md)**

## Features

- **100% local** — all processing in your browser, no server, no upload, no signup
- **Semantic search** — understands meaning, not just keywords
- **PDF / TXT / MD** — drag and drop documents
- **23MB embedding model** — `all-MiniLM-L6-v2` via Transformers.js, no GPU needed
- **Zero config** — open the page, drop a file, start searching
- **Offline capable** — model cached after first download
- **Dark / Light theme**
- **中文 / English UI**
- **MIT open source**

## Quick Start

### Use the hosted version

Visit **[ragbox.always.tools](https://ragbox.always.tools)** — no install, no signup.

### Run locally

```bash
git clone https://github.com/super-rick/rag-tools.git
cd rag-tools
python3 -m http.server 8080
```

Open `http://localhost:8080` in your browser.

### Run tests

```bash
npm install
npm test
```

## How It Works

```
Drag PDF → PDF.js extracts text
       → Recursive chunker (512 chars, 10% overlap)
       → Transformers.js (all-MiniLM-L6-v2) → 384-dim embedding
       → Stored in IndexedDB

Search query → same model embeds query
            → cosine similarity over all vectors
            → Top-10 results with highlights
```

## Tech Stack

- **Vanilla JS** — no framework, no build step
- **Transformers.js** — ONNX Runtime Web WASM backend
- **PDF.js** — text extraction
- **IndexedDB** — local vector storage
- **Service Worker** — model file caching
- **Deploy** — Cloudflare Pages

## Roadmap

- [x] V1: PDF/TXT/MD ingestion, semantic search, dark theme, i18n
- [ ] V2 Pro: RAG Q&A (WebLLM), multi-KB, DOCX/EPUB, export/import

## License

MIT
