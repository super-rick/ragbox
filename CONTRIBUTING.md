# Contributing to RAG Box

Thanks for your interest in contributing! RAG Box is a browser-local RAG knowledge base — a vanilla-JS static site with no server, no build step, and no backend.

## Project basics

- **Language:** Vanilla JavaScript (ES modules), single `index.html`, no framework, no bundler.
- **Data:** Everything runs in the browser — IndexedDB stores vectors, the Service Worker caches models. No data ever leaves the device.
- **Embedding:** `all-MiniLM-L6-v2` via Transformers.js (ONNX WASM, ~23MB, no WebGPU needed for embedding).
- **RAG Q&A:** WebLLM (Qwen2.5-0.5B, ~500MB) — requires WebGPU.

## Getting started

```bash
git clone https://github.com/super-rick/ragbox.git
cd ragbox
python3 -m http.server 8080
```

Open `http://localhost:8080`.

### Running tests

```bash
npm install
npm test
```

The E2E suite uses Playwright (Chromium). The config lives at `tests/playwright.config.js` and is wired into the `npm test` script.

## Code layout

```
src/
  app.js          — main logic: ingestion pipeline + search flow + UI wiring
  state.js        — reactive state (EventTarget-based pub/sub)
  ui.js           — DOM utilities, theme, toast, modal, empty/error states
  router.js       — hash-based routing
  i18n.js         — Chinese & English translations (key-value)
  db.js           — IndexedDB CRUD: knowledgeBases, documents, chunks
  chunker.js      — recursive text splitter, token-aware for CJK
  embedder.js     — Transformers.js wrapper (model load, progress)
  models.js       — model management: available models, cache inspection
  search.js       — hybrid keyword + semantic search
  pdf-extractor.js— PDF.js text extraction (vendored in vendor/pdfjs/)
  file-handler.js — drag/drop, validation, markdown stripping, dedup
  qa.js           — WebLLM RAG Q&A (streaming, abortable)
  backup.js       — export/import .ragbak
sw.js             — Service Worker: offline app shell + model caching
index.html        — single HTML entry point, all CSS inlined
```

## How to contribute

1. **Find or open an issue** — check existing issues first; if you're fixing a bug, mention it.
2. **Fork & branch** — `git checkout -b fix/something`.
3. **Make the change** — follow the surrounding code's style (the codebase has no linter; match the existing conventions: ES modules, `createElement` for DOM, `t()` for any user-visible string in both `en` and `zh-CN`).
4. **Test** — run `npm test`; add/extend a Playwright test if you change user-visible behavior.
5. **Open a pull request** — describe what changed and why, and reference the issue.

## Guidelines

- **No user-visible hardcoded strings.** Any string a user sees must go through `t()` in `src/i18n.js` with both `en` and `zh-CN` entries.
- **Keep it 100% local.** Features must not send data to any server or require an external API.
- **Offline-friendly.** Avoid new CDN dependencies — vendor static assets locally (see `vendor/pdfjs/`).
- **Small, focused PRs** are easier to review.
- Be kind and respectful — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
