/**
 * Internationalization — simple key-value lookup, no framework.
 */

import { state } from './state.js';

const translations = {
  'en': {
    // General
    'app.name': 'RAG Tools',
    'app.tagline': 'Browser Local Knowledge Base',

    // Sidebar
    'kb.title': 'Knowledge Bases',
    'kb.new': 'New knowledge base',
    'kb.empty': 'No knowledge bases yet',
    'kb.name.placeholder': 'Knowledge base name',
    'kb.create': 'Create',
    'kb.delete.confirm': 'Delete this knowledge base and all its documents? This cannot be undone.',
    'docs.title': 'Documents',
    'docs.empty': 'No documents',
    'docs.delete.confirm': 'Delete this document? The associated chunks will also be removed.',

    // Search
    'search.placeholder': 'Search your documents...',
    'search.empty.title': 'No documents yet',
    'search.empty.desc': 'Drop PDF, TXT, or MD files below to get started.',
    'search.no_results': 'No results found for "{query}". Try different keywords.',
    'search.results_count': 'Found {count} results',
    'search.model_changed': 'The embedding model changed after these documents were indexed — semantic search is limited for them. Re-ingest them to re-index.',

    // Drop zone
    'dropzone.text': 'Drop documents here, or click to select',
    'dropzone.hint': 'Supports PDF, TXT, MD',

    // Q&A
    'qa.toggle': 'Ask AI',
    'qa.placeholder': 'Ask a question about your documents...',

    // Ingestion
    'ingestion.extracting': 'Extracting text',
    'ingestion.chunking': 'Chunking text',
    'ingestion.embedding': 'Generating embeddings',
    'ingestion.storing': 'Saving to database',
    'ingestion.complete': 'Ingestion complete',
    'ingestion.error': 'Error processing {name}',
    'ingestion.progress': '{current}/{total}',
    'ingestion.unsupported_format': '{ext} files are not supported yet. Supported: PDF, TXT, MD',
    'ingestion.failed': 'Failed to process {count} file(s).',
    'ingestion.partial': '{succeeded} ingested, {failed} failed.',
    'ingestion.backfilled': 'Embedded {count} previously text-only chunks.',
    'ingestion.duplicate': '{name} is already in this knowledge base. Skipped.',

    // Model
    'model.downloading': 'Downloading embedding model (~23MB)',
    'model.download.detail': 'First-time setup, one-time only. Cached for offline use.',
    'model.loading': 'Loading model into memory',
    'model.ready': 'Model ready',
    'model.error': 'Failed to load model. Please refresh and try again.',

    // Results
    'result.expand': 'Expand context',
    'result.collapse': 'Collapse',
    'result.from': 'From',

    // Source viewer
    'doc.view_source': 'View source',
    'doc.page': 'Page {n}',
    'doc.no_text': 'No full text available for this document.',

    // Theme
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.auto': 'Auto',

    // Stats
    'stats.docs': '{count} docs',
    'stats.chunks': '{count} chunks',
    'stats.storage': '{size}',

    // Errors
    'error.file_size': 'File too large.',
    'error.file_type': 'Unsupported file type. Supported: {types}',
    'error.generic': 'Something went wrong. Please try again.',
    'error.offline': 'You appear to be offline. Some features may not work.',

    // Pro
    'pro.title': 'Upgrade to Pro',
    'pro.price': '¥29.9 one-time',
    'pro.benefits': 'Unlimited documents, RAG Q&A, export/import, DOCX/EPUB, no ads',
    'pro.enter_license': 'Enter License Key',
    'pro.activate': 'Activate',
    'pro.activated': 'Pro activated!',
    'pro.invalid': 'Invalid license key',

    // QA
    'qa.ask': 'Ask',
    'qa.stop': 'Stop',
    'qa.search_mode': '🔍 Search',
    'qa.loading_model': 'Loading AI model ({pct}%)...',
    'qa.model_ready': '✅ AI model ready! Ask me anything.',
    'qa.model_failed': 'Failed to load AI model. WebGPU may not be available.',
    'qa.error': 'Error: {msg}',
    'qa.loading_wait': 'AI model is still loading, please wait...',
    'qa.init': 'Initializing AI model...',
    'qa.init_failed': 'Failed to initialize AI model: {msg}',
    'qa.no_answer': 'Failed to get answer',
    'qa.no_info': "I couldn't find any relevant information in your knowledge base to answer this question.",
    'qa.stopped': '⏹️ Response stopped.',

    // KB / Doc management
    'kb.required': 'Please create or select a knowledge base first.',

    // Ingestion status
    'ingestion.too_little': 'Too little text extracted',
    'ingestion.text_only': 'Model loading, storing text only...',
    'ingestion.chunks_done': '{count} chunks',

    // Common actions
    'common.delete': 'Delete',
    'common.cancel': 'Cancel',

    // KB / Doc management
    'kb.create_failed': 'Failed to create knowledge base',
    'kb.deleted': 'Knowledge base deleted',
    'kb.delete_title': 'Delete Knowledge Base',
    'doc.deleted': 'Document deleted',
    'doc.delete_title': 'Delete Document',

    // Search
    'search.no_results_title': 'No results',
    'search.searching': 'Searching...',

    // Settings
    'settings.title': '⚙️ Settings',
    'settings.tab_models': '🧠 Models',
    'settings.tab_language': '🌐 Language',
    'settings.embedding_model': 'Embedding Model',
    'settings.qa_model': 'QA Model (RAG Q&A)',
    'settings.idle': 'Idle',
    'settings.cache_checking': '📦 Cache: checking...',
    'settings.cache_cached': '📦 Cache: cached',
    'settings.cache_not_cached': '📦 Cache: not cached',
    'settings.cache_cleared': '📦 Cache: cleared',
    'settings.download': '⬇ Download',
    'settings.redownload': '🔄 Re-download',
    'settings.downloading': '⏳ Downloading...',
    'settings.loading': '⏳ Loading...',
    'settings.webgpu_unavailable': '⚠ WebGPU not available',
    'settings.model_cache': '🗄️ Model Cache',
    'settings.cached_files': 'Cached files:',
    'settings.total_size': 'Total size:',
    'settings.clear_cache': '🗑 Clear model cache',
    'settings.cache_warning': 'Clearing the cache will re-download models on next use.',
    'settings.embedding_ready': 'Embedding model ready!',
    'settings.embedding_failed': 'Failed to load model: {msg}',
    'settings.qa_ready': 'QA model ready!',
    'settings.qa_failed': 'Failed to load QA model: {msg}',
    'settings.switching': 'Switching to {model}. Re-index documents after download.',
    'settings.cache_cleared_toast': 'Cache cleared. Click Download to re-download.',
    'settings.cache_clear_success': 'Model cache cleared',
    'settings.cache_clear_failed': 'Failed to clear cache',
    'settings.na': 'N/A',
    'settings.language': 'Language / 语言',
    'settings.status_ready': 'Ready',
    'settings.status_error': 'Error',
    'settings.status_downloading': 'Downloading',
    'settings.status_loading': 'Loading',
    'settings.language_set': 'Language set to {name}',

    // Backup
    'backup.tab': '💾 Backup',
    'backup.title': 'Backup & Restore',
    'backup.export': '⬇ Export (.ragbak)',
    'backup.import': '⬆ Import (.ragbak)',
    'backup.desc': 'Export all knowledge bases with vectors for backup or transfer to another browser.',
    'backup.exported': 'Exported {kbs} KBs, {docs} docs, {chunks} chunks.',
    'backup.imported': 'Imported {kbs} KBs, {docs} docs, {chunks} chunks.',
    'backup.import_failed': 'Import failed: {msg}',

    // Model download overlay
    'overlay.title': 'Loading AI Model',
    'overlay.desc': 'Downloading embedding model (~23MB).\nFirst-time setup, one-time only. Cached for offline use.',
    'overlay.dismiss': 'Continue browsing',

    // Router titles
    'route.home': 'RAG Tools — Browser Local Knowledge Base',
    'route.search': 'Search — RAG Tools',
    'route.docs': 'Documents — RAG Tools',
    'route.settings': 'Settings — RAG Tools',
  },

  'zh-CN': {
    // General
    'app.name': 'RAG Tools',
    'app.tagline': '浏览器本地知识库',

    // Sidebar
    'kb.title': '知识库',
    'kb.new': '新建知识库',
    'kb.empty': '暂无知识库',
    'kb.name.placeholder': '知识库名称',
    'kb.create': '创建',
    'kb.delete.confirm': '删除此知识库及所有文档？此操作不可撤销。',
    'docs.title': '文档',
    'docs.empty': '暂无文档',
    'docs.delete.confirm': '删除此文档？关联的分块也将被移除。',

    // Search
    'search.placeholder': '搜索你的文档...',
    'search.empty.title': '还没有文档',
    'search.empty.desc': '拖入 PDF、TXT 或 MD 文件开始使用。',
    'search.no_results': '未找到 "{query}" 的相关结果。尝试换个关键词。',
    'search.results_count': '找到 {count} 个结果',
    'search.model_changed': '嵌入模型已更改 — 旧文档的语义搜索受限。请重新导入文档以重新索引。',

    // Drop zone
    'dropzone.text': '拖入文档，或点击选择',
    'dropzone.hint': '支持 PDF、TXT、MD',

    // Q&A
    'qa.toggle': 'AI 问答',
    'qa.placeholder': '询问文档相关问题...',

    // Ingestion
    'ingestion.extracting': '提取文本中',
    'ingestion.chunking': '分块处理中',
    'ingestion.embedding': '生成向量中',
    'ingestion.storing': '保存到数据库',
    'ingestion.complete': '处理完成',
    'ingestion.error': '处理 {name} 时出错',
    'ingestion.progress': '{current}/{total}',
    'ingestion.unsupported_format': '暂不支持 {ext} 文件。支持：PDF、TXT、MD',
    'ingestion.failed': '有 {count} 个文件处理失败。',
    'ingestion.partial': '{succeeded} 个成功，{failed} 个失败。',
    'ingestion.backfilled': '已为 {count} 个纯文本分块生成向量。',
    'ingestion.duplicate': '「{name}」已在该知识库中，已跳过。',

    // Model
    'model.downloading': '下载嵌入模型中（约 23MB）',
    'model.download.detail': '首次使用只需一次下载，之后离线可用。',
    'model.loading': '加载模型到内存中',
    'model.ready': '模型就绪',
    'model.error': '模型加载失败，请刷新重试。',

    // Results
    'result.expand': '展开上下文',
    'result.collapse': '收起',
    'result.from': '来自',

    // Source viewer
    'doc.view_source': '查看原文',
    'doc.page': '第 {n} 页',
    'doc.no_text': '该文档暂无全文。',

    // Theme
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.auto': '自动',

    // Stats
    'stats.docs': '{count} 个文档',
    'stats.chunks': '{count} 个分块',
    'stats.storage': '{size}',

    // Errors
    'error.file_size': '文件过大。',
    'error.file_type': '不支持的文件类型。支持：{types}',
    'error.generic': '出错了，请重试。',
    'error.offline': '您似乎离线了，部分功能可能不可用。',

    // Pro
    'pro.title': '升级到 Pro',
    'pro.price': '¥29.9 一次买断',
    'pro.benefits': '无限文档、RAG 问答、导出导入、DOCX/EPUB、无广告',
    'pro.enter_license': '输入 License Key',
    'pro.activate': '激活',
    'pro.activated': 'Pro 已激活！',
    'pro.invalid': '无效的 License Key',

    // QA
    'qa.ask': '提问',
    'qa.stop': '停止',
    'qa.search_mode': '🔍 搜索',
    'qa.loading_model': '正在加载 AI 模型（{pct}%）...',
    'qa.model_ready': '✅ AI 模型就绪！可以提问了。',
    'qa.model_failed': 'AI 模型加载失败，可能缺少 WebGPU。',
    'qa.error': '错误：{msg}',
    'qa.loading_wait': 'AI 模型仍在加载，请稍候...',
    'qa.init': '正在初始化 AI 模型...',
    'qa.init_failed': 'AI 模型初始化失败：{msg}',
    'qa.no_answer': '获取回答失败',
    'qa.no_info': '在知识库中未找到相关信息来回答该问题。',
    'qa.stopped': '⏹️ 已停止回答。',

    // KB / Doc management
    'kb.required': '请先创建或选择知识库。',

    // Ingestion status
    'ingestion.too_little': '提取到的文本过少',
    'ingestion.text_only': '模型加载中，仅存文本...',
    'ingestion.chunks_done': '{count} 个分块',

    // Common actions
    'common.delete': '删除',
    'common.cancel': '取消',

    // KB / Doc management
    'kb.create_failed': '创建知识库失败',
    'kb.deleted': '知识库已删除',
    'kb.delete_title': '删除知识库',
    'doc.deleted': '文档已删除',
    'doc.delete_title': '删除文档',

    // Search
    'search.no_results_title': '没有结果',
    'search.searching': '搜索中...',

    // Settings
    'settings.title': '⚙️ 设置',
    'settings.tab_models': '🧠 模型',
    'settings.tab_language': '🌐 语言',
    'settings.embedding_model': '嵌入模型',
    'settings.qa_model': '问答模型（RAG 问答）',
    'settings.idle': '待命',
    'settings.cache_checking': '📦 缓存：检查中...',
    'settings.cache_cached': '📦 缓存：已缓存',
    'settings.cache_not_cached': '📦 缓存：未缓存',
    'settings.cache_cleared': '📦 缓存：已清除',
    'settings.download': '⬇ 下载',
    'settings.redownload': '🔄 重新下载',
    'settings.downloading': '⏳ 下载中...',
    'settings.loading': '⏳ 加载中...',
    'settings.webgpu_unavailable': '⚠ 不可用 WebGPU',
    'settings.model_cache': '🗄️ 模型缓存',
    'settings.cached_files': '已缓存文件：',
    'settings.total_size': '总大小：',
    'settings.clear_cache': '🗑 清除模型缓存',
    'settings.cache_warning': '清除缓存后，下次使用需重新下载模型。',
    'settings.embedding_ready': '嵌入模型就绪！',
    'settings.embedding_failed': '模型加载失败：{msg}',
    'settings.qa_ready': '问答模型就绪！',
    'settings.qa_failed': '问答模型加载失败：{msg}',
    'settings.switching': '正在切换到 {model}，下载完成后请重新索引文档。',
    'settings.cache_cleared_toast': '缓存已清除，点击下载重新下载。',
    'settings.cache_clear_success': '模型缓存已清除',
    'settings.cache_clear_failed': '清除缓存失败',
    'settings.na': 'N/A',
    'settings.language': '语言 / Language',
    'settings.status_ready': '就绪',
    'settings.status_error': '出错',
    'settings.status_downloading': '下载中',
    'settings.status_loading': '加载中',
    'settings.language_set': '已切换语言：{name}',

    // Backup
    'backup.tab': '💾 备份',
    'backup.title': '备份与恢复',
    'backup.export': '⬇ 导出（.ragbak）',
    'backup.import': '⬆ 导入（.ragbak）',
    'backup.desc': '导出全部知识库及向量，用于备份或迁移到其他浏览器。',
    'backup.exported': '已导出 {kbs} 个知识库、{docs} 个文档、{chunks} 个分块。',
    'backup.imported': '已导入 {kbs} 个知识库、{docs} 个文档、{chunks} 个分块。',
    'backup.import_failed': '导入失败：{msg}',

    // Model download overlay
    'overlay.title': '正在加载 AI 模型',
    'overlay.desc': '正在下载嵌入模型（约 23MB）。\n首次使用只需一次下载，之后离线可用。',
    'overlay.dismiss': '继续浏览',

    // Router titles
    'route.home': 'RAG Tools — 浏览器本地知识库',
    'route.search': '搜索 — RAG Tools',
    'route.docs': '文档 — RAG Tools',
    'route.settings': '设置 — RAG Tools',
  },
};

let currentLocale = 'en';

export function t(key, params = {}) {
  const locale = currentLocale;
  const dict = translations[locale] || translations['en'];
  let text = dict[key] || translations['en'][key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

export function setLocale(locale) {
  if (translations[locale]) {
    currentLocale = locale;
    localStorage.setItem('rag-locale', locale);
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    // Keep shared state in sync so formatDate & other state-readers use the new locale.
    state.set('locale', locale);
  }
}

export function getLocale() {
  return currentLocale;
}

// Auto-detect initial locale
const initial = localStorage.getItem('rag-locale') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en');
setLocale(initial);
