/**
 * Global application state with EventTarget for reactivity.
 * Simple pub/sub — no framework.
 */

class AppState extends EventTarget {
  constructor() {
    super();
    this._state = {
      // UI state
      theme: localStorage.getItem('rag-theme') || 'auto',
      locale: localStorage.getItem('rag-locale') || navigator.language.startsWith('zh') ? 'zh-CN' : 'en',
      route: 'home',

      // Knowledge base
      currentKBId: null,
      knowledgeBases: [],
      documents: [],

      // Model
      modelStatus: 'idle', // idle | downloading | loading | ready | error
      modelProgress: 0,

      // Search
      searchQuery: '',
      searchResults: [],
      isSearching: false,

      // Ingestion
      ingestionQueue: [],
      isIngesting: false,

      // Pro
      isPro: localStorage.getItem('rag-pro') === 'true',

      // UI interactions
      sidebarOpen: true,
      toasts: [],
      modal: null,
    };
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const old = this._state[key];
    if (old === value) return;
    this._state[key] = value;
    this.dispatchEvent(new CustomEvent('state:' + key, { detail: { value, old } }));
    this.dispatchEvent(new CustomEvent('state:change', { detail: { key, value, old } }));
  }

  toggle(key) {
    this.set(key, !this._state[key]);
  }

  subscribe(key, callback) {
    this.addEventListener('state:' + key, (e) => callback(e.detail.value, e.detail.old));
  }

  subscribeAny(callback) {
    this.addEventListener('state:change', (e) => callback(e.detail.key, e.detail.value, e.detail.old));
  }
}

export const state = new AppState();
