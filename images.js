/*
 * Image storage. Uploaded images are kept as Blobs in IndexedDB (localStorage is too small
 * for product renders). Entities only hold an image *reference* string:
 *   "assets/…"   – static file shipped with the app (demo assets)
 *   "idb:<id>"   – uploaded blob in IndexedDB
 *   ""           – no image → a labelled placeholder is drawn
 * Swapping this module for object storage (S3/GCS) later only changes put()/url().
 */
(function (CR) {
  const DB_NAME = 'cult-design-review-images';
  const STORE = 'images';
  const MAX_EDGE = 1800;
  let dbPromise = null;
  const urlCache = new Map();

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }

  /** Downscale very large uploads so a review with dozens of renders stays fast. */
  async function normalise(file) {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 2.5e6) { bmp.close && bmp.close(); return file; }
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
      return await new Promise((res) => canvas.toBlob((b) => res(b || file), type, 0.9));
    } catch { return file; }
  }

  async function put(file) {
    if (!file || !file.type.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG, WebP, SVG).');
    const blob = await normalise(file);
    const prov = CR.backend && CR.backend.active && CR.backend.active.images;
    if (prov) return prov.put(blob);   // Supabase storage
    const shared = CR.backend && CR.backend.active && CR.backend.active.assets;
    if (shared) {
      // Published on claude.ai: images go to the page's shared asset store.
      const r = await shared.upload(blob, blob.type ? { type: blob.type } : undefined);
      return 'asset:' + r.id;
    }
    const id = CR.util.uid('img');
    await tx('readwrite', (s) => s.put(blob, id));
    return 'idb:' + id;
  }

  async function url(ref) {
    if (!ref) return null;
    if (ref.startsWith('asset:')) return '/_blob/' + ref.slice(6);
    if (ref.startsWith('sb:')) { const pv = CR.backend && CR.backend.active && CR.backend.active.images; return pv ? pv.url(ref) : null; }
    if (!ref.startsWith('idb:')) return ref;
    if (urlCache.has(ref)) return urlCache.get(ref);
    const blob = await tx('readonly', (s) => s.get(ref.slice(4)));
    const u = blob ? URL.createObjectURL(blob) : null;
    urlCache.set(ref, u);
    return u;
  }

  async function remove(ref) {
    if (ref && ref.startsWith('sb:')) {
      const pv = CR.backend && CR.backend.active && CR.backend.active.images;
      if (pv) pv.remove(ref).catch(() => {});
      return;
    }
    if (ref && ref.startsWith('asset:')) {
      const a = CR.backend && CR.backend.active && CR.backend.active.assets;
      if (a) a.delete(ref.slice(6)).catch(() => {});
      return;
    }
    if (!ref || !ref.startsWith('idb:')) return;
    await tx('readwrite', (s) => s.delete(ref.slice(4)));
    urlCache.delete(ref);
  }

  async function clearAll() {
    await tx('readwrite', (s) => s.clear());
    urlCache.clear();
  }

  /** After each render, resolve <img data-ref="idb:…"> to object URLs. */
  function hydrate(root) {
    root.querySelectorAll('img[data-ref]').forEach(async (img) => {
      const ref = img.getAttribute('data-ref');
      const u = await url(ref).catch(() => null);
      if (u) img.src = u;
      else img.closest('.media')?.classList.add('media--missing');
    });
  }

  CR.images = { put, url, remove, clearAll, hydrate };
})(window.CR);
