# RAG Tools

> **浏览器本地 RAG 知识库。** 拖入文档，浏览器本地完成向量化，语义搜索全程在客户端运行。数据不离开你的设备。

**🇬🇧 [English](README.md)**

## 功能

- **100% 本地** — 全部在浏览器处理，无服务器、不上传、免注册
- **语义搜索** — 理解意思，不只是搜关键词
- **支持 PDF / TXT / MD** — 拖拽即可
- **23MB 嵌入模型** — `all-MiniLM-L6-v2`，无需 GPU
- **零配置** — 打开网页、拖入文件、立即搜索
- **离线可用** — 模型首次下载后缓存
- **深色 / 浅色主题**
- **中英文界面**
- **MIT 开源**

## 快速开始

### 使用在线版本

访问 **[ragbox.always.tools](https://ragbox.always.tools)** — 无需安装和注册。

### 本地运行

```bash
git clone https://github.com/super-rick/rag-tools.git
cd rag-tools
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`。

### 运行测试

```bash
npm install
npm test
```

## 技术架构

```
拖入 PDF → PDF.js 提取文本
       → 递归分块 (512 字符，10% 重叠)
       → Transformers.js (all-MiniLM-L6-v2) → 384 维向量
       → 存入 IndexedDB

搜索 → 同模型嵌入查询
    → 全量余弦相似度计算
    → Top-10 结果 + 高亮
```

## 技术栈

- **原生 JS** — 无框架、无构建步骤
- **Transformers.js** — ONNX Runtime Web WASM 后端
- **PDF.js** — 文本提取
- **IndexedDB** — 本地向量存储
- **Service Worker** — 模型文件缓存
- **部署** — Cloudflare Pages

## 开发路线

- [x] V1: PDF/TXT/MD 导入、语义搜索、深色主题、多语言
- [ ] V2 Pro: RAG 问答、多知识库、DOCX/EPUB、导入导出

## License

MIT
