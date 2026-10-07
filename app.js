/* App shell: hash router, render loop, modal + toast handling and DOM event delegation. */
(function (CR) {
  const { html } = CR.util;
  const { actions, sel } = CR.store;

  const ui = {
    compare: { areaId: null, ids: [] },
    modal: null,
    showAllActivity: false,
    openThreads: new Set(),
    filters: { reviews: {}, finals: {} },
    library: { season: null, source: 'all' },
    bench: { category: '', sub: '', q: '', tag: '' },
    benchEditing: new Set(),
  };

  const $app = () => document.getElementById('app');
  const $dialog = () => document.getElementById('modal');
  let lastRoute = '';
  let scheduled = false;
  let modalOpener = null;
  let remoteRender = false;
  let rendered = false;

  // ───────────────────────── routing ─────────────────────────

  function parseRoute() {
    const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : (location.hash ? null : '');
    if (raw == null) return null; // in-page anchor, not a route
    const [path, anchor] = raw.split('#');
    const p = path.split('/').filter(Boolean);
    return { p, anchor, key: path };
  }

  function view(route) {
    const [a, id, sub] = route.p;
    switch (a) {
      case undefined: return { nav: 'dashboard', body: CR.views.dashboard(), title: 'Dashboard' };
      case 'reviews': return { nav: 'reviews', body: CR.views.reviewsPage(), title: 'Reviews' };
      case 'finals': return { nav: 'finals', body: CR.views.finalsPage(), title: 'Selections' };
      case 'benchmarks': return { nav: 'benchmarks', body: CR.views.benchmarksPage(), title: 'Benchmarks' };
      case 'colours': return { nav: 'colours', body: CR.views.libraryPage(), title: 'Pantone & WGSN' };
      case 'guide': return { nav: 'guide', body: CR.views.guidePage(), title: 'How it works' };
      case 'settings': return { nav: 'settings', body: CR.views.settingsPage(), title: 'Settings' };
      case 'review': {
        const r = sel.review(id);
        if (r && !sub) actions.markOpened(r.id, CR.store.me().id);
        const t = r ? r.title : 'Review';
        if (sub === 'edit') return { nav: 'reviews', body: CR.views.editorPage(id), title: `Edit · ${t}` };
        if (sub === 'summary') return { nav: 'finals', body: CR.views.summaryPage(id), title: `Summary · ${t}` };
        return { nav: 'reviews', body: CR.views.reviewPage(id), title: t };
      }
      default: return { nav: '', body: CR.ui.emptyState('Page not found', 'That link doesn’t match a page.', html`<a class="btn" href="#/">Dashboard</a>`), title: 'Not found' };
    }
  }

  // ───────────────────────── rendering ─────────────────────────

  function renderShell(nav) {
    const me = CR.store.me();
    document.querySelectorAll('.nav a').forEach((a) => {
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (CR.store.mode === 'shared' || CR.store.mode === 'supabase') {
      // Hosted: you are whoever is signed in. No switching.
      const by = CR.store.mode === 'shared' ? 'your claude.ai account' : 'your work email';
      document.getElementById('user-slot').innerHTML = html`
        <div class="user-switch user-switch--fixed" title="Signed in with ${by}">
          ${CR.ui.avatar(me, 'md')}
          <span class="user-switch__text"><span class="user-switch__k">Signed in as · ${CR.store.ROLES[me.role]}</span>
            <span class="user-switch__name">${me.name}</span></span>
          ${CR.store.mode === 'supabase' ? html`<button class="btn btn--ghost btn--sm" data-action="sign-out">Sign out</button>` : ''}
        </div>`.toString();
      return;
    }
    document.getElementById('user-slot').innerHTML = html`
      <label class="user-switch" title="Pick who you are — there is no sign-in in this prototype">
        ${CR.ui.avatar(me, 'md')}
        <span class="user-switch__text"><span class="user-switch__k">Viewing as</span>
          <select id="user-select" aria-label="Who are you? (no sign-in in this prototype)">
            ${CR.store.state.users.map((u) => html`<option value="${u.id}" ${u.id === me.id ? CR.util.raw('selected') : ''}>${u.name} — ${CR.store.ROLES[u.role]}</option>`)}
            <option value="__add">＋ Add a person…</option>
          </select></span>
      </label>`.toString();
  }

  function renderModal() {
    const dlg = $dialog();
    if (!ui.modal) { if (dlg.open) dlg.close(); return; }
    // A change made by someone else shouldn't wipe a form the person is filling in.
    if (remoteRender && dlg.open && ['decide', 'person'].includes(ui.modal.type)) return;
    const fn = CR.modals[ui.modal.type];
    const content = fn && fn(ui.modal);
    if (!content) { ui.modal = null; if (dlg.open) dlg.close(); return; }
    dlg.className = `modal modal--${ui.modal.type}`;
    const keepScroll = dlg.open ? dlg.querySelector('.modal__inner')?.scrollTop : 0;
    dlg.innerHTML = `<div class="modal__inner">${content}</div>`;
    if (!dlg.open) { modalOpener = document.activeElement; dlg.showModal(); }
    const inner = dlg.querySelector('.modal__inner');
    if (inner && keepScroll) inner.scrollTop = keepScroll;
  }

  function render() {
    scheduled = false;
    let route = parseRoute();
    if (!route) { if (rendered) return; route = { p: [], anchor: null, key: '' }; } // first load with a bare #anchor: show the dashboard
    rendered = true;
    const active = document.activeElement;
    const focusId = active && active.id && active !== document.body ? active.id : null;
    let caret = null;
    try { caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null; } catch { caret = null; }
    const sameRoute = route.key === lastRoute;
    const y = window.scrollY;

    const v = view(route);
    renderShell(v.nav);
    $app().innerHTML = v.body.toString();
    document.title = `${v.title} · Cult Design Review`;
    renderModal();
    CR.images.hydrate(document);

    if (sameRoute) {
      window.scrollTo(0, y);
      if (focusId) {
        const el = document.getElementById(focusId);
        if (el) {
          el.focus({ preventScroll: true });
          if (caret != null && typeof el.setSelectionRange === 'function') { try { el.setSelectionRange(caret, caret); } catch { /* not a text input */ } }
        }
      }
    } else {
      lastRoute = route.key;
      if (route.anchor) setTimeout(() => scrollToId(route.anchor), 30);
      else {
        window.scrollTo(0, 0);
        const h1 = $app().querySelector('h1');
        if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
      }
    }
  }

  function scheduleRender(remote = false) {
    if (!remote) remoteRender = false;
    if (scheduled) return;
    remoteRender = remote === true;
    scheduled = true;
    // rAF doesn't fire in hidden tabs; the timer guarantees the queue never stalls.
    const run = () => { if (scheduled) render(); };
    requestAnimationFrame(run);
    setTimeout(run, 60);
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    const h = el.querySelector('h2') || el;
    h.setAttribute('tabindex', '-1');
    h.focus({ preventScroll: true });
  }

  function toast(msg, tone = 'ok') {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast toast--${tone}`;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.classList.add('is-out'), 2800);
    setTimeout(() => t.remove(), 3300);
  }

  const openModal = (m) => { ui.modal = m; scheduleRender(); };
  const closeModal = () => { ui.modal = null; const d = $dialog(); if (d.open) d.close(); };

  // ───────────────────────── uploads ─────────────────────────

  /** In-page confirmation (pop-up confirm boxes are blocked on a hosted page). Resolves true / false. */
  function askConfirm(message, opts = {}) {
    const verb = (/^(Delete|Remove|Clear|Reset|Reopen|Close|Open)\b/.exec(message) || [])[1];
    const ok = opts.ok || (verb ? (verb === 'Reset' ? 'Reset' : verb) : 'Confirm');
    const danger = opts.danger != null ? opts.danger : /^(Delete|Remove|Clear|Reset)$/.test(verb || '');
    return new Promise((resolve) => {
      const dlg = document.getElementById('confirm');
      dlg.innerHTML = `<form method="dialog" class="confirm__inner"><p class="confirm__msg" id="confirm-msg"></p>
        <div class="form-actions"><span class="spacer"></span>
        <button type="button" class="btn" data-confirm="no" id="confirm-no">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'}" data-confirm="yes" id="confirm-yes"></button></div></form>`;
      dlg.querySelector('#confirm-msg').textContent = message;
      dlg.querySelector('#confirm-yes').textContent = ok;
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; dlg.close(); resolve(v); };
      dlg.querySelector('#confirm-yes').addEventListener('click', () => done(true));
      dlg.querySelector('#confirm-no').addEventListener('click', () => done(false));
      dlg.addEventListener('close', () => done(false), { once: true });
      dlg.showModal();
      dlg.querySelector('#confirm-no').focus();
    });
  }

  async function handleFiles(kind, id, fileList) {
    if (!CR.store.caps.upload) { toast('Only people with Editor access can upload images.', 'danger'); return; }
    const files = [...fileList].filter((f) => f.type.startsWith('image/'));
    if (!files.length) { toast('Please choose image files (PNG, JPG, WebP or SVG).', 'danger'); return; }
    const status = document.getElementById('save-status');
    if (status) status.textContent = `Uploading ${files.length} image${files.length > 1 ? 's' : ''}…`;
    if (kind === 'study-new') { id = actions.addColourStudy({ season: id }); kind = 'study-pages'; setTimeout(() => scrollToId('study-' + id), 200); } // one new study; every file becomes a page
    let n = 0;
    for (const f of files) {
      try {
        const ref = await CR.images.put(f);
        const name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        if (kind === 'area') actions.addOption(id, { name, imageRef: ref });
        else if (kind === 'option-image') { const old = sel.option(id).imageRef; actions.updateOption(id, { imageRef: ref }); CR.images.remove(old); }
        else if (kind === 'bench') { const b = actions.addBenchmark(id, ref); actions.updateBenchmark(b, { name }); }
        else if (kind === 'bench-image') { const old = sel.benchmark(id).imageRef; actions.updateBenchmark(id, { imageRef: ref }); CR.images.remove(old); }
        else if (kind === 'option-bench') {
          // Put the image on the benchmark already linked to this option, or create one linked to it.
          const opt = sel.option(id);
          const cur = sel.benchmarksForOption(opt).find((b) => (b.informsOptionIds || []).includes(id));
          if (cur) { const old = cur.imageRef; actions.updateBenchmark(cur.id, { imageRef: ref }); CR.images.remove(old); }
          else actions.addBenchmark(opt.reviewId, ref, { optionId: id, name });
        }
        else if (kind === 'bench-lib') {
          const [categoryId, subcategoryId] = id.split('|');
          const b = actions.addBenchmark(null, ref, { name, categoryId, subcategoryId }); ui.benchEditing.add(b);
        }
        else if (kind === 'study-pages') actions.addStudyPage(id, ref, name);
        n++;
      } catch (e) { toast(`${f.name}: ${e.message || 'upload failed'}`, 'danger'); }
    }
    if (n) toast(`${n} image${n > 1 ? 's' : ''} added`);
  }

  // ───────────────────────── click actions ─────────────────────────

  const clicks = {
    'new-review'(el) { const id = actions.createReview(el.dataset.cat, el.dataset.sub); location.hash = `#/review/${id}/edit`; },
    verdict(el) {
      const v = el.dataset.verdict; const had = sel.myVerdict(el.dataset.opt, CR.store.me().id);
      actions.castVerdict(el.dataset.opt, v);
      toast(had && had.verdict === v ? 'Verdict cleared' : had ? `Changed to ${CR.store.VERDICT_LABEL[v]} — shown in activity` : `Marked ${CR.store.VERDICT_LABEL[v]}`);
    },
    // Selections page
    'finals-view'(el) { CR.app.filters('finals').view = el.dataset.id; scheduleRender(); },
    'finals-type'(el) { CR.app.filters('finals').area = el.dataset.id; scheduleRender(); },
    // Benchmarks page
    'bench-cat'(el) { ui.bench.category = el.dataset.id; ui.bench.sub = ''; scheduleRender(); },
    'bench-sub'(el) { ui.bench.sub = el.dataset.id; scheduleRender(); },
    'bench-clear'() { ui.bench.q = ''; ui.bench.tag = ''; scheduleRender(); },
    'bench-edit'(el) { const s = ui.benchEditing; s.has(el.dataset.id) ? s.delete(el.dataset.id) : s.add(el.dataset.id); scheduleRender(); },
    'add-bench-lib'() {
      const cat = ui.bench.category || (CR.store.state.categories[0] || {}).id || '';
      const c = sel.category(cat); const sub = ui.bench.sub || (c && c.subcategories[0] ? c.subcategories[0].id : '');
      ui.benchEditing.add(actions.addBenchmark(null, '', { categoryId: cat, subcategoryId: sub }));
    },
    'add-bcolour'(el) { actions.addBenchmarkColour(el.dataset.id); },
    'remove-bcolour'(el) { actions.removeBenchmarkColour(el.dataset.bid, el.dataset.cid); },
    'remove-bc-link'(el) { actions.linkBenchmarkColourRef(el.dataset.bid, el.dataset.cid, el.dataset.ref, false); },
    'sign-out'() { const b = CR.backend.active; if (b && b.signOut) b.signOut(); },
    'add-study'(el) { const sid = actions.addColourStudy({ season: el.dataset.season }); setTimeout(() => scrollToId('study-' + sid), 80); },
    async 'remove-study'(el) { const s = sel.study(el.dataset.id); if (!await askConfirm('Delete ' + s.title + ' with its ' + s.pages.length + ' page(s) and key colours?')) return; actions.removeColourStudy(s.id); },
    'add-study-colour'(el) { actions.addColourRef({ studyId: el.dataset.id }); },
    'move-page'(el) { actions.moveStudyPage(el.dataset.study, el.dataset.page, +el.dataset.dir); },
    async 'remove-page'(el) { if (await askConfirm('Delete this page?')) actions.removeStudyPage(el.dataset.study, el.dataset.page); },
    'open-page'(el) { if (el.dataset.page) openModal({ type: 'studyPage', studyId: el.dataset.study, pageId: el.dataset.page }); },
    'pick-person'(el) { actions.setCurrentUser(el.dataset.id); closeModal(); toast(`Now viewing as ${CR.store.me().name}`); },
    'rev-sub'(el) { ui.filters.reviews = { category: el.dataset.cat, sub: el.dataset.sub }; scheduleRender(); },
    'bench-slot'(el) { ui.bench.category = el.dataset.cat; ui.bench.sub = el.dataset.sub; scheduleRender(); },
    'lib-season'(el) { ui.library.season = el.dataset.season; scheduleRender(); },
    async 'remove-colref'(el) {
      const e = sel.colourRef(el.dataset.id);
      if (!await askConfirm(`Delete “${e.name || 'this entry'}”? It will also be unlinked from any colourways.`)) return;
      actions.removeColourRef(e.id);
    },
    'remove-colref-link'(el) { actions.removeColourRefLink(el.dataset.colour, el.dataset.ref); },
    async 'remove-user'(el) {
      const u = sel.user(el.dataset.id);
      if (!await askConfirm(`Remove ${u.name}? Their past verdicts and comments stay in the history.`)) return;
      actions.removeUser(u.id);
    },
    'decide-reject-rest'(el) {
      const form = el.closest('form');
      form.querySelectorAll('fieldset.decide-row').forEach((fs) => {
        const checked = fs.querySelector('input:checked');
        if (!checked || checked.value !== 'approve') fs.querySelector('input[value="reject"]').checked = true;
      });
      updateDecideHints(form);
    },
    'open-option'(el) { if (el.dataset.id) openModal({ type: 'option', id: el.dataset.id }); },
    'toggle-compare'(el) {
      const c = ui.compare;
      if (c.areaId !== el.dataset.area) { c.areaId = el.dataset.area; c.ids = []; }
      const i = c.ids.indexOf(el.dataset.opt);
      if (i >= 0) c.ids.splice(i, 1);
      else if (c.ids.length >= 4) { toast('Compare up to 4 options at a time.', 'danger'); return; }
      else c.ids.push(el.dataset.opt);
      scheduleRender();
    },
    'open-compare'() { openModal({ type: 'compare', areaId: ui.compare.areaId, ids: ui.compare.ids.slice() }); },
    'clear-compare'() { ui.compare = { areaId: null, ids: [] }; scheduleRender(); },
    'open-decide'(el) { openModal({ type: 'decide', areaId: el.dataset.id }); },
    async 'clear-decision'(el) {
      if (!await askConfirm('Clear the recorded approval for this area? Reviewer verdicts are kept.')) return;
      actions.clearDecision(el.dataset.id); closeModal(); toast('Approval cleared');
    },
    'open-share'(el) { openModal({ type: 'share', reviewId: el.dataset.id }); },
    'close-modal'() { closeModal(); },
    async 'set-status'(el) {
      const r = sel.review(el.dataset.id); const to = el.dataset.status;
      if (to === 'in_review' && r.status === 'draft') {
        const n = sel.areas(r.id).reduce((k, a) => k + sel.options(a.id).length, 0);
        if (!n) { toast('Add at least one concept option before opening for review.', 'danger'); return; }
        if (!sel.participants(r.id).length && !await askConfirm('No reviewers are invited yet. Open for review anyway?')) return;
      }
      if (to === 'final') {
        const dp = sel.decisionProgress(r.id);
        const msg = dp.done < dp.total
          ? `Close voting? ${dp.total - dp.done} of ${dp.total} decision areas aren’t approved yet — the approver can still record them after closing.`
          : 'Close voting and move to Final decision? Reviewers will no longer be able to change their verdicts.';
        if (!await askConfirm(msg)) return;
      }
      if (to === 'in_review' && r.status === 'final' && !await askConfirm('Reopen voting? Reviewers will be able to change their votes again.')) return;
      actions.setStatus(r.id, to);
      toast(`Review moved to ${CR.store.STATUS[to]}`);
      if (to === 'in_review' && location.hash.endsWith('/edit')) location.hash = `#/review/${r.id}`;
    },
    'toggle-thread'(el) { const id = el.dataset.id; ui.openThreads.has(id) ? ui.openThreads.delete(id) : ui.openThreads.add(id); scheduleRender(); },
    'toggle-activity'() { ui.showAllActivity = !ui.showAllActivity; scheduleRender(); },
    'scroll-to'(el, e) { e.preventDefault(); closeModal(); scrollToId(el.dataset.target); },
    print() { window.print(); },
    async 'delete-comment'(el) { if (await askConfirm('Delete this comment?')) actions.deleteComment(el.dataset.id); },

    'add-area'(el) { actions.addArea(el.dataset.id, el.dataset.type); },
    'move-area'(el) { actions.moveArea(el.dataset.id, +el.dataset.dir); },
    async 'remove-area'(el) {
      const a = sel.area(el.dataset.id);
      const n = sel.options(a.id).length;
      if (!await askConfirm(`Delete “${a.title}”${n ? ` and its ${n} option${n > 1 ? 's' : ''}, votes and comments` : ''}?`)) return;
      actions.removeArea(a.id);
    },
    'add-option'(el) { actions.addOption(el.dataset.id); },
    'move-option'(el) { actions.moveOption(el.dataset.id, +el.dataset.dir); },
    async 'remove-option'(el) {
      const o = sel.option(el.dataset.id); const v = sel.optionVotes(o.id).length;
      if (!await askConfirm(`Remove “${o.name}”${v ? ` and its ${v} verdict${v > 1 ? 's' : ''}` : ''}?`)) return;
      actions.removeOption(o.id);
    },
    'add-colour'(el) { actions.addColour(el.dataset.id); },
    'remove-colour'(el) { actions.removeColour(el.dataset.id); },
    'add-benchmark'(el) { actions.addBenchmark(el.dataset.id); },
    async 'remove-benchmark'(el) { if (await askConfirm('Remove this benchmark?')) actions.removeBenchmark(el.dataset.id); },
    async 'delete-review'(el) {
      const r = sel.review(el.dataset.id);
      if (!await askConfirm(`Delete “${r.title}” with all its concepts, votes and decisions? This can’t be undone.`)) return;
      actions.deleteReview(r.id); location.hash = '#/reviews'; toast('Review deleted');
    },

    'cat-remove-sub'(el) {
      const cats = structuredClone(CR.store.state.categories);
      cats[+el.dataset.ci].subcategories.splice(+el.dataset.si, 1);
      actions.saveCategories(cats);
    },
    async 'cat-remove'(el) {
      const cats = structuredClone(CR.store.state.categories);
      if (!await askConfirm(`Delete category “${cats[+el.dataset.ci].name}”?`)) return;
      cats.splice(+el.dataset.ci, 1); actions.saveCategories(cats);
    },
    async 'reset-demo'() {
      if (!await askConfirm('Reset everything? All reviews, benchmarks, colour entries, verdicts and uploaded images in this browser will be deleted.')) return;
      ui.compare = { areaId: null, ids: [] }; ui.modal = null;
      await actions.resetDemo(); location.hash = '#/'; toast('Workspace reset');
    },
    'clear-filters'(el) { ui.filters[el.dataset.id] = {}; scheduleRender(); },
  };

  // ───────────────────────── forms ─────────────────────────

  const forms = {
    comment(f) {
      const text = f.text.value.trim(); if (!text) return;
      actions.addComment({ reviewId: f.dataset.review, areaId: f.dataset.area || null, optionId: f.dataset.option || null, text });
    },
    decide(f) {
      const a = sel.area(f.dataset.area);
      const { approved, hold, reject } = readDecision(f);
      const rationale = f.rationale.value.trim(); const overrideReason = f.overrideReason.value.trim();
      const err = f.querySelector('#decide-error');
      const t = sel.tally(a.id);
      const differs = t.max > 0 && !t.leaders.some((l) => approved.includes(l));
      if (approved.length > a.maxSelections) { err.textContent = `Approve no more than ${a.maxSelections} option${a.maxSelections > 1 ? 's' : ''} in this area.`; return; }
      if (!rationale) { err.textContent = 'Add a short rationale.'; f.rationale.focus(); return; }
      if (differs && !overrideReason) { err.textContent = 'None of the approved options is the most-selected one — add a reason.'; f.overrideReason.focus(); return; }
      actions.recordDecision(a.id, { approvedIds: approved, holdIds: hold, rejectedIds: reject, rationale, overrideReason: differs ? overrideReason : '' });
      closeModal(); toast('Approval recorded');
    },
    'season-add'(f) {
      const name = f.name.value.trim().toUpperCase().replace(/\s+/g, '');
      if (!/^(SS|AW)\d{2}$/.test(name)) { toast('Use a season like SS28 or AW28.', 'danger'); return; }
      actions.addSeason(name); ui.library.season = name; toast(`${name} added`);
    },
    'person-add'(f) {
      const name = f.name.value.trim(); if (!name) return;
      const id = actions.addUser({ name, role: f.role.value });
      actions.setCurrentUser(id); closeModal(); toast(`Welcome, ${name}`);
    },
    'cat-add'(f) {
      const name = f.name.value.trim(); if (!name) return;
      const cats = structuredClone(CR.store.state.categories);
      cats.push({ id: CR.util.uid('cat'), name, subcategories: [] }); actions.saveCategories(cats);
    },
    'cat-add-sub'(f) {
      const name = f.name.value.trim(); if (!name) return;
      const cats = structuredClone(CR.store.state.categories);
      cats[+f.dataset.ci].subcategories.push({ id: CR.util.uid('sub'), name }); actions.saveCategories(cats);
    },
    'user-add'(f) {
      const email = f.email ? f.email.value.trim().toLowerCase() : '';
      let name = f.name.value.trim();
      if (!name && email) name = email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      if (!name) return;
      actions.addUser({ name, role: f.role.value, email });
      f.reset(); toast(`${name} added`);
    },
  };

  /** Read the approver's per-option Approve / Hold / Reject choices from the approval form. */
  function readDecision(form) {
    const out = { approved: [], hold: [], reject: [] };
    form.querySelectorAll('input[type=radio]:checked').forEach((r) => {
      const id = r.name.slice(2);
      (r.value === 'approve' ? out.approved : r.value === 'hold' ? out.hold : out.reject).push(id);
    });
    return out;
  }

  function updateDecideHints(form) {
    const a = sel.area(form.dataset.area);
    const { approved } = readDecision(form);
    const t = sel.tally(a.id);
    const differs = t.max > 0 && !t.leaders.some((l) => approved.includes(l));
    form.querySelector('#override-req').hidden = !differs;
    form.overrideReason.required = !!differs;
    form.querySelector('#override-field').classList.toggle('is-required', !!differs);
    const c = form.querySelector('#decide-count');
    c.textContent = approved.length;
    c.classList.toggle('is-over', approved.length > a.maxSelections);
  }

  // ───────────────────────── wiring ─────────────────────────

  function onInput(e) {
    const el = e.target; const d = el.dataset; const q = { quiet: true };
    if (d.revField) actions.updateReview(d.id, { [d.revField]: el.value }, q);
    else if (d.areaField) actions.updateArea(d.id, { [d.areaField]: el.value }, q);
    else if (d.optField) actions.updateOption(d.id, { [d.optField]: el.value }, q);
    else if (d.colField) actions.updateColour(d.id, { [d.colField]: el.value }, q);
    else if (d.bmField) actions.updateBenchmark(d.id, { [d.bmField]: el.value }, q);
    else if (d.crField) actions.updateColourRef(d.id, { [d.crField]: el.value }, q);
    else if (d.stField) actions.updateColourStudy(d.id, { [d.stField]: el.value }, q);
    else if (d.spCaption != null) actions.updateStudyPage(d.study, d.page, { caption: el.value }, q);
    else if (d.bcField) actions.updateBenchmarkColour(d.bid, d.cid, { [d.bcField]: el.value }, q);
    else if (el.id === 'bench-q') { ui.bench.q = el.value; scheduleRender(); }
    else if (d.userName) { const v = el.value.trim(); if (v) actions.updateUser(d.userName, { name: v, initials: v.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() }); }
    else if (d.filter === 'q') { const form = el.closest('[data-filter-form]'); ui.filters[form.dataset.filterForm].q = el.value; scheduleRender(); }
  }

  function onChange(e) {
    const el = e.target; const d = el.dataset;
    if (el.id === 'user-select') {
      if (el.value === '__add') { el.value = CR.store.me().id; openModal({ type: 'person' }); return; }
      actions.setCurrentUser(el.value); ui.compare = { areaId: null, ids: [] };
      toast(`Now viewing as ${CR.store.me().name}`); return;
    }
    if (d.optBench != null) { actions.setOptionBenchmark(d.optBench, el.value || null); return; }
    if (d.colAddref) { if (el.value) actions.addColourRefLink(d.colAddref, el.value); return; }
    if (d.bcSelect) { actions.updateBenchmarkColour(d.bid, d.cid, { [d.bcSelect]: el.value }); return; }
    if (d.bcAddref != null) { if (el.value) actions.linkBenchmarkColourRef(d.bid, d.cid, el.value, true); return; }
    if (d.bmCat) { const c = sel.category(el.value); actions.updateBenchmark(d.bmCat, { categoryId: el.value, subcategoryId: c && c.subcategories[0] ? c.subcategories[0].id : '' }); return; }
    if (d.bmSub) { actions.updateBenchmark(d.bmSub, { subcategoryId: el.value }); return; }
    if (d.benchTag != null) { ui.bench.tag = el.value; scheduleRender(); return; }
    if (d.stSelect) { actions.updateColourStudy(d.id, { [d.stSelect]: el.value }); return; }
    if (d.crSelect) { actions.updateColourRef(d.id, { [d.crSelect]: el.value }); return; }
    if (d.libSource != null) { ui.library.source = el.value; scheduleRender(); return; }
    if (d.upload) { handleFiles(d.upload, d.id, el.files); el.value = ''; return; }
    if (d.revSelect) {
      const patch = { [d.revSelect]: el.value };
      if (d.revSelect === 'categoryId') { const c = sel.category(el.value); patch.subcategoryId = c && c.subcategories[0] ? c.subcategories[0].id : ''; }
      actions.updateReview(d.id, patch); return;
    }
    if (d.areaSelect) {
      const a = sel.area(d.id);
      if (d.areaSelect === 'type') {
        const patch = { type: el.value };
        if (!a.title || a.title === CR.store.AREA_TYPES[a.type]) patch.title = CR.store.AREA_TYPES[el.value];
        actions.updateArea(d.id, patch);
      } else actions.updateArea(d.id, { maxSelections: Math.max(1, Math.min(10, parseInt(el.value, 10) || 1)) });
      return;
    }
    if (d.colSelect) { actions.updateColour(d.id, { [d.colSelect]: el.value }); return; }
    if (d.bmTag || d.bmArea || d.bmOpt) {
      const b = sel.benchmark(d.id);
      const [key, val] = d.bmTag ? ['tags', d.bmTag] : d.bmArea ? ['informsAreaIds', d.bmArea] : ['informsOptionIds', d.bmOpt];
      const list = new Set(b[key] || []); el.checked ? list.add(val) : list.delete(val);
      actions.updateBenchmark(d.id, { [key]: [...list] }); return;
    }
    if (d.shareUser) { actions.setParticipant(d.review, d.shareUser, el.checked); return; }
    if (d.filter && d.filter !== 'q') {
      const form = el.closest('[data-filter-form]'); const fl = ui.filters[form.dataset.filterForm];
      fl[d.filter] = el.value; if (d.filter === 'category') fl.sub = '';
      scheduleRender(); return;
    }
    if (d.openJoin != null) { const b = CR.backend.active; if (b && b.setOpenJoin) b.setOpenJoin(el.checked); return; }
    if (d.approver != null) { actions.setApprover(el.value); toast(el.value ? 'Approver set' : 'Approver cleared'); return; }
    if (d.userRole) { actions.updateUser(d.userRole, { role: el.value }); return; }
    if (d.catName != null) { const cats = structuredClone(CR.store.state.categories); cats[+d.catName].name = el.value.trim() || cats[+d.catName].name; actions.saveCategories(cats); return; }
    if (d.subName != null) { const [ci, si] = d.subName.split(':').map(Number); const cats = structuredClone(CR.store.state.categories); cats[ci].subcategories[si].name = el.value.trim() || cats[ci].subcategories[si].name; actions.saveCategories(cats); return; }
    if (d.decideOpt != null) { updateDecideHints(el.closest('form')); return; }
    // Text fields already saved on input — re-render on commit so headings etc. update.
    if (d.revField || d.areaField || d.optField || d.colField || d.bmField || d.crField) scheduleRender();
  }

  /** Shown instead of the app when the person can't use it yet: signing in, not on the team, or no storage. */
  function showGate(gate) {
    document.querySelector('.topbar').hidden = true;
    const esc = CR.util.esc;
    const mode = (gate && gate.mode) || 'unavailable';
    if (mode === 'signin') {
      $app().innerHTML = `<section class="welcome gate" style="margin-top:40px"><p class="eyebrow">Cult footwear</p><h2>Sign in to Cult Design Review</h2>
        <p class="lede">Enter your email. We’ll send you a link — click it and you’re in. No password needed.</p>
        ${gate.google ? '<button class="btn btn--block" id="google-btn" type="button">Continue with Google</button><p class="small muted" style="margin:10px 0">or use your email</p>' : ''}
        <form id="signin-form" class="gate__form"><label class="field"><span class="field__label">Work email</span>
          <input type="email" id="signin-email" name="email" required autocomplete="email" placeholder="you@curefit.com"></label>
          <button class="btn btn--primary" id="signin-btn">Email me a sign-in link</button></form>
        <p class="form-error" id="signin-msg" role="status"></p></section>`;
      const gbtn = document.getElementById('google-btn');
      if (gbtn) gbtn.addEventListener('click', async () => {
        try { await gate.signInGoogle(); } catch (err) { const m = document.getElementById('signin-msg'); m.style.color = ''; m.textContent = (err && err.message) || 'Google sign-in isn’t available.'; }
      });
      const form = document.getElementById('signin-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('signin-msg'); const btn = document.getElementById('signin-btn');
        btn.disabled = true; msg.style.color = ''; msg.textContent = 'Sending…';
        try {
          await gate.signIn(form.email.value.trim());
          msg.style.color = 'var(--final)'; msg.textContent = 'Check your inbox for the sign-in link (it can take a minute). You can close this tab and open the link.';
        } catch (err) { msg.style.color = ''; msg.textContent = (err && err.message) || 'Couldn’t send the link. Try again.'; btn.disabled = false; }
      });
      return;
    }
    if (mode === 'notmember') {
      $app().innerHTML = `<section class="welcome gate" style="margin-top:40px"><h2>You’re signed in, but not on the team yet</h2>
        <p class="lede">${esc(gate.email)} isn’t on the Cult Design Review team list. Ask a designer or the approver to add this email address, then reload.</p>
        <button class="btn" id="gate-signout">Sign out</button></section>`;
      document.getElementById('gate-signout').addEventListener('click', () => gate.signOut());
      return;
    }
    $app().innerHTML = `<section class="welcome gate" style="margin-top:40px"><h2>${CR.store.mode === 'unavailable' && window.claude ? 'Sign in to use Cult Design Review' : 'Can’t open Cult Design Review'}</h2>
      <p class="lede">${esc((gate && gate.message) || 'This tool saves everyone’s work in one shared place, so it needs your claude.ai account. Open the link you were sent while signed in to claude.ai, then reload this page. If you’re signed in and still see this, ask the person who shared it to check that you have access.')}</p></section>`;
  }

  async function init() {
    const ok = await CR.store.load();
    if (!ok) { showGate(CR.store.gate); return; }
    CR.store.subscribe((info) => scheduleRender(!!(info && info.remote)));
    if (CR.store.mode === 'shared' || CR.store.mode === 'supabase') {
      const b = document.querySelector('.proto-banner');
      if (b) b.innerHTML = '<strong>Shared workspace</strong> · Everyone on the team sees the same reviews, live · ' + (CR.store.mode === 'shared' ? 'Signed in with your claude.ai account' : 'Signed in with your work email');
    }

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      const fn = clicks[el.dataset.action];
      if (fn) { if (el.tagName === 'A' || el.tagName === 'BUTTON') e.preventDefault(); fn(el, e); }
    });
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('submit', (e) => {
      const f = e.target.closest('[data-form]');
      if (!f) { e.preventDefault(); return; } // a plain form must never navigate the page
      e.preventDefault();
      forms[f.dataset.form] && forms[f.dataset.form](f);
    });
    document.addEventListener('dragover', (e) => { const z = e.target.closest('[data-drop]'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
    document.addEventListener('dragleave', (e) => { const z = e.target.closest('[data-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over'); });
    document.addEventListener('drop', (e) => {
      const z = e.target.closest('[data-drop]'); if (!z) return;
      e.preventDefault(); z.classList.remove('is-over');
      handleFiles(z.dataset.drop, z.dataset.id, e.dataTransfer.files);
    });
    document.addEventListener('keydown', (e) => {
      if (!ui.modal || !['option', 'studyPage'].includes(ui.modal.type)) return;
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft') document.getElementById('m-prev')?.click();
      if (e.key === 'ArrowRight') document.getElementById('m-next')?.click();
    });

    const dlg = $dialog();
    dlg.addEventListener('close', () => {
      ui.modal = null; dlg.innerHTML = '';
      if (modalOpener && document.contains(modalOpener)) modalOpener.focus();
      modalOpener = null;
    });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // backdrop click

    window.addEventListener('hashchange', () => {
      const r = parseRoute();
      if (!r) { const id = location.hash.slice(1); history.replaceState(null, '', '#/' + lastRoute); scrollToId(id); return; }
      ui.modal = null; closeModal();
      render();
    });
    render();
    // First visit in this browser: ask who they are before anything else.
    if (CR.store.mode === 'local' && !CR.store.state.meta.currentUserId) openModal({ type: 'person', first: true });
  }

  CR.app = { ui, toast, filters: (id) => ui.filters[id] || (ui.filters[id] = {}), render: scheduleRender };
  // The page may already be parsed when this script runs inside a viewer.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window.CR);
