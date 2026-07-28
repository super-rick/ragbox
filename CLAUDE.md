# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**rag.always.tools** — A browser-local RAG (Retrieval-Augmented Generation) knowledge base. Users drag in documents (PDF/TXT/MD), the browser vectorizes them locally, and semantic search runs entirely client-side. MIT-licensed open source, with a one-time ¥29.9 Pro tier for advanced features.

See `plan/2026-07-28_rag-always-tools-plan.md` for the full product and technical plan.

## Tech Stack

- **Pure frontend** — vanilla JS, single `index.html`, no framework
- **No server, no build step** — static files served by Cloudflare Pages
- **Embedding model:** `all-MiniLM-L6-v2` via Transformers.js (ONNX Runtime Web WASM backend, ~23MB, no WebGPU needed)
- **Vector DB:** IndexedDB (cosine similarity search over all vectors, 384-dim)
- **PDF extraction:** PDF.js
- **Text chunking:** Recursive character splitter, 512 tokens, 10% overlap
- **Pro LLM (V2):** WebLLM with Qwen2.5-0.5B (~500MB, requires WebGPU, Pro-only)
- **Service Worker:** Cache Storage for model files
- **Deploy:** Cloudflare Pages (static), Cloudflare Worker for license generation (private, not in repo)
- **Payments:** PayJS → webhook → Worker → HMAC-signed license key → frontend public-key verification

## Architecture

```
User drags file → PDF.js / FileReader extracts text
  → Recursive chunker (512 tokens, 10% overlap)
  → Transformers.js embeds each chunk (384-dim vector)
  → Stored in IndexedDB (chunks + metadata + embeddings)

Search:
  User query → same model embeds query
  → Full cosine similarity scan over IndexedDB vectors
  → Top-K results with highlighted matches + source document links
```

## Repository Structure

```
rag-tools/                          ← Public GitHub, MIT
├── src/
│   ├── app.js                      ← Main logic: ingestion pipeline + search flow + UI wiring
│   ├── state.js                    ← Global reactive state (EventTarget-based pub/sub)
│   ├── ui.js                       ← DOM utilities, theme, toast, modal, empty/error states
│   ├── router.js                   ← Hash-based routing (#search, #docs, #settings)
│   ├── i18n.js                     ← Chinese & English translations (key-value)
│   ├── db.js                       ← IndexedDB CRUD: knowledgeBases, documents, chunks
│   ├── chunker.js                  ← Recursive character text splitter (paragraph→sentence→clause→word→hard)
│   ├── embedder.js                 ← Transformers.js (all-MiniLM-L6-v2, 384-dim), model init with progress
│   ├── search.js                   ← Cosine similarity + Top-K over IndexedDB embeddings
│   ├── pdf-extractor.js            ← PDF.js text extraction with page-level progress
│   ├── file-handler.js             ← Drag/drop, file validation, markdown stripping
│   ├── license.js                  ← [V2] Pro verification (public key only)
│   ├── qa.js                       ← [V2] WebLLM RAG Q&A (Pro)
│   ├── docx-extractor.js           ← [V2] DOCX via JSZip
│   ├── epub-extractor.js           ← [V2] EPUB via JSZip
│   └── backup.js                   ← [V2] Export/import .ragbak
├── sw.js                           ← Service Worker: cache-first for model files, network-first for app
├── index.html                      ← Single HTML entry point with all CSS inlined
├── sitemap.xml / robots.txt
├── _headers                        ← Cloudflare Pages cache rules
├── .env.example                    ← Template (empty values)
├── .gitignore                      ← Excludes /worker/, /plan/, .env
├── CLAUDE.md                       ← This file
├── README.md / README.zh-CN.md     ← [TODO]
└── LICENSE                         ← MIT [TODO]

NOT in Git (.gitignore):
├── worker/license-worker.js        ← License generation with HMAC private key
├── plan/                           ← Product & implementation plans
└── .env                            ← Real secrets
```

## Key Technical Decisions

1. **No WebGPU required for embedding** — all-MiniLM-L6-v2 runs on ONNX WASM backend, no COOP/COEP headers needed, works everywhere
2. **No server-side vector DB** — IndexedDB brute-force cosine similarity is fast enough (<200ms for 100K vectors) for personal use
3. **Sensitive code isolation** — `src/license.js` contains only the public key and verification logic (safe to open-source). The HMAC private key lives only in a Cloudflare Worker that is `.gitignore`'d
4. **"Honor Lock" philosophy** — Pro unlock logic is frontend-only and technically bypassable. That's intentional: bypassers become DAU, give stars, and generate word-of-mouth

## Development Commands

Since this is a vanilla JS static site with no build step:

- **Local dev:** `python3 -m http.server 8080` or `npx serve .` — serve the project root, open `http://localhost:8080`
- **Deploy:** Push to GitHub → Cloudflare Pages auto-deploys from the repo root
- **Worker deploy:** Manually paste `worker/license-worker.js` into Cloudflare Dashboard

There is no `package.json`, no bundler, and no test framework yet. If tooling is added (e.g., linters, test runner), update this section.
