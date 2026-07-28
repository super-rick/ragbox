/**
 * Internationalization — simple key-value lookup, no framework.
 */

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

    // Drop zone
    'dropzone.text': 'Drop documents here, or click to select',
    'dropzone.hint': 'Supports PDF, TXT, MD',
    'dropzone.pro.error': 'This feature requires Pro',

    // Ingestion
    'ingestion.extracting': 'Extracting text',
    'ingestion.chunking': 'Chunking text',
    'ingestion.embedding': 'Generating embeddings',
    'ingestion.storing': 'Saving to database',
    'ingestion.complete': 'Ingestion complete',
    'ingestion.error': 'Error processing {name}',
    'ingestion.progress': '{current}/{total}',

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

    // Theme
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.auto': 'Auto',

    // Stats
    'stats.docs': '{count} docs',
    'stats.chunks': '{count} chunks',
    'stats.storage': '{size}',

    // Errors
    'error.file_size': 'File too large. Max {size} for free tier.',
    'error.file_type': 'Unsupported file type. Supported: {types}',
    'error.pro_only': 'This feature is only available in Pro.',
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

    // Drop zone
    'dropzone.text': '拖入文档，或点击选择',
    'dropzone.hint': '支持 PDF、TXT、MD',
    'dropzone.pro.error': '此功能需要 Pro',

    // Ingestion
    'ingestion.extracting': '提取文本中',
    'ingestion.chunking': '分块处理中',
    'ingestion.embedding': '生成向量中',
    'ingestion.storing': '保存到数据库',
    'ingestion.complete': '处理完成',
    'ingestion.error': '处理 {name} 时出错',
    'ingestion.progress': '{current}/{total}',

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

    // Theme
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.auto': '自动',

    // Stats
    'stats.docs': '{count} 个文档',
    'stats.chunks': '{count} 个分块',
    'stats.storage': '{size}',

    // Errors
    'error.file_size': '文件过大。免费版限制 {size}。',
    'error.file_type': '不支持的文件类型。支持：{types}',
    'error.pro_only': '此功能仅 Pro 版本可用。',
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
  }
}

export function getLocale() {
  return currentLocale;
}

// Auto-detect initial locale
const initial = localStorage.getItem('rag-locale') || (navigator.language.startsWith('zh') ? 'zh-CN' : 'en');
setLocale(initial);
