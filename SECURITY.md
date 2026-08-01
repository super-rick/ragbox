# Security Policy

RAG Box is a **browser-local** application: documents, vectors, and the Q&A model
all live in your own browser (IndexedDB + Cache Storage). No data is ever
transmitted to any server.

## Supported versions

The latest commit on `main` is the only supported version. Releases are not
tagged yet; if you're reporting a security issue, include the commit SHA or date
you're running.

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Instead, email the maintainers privately at
[superrick730@gmail.com](mailto:superrick730@gmail.com). Please include:

- The commit/version you're running
- Steps to reproduce
- A description of the impact

You can expect a response within 7 days. Once a fix lands, the issue will be
disclosed responsibly.

## Security notes for this project

- **Data stays in the browser** — no server, no upload, no account. If you see
  any code path that transmits document content or embeddings to a third party,
  that is a bug — please report it.
- **Model files** are fetched from public CDNs (Transformers.js, WebLLM, ONNX
  weights). The Service Worker caches them; it never sends your data anywhere.
- **Third-party code** runs in your browser: Transformers.js, PDF.js (vendored),
  WebLLM. Keep these updated.
- This is MIT-licensed open source; the code is auditable. The "security" model
  is transparency, not secrecy.
