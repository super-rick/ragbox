/**
 * DOM utilities and UI rendering helpers.
 */

import { state } from './state.js';
import { t } from './i18n.js';

// ─── DOM Query Shortcuts ────────────────────────────────────────

export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

// ─── Element Creation ───────────────────────────────────────────

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') {
      el.className = val;
    } else if (key === 'dataset') {
      Object.assign(el.dataset, val);
    } else if (key.startsWith('on')) {
      const eventName = key.slice(2).toLowerCase();
      if (typeof val === 'function') {
        el.addEventListener(eventName, val);
      } else if (typeof val === 'object' && val !== null) {
        // Support nested on: { click: fn, input: fn }
        for (const [evt, handler] of Object.entries(val)) {
          el.addEventListener(evt, handler);
        }
      }
    } else if (key === 'style' && typeof val === 'object') {
      Object.assign(el.style, val);
    } else {
      el.setAttribute(key, val);
    }
  }
  for (const child of children) {
    if (child == null) continue;
    el.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

// ─── Theme ──────────────────────────────────────────────────────

export function setTheme(theme) {
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.setAttribute('data-theme', resolved);
  state.set('theme', theme);
  localStorage.setItem('rag-theme', theme);
}

export function initTheme() {
  const saved = state.get('theme');
  setTheme(saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.get('theme') === 'auto') setTheme('auto');
  });
}

// ─── Toast Notifications ────────────────────────────────────────

export function showToast(message, type = 'info', duration = 3000) {
  const container = $('#toast-container') || (() => {
    const c = createElement('div', { id: 'toast-container' });
    Object.assign(c.style, {
      position: 'fixed', bottom: '1rem', right: '1rem',
      zIndex: '1000', display: 'flex', flexDirection: 'column', gap: '0.5rem',
    });
    document.body.appendChild(c);
    return c;
  })();

  const colors = {
    info: 'var(--accent)',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
  };

  const toast = createElement('div', {
    className: `toast toast-${type}`,
    style: {
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      border: `1px solid ${colors[type] || colors.info}`,
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      fontSize: '0.875rem',
      maxWidth: '360px',
      animation: 'slideIn 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
    },
  });

  const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
  toast.prepend(document.createTextNode(icons[type] || ' '));
  toast.append(document.createTextNode(' ' + message));
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Modal ──────────────────────────────────────────────────────

export function showModal({ title, content, actions = [], size = 'default' }) {
  const overlay = createElement('div', {
    className: 'modal-overlay',
    style: {
      position: 'fixed', inset: '0', zIndex: '999',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    },
  });

  const dialog = createElement('div', {
    className: 'modal-dialog',
    style: {
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      borderRadius: '12px',
      padding: '1.5rem',
      maxWidth: size === 'wide' ? '720px' : '480px',
      width: '90%',
      boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    },
  });

  if (title) {
    dialog.append(createElement('h2', {
      style: { margin: '0 0 1rem 0', fontSize: '1.125rem', fontWeight: '600' },
    }, [title]));
  }

  if (typeof content === 'string') {
    dialog.append(createElement('p', { style: { margin: '0 0 1rem 0', lineHeight: '1.5' }}, [content]));
  } else if (content) {
    dialog.append(content);
  }

  if (actions.length > 0) {
    const btnRow = createElement('div', {
      style: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' },
    });
    for (const action of actions) {
      const btn = createElement('button', {
        className: `btn btn-${action.variant || 'secondary'}`,
        style: {
          padding: '0.5rem 1rem',
          borderRadius: '6px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: '500',
          background: action.variant === 'danger' ? '#ef4444'
            : action.variant === 'primary' ? 'var(--accent)'
            : 'var(--bg-secondary)',
          color: action.variant === 'primary' ? '#fff' : 'var(--text-primary)',
          border: action.variant === 'secondary' ? '1px solid var(--border)' : 'none',
        },
        on: { click: () => { action.onClick?.(); overlay.remove(); } },
      }, [action.label]);
      btnRow.append(btn);
    }
    dialog.append(btnRow);
  }

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.append(dialog);
  document.body.appendChild(overlay);
  return overlay;
}

// ─── Formatting Helpers ─────────────────────────────────────────

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(state.get('locale') === 'zh-CN' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function sanitizeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Progress Bar ───────────────────────────────────────────────

export function createProgressBar() {
  const container = createElement('div', {
    style: {
      width: '100%', height: '8px',
      background: 'var(--bg-secondary)',
      borderRadius: '4px', overflow: 'hidden',
    },
  });
  const bar = createElement('div', {
    style: {
      width: '0%', height: '100%',
      background: 'var(--accent)',
      borderRadius: '4px',
      transition: 'width 0.3s ease',
    },
  });
  container.append(bar);
  return { container, setProgress: (pct) => { bar.style.width = Math.min(100, Math.max(0, pct)) + '%'; } };
}

// ─── Loading Spinner ────────────────────────────────────────────

export function createSpinner(size = 24) {
  const spinner = createElement('div', {
    className: 'spinner',
    style: {
      width: size + 'px', height: size + 'px',
      border: '3px solid var(--border)',
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.6s linear infinite',
    },
  });
  return spinner;
}

// ─── Stats Bar ──────────────────────────────────────────────────

export function renderStats(stats) {
  const el = $('#stats-bar');
  if (!el) return;
  el.innerHTML = '';
  el.append(
    createElement('span', { className: 'stat-item' }, [`📄 ${t('stats.docs', { count: stats.docCount ?? 0 })}`]),
    createElement('span', { className: 'stat-item' }, [`🧩 ${t('stats.chunks', { count: stats.chunkCount ?? 0 })}`]),
    createElement('span', { className: 'stat-item' }, [`💾 ${t('stats.storage', { size: formatBytes(stats.storageBytes ?? 0) })}`]),
  );
}

// ─── Loading State ──────────────────────────────────────────────

export function renderEmptyState(container, { icon = '📂', title, description, action } = {}) {
  container.innerHTML = '';
  const wrapper = createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', textAlign: 'center', gap: '0.75rem',
    },
  });
  wrapper.append(createElement('div', { style: { fontSize: '3rem' } }, [icon]));
  if (title) wrapper.append(createElement('h2', { style: { margin: 0, fontSize: '1.25rem' } }, [title]));
  if (description) wrapper.append(createElement('p', { style: { margin: 0, color: 'var(--text-secondary)', lineHeight: '1.5' } }, [description]));
  if (action) wrapper.append(action);
  container.append(wrapper);
}

export function renderErrorState(container, { message, onRetry } = {}) {
  container.innerHTML = '';
  const wrapper = createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', textAlign: 'center', gap: '0.75rem',
    },
  });
  wrapper.append(createElement('div', { style: { fontSize: '3rem' } }, ['⚠️']));
  wrapper.append(createElement('p', { style: { color: '#ef4444', margin: 0 } }, [message || t('error.generic')]));
  if (onRetry) {
    wrapper.append(createElement('button', {
      className: 'btn',
      style: {
        padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border)',
        cursor: 'pointer', background: 'var(--bg-secondary)', color: 'var(--text-primary)',
      },
      on: { click: onRetry },
    }, ['Retry']));
  }
  container.append(wrapper);
}

export function renderLoadingState(container, { message = 'Loading...' } = {}) {
  container.innerHTML = '';
  const wrapper = createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '4rem 2rem', gap: '1rem',
    },
  });
  wrapper.append(createSpinner(32));
  wrapper.append(createElement('p', { style: { margin: 0, color: 'var(--text-secondary)' } }, [message]));
  container.append(wrapper);
}
