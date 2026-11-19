// Sites serves the same-origin API. GitHub Pages declares the existing API origin at build time.
export function apiRequest(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('Unsupported training API path.');
  const configured = document.querySelector('meta[name="training-api-origin"]')?.content;
  const origin = configured ? new URL(configured).origin : location.origin;
  return fetch(new URL(path, origin), { ...options, credentials: 'omit' });
}
