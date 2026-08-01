# RAG Box

> **Browser-local RAG knowledge base.** Drag in documents, the browser vectorizes them locally, and semantic search runs entirely client-side. Zero data leaves your device.

**🇨🇳 [中文版](README.zh-CN.md)**

## Features

- **100% local** — all processing in your browser, no server, no upload, no signup
- **Hybrid search** — keyword always works, semantic adds meaning-based matching on top
- **RAG Q&A** — ask questions and get answers grounded in your documents (local WebLLM, WebGPU)
- **PDF / TXT / MD** — drag and drop documents
- **Source viewer** — open the original document text (PDF per-page) from any search result
- **Multiple knowledge bases** — organize documents and search each independently
- **Backup & restore** — export everything (including vectors) to a `.ragbak` file
- **23MB embedding model** — `all-MiniLM-L6-v2` via Transformers.js, no GPU needed
- **Zero config** — open the page, drop a file, start searching
- **Offline capable** — model cached after first download
- **Dark / Light theme** · **中文 / English UI**
- **MIT open source**

## Quick Start

### Use the hosted version

Visit **[ragbox.always.tools](https://ragbox.always.tools)** — no install, no signup.

### Run locally

```bash
git clone https://github.com/super-rick/ragbox.git
cd ragbox
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
       → Recursive chunker (token-aware for Chinese, 10% overlap)
       → Transformers.js (all-MiniLM-L6-v2) → 384-dim embedding
       → Stored in IndexedDB

Search query → keyword + semantic (cosine similarity) hybrid ranking
            → Top-10 results with highlights + source links + page numbers
```

## Tech Stack

- **Vanilla JS** — no framework, no build step
- **Transformers.js** — ONNX Runtime Web WASM backend
- **PDF.js** — text extraction (vendored locally, works offline)
- **IndexedDB** — local vector storage
- **Service Worker** — offline app shell + model caching
- **WebLLM** — on-device RAG Q&A (Qwen2.5-0.5B, WebGPU)
- **Deploy** — Cloudflare Pages

## Roadmap

- [x] PDF / TXT / MD ingestion with local embedding
- [x] Hybrid keyword + semantic search
- [x] Multiple knowledge bases
- [x] RAG Q&A (local WebLLM)
- [x] Source document viewer
- [x] Backup / restore (.ragbak)
- [x] Dark theme, Chinese / English UI, offline support
- [ ] DOCX / EPUB support

## License

MIT
