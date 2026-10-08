/*
 * Persistence backends.
 *
 *  - shared : published on claude.ai. Everything is saved in the page's shared database (`db`), images in
 *             its asset store (`assets`), and people are the real signed-in viewers (`user`). Every viewer
 *             sees the same data, live.
 *  - local  : opened from a plain web server (development). Everything is kept in this browser only.
 *
 * store.js keeps one in-memory `state`; a backend loads it, saves changes (as per-document writes in shared
 * mode) and reports changes made by other people through hooks.onRemote().
 */
(function (CR) {
  // Collections stored one document per item. (`users` is derived from `user` profiles; `meta` lives in config/app.)
  const SYNCED = ['categories', 'reviews', 'participants', 'areas', 'options', 'colours', 'colourRefs', 'colourStudies',
    'benchmarks', 'votes', 'comments', 'decisions', 'activity', 'opened', 'people'];

  const clone = (o) => JSON.parse(JSON.stringify(o));
  /** JSON with sorted keys, so equal documents always compare equal. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }
  const hueOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const initialsOf = (name) => (name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  // ───────────────────────── local (this browser only) ─────────────────────────

  function localBackend() {
    const KEY = 'cult-design-review:v7';
    const save = (st) => {
      try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { CR.app && CR.app.toast('Could not save — browser storage is full.', 'danger'); }
    };
    return {
      mode: 'local',
      async load() {
        try { Object.keys(localStorage).filter((k) => k.startsWith('cult-design-review:') && k !== KEY).forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }
        let st = null;
        try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { st = null; }
        if (!st || st.schemaVersion !== CR.seed.SCHEMA) { st = CR.seed.build(); save(st); CR.images.clearAll().catch(() => {}); }
        return st;
      },
      save,
      start(st, hooks) {
        window.addEventListener('storage', (e) => { if (e.key === KEY) { this.load().then((ns) => { Object.keys(st).forEach((k) => delete st[k]); Object.assign(st, ns); hooks.onRemote(); }); } });
      },
    };
  }

  // ───────────────────────── shared (claude.ai artifact storage) ─────────────────────────

  async function sharedBackend(claude) {
    const [db, user, assets] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('assets')]);
    if (!db || !user) return { mode: 'unavailable' };
    const me = await user.me();
    if (!me || !me.id) return { mode: 'unavailable' };
    const [admin, canWrite] = await Promise.all([user.canEdit(), user.can('data.write')]);

    const caps = { admin: !!admin, write: canWrite !== false, upload: !!assets };
    let state = null;
    let ready = false;
    let hooks = { onRemote() {} };
    const lw = {};                     // last-known server copy per collection: Map(id -> stable json)
    [...SYNCED, 'config'].forEach((c) => { lw[c] = new Map(); });
    const chains = new Map();          // one write at a time per document
    let flushTimer = null;
    let remoteTimer = null;
    let lastErrorAt = 0;

    const toast = (m, tone) => CR.app && CR.app.toast(m, tone);
    const configOf = (st) => ({ id: 'app', approverId: st.meta.approverId || null, extraSeasons: st.meta.extraSeasons || [] });

    // ── people: every viewer becomes a Person; names come from claude.ai profiles ──
    async function refreshUsers() {
      const ids = new Set([me.id]);
      const add = (v) => { if (v) ids.add(v); };
      state.people.forEach((p) => add(p.id));
      state.reviews.forEach((r) => add(r.ownerId));
      state.participants.forEach((p) => add(p.userId));
      [state.votes, state.comments, state.activity, state.opened].forEach((l) => l.forEach((x) => add(x.userId)));
      state.decisions.forEach((d) => add(d.decidedBy));
      [state.colourStudies, state.colourRefs, state.benchmarks].forEach((l) => l.forEach((x) => add(x.addedBy)));
      add(state.meta.approverId);
      const profs = await user.profiles([...ids]);
      state.users = [...ids].map((id) => {
        const p = profs[id] || {};
        const name = p.name || (id === me.id ? 'You' : 'Someone');
        const role = id === state.meta.approverId ? 'approver' : (id === me.id ? (admin ? 'designer' : 'reviewer') : 'member');
        return { id, name, initials: initialsOf(p.name), hue: hueOf(id), avatarUrl: p.avatarUrl || '', role, demo: false };
      });
    }

    // ── incoming changes ──
    function applySnapshot(c, snap) {
      if (c === 'config') {
        snap.docs.forEach((d) => {
          if (d.id !== 'app' || !d.exists) return;
          const data = clone(d.data());
          state.meta.approverId = data.approverId || null;
          state.meta.extraSeasons = Array.isArray(data.extraSeasons) ? data.extraSeasons : [];
          lw.config.set('app', stable({ id: 'app', approverId: state.meta.approverId, extraSeasons: state.meta.extraSeasons }));
        });
        return;
      }
      snap.docChanges().forEach((ch) => {
        const id = ch.doc.id;
        const list = state[c];
        const i = list.findIndex((o) => o.id === id);
        if (ch.type === 'removed') {
          if (i >= 0 && lw[c].has(id)) { state[c] = list.filter((o) => o.id !== id); }
          lw[c].delete(id);
          return;
        }
        const data = clone(ch.doc.data() || {});
        if (!data.id) data.id = id;
        if (i >= 0 && lw[c].has(id) && stable(list[i]) !== lw[c].get(id)) return; // I have unsaved edits to this document: keep mine
        if (i >= 0) list[i] = data; else list.push(data);
        lw[c].set(id, stable(data));
      });
      if (c === 'categories') state.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function scheduleRemote() {
      clearTimeout(remoteTimer);
      remoteTimer = setTimeout(async () => { await refreshUsers(); hooks.onRemote(); }, 120);
    }

    // ── outgoing changes ──
    function enqueue(c, id) {
      const key = c + '/' + id;
      const run = async () => {
        const obj = c === 'config' ? configOf(state) : (state[c] || []).find((o) => o.id === id);
        const ref = db.doc(key);
        try {
          if (obj) await ref.set(clone(obj)); else await ref.delete();
        } catch (e) { await onWriteError(c, id, e); }
      };
      chains.set(key, (chains.get(key) || Promise.resolve()).then(run));
    }

    async function onWriteError(c, id, e) {
      lw[c].delete(id); // forget, so the next change retries
      if (e && e.code === 'invalid_argument') {
        // Not allowed for this person: put back whatever the server holds.
        try {
          const snap = await db.doc(c + '/' + id).get();
          if (c !== 'config') {
            state[c] = state[c].filter((o) => o.id !== id);
            if (snap.exists) { const d = clone(snap.data()); d.id = d.id || id; state[c].push(d); lw[c].set(id, stable(d)); }
          }
          hooks.onRemote();
        } catch { /* ignore */ }
        if (Date.now() - lastErrorAt > 4000) { lastErrorAt = Date.now(); toast('That change isn’t allowed for your access level, so it was undone.', 'danger'); }
      } else if (e && e.code === 'quota_exceeded') {
        toast('Storage is full — delete something and try again.', 'danger');
      } else if (Date.now() - lastErrorAt > 4000) {
        lastErrorAt = Date.now(); toast('Couldn’t save the last change. Check your connection and try again.', 'danger');
      }
    }

    function flush() {
      if (!ready) return;
      SYNCED.forEach((c) => {
        const cur = new Map(state[c].map((o) => [o.id, stable(o)]));
        cur.forEach((js, id) => { if (lw[c].get(id) !== js) { lw[c].set(id, js); enqueue(c, id); } });
        [...lw[c].keys()].forEach((id) => { if (!cur.has(id)) { lw[c].delete(id); enqueue(c, id); } });
      });
      const cfg = stable(configOf(state));
      if (lw.config.get('app') !== cfg) {
        const hasData = state.meta.approverId || (state.meta.extraSeasons || []).length;
        if (hasData || lw.config.has('app')) { lw.config.set('app', cfg); enqueue('config', 'app'); }
      }
    }

    return {
      mode: 'shared',
      assets,
      caps,
      me,
      async load() {
        state = CR.seed.empty();
        const first = [...SYNCED, 'config'].map((c) => new Promise((resolve) => {
          let done = false;
          const fin = () => { if (!done) { done = true; resolve(); } };
          db.collection(c).onSnapshot((snap) => { applySnapshot(c, snap); if (ready) scheduleRemote(); fin(); },
            (err) => { console.warn('db subscription ended', c, err); fin(); });
        }));
        await Promise.race([Promise.all(first), new Promise((r) => setTimeout(r, 15000))]);

        // First ever open: categories come from the built-in list; an Editor saves them for everyone.
        if (!state.categories.length) {
          state.categories = CR.seed.categories();
          if (!admin) state.categories.forEach((c) => lw.categories.set(c.id, stable(c)));
        }
        state.meta.currentUserId = me.id;
        if (caps.write && !state.people.some((p) => p.id === me.id)) state.people.push({ id: me.id, joinedAt: new Date().toISOString() });
        await refreshUsers();
        ready = true;
        flush();
        return state;
      },
      save(st, { quiet } = {}) {
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, quiet ? 500 : 30);
      },
      start(st, h) { hooks = h; },
    };
  }

  // ───────────────────────── Supabase (Vercel deployment) ─────────────────────────
  //
  // Tables (see supabase/schema.sql): `members` (the team: email, name, role) and `docs` (one row per item:
  // collection, id, data). Row-level security decides who can read and write what; images live in a private
  // storage bucket. Sign-in is an emailed link. People are identified by their lowercase email address.

  const nameFromEmail = (email) => String(email || '').split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'Someone';

  async function supabaseBackend(cfg) {
    const lib = window.supabase;
    if (!lib || !lib.createClient) return { mode: 'unavailable', message: 'The sign-in service could not be loaded. Check your internet connection and reload the page.' };
    const client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const signOut = async () => { try { await client.auth.signOut(); } finally { location.hash = ''; location.reload(); } };

    const { data: sessData } = await client.auth.getSession();
    const session = sessData && sessData.session;
    if (!session) {
      return {
        mode: 'signin',
        google: !!cfg.enableGoogle,
        async signInGoogle() {
          const { error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
          if (error) throw error;
        },
        // Sign-in by emailed 6-digit code (a link in an email is often "used up" by mail security scanners).
        async signIn(email) {
          const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
        },
        async verify(email, code) {
          const token = String(code || '').replace(/\s+/g, '');
          const { error } = await client.auth.verifyOtp({ email, token, type: 'email' });
          if (error) throw error;
        },
      };
    }
    const email = String(session.user.email || '').toLowerCase();
    const fetchMine = async () => { const { data } = await client.rpc('my_member'); return Array.isArray(data) ? data[0] : data; };
    let mine = await fetchMine();
    if (!mine) { await client.rpc('join_team'); mine = await fetchMine(); }   // people from an allowed email domain join as reviewers
    if (!mine) return { mode: 'notmember', email, signOut };

    const admin = mine.role === 'designer' || mine.role === 'approver';
    const caps = { admin, write: true, upload: admin };
    const DOCS = SYNCED.filter((c) => c !== 'people');
    let state = null;
    let ready = false;
    let hooks = { onRemote() {} };
    const lw = {};                       // last-known server copy per collection
    [...DOCS, 'config'].forEach((c) => { lw[c] = new Map(); });
    const lwUsers = new Map();           // members: id -> stable({name, role})
    const chains = new Map();
    let flushTimer = null;
    let remoteTimer = null;
    let lastErrorAt = 0;
    const toast = (m, tone) => CR.app && CR.app.toast(m, tone);
    const configOf = (st) => ({ id: 'app', extraSeasons: st.meta.extraSeasons || [] });
    const isDenied = (e) => !!e && (e.code === '42501' || /row-level security|permission denied/i.test(e.message || ''));

    const toUser = (m) => {
      const id = String(m.email).toLowerCase();
      const name = m.name || nameFromEmail(id);
      return { id, email: id, name, initials: initialsOf(name), hue: hueOf(id), avatarUrl: '', role: m.role, demo: false };
    };
    async function loadMembers() {
      const { data, error } = await client.from('members').select('email,name,role').order('added_at');
      if (error) { console.warn('members', error); return; }
      state.users = (data || []).map(toUser);
      lwUsers.clear();
      state.users.forEach((u) => lwUsers.set(u.id, stable({ name: u.name, role: u.role })));
    }

    // ── incoming changes ──
    function applyDoc(c, id, data) {
      if (c === 'config') {
        if (id === 'app' && data) {
          state.meta.extraSeasons = Array.isArray(data.extraSeasons) ? data.extraSeasons : [];
          lw.config.set('app', stable({ id: 'app', extraSeasons: state.meta.extraSeasons }));
        }
        return;
      }
      if (!lw[c]) return;
      const list = state[c];
      const i = list.findIndex((o) => o.id === id);
      if (data === null) {
        if (i >= 0 && lw[c].has(id)) state[c] = list.filter((o) => o.id !== id);
        lw[c].delete(id);
        return;
      }
      const d = clone(data); if (!d.id) d.id = id;
      if (i >= 0 && lw[c].has(id) && stable(list[i]) !== lw[c].get(id)) return;   // unsaved local edits win
      if (i >= 0) list[i] = d; else list.push(d);
      lw[c].set(id, stable(d));
      if (c === 'categories') state.categories.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    function scheduleRemote() { clearTimeout(remoteTimer); remoteTimer = setTimeout(() => hooks.onRemote(), 120); }

    // ── outgoing changes ──
    async function writeDoc(c, id) {
      const obj = c === 'config' ? configOf(state) : (state[c] || []).find((o) => o.id === id);
      let error;
      if (obj) ({ error } = await client.from('docs').upsert({ collection: c, id, data: clone(obj) }, { onConflict: 'collection,id' }));
      else ({ error } = await client.from('docs').delete().eq('collection', c).eq('id', id));
      if (error) await onWriteError(c, id, error);
    }
    async function writeMember(id) {
      const u = state.users.find((x) => x.id === id);
      let error;
      if (u) ({ error } = await client.from('members').upsert({ email: id, name: u.name, role: u.role }, { onConflict: 'email' }));
      else ({ error } = await client.from('members').delete().eq('email', id));
      if (error) { lwUsers.delete(id); if (Date.now() - lastErrorAt > 4000) { lastErrorAt = Date.now(); toast(isDenied(error) ? 'You can’t change the team list.' : 'Couldn’t save the team change.', 'danger'); } await loadMembers(); hooks.onRemote(); }
    }
    function enqueue(key, run) { chains.set(key, (chains.get(key) || Promise.resolve()).then(() => run().catch((e) => console.warn('write failed', key, e)))); }

    async function onWriteError(c, id, error) {
      lw[c].delete(id);
      if (isDenied(error)) {
        const { data } = await client.from('docs').select('data').eq('collection', c).eq('id', id).maybeSingle();
        if (c !== 'config') {
          state[c] = state[c].filter((o) => o.id !== id);
          if (data && data.data) { const d = clone(data.data); d.id = d.id || id; state[c].push(d); lw[c].set(id, stable(d)); }
        }
        hooks.onRemote();
        if (Date.now() - lastErrorAt > 4000) { lastErrorAt = Date.now(); toast('Your role doesn’t allow that change, so it was undone.', 'danger'); }
      } else if (Date.now() - lastErrorAt > 4000) {
        lastErrorAt = Date.now(); toast('Couldn’t save the last change. Check your connection and try again.', 'danger');
      }
    }

    function flush() {
      if (!ready) return;
      DOCS.forEach((c) => {
        const cur = new Map(state[c].map((o) => [o.id, stable(o)]));
        cur.forEach((js, id) => { if (lw[c].get(id) !== js) { lw[c].set(id, js); enqueue(c + '/' + id, () => writeDoc(c, id)); } });
        [...lw[c].keys()].forEach((id) => { if (!cur.has(id)) { lw[c].delete(id); enqueue(c + '/' + id, () => writeDoc(c, id)); } });
      });
      const cfg = stable(configOf(state));
      if (lw.config.get('app') !== cfg && ((state.meta.extraSeasons || []).length || lw.config.has('app'))) { lw.config.set('app', cfg); enqueue('config/app', () => writeDoc('config', 'app')); }
      const curU = new Map(state.users.map((u) => [u.id, stable({ name: u.name, role: u.role })]));
      curU.forEach((js, id) => { if (lwUsers.get(id) !== js) { lwUsers.set(id, js); enqueue('member/' + id, () => writeMember(id)); } });
      [...lwUsers.keys()].forEach((id) => { if (!curU.has(id)) { lwUsers.delete(id); enqueue('member/' + id, () => writeMember(id)); } });
    }

    // ── images: a private storage bucket, shown through short-lived signed links ──
    const urlCache = new Map();
    const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
    const images = {
      async put(blob) {
        const path = `${CR.util.uid('img')}.${EXT[blob.type] || 'img'}`;
        const { error } = await client.storage.from('images').upload(path, blob, { contentType: blob.type || undefined, upsert: false });
        if (error) throw new Error(isDenied(error) ? 'Only designers can upload images.' : (error.message || 'Upload failed'));
        return 'sb:' + path;
      },
      async url(ref) {
        const hit = urlCache.get(ref);
        if (hit && hit.until > Date.now()) return hit.url;
        const { data } = await client.storage.from('images').createSignedUrl(ref.slice(3), 3600);
        const url = data && data.signedUrl ? data.signedUrl : null;
        if (url) urlCache.set(ref, { url, until: Date.now() + 50 * 60 * 1000 });
        return url;
      },
      async remove(ref) { urlCache.delete(ref); await client.storage.from('images').remove([ref.slice(3)]); },
    };

    return {
      mode: 'supabase',
      caps,
      images,
      signOut,
      /** Designers can switch "anyone who signs in joins as a reviewer" on or off. */
      async setOpenJoin(on) {
        const { error } = await client.from('team_settings').upsert({ key: 'open_join', value: on ? 'true' : 'false' }, { onConflict: 'key' });
        if (error) { toast(isDenied(error) ? 'Only designers can change this.' : 'Couldn’t save that setting.', 'danger'); return; }
        state.meta.openJoin = !!on;
        hooks.onRemote();
      },
      async load() {
        state = CR.seed.empty();
        state.meta.currentUserId = email;
        { const { data: oj } = await client.from('team_settings').select('value').eq('key', 'open_join').maybeSingle(); state.meta.openJoin = !!(oj && oj.value === 'true'); }
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
          const { data, error } = await client.from('docs').select('collection,id,data').order('collection').order('id').range(from, from + pageSize - 1);
          if (error) { console.warn('docs', error); break; }
          (data || []).forEach((r) => applyDoc(r.collection, r.id, r.data));
          if (!data || data.length < pageSize) break;
        }
        await loadMembers();
        if (!state.categories.length) {
          state.categories = CR.seed.categories();
          if (!admin) state.categories.forEach((c) => lw.categories.set(c.id, stable(c)));   // only a designer saves the defaults
        }
        ready = true;
        flush();
        return state;
      },
      save(st, { quiet } = {}) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, quiet ? 500 : 30); },
      start(st, h) {
        hooks = h;
        client.channel('cult-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, (p) => {
            const row = p.eventType === 'DELETE' ? p.old : p.new;
            if (!row || !row.collection) return;
            applyDoc(row.collection, row.id, p.eventType === 'DELETE' ? null : row.data);
            scheduleRemote();
          })
          .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, async () => { await loadMembers(); scheduleRemote(); })
          .subscribe();
      },
    };
  }

  async function create() {
    if (window.claude && typeof window.claude.use === 'function') return sharedBackend(window.claude);
    const cfg = window.CULT_CONFIG || {};
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) return supabaseBackend(cfg);
    return localBackend();
  }

  CR.backend = { create };
})(window.CR);
