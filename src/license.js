/**
 * Pro License — simplified: all features are free.
 */

import { state } from './state.js';

/**
 * Always returns true — all features are free.
 */
export function isPro() {
  return true;
}

/**
 * No-op — Pro is always active.
 */
export function initLicense() {
  state.set('isPro', true);
}

/**
 * Always returns Pro limits.
 */
export function getLimits() {
  return { maxFileSize: 100 * 1024 * 1024, maxDocs: Infinity, maxKBs: Infinity };
}

/**
 * No-op — all features are accessible.
 */
export function requirePro(_featureName) {
  return true;
}
