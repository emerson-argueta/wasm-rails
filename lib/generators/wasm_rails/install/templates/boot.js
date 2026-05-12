// boot.js — Main thread glue.
// Registers the Service Worker and relays progress messages to the shell page.

export async function bootWasm() {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers not supported in this browser.');
  }

  const reg = await navigator.serviceWorker.register('/wasm/service_worker.js', { scope: '/', type: 'module' });
  console.log('[wasm/boot] Service Worker registered', reg.scope);

  // If a SW is already active with no pending update, boot completed in a previous session.
  if (reg.active && !reg.installing && !reg.waiting) {
    console.log('[wasm/boot] SW already active');
    return;
  }

  return new Promise((resolve, reject) => {
    navigator.serviceWorker.addEventListener('message', function handler({ data }) {
      if (data.type === 'progress') {
        window.dispatchEvent(new CustomEvent('wasm-progress', { detail: data }));
      } else if (data.type === 'ready') {
        navigator.serviceWorker.removeEventListener('message', handler);
        resolve();
      } else if (data.type === 'error') {
        navigator.serviceWorker.removeEventListener('message', handler);
        reject(new Error(data.message));
      }
    });
  });
}
