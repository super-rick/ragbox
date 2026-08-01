# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ragbox.always.tools** — A browser-local RAG (Retrieval-Augmented Generation) knowledge base. Users drag in documents (PDF/TXT/MD), the browser vectorizes them locally, and semantic search runs entirely client-side. MIT-licensed open source — all features are free.

See `plan/2026-07-28_ragbox-always-tools-plan.md` for the full product and technical plan.

## Tech Stack

- **Pure frontend** — vanilla JS, single `index.html`, no framework
- **No server, no build step** — static files served by Cloudflare Pages
- **Embedding model:** `all-MiniLM-L6-v2` via Transformers.js (ONNX Runtime Web WASM backend, ~23MB, no WebGPU needed)
- **Vector DB:** IndexedDB (cosine similarity search over all vectors, 384-dim)
- **PDF extraction:** PDF.js
- **Text chunking:** Recursive character splitter, ~512 chars (token-aware for CJK), 10% overlap
- **RAG Q&A:** WebLLM with Qwen2.5-0.5B (~500MB, requires WebGPU)
- **Service Worker:** offline app shell + model caching
- **Deploy:** Cloudflare Pages (static), custom domain `ragbox.always.tools`

## Architecture

```
User drags file → PDF.js / FileReader extracts text
  → Recursive chunker (~512 chars, CJK token-aware, 10% overlap)
  → Transformers.js embeds each chunk (384-dim vector)
  → Stored in IndexedDB (chunks + metadata + embeddings)

Search:
  User query → same model embeds query
  → Full cosine similarity scan over IndexedDB vectors
  → Top-K results with highlighted matches + source document links
```

## Repository Structure

```
ragbox/                            ← Public GitHub, MIT
├── src/
│   ├── app.js                      ← Main logic: ingestion pipeline + search flow + UI wiring
│   ├── state.js                    ← Global reactive state (EventTarget-based pub/sub)
│   ├── ui.js                       ← DOM utilities, theme, toast, modal, empty/error states
│   ├── router.js                   ← Hash-based routing (#search, #docs, #settings)
│   ├── i18n.js                     ← Chinese & English translations (key-value)
│   ├── db.js                       ← IndexedDB CRUD: knowledgeBases, documents, chunks
│   ├── chunker.js                  ← Recursive text splitter, token-aware for CJK
│   ├── embedder.js                 ← Transformers.js (all-MiniLM-L6-v2), model init with progress
│   ├── models.js                   ← Model management: available models, cache inspection
│   ├── search.js                   ← Hybrid keyword + cosine similarity + Top-K
│   ├── pdf-extractor.js            ← PDF.js text extraction with page-level progress
│   ├── file-handler.js             ← Drag/drop, file validation, markdown stripping, dedup
│   ├── qa.js                       ← WebLLM RAG Q&A (streaming, abortable)
│   └── backup.js                   ← Export/import .ragbak
├── vendor/pdfjs/                   ← PDF.js vendored locally (offline, no CDN)
├── sw.js                           ← Service Worker: offline app shell + model caching
├── index.html                      ← Single HTML entry point with all CSS inlined
├── sitemap.xml / robots.txt        ← SEO (ragbox.always.tools)
├── _headers                        ← Cloudflare Pages cache rules
├── .env.example                    ← Template (empty values)
├── .gitignore                      ← Excludes /plan/, .env
├── CLAUDE.md                       ← This file
├── README.md / README.zh-CN.md
├── CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / CHANGELOG.md
├── .github/                        ← Issue & PR templates
└── LICENSE                         ← MIT

NOT in Git (.gitignore):
├── plan/                           ← Product & implementation plans
└── .env                            ← Real secrets
```

## Key Technical Decisions

1. **No WebGPU required for embedding** — all-MiniLM-L6-v2 runs on ONNX WASM backend, no COOP/COEP headers needed, works everywhere
2. **No server-side vector DB** — IndexedDB brute-force cosine similarity is fast enough (<200ms for 100K vectors) for personal use
3. **Vendored PDF.js** — PDF.js is copied into `vendor/pdfjs/` (no CDN), so extraction works offline and can't be blocked by a flaky network
4. **All features free** — the Pro paywall was removed; `src/license.js` is a no-op stub returning `true`

## Development Commands

Since this is a vanilla JS static site with no build step:

- **Local dev:** `python3 -m http.server 8080` or `npx serve .` — serve the project root, open `http://localhost:8080`
- **Deploy:** Push to GitHub → Cloudflare Pages auto-deploys from the repo root (custom domain `ragbox.always.tools`)
- **Tests:** Playwright E2E via `npm test` (config at `tests/playwright.config.js` — pass it explicitly, the runner won't auto-discover it from the root)

There is no bundler or build step.
