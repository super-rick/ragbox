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

## 进度与计划 (Progress & Roadmap)

### 已完成 (Done)
- **核心 RAG**：PDF/TXT/MD → 分块（CJK token 自适应）→ 本地向量化 → 混合搜索（关键词+语义）→ WebLLM 问答。
- **功能**：源文件查看（PDF 按页）、.ragbak 备份导出/导入、多知识库（创建/切换/删除 UI）、文件去重、帮助页、设置浮动窗。
- **中文支持**：单字/两字搜索、高亮与搜索统一分词、全界面 i18n（en/zh-CN 即时切换）。
- **健壮性**：PDF.js 本地化（vendor/pdfjs/）、模型多 CDN 降级（hf-mirror → huggingface、jsdelivr → unpkg）、SW 假离线修复、QA 停止真中断、chunk 偏移/页码修复。
- **模型逻辑**：persist-on-load（仅加载成功才记住）、initModel 防重入去重、切换竞态防护、30s 错误重试冷却、QA WebGPU/适配器快速失败、状态模型（未下载/已缓存/就绪/下载中/错误）。
- **测试**：23 个 Playwright E2E 全绿（核心 + 中文搜索 + 备份 + 模型逻辑）。
- **仓库**：github.com/super-rick/ragbox（public，MIT），域名 `ragbox.always.tools`，社区文件齐全（CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/CHANGELOG/GitHub 模板）。

### 计划 / 待办 (Planned)
1. **部署上线**：Cloudflare Pages 连接 GitHub 仓库 + 绑定自定义域名 `ragbox.always.tools`（需 Cloudflare 账号）。部署后 Windows/远程访问才支持 WebGPU（QA）。
2. **DOCX/EPUB**：已从支持列表移除；若要做需 JSZip 实现（可选）。
3. **打磨项**：KB/文档重命名、存储配额警告（>80%）、SW 离线横幅。
4. **模型本地化（备选）**：若外部模型/CDN 网络长期不稳，把 all-MiniLM-L6-v2 + transformers 库 vendor 进仓库（~38MB），实现真离线。

### 注意事项
- **WebGPU（QA 功能）需要 HTTPS 或 localhost 安全上下文**——局域网 http 访问时 `navigator.gpu` 为 undefined，Ask AI 按钮不显示。
- 嵌入模型**persist-on-load**：仅在 `initModel` 成功后写入 `rag-embed-model`；改设置下拉框是预览，不触发下载。
- 模型文件优先 `hf-mirror.com`（CN 友好），失败回退 `huggingface.co`；库优先 jsdelivr `+esm`，失败回退 unpkg dist。
