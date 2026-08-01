/**
 * Hash-based router for single-page app.
 * Routes: #home, #search, #docs, #settings
 */

import { state } from './state.js';
import { t } from './i18n.js';

const ROUTE_KEYS = {
  'home': 'route.home',
  'search': 'route.search',
  'docs': 'route.docs',
  'settings': 'route.settings',
};

function getHashRoute() {
  const hash = window.location.hash.replace('#', '') || 'home';
  return ROUTE_KEYS[hash] ? hash : 'home';
}

function navigate(route) {
  if (!ROUTE_KEYS[route]) route = 'home';
  window.location.hash = '#' + route;
}

function onHashChange() {
  const route = getHashRoute();
  document.title = t(ROUTE_KEYS[route] || 'route.home');
  state.set('route', route);
}

/** Re-apply the localized document title for a route (used after language switch). */
export function updateTitle(route) {
  document.title = t(ROUTE_KEYS[route] || 'route.home');
}

export function initRouter() {
  window.addEventListener('hashchange', onHashChange);
  // Handle initial hash
  onHashChange();
}

export function getRouteMeta(route) {
  return { title: t(ROUTE_KEYS[route] || 'route.home') };
}

export { navigate };
