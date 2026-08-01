# RAG Box

> **浏览器本地 RAG 知识库。** 拖入文档，浏览器本地完成向量化，语义搜索全程在客户端运行。数据不离开你的设备。

**🇬🇧 [English](README.md)**

## 功能

- **100% 本地** — 全部在浏览器处理，无服务器、不上传、免注册
- **混合搜索** — 关键词永远可用，语义匹配在此基础上增强
- **RAG 问答** — 就文档内容提问，答案有原文依据（本地 WebLLM，需 WebGPU）
- **支持 PDF / TXT / MD** — 拖拽即可
- **原文查看** — 从任何搜索结果打开原始文档全文（PDF 按页显示）
- **多知识库** — 文档分库组织，独立检索
- **备份与恢复** — 导出全部数据（含向量）为 `.ragbak` 文件
- **23MB 嵌入模型** — `all-MiniLM-L6-v2`，无需 GPU
- **零配置** — 打开网页、拖入文件、立即搜索
- **离线可用** — 模型首次下载后缓存
- **深色 / 浅色主题** · **中英文界面**
- **MIT 开源**

## 快速开始

### 使用在线版本

访问 **[ragbox.always.tools](https://ragbox.always.tools)** — 无需安装和注册。

### 本地运行

```bash
git clone https://github.com/super-rick/ragbox.git
cd ragbox
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
       → 递归分块（中文按 token 自适应，10% 重叠）
       → Transformers.js (all-MiniLM-L6-v2) → 384 维向量
       → 存入 IndexedDB

搜索 → 关键词 + 语义（余弦相似度）混合排序
    → Top-10 结果 + 高亮 + 来源链接 + 页码
```

## 技术栈

- **原生 JS** — 无框架、无构建步骤
- **Transformers.js** — ONNX Runtime Web WASM 后端
- **PDF.js** — 文本提取（本地内置，离线可用）
- **IndexedDB** — 本地向量存储
- **Service Worker** — 离线应用外壳 + 模型缓存
- **WebLLM** — 端侧 RAG 问答（Qwen2.5-0.5B，WebGPU）
- **部署** — Cloudflare Pages

## 开发路线

- [x] PDF / TXT / MD 导入 + 本地向量化
- [x] 混合搜索（关键词 + 语义）
- [x] 多知识库
- [x] RAG 问答（本地 WebLLM）
- [x] 原文查看
- [x] 备份 / 恢复（.ragbak）
- [x] 深色主题、中英界面、离线支持
- [ ] DOCX / EPUB 支持

## License

MIT
