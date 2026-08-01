# Changelog

All notable changes to RAG Box are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and is pre-1.0, so
anything may change between versions.

## [Unreleased]

### Added
- Full-source viewer — open the original document text from any search result or the doc list (PDF renders per-page).
- Backup & restore — export the entire knowledge base (including embeddings) to a `.ragbak` file and import it into another browser.
- Knowledge base delete in the sidebar (with confirmation and cascade delete).
- File dedup — re-uploading the same file into a KB is skipped with a warning.
- Open-source community files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`, GitHub issue/PR templates.

### Fixed
- PDF ingestion crashed with "detached ArrayBuffer" (parsed the buffer twice); PDF.js is now vendored locally so extraction works offline and isn't CDN-dependent.
- Chunks ingested while the model was still downloading kept `embedding: null` forever; they are now backfilled automatically when the model becomes ready.
- Files dropped after switching KBs mid-ingestion were silently stored in the old KB — each file now carries its target KB.
- Embedding model switching could silently break semantic search (dimension mismatch) — now guarded with a re-index notice.
- Chunk `charStart`/`charEnd` were wrong for repeated substrings; PDF page numbers were never stored. Both are fixed, so search shows `p.X` citations.
- Chinese chunks exceeded the embedder's 256-token window and were truncated at embed time — chunk size is now token-aware for CJK.
- Service Worker could report a false "Offline" 503 while online (cache quota) and wiped WebLLM's cache on update — both fixed.
- QA "stop" only halted the display stream; it now actually interrupts WebLLM generation.
- QA context merging was a no-op (chunk overlap produced negative gaps) — now merges consecutive same-doc chunks.
- The user's saved locale (`rag-locale`) was ignored on load; switching language now re-renders the whole UI.
- Duplicate `pro.*`/paywall leftovers removed (all features are free).

### Changed
- Product renamed from RAG Tools to **RAG Box**; domain is **ragbox.always.tools**.
- Settings is now a floating modal (main content stays visible, results survive open/close).
- Model selection in Settings is persisted and honored by auto-init (ingest/search/QA).
- Full Chinese (zh-CN) UI coverage.

## [Before this session]

- V1 core: PDF/TXT/MD ingestion, recursive chunking, Transformers.js embedding, hybrid keyword + semantic search, IndexedDB storage.
- RAG Q&A via WebLLM (Qwen2.5-0.5B, WebGPU).
- Multiple knowledge bases, model management page.
- Pro paywall removed — all features free.
