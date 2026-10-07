/*
 * Data layer. Every concept is its own entity collection, linked by id:
 *   users · categories · reviews · participants · areas (decision areas) · options
 *   colours (per option) · colourRefs (season-wise WGSN / Pantone library) · benchmarks
 *   votes (one verdict per reviewer per option) · comments · decisions (approver) · activity
 *
 * Persistence goes through CR.backend: shared claude.ai storage when published, or this browser (localStorage) when run locally. All writes go through the action
 * functions below, so replacing them with API calls to a real backend is a contained change.
 */
(function (CR) {
  const { uid, nowIso } = CR.util;
  const COLLECTIONS = ['users', 'categories', 'reviews', 'participants', 'areas', 'options',
    'colours', 'colourRefs', 'colourStudies', 'benchmarks', 'votes', 'comments', 'decisions', 'activity', 'opened', 'people'];

  const VERDICTS = ['select', 'hold', 'reject'];
  const VERDICT_LABEL = { select: 'Select', hold: 'Hold', reject: 'Reject' };
  const VERDICT_PAST = { select: 'Selected', hold: 'On hold', reject: 'Rejected' };
  const ROLES = { designer: 'Designer', reviewer: 'Reviewer', approver: 'Approver', member: 'Team member' };

  let state = null;
  let backend = null;
  const listeners = new Set();

  /** Pick a backend (shared claude.ai storage, or this browser), load state, start listening for remote changes. */
  async function load() {
    backend = await CR.backend.create();
    CR.backend.active = backend;
    if (['unavailable', 'signin', 'notmember'].includes(backend.mode)) { CR.store.mode = backend.mode; CR.store.gate = backend; return false; }
    state = await backend.load();
    COLLECTIONS.forEach((c) => { if (!Array.isArray(state[c])) state[c] = []; });
    if (!state.meta) state.meta = {};
    if (!Array.isArray(state.meta.extraSeasons)) state.meta.extraSeasons = [];
    CR.store.mode = backend.mode;
    CR.store.caps = backend.caps || { admin: true, write: true, upload: true };
    if (backend.start) backend.start(state, { onRemote: () => listeners.forEach((l) => l({ remote: true })) });
    return true;
  }

  function persist(quiet) { if (backend) backend.save(state, { quiet: !!quiet }); }

  /** Mutate state inside fn, persist, notify. `quiet` skips re-render (used for typing). */
  function commit(fn, { quiet = false } = {}) {
    const result = fn(state);
    persist(quiet);
    if (!quiet) listeners.forEach((l) => l({ remote: false }));
    return result;
  }
  const byId = (coll, id) => state[coll].find((x) => x.id === id) || null;
  const where = (coll, pred) => state[coll].filter(pred);

  function me() { return byId('users', state.meta.currentUserId) || state.users[0]; }

  function log(s, reviewId, text, type = 'info') {
    s.activity.push({ id: uid('act'), reviewId, userId: s.meta.currentUserId, type, text, at: nowIso() });
  }
  function touch(s, reviewId) { const r = s.reviews.find((x) => x.id === reviewId); if (r) r.updatedAt = nowIso(); }

  // ───────────────────────────── selectors ─────────────────────────────

  const sel = {
    review: (id) => byId('reviews', id),
    user: (id) => byId('users', id),
    area: (id) => byId('areas', id),
    option: (id) => byId('options', id),
    benchmark: (id) => byId('benchmarks', id),
    category: (id) => byId('categories', id),
    colourRef: (id) => byId('colourRefs', id),
    study: (id) => byId('colourStudies', id),
    studies: (season) => where('colourStudies', (s) => !season || s.season === season),
    studyColours: (studyId) => where('colourRefs', (r) => r.studyId === studyId),
    approver: () => state.users.find((u) => u.role === 'approver') || null,

    areas: (reviewId) => where('areas', (a) => a.reviewId === reviewId).sort((a, b) => a.order - b.order),
    options: (areaId) => where('options', (o) => o.areaId === areaId).sort((a, b) => a.order - b.order),
    reviewOptions: (reviewId) => sel.areas(reviewId).flatMap((a) => sel.options(a.id)),
    optionNumber: (opt) => sel.options(opt.areaId).findIndex((o) => o.id === opt.id) + 1,
    colours: (optionId) => where('colours', (c) => c.optionId === optionId),
    benchmarks: (reviewId) => where('benchmarks', (b) => b.reviewId === reviewId),
    allBenchmarks: () => state.benchmarks.slice(),
    /** Category of a benchmark: its own (library-level) or the review it was added to. */
    benchmarkCategory(b) {
      const r = b.reviewId ? byId('reviews', b.reviewId) : null;
      return { categoryId: b.categoryId || (r && r.categoryId) || '', subcategoryId: b.subcategoryId || (r && r.subcategoryId) || '' };
    },
    /** Cult options a benchmark inspired: linked directly (any review), or area-wide within its own review. */
    inspiredOptions(b) {
      const direct = state.options.filter((o) => (b.informsOptionIds || []).includes(o.id));
      const area = state.options.filter((o) => !direct.includes(o) && b.reviewId === o.reviewId && (b.informsAreaIds || []).includes(o.areaId));
      return direct.concat(area);
    },
    /** Benchmarks shown beside an option: ones linked to it directly first, then area-wide ones in the same review. */
    benchmarksForOption(opt) {
      const direct = state.benchmarks.filter((b) => (b.informsOptionIds || []).includes(opt.id));
      const area = state.benchmarks.filter((b) => !direct.includes(b) && b.reviewId === opt.reviewId && (b.informsAreaIds || []).includes(opt.areaId));
      return direct.concat(area);
    },
    /** Is this option part of an approved selection? */
    isApproved(optionId) { return state.decisions.some((d) => d.optionIds.includes(optionId)); },
    participants: (reviewId) => where('participants', (p) => p.reviewId === reviewId),
    opened: (reviewId, userId) => state.opened.some((o) => o.reviewId === reviewId && o.userId === userId),
    participant: (reviewId, userId) => state.participants.find((p) => p.reviewId === reviewId && p.userId === userId) || null,

    votes: (areaId) => where('votes', (v) => v.areaId === areaId),
    optionVotes: (optionId) => where('votes', (v) => v.optionId === optionId),
    myVerdict: (optionId, userId) => state.votes.find((v) => v.optionId === optionId && v.userId === userId) || null,
    decision: (areaId) => state.decisions.find((d) => d.areaId === areaId) || null,
    comments: (pred) => where('comments', pred).sort((a, b) => a.at.localeCompare(b.at)),
    activity: (reviewId) => where('activity', (a) => a.reviewId === reviewId).sort((a, b) => b.at.localeCompare(a.at)),

    categoryPath(review) {
      const cat = byId('categories', review.categoryId);
      const sub = cat && cat.subcategories.find((s) => s.id === review.subcategoryId);
      return { cat, sub, text: [cat && cat.name, sub && sub.name].filter(Boolean).join(' · ') || 'Uncategorised' };
    },

    /** Per-option Select / Hold / Reject lists, plus the most-selected option(s). Advisory only. */
    tally(areaId) {
      const opts = sel.options(areaId);
      const per = new Map(opts.map((o) => [o.id, { select: [], hold: [], reject: [] }]));
      const votes = sel.votes(areaId);
      votes.forEach((v) => { const p = per.get(v.optionId); if (p && p[v.verdict]) p[v.verdict].push(v.userId); });
      const max = Math.max(0, ...opts.map((o) => per.get(o.id).select.length));
      const leaders = max > 0 ? opts.filter((o) => per.get(o.id).select.length === max).map((o) => o.id) : [];
      return { per, max, leaders, leaderId: leaders.length === 1 ? leaders[0] : null, total: votes.length, reviewers: new Set(votes.map((v) => v.userId)).size };
    },

    /** invited → hasn't opened · pending → started but not every option reviewed · completed → a verdict on every option. */
    reviewProgressFor(reviewId, userId) {
      const opts = sel.reviewOptions(reviewId);
      const done = opts.filter((o) => sel.myVerdict(o.id, userId)).length;
      return { done, total: opts.length };
    },
    participantStatus(reviewId, userId) {
      const p = sel.participant(reviewId, userId);
      if (!p) return null;
      const { done, total } = sel.reviewProgressFor(reviewId, userId);
      if (total && done === total) return 'completed';
      if (sel.opened(reviewId, userId) || done > 0) return 'pending';
      return 'invited';
    },
    progress(reviewId) {
      const ps = sel.participants(reviewId);
      const done = ps.filter((p) => sel.participantStatus(reviewId, p.userId) === 'completed').length;
      return { done, total: ps.length };
    },
    decisionProgress(reviewId) {
      const areas = sel.areas(reviewId);
      return { done: areas.filter((a) => sel.decision(a.id)).length, total: areas.length };
    },
    needsVote(reviewId, userId) {
      const r = sel.review(reviewId);
      if (!r || r.status !== 'in_review' || !sel.participant(reviewId, userId)) return false;
      return sel.participantStatus(reviewId, userId) !== 'completed';
    },

    coverImage(reviewId) {
      for (const a of sel.areas(reviewId)) {
        const d = sel.decision(a.id);
        if (d && d.optionIds.length) { const o = sel.option(d.optionIds[0]); if (o && o.imageRef) return o.imageRef; }
      }
      for (const a of sel.areas(reviewId)) {
        const t = sel.tally(a.id);
        const lead = t.leaderId && sel.option(t.leaderId);
        if (lead && lead.imageRef) return lead.imageRef;
        const first = sel.options(a.id).find((o) => o.imageRef);
        if (first) return first.imageRef;
      }
      return '';
    },

    seasons() {
      const base = ['SS27', 'AW27', 'SS28', 'AW28', 'SS29'];
      const used = [...state.reviews.map((r) => r.season), ...state.colourStudies.map((c) => c.season), ...(state.meta.extraSeasons || [])].filter(Boolean);
      return [...new Set([...base, ...used])].sort(seasonSort);
    },
    designers: () => [...new Set(state.reviews.map((r) => r.ownerId))].map((id) => byId('users', id)).filter(Boolean),
  };

  /** SS27 < AW27 < SS28 …  (year first, then SS before AW) */
  function seasonSort(a, b) {
    const k = (s) => { const m = /^(SS|AW)\s*(\d{2})/i.exec(s); return m ? `${m[2]}${m[1].toUpperCase() === 'SS' ? 0 : 1}` : `99${s}`; };
    return k(a).localeCompare(k(b));
  }

  // ───────────────────────────── actions ─────────────────────────────

  const AREA_TYPES = {
    overall: 'Overall design', colourway: 'Colourway', sole: 'Sole', upper: 'Upper',
    materials: 'Materials & detailing', other: 'Other',
  };
  /** Wording for the designer's explanation next to each concept. */
  const WHY_LABEL = {
    overall: 'Why this design', colourway: 'Why this colour', sole: 'Why this sole', upper: 'Why this upper',
    materials: 'Why this material / detail', other: 'Why this option',
  };
  const INSPIRATION_TAGS = ['silhouette', 'construction', 'sole', 'colour', 'materials', 'detailing'];
  const STATUS = { draft: 'Draft', in_review: 'In review', final: 'Final decision' };

  const optLabel = (s, id) => { const o = s.options.find((x) => x.id === id); return o ? `#${sel.optionNumber(o)} ${o.name}` : 'a removed option'; };

  const actions = {
    setCurrentUser(id) { commit((s) => { s.meta.currentUserId = id; }); },

    createReview(categoryId, subcategoryId) {
      return commit((s) => {
        const userId = s.meta.currentUserId || (s.users[0] || {}).id;
        const cat = s.categories.find((c) => c.id === categoryId) || s.categories[0];
        const sub = cat && (cat.subcategories.find((x) => x.id === subcategoryId) || cat.subcategories[0]);
        const r = {
          id: uid('rev'), title: 'Untitled review', model: '', categoryId: cat ? cat.id : '',
          subcategoryId: sub ? sub.id : '',
          season: '', ownerId: userId, dueDate: '', notes: '', rationale: '', status: 'draft',
          demo: false, source: 'manual', createdAt: nowIso(), updatedAt: nowIso(),
        };
        s.reviews.push(r);
        ['overall', 'colourway'].forEach((type, i) => s.areas.push({
          id: uid('area'), reviewId: r.id, type, title: AREA_TYPES[type], description: '', maxSelections: 1, order: i,
        }));
        log(s, r.id, 'created the review', 'create');
        return r.id;
      });
    },
    updateReview(id, patch, opts) { commit((s) => { Object.assign(s.reviews.find((r) => r.id === id), patch, { updatedAt: nowIso() }); }, opts); },

    deleteReview(id) {
      const refs = [];
      commit((s) => {
        const optIds = s.options.filter((o) => o.reviewId === id).map((o) => { refs.push(o.imageRef); return o.id; });
        s.benchmarks.filter((b) => b.reviewId === id).forEach((b) => refs.push(b.imageRef));
        s.colours = s.colours.filter((c) => !optIds.includes(c.optionId));
        ['areas', 'options', 'benchmarks', 'participants', 'votes', 'comments', 'decisions', 'activity', 'opened']
          .forEach((c) => { s[c] = s[c].filter((x) => x.reviewId !== id); });
        s.reviews = s.reviews.filter((r) => r.id !== id);
      });
      refs.forEach((r) => CR.images.remove(r));
    },

    setStatus(id, status) {
      commit((s) => {
        const r = s.reviews.find((x) => x.id === id);
        const from = r.status;
        r.status = status; r.updatedAt = nowIso();
        if (status === 'final') r.closedAt = nowIso();
        const verb = status === 'in_review' ? (from === 'final' ? 'reopened the review for voting' : 'opened the review for voting')
          : status === 'final' ? 'closed voting and moved the review to Final decision' : 'moved the review back to Draft';
        log(s, id, verb, 'status');
      });
    },

    setParticipant(reviewId, userId, invited) {
      commit((s) => {
        const p = s.participants.find((x) => x.reviewId === reviewId && x.userId === userId);
        const name = (s.users.find((u) => u.id === userId) || {}).name;
        if (!invited) {
          if (p) { s.participants = s.participants.filter((x) => x !== p); log(s, reviewId, `removed ${name} from the review`, 'share'); }
        } else if (!p) {
          s.participants.push({ id: uid('par'), reviewId, userId, role: 'reviewer', invitedBy: s.meta.currentUserId, invitedAt: nowIso() });
          log(s, reviewId, `invited ${name} as a reviewer`, 'share');
        }
        touch(s, reviewId);
      });
    },
    markOpened(reviewId, userId) {
      if (sel.participant(reviewId, userId) && !sel.opened(reviewId, userId)) {
        commit((s) => { s.opened.push({ id: reviewId + '__' + userId, reviewId, userId, at: nowIso() }); }, { quiet: true });
      }
    },

    addArea(reviewId, type = 'other') {
      commit((s) => {
        const order = Math.max(-1, ...s.areas.filter((a) => a.reviewId === reviewId).map((a) => a.order)) + 1;
        s.areas.push({ id: uid('area'), reviewId, type, title: AREA_TYPES[type] || 'New decision area', description: '', maxSelections: 1, order });
        touch(s, reviewId);
      });
    },
    updateArea(id, patch, opts) { commit((s) => { Object.assign(s.areas.find((a) => a.id === id), patch); }, opts); },
    moveArea(id, dir) {
      commit((s) => {
        const a = s.areas.find((x) => x.id === id);
        const list = s.areas.filter((x) => x.reviewId === a.reviewId).sort((x, y) => x.order - y.order);
        const i = list.indexOf(a); const j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i].order, list[j].order] = [list[j].order, list[i].order];
      });
    },
    removeArea(id) {
      const refs = [];
      commit((s) => {
        const a = s.areas.find((x) => x.id === id);
        const optIds = s.options.filter((o) => o.areaId === id).map((o) => { refs.push(o.imageRef); return o.id; });
        s.options = s.options.filter((o) => o.areaId !== id);
        s.colours = s.colours.filter((c) => !optIds.includes(c.optionId));
        ['votes', 'comments', 'decisions'].forEach((c) => { s[c] = s[c].filter((x) => x.areaId !== id); });
        s.benchmarks.forEach((b) => {
          b.informsAreaIds = (b.informsAreaIds || []).filter((x) => x !== id);
          b.informsOptionIds = (b.informsOptionIds || []).filter((x) => !optIds.includes(x));
        });
        s.areas = s.areas.filter((x) => x !== a);
        log(s, a.reviewId, `removed decision area “${a.title}”`, 'edit');
      });
      refs.forEach((r) => CR.images.remove(r));
    },

    addOption(areaId, { name = '', imageRef = '' } = {}) {
      return commit((s) => {
        const a = s.areas.find((x) => x.id === areaId);
        const order = Math.max(-1, ...s.options.filter((o) => o.areaId === areaId).map((o) => o.order)) + 1;
        const o = { id: uid('opt'), reviewId: a.reviewId, areaId, name: name || `Option ${order + 1}`, rationale: '', imageRef, order, createdAt: nowIso() };
        s.options.push(o);
        touch(s, a.reviewId);
        return o.id;
      });
    },
    updateOption(id, patch, opts) { commit((s) => { Object.assign(s.options.find((o) => o.id === id), patch); }, opts); },
    moveOption(id, dir) {
      commit((s) => {
        const o = s.options.find((x) => x.id === id);
        const list = s.options.filter((x) => x.areaId === o.areaId).sort((x, y) => x.order - y.order);
        const i = list.indexOf(o); const j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i].order, list[j].order] = [list[j].order, list[i].order];
      });
    },
    removeOption(id) {
      const o = byId('options', id);
      commit((s) => {
        s.options = s.options.filter((x) => x.id !== id);
        s.colours = s.colours.filter((c) => c.optionId !== id);
        s.votes = s.votes.filter((v) => v.optionId !== id);
        s.comments = s.comments.filter((c) => c.optionId !== id);
        s.decisions.forEach((d) => { ['optionIds', 'holdIds', 'rejectedIds'].forEach((k) => { d[k] = (d[k] || []).filter((x) => x !== id); }); });
        s.decisions = s.decisions.filter((d) => d.optionIds.length || (d.holdIds || []).length || (d.rejectedIds || []).length);
        s.benchmarks.forEach((b) => { b.informsOptionIds = (b.informsOptionIds || []).filter((x) => x !== id); });
      });
      if (o) CR.images.remove(o.imageRef);
    },
    /** Link exactly one benchmark as "the" comparison for an option (null = none). */
    setOptionBenchmark(optionId, benchmarkId) {
      commit((s) => {
        s.benchmarks.forEach((b) => {
          b.informsOptionIds = (b.informsOptionIds || []).filter((x) => x !== optionId);
          if (b.id === benchmarkId) b.informsOptionIds.push(optionId);
        });
      });
    },

    addColour(optionId) {
      commit((s) => {
        s.colours.push({ id: uid('col'), optionId, part: 'Upper', name: '', hex: '#cccccc', pantone: '', wgsn: '', rationale: '', sourceRef: '', refIds: [], isExample: false });
      });
    },
    updateColour(id, patch, opts) { commit((s) => { Object.assign(s.colours.find((c) => c.id === id), patch, { isExample: false }); }, opts); },
    addColourRefLink(colourId, refId) {
      commit((s) => { const c = s.colours.find((x) => x.id === colourId); c.refIds = [...new Set([...(c.refIds || []), refId])]; c.isExample = false; });
    },
    removeColourRefLink(colourId, refId) {
      commit((s) => { const c = s.colours.find((x) => x.id === colourId); c.refIds = (c.refIds || []).filter((x) => x !== refId); });
    },
    removeColour(id) { commit((s) => { s.colours = s.colours.filter((c) => c.id !== id); }); },

    // ── Colour studies: one or more per season, made of pages (images) plus the key colours with codes ──
    addColourStudy({ season, source = 'wgsn', title = '' }) {
      return commit((s) => {
        const st = { id: uid('study'), season: season || '', source, title: title || `Colour study ${season || ''}`.trim(), summary: '', report: '', sourceUrl: '', pages: [], addedBy: s.meta.currentUserId, addedAt: nowIso() };
        s.colourStudies.push(st);
        return st.id;
      });
    },
    updateColourStudy(id, patch, opts) {
      commit((s) => {
        Object.assign(s.colourStudies.find((x) => x.id === id), patch);
        if (patch.source) s.colourRefs.forEach((r) => { if (r.studyId === id) r.source = patch.source; });
        if (patch.season) s.colourRefs.forEach((r) => { if (r.studyId === id) r.season = patch.season; });
      }, opts);
    },
    removeColourStudy(id) {
      const refs = [];
      commit((s) => {
        const st = s.colourStudies.find((x) => x.id === id);
        (st.pages || []).forEach((p) => refs.push(p.imageRef));
        const refIds = s.colourRefs.filter((r) => r.studyId === id).map((r) => r.id);
        s.colourRefs = s.colourRefs.filter((r) => r.studyId !== id);
        s.colours.forEach((c) => { c.refIds = (c.refIds || []).filter((x) => !refIds.includes(x)); });
        s.benchmarks.forEach((b) => (b.colours || []).forEach((c) => { c.refIds = (c.refIds || []).filter((x) => !refIds.includes(x)); }));
        s.colourStudies = s.colourStudies.filter((x) => x.id !== id);
      });
      refs.forEach((r) => CR.images.remove(r));
    },
    addStudyPage(studyId, imageRef, caption = '') {
      commit((s) => { s.colourStudies.find((x) => x.id === studyId).pages.push({ id: uid('pg'), imageRef, caption }); });
    },
    updateStudyPage(studyId, pageId, patch, opts) {
      commit((s) => { Object.assign(s.colourStudies.find((x) => x.id === studyId).pages.find((p) => p.id === pageId), patch); }, opts);
    },
    moveStudyPage(studyId, pageId, dir) {
      commit((s) => {
        const pages = s.colourStudies.find((x) => x.id === studyId).pages;
        const i = pages.findIndex((p) => p.id === pageId); const j = i + dir;
        if (j < 0 || j >= pages.length) return;
        [pages[i], pages[j]] = [pages[j], pages[i]];
      });
    },
    removeStudyPage(studyId, pageId) {
      let ref = '';
      commit((s) => { const st = s.colourStudies.find((x) => x.id === studyId); ref = (st.pages.find((p) => p.id === pageId) || {}).imageRef; st.pages = st.pages.filter((p) => p.id !== pageId); });
      CR.images.remove(ref);
    },
    // A key colour from a study (Pantone code, WGSN trend). Other colours (Cult concepts, benchmarks) link to these.
    addColourRef({ studyId, name = '' }) {
      return commit((s) => {
        const st = s.colourStudies.find((x) => x.id === studyId);
        const e = { id: uid('cref'), studyId, season: st.season, source: st.source, name, hex: '#cccccc', code: '', trend: '', note: '', addedBy: s.meta.currentUserId, addedAt: nowIso() };
        s.colourRefs.push(e);
        return e.id;
      });
    },
    updateColourRef(id, patch, opts) { commit((s) => { Object.assign(s.colourRefs.find((c) => c.id === id), patch); }, opts); },
    removeColourRef(id) {
      commit((s) => {
        s.colourRefs = s.colourRefs.filter((c) => c.id !== id);
        s.colours.forEach((c) => { c.refIds = (c.refIds || []).filter((x) => x !== id); });
        s.benchmarks.forEach((b) => (b.colours || []).forEach((c) => { c.refIds = (c.refIds || []).filter((x) => x !== id); }));
      });
    },
    addSeason(name) { commit((s) => { s.meta.extraSeasons = [...new Set([...(s.meta.extraSeasons || []), name])]; }); },

    /** reviewId = null creates a library-level benchmark (browsed by category on the Benchmarks page). */
    addBenchmark(reviewId, imageRef = '', { optionId = null, name = '', categoryId = '', subcategoryId = '' } = {}) {
      return commit((s) => {
        const b = {
          id: uid('bm'), reviewId: reviewId || null, categoryId, subcategoryId, name, brand: '', imageRef, sourceUrl: '', note: '', tags: [],
          colours: [], informsOptionIds: optionId ? [optionId] : [], informsAreaIds: [], isPlaceholder: false, addedBy: s.meta.currentUserId, createdAt: nowIso(),
        };
        if (optionId) s.benchmarks.forEach((x) => { x.informsOptionIds = (x.informsOptionIds || []).filter((id) => id !== optionId); });
        s.benchmarks.push(b);
        if (reviewId) log(s, reviewId, 'added a benchmark reference', 'edit');
        return b.id;
      });
    },
    updateBenchmark(id, patch, opts) { commit((s) => { Object.assign(s.benchmarks.find((b) => b.id === id), patch, { isPlaceholder: false }); }, opts); },
    removeBenchmark(id) {
      const b = byId('benchmarks', id);
      commit((s) => { s.benchmarks = s.benchmarks.filter((x) => x.id !== id); });
      if (b) CR.images.remove(b.imageRef);
    },
    // Colours of a benchmark shoe (name, swatch, Pantone, WGSN, links into the season library)
    addBenchmarkColour(benchId) {
      commit((s) => { const b = s.benchmarks.find((x) => x.id === benchId); b.colours = (b.colours || []).concat({ id: uid('bc'), part: 'Upper', name: '', hex: '#cccccc', pantone: '', wgsn: '', refIds: [] }); });
    },
    updateBenchmarkColour(benchId, colId, patch, opts) {
      commit((s) => { const c = s.benchmarks.find((x) => x.id === benchId).colours.find((x) => x.id === colId); Object.assign(c, patch); }, opts);
    },
    removeBenchmarkColour(benchId, colId) {
      commit((s) => { const b = s.benchmarks.find((x) => x.id === benchId); b.colours = b.colours.filter((c) => c.id !== colId); });
    },
    linkBenchmarkColourRef(benchId, colId, refId, on = true) {
      commit((s) => {
        const c = s.benchmarks.find((x) => x.id === benchId).colours.find((x) => x.id === colId);
        c.refIds = on ? [...new Set([...(c.refIds || []), refId])] : (c.refIds || []).filter((x) => x !== refId);
      });
    },

    /**
     * One active verdict (Select / Hold / Reject) per reviewer per option.
     * Choosing a different verdict replaces it (history kept, logged); choosing the same one clears it.
     */
    castVerdict(optionId, verdict) {
      commit((s) => {
        const userId = s.meta.currentUserId;
        const o = s.options.find((x) => x.id === optionId);
        const a = s.areas.find((x) => x.id === o.areaId);
        const existing = s.votes.find((v) => v.optionId === optionId && v.userId === userId);
        if (existing && existing.verdict === verdict) {
          s.votes = s.votes.filter((v) => v !== existing);
          log(s, a.reviewId, `cleared their verdict on ${optLabel(s, optionId)} in ${a.title}`, 'vote');
        } else if (existing) {
          const from = existing.verdict;
          existing.history = (existing.history || []).concat({ verdict: from, at: existing.updatedAt });
          existing.verdict = verdict; existing.updatedAt = nowIso();
          log(s, a.reviewId, `changed ${optLabel(s, optionId)} from ${VERDICT_LABEL[from]} to ${VERDICT_LABEL[verdict]} in ${a.title}`, 'vote');
        } else {
          s.votes.push({ id: 'vote_' + optionId + '__' + userId, reviewId: a.reviewId, areaId: a.id, optionId, userId, verdict, createdAt: nowIso(), updatedAt: nowIso(), history: [] });
          log(s, a.reviewId, `marked ${optLabel(s, optionId)} as ${VERDICT_LABEL[verdict]} in ${a.title}`, 'vote');
        }
        if (s.participants.some((x) => x.reviewId === a.reviewId && x.userId === userId) && !s.opened.some((x) => x.reviewId === a.reviewId && x.userId === userId)) {
          s.opened.push({ id: a.reviewId + '__' + userId, reviewId: a.reviewId, userId, at: nowIso() });
        }
      });
    },

    addComment({ reviewId, areaId = null, optionId = null, text }) {
      commit((s) => {
        s.comments.push({ id: uid('cmt'), reviewId, areaId, optionId, userId: s.meta.currentUserId, text, at: nowIso() });
        const a = s.areas.find((x) => x.id === areaId);
        log(s, reviewId, `commented on ${optionId ? optLabel(s, optionId) : a ? a.title : 'the review'}`, 'comment');
      });
    },
    deleteComment(id) { commit((s) => { s.comments = s.comments.filter((c) => c.id !== id); }); },

    /** Approver's decision per decision area. Stored separately from the advisory verdicts. */
    recordDecision(areaId, { approvedIds, holdIds, rejectedIds, rationale, overrideReason }) {
      commit((s) => {
        const a = s.areas.find((x) => x.id === areaId);
        const t = sel.tally(areaId);
        const prev = s.decisions.find((d) => d.areaId === areaId);
        const snapshot = Object.fromEntries([...t.per].map(([k, v]) => [k, { select: v.select.length, hold: v.hold.length, reject: v.reject.length }]));
        const d = {
          id: prev ? prev.id : uid('dec'), reviewId: a.reviewId, areaId,
          optionIds: approvedIds, holdIds, rejectedIds, rationale, overrideReason: overrideReason || '',
          decidedBy: s.meta.currentUserId, decidedAt: nowIso(), voteSnapshot: snapshot, leadersAtDecision: t.leaders,
        };
        s.decisions = s.decisions.filter((x) => x.areaId !== areaId).concat(d);
        log(s, a.reviewId, `${prev ? 'updated' : 'recorded'} approval for ${a.title}: ${approvedIds.map((id) => optLabel(s, id)).join(', ') || 'nothing approved'}`, 'decision');
        touch(s, a.reviewId);
      });
    },
    clearDecision(areaId) {
      commit((s) => {
        const a = s.areas.find((x) => x.id === areaId);
        s.decisions = s.decisions.filter((x) => x.areaId !== areaId);
        log(s, a.reviewId, `cleared the approval for ${a.title}`, 'decision');
      });
    },

    saveCategories(categories) { commit((s) => { s.categories = categories.map((c, i) => ({ ...c, order: i })); }); },
    setApprover(userId) { commit((s) => { s.meta.approverId = userId || null; }); },
    addUser({ name, role, email }) {
      return commit((s) => {
        const hues = [12, 38, 160, 200, 230, 280, 320, 95];
        const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
        const id = String(email || '').trim().toLowerCase() || uid('usr');
        if (s.users.some((x) => x.id === id)) return id;
        const u = { id, email: email ? id : undefined, name, initials, role, hue: hues[s.users.length % hues.length], demo: false };
        s.users.push(u);
        return u.id;
      });
    },
    updateUser(id, patch) { commit((s) => { Object.assign(s.users.find((u) => u.id === id), patch); }); },
    removeUser(id) {
      commit((s) => {
        s.users = s.users.filter((u) => u.id !== id);
        s.participants = s.participants.filter((p) => p.userId !== id);
        if (s.meta.currentUserId === id) s.meta.currentUserId = (s.users[0] || {}).id;
      });
    },

    async resetDemo() {
      await CR.images.clearAll().catch(() => {});
      commit((s) => { const fresh = CR.seed.build(); Object.keys(s).forEach((k) => delete s[k]); Object.assign(s, fresh); });
    },
  };

  CR.store = {
    load, commit, actions, sel, me, AREA_TYPES, WHY_LABEL, INSPIRATION_TAGS, STATUS, VERDICTS, VERDICT_LABEL, VERDICT_PAST, ROLES,
    mode: 'local', caps: { admin: true, write: true, upload: true },
    get state() { return state; },
    subscribe: (fn) => listeners.add(fn),
  };
})(window.CR);

