/**
 * Hash-based router for single-page app.
 * Routes: #home, #search, #docs, #settings
 */

import { state } from './state.js';

const routes = {
  'home':     { title: 'RAG Tools — Browser Local Knowledge Base' },
  'search':   { title: 'Search — RAG Tools' },
  'docs':     { title: 'Documents — RAG Tools' },
  'settings': { title: 'Settings — RAG Tools' },
};

function getHashRoute() {
  const hash = window.location.hash.replace('#', '') || 'home';
  return routes[hash] ? hash : 'home';
}

function navigate(route) {
  if (!routes[route]) route = 'home';
  window.location.hash = '#' + route;
}

function onHashChange() {
  const route = getHashRoute();
  const meta = routes[route];
  document.title = meta.title;
  state.set('route', route);
}

export function initRouter() {
  window.addEventListener('hashchange', onHashChange);
  // Handle initial hash
  onHashChange();
}

export function getRouteMeta(route) {
  return routes[route] || routes.home;
}

export { navigate };
