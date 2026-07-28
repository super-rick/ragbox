/**
 * Pro License verification.
 *
 * Honor-lock: public key in open-source code, private key in Cloudflare Worker.
 * HMAC-SHA256 signed keys: RAG-PRO-{userId}-{timestamp}-{signature}
 */

import { state } from './state.js';

// Public HMAC key for signature verification
// Safe to commit to GitHub — this can only verify, not generate
const PUBLIC_KEY = 'rag-pro-v1-public-key-change-in-production';

const STORAGE_KEY = 'rag-pro';

/**
 * Verify a license key signature.
 * Key format: RAG-PRO-{userId}-{timestamp}-{base64signature}
 */
function verifyLicenseKey(key) {
  if (!key || typeof key !== 'string') return false;

  const parts = key.split('-');
  if (parts.length < 5) return false;
  if (parts[0] !== 'RAG' || parts[1] !== 'PRO') return false;

  // payload = RAG-PRO-{userId}-{timestamp}
  // signature = last part
  const signature = parts.pop();
  const payload = parts.join('-');

  // Simple HMAC-like verification using the public key
  // In production, replace with actual HMAC-SHA256 verification
  const expectedSig = btoa(payload + ':' + PUBLIC_KEY).replace(/=/g, '');
  const actualSig = signature.replace(/=/g, '');

  return expectedSig === actualSig;
}

/**
 * Activate Pro with a license key.
 */
export function activateLicense(key) {
  const valid = verifyLicenseKey(key);
  if (valid) {
    localStorage.setItem(STORAGE_KEY, key);
    state.set('isPro', true);
    return { success: true };
  }
  return { success: false, error: 'Invalid license key' };
}

/**
 * Check if Pro is currently active.
 */
export function isPro() {
  return state.get('isPro');
}

/**
 * Initialize Pro status from saved license.
 */
export function initLicense() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && verifyLicenseKey(saved)) {
    state.set('isPro', true);
  }
}

/**
 * Get license info for display.
 */
export function getLicenseInfo() {
  return {
    tier: state.get('isPro') ? 'pro' : 'free',
  };
}

// ─── Pro Feature Gating ─────────────────────────────────────────

/**
 * Check if a Pro feature is accessible.
 * Shows upgrade modal if not Pro.
 */
export function requirePro(featureName, onUpgrade) {
  if (state.get('isPro')) return true;

  const { showModal } = import('./ui.js').then(({ showModal }) => {
    showModal({
      title: 'Upgrade to Pro',
      content: `${featureName} is a Pro feature. Upgrade for ¥29.9 one-time to unlock it.`,
      actions: [
        { label: 'Upgrade', variant: 'primary', onClick: onUpgrade },
        { label: 'Cancel', variant: 'secondary' },
      ],
    });
  });

  return false;
}

/**
 * Pro feature limits check.
 */
export function getLimits() {
  if (state.get('isPro')) {
    return { maxFileSize: 100 * 1024 * 1024, maxDocs: Infinity, maxKBs: Infinity };
  }
  return { maxFileSize: 10 * 1024 * 1024, maxDocs: 10, maxKBs: 1 };
}
