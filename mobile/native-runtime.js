/* ScopeGuard native bridge: fail closed until a reviewed production API is configured. */
(() => {
  'use strict';
  const cfg = window.SCOPEGUARD_NATIVE;
  if (!cfg?.enabled) return;
  const originalFetch = window.fetch.bind(window);
  // Native builds must not offer web-only Stripe checkout or billing management.
  const hideWebBilling = () => {
    for (const button of document.querySelectorAll('.checkout-btn, #manageSubscriptionBtn')) {
      button.disabled = true;
      button.hidden = true;
      button.setAttribute('aria-hidden', 'true');
    }
    const notice = document.getElementById('checkoutMessage');
    if (notice) notice.textContent = 'Mobile subscriptions are not available in this development build.';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hideWebBilling);
  else hideWebBilling();
  const blocked = new Set(['/api/billing-checkout', '/api/billing-portal']);
  const origin = typeof cfg.apiBaseUrl === 'string' ? cfg.apiBaseUrl.replace(/\/$/, '') : '';
  const validOrigin = origin === 'https://scopeguard-preview.vercel.app';
  window.fetch = function nativeFetch(resource, options) {
    const url = typeof resource === 'string' ? resource : resource?.url;
    if (typeof url === 'string' && url.startsWith('/api/')) {
      const pathname = url.split('?')[0];
      if (blocked.has(pathname)) {
        return Promise.reject(new Error('Mobile subscription purchases are not available until platform billing is implemented.'));
      }
      if (!validOrigin) {
        return Promise.reject(new Error('ScopeGuard mobile API is not configured. This development build cannot connect to cloud services.'));
      }
      // The API must explicitly support native app origins and authenticated CORS preflight.
      if (typeof resource !== 'string') {
        return Promise.reject(new Error('Native API requests must use a URL string until Request rewriting is supported.'));
      }
      return originalFetch(origin + url, options);
    }
    return originalFetch(resource, options);
  };
})();
