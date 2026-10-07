/* Reusable view fragments. Each returns an html`` value. */
(function (CR) {
  const { html, raw, pad2, dueLabel, inkOn } = CR.util;
  const { sel, STATUS } = CR.store;

  const ICONS = {
    check: '<path d="M4 10.5l4 4 8-9" />',
    plus: '<path d="M10 4v12M4 10h12" />',
    x: '<path d="M5 5l10 10M15 5L5 15" />',
    up: '<path d="M10 15V5M5 10l5-5 5 5" />',
    down: '<path d="M10 5v10M5 10l5 5 5-5" />',
    upload: '<path d="M10 13V3M6 7l4-4 4 4M3 13v3h14v-3" />',
    compare: '<path d="M3 4h6v12H3zM11 4h6v12h-6z" />',
    link: '<path d="M8 12l4-4M7 9L5 11a3 3 0 004 4l2-2M13 11l2-2a3 3 0 00-4-4L9 7" />',
    chat: '<path d="M4 4h12v9H8l-4 3z" />',
    star: '<path d="M10 3l2.2 4.5 4.8.7-3.5 3.4.8 4.9L10 14.2 5.7 16.5l.8-4.9L3 8.2l4.8-.7z" />',
    flag: '<path d="M5 17V3M5 3h9l-2 3.5 2 3.5H5" />',
    expand: '<path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" />',
    arrowL: '<path d="M12 4l-6 6 6 6" />', arrowR: '<path d="M8 4l6 6-6 6" />',
    edit: '<path d="M4 16h3l9-9-3-3-9 9z" />',
    print: '<path d="M6 7V3h8v4M5 14H3V8h14v6h-2M6 11h8v6H6z" />',
    share: '<path d="M7 10a3 3 0 11-.01 0zM15 4.5a2 2 0 11-.01 0zM15 15.5a2 2 0 11-.01 0zM9.6 8.6l3.6-2.3M9.6 11.4l3.6 2.3" />',
    trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" />',
    pause: '<path d="M7 4v12M13 4v12" />',
    palette: '<path d="M10 3a7 7 0 100 14c1.2 0 1.6-.8 1.2-1.7-.4-1 .2-2 1.3-2H15a2 2 0 002-2A7 7 0 0010 3zM6.5 9.5h.01M9 6.5h.01M12.5 7h.01" />',
  };
  const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 20 20" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

  const VERDICT_ICON = { select: 'check', hold: 'pause', reject: 'x' };
  const verdictIcon = (v) => icon(VERDICT_ICON[v]);

  function avatar(user, size = 'md', extraTitle = '') {
    if (!user) return '';
    const bg = `hsl(${user.hue} 45% 88%)`, fg = `hsl(${user.hue} 55% 26%)`;
    return html`<span class="avatar avatar--${size}" style="background:${bg};color:${fg}" title="${user.name}${extraTitle}" aria-hidden="true">${user.initials}</span>`;
  }
  function person(user, size = 'sm') {
    if (!user) return html`<span class="muted">Unknown</span>`;
    return html`<span class="person">${avatar(user, size)}<span>${user.name}</span></span>`;
  }
  function avatarStack(userIds, max = 5) {
    const users = userIds.map(sel.user).filter(Boolean);
    const shown = users.slice(0, max);
    return html`<span class="avatar-stack" aria-label="${users.map((u) => u.name).join(', ')}">
      ${shown.map((u) => avatar(u, 'sm'))}${users.length > max ? html`<span class="avatar avatar--sm avatar--more">+${users.length - max}</span>` : ''}
    </span>`;
  }

  function statusPill(status) {
    return html`<span class="pill pill--${status}">${STATUS[status]}</span>`;
  }
  const demoChip = (on) => (on ? html`<span class="chip chip--demo" title="Sample data for the prototype">Demo</span>` : '');

  function due(review) {
    if (review.status === 'final') return html`<span class="due due--muted">Closed</span>`;
    const d = dueLabel(review.dueDate);
    return html`<span class="due due--${d.tone}">${d.text}</span>`;
  }

  /** Simple side-profile silhouette used where no concept image has been uploaded. */
  function placeholderSvg(label, hex = '#C9C4BA', accent = '#8F897E') {
    return raw(`<svg class="ph-shoe" viewBox="0 0 400 200" role="img" aria-label="${CR.util.esc(label)}">
      <rect width="400" height="200" fill="none"/>
      <path d="M44 134 C40 116 58 106 88 100 L168 86 C196 70 218 54 240 48 L296 40 C316 37 326 48 331 66 L343 102 C356 110 370 120 371 134 Z" fill="${hex}" opacity=".85"/>
      <path d="M30 136 L372 136 Q384 150 370 162 Q340 172 300 170 L70 170 Q34 168 30 150 Z" fill="${accent}" opacity=".55"/>
      <text x="200" y="192" text-anchor="middle" font-size="12" font-family="system-ui" letter-spacing="2" fill="#6E6A63">PLACEHOLDER · UPLOAD CONCEPT</text>
    </svg>`);
  }

  function media(ref, alt, { kind = 'concept', hex, accent, ratio = 'wide' } = {}) {
    if (!ref) {
      if (kind === 'benchmark') {
        return html`<div class="media media--${ratio} media--empty media--bench"><span>Benchmark image not added<br><small>Add an approved reference image</small></span></div>`;
      }
      return html`<div class="media media--${ratio} media--empty">${placeholderSvg(alt + ' — placeholder', hex, accent)}</div>`;
    }
    const isIdb = ref.startsWith('idb:') || ref.startsWith('sb:');
    const srcUrl = ref.startsWith('asset:') ? '/_blob/' + ref.slice(6) : ref;
    return html`<div class="media media--${ratio}"><img ${isIdb ? raw(`data-ref="${CR.util.esc(ref)}"`) : raw(`src="${CR.util.esc(srcUrl)}"`)} alt="${alt}" loading="lazy" decoding="async"></div>`;
  }

  function optionMedia(opt, ratio) {
    const cols = sel.colours(opt.id);
    return media(opt.imageRef, `Option ${sel.optionNumber(opt)}: ${opt.name}`, { hex: cols[0]?.hex, accent: cols[1]?.hex, ratio });
  }

  function swatches(optionId, size = 'sm') {
    const cols = sel.colours(optionId);
    if (!cols.length) return '';
    return html`<span class="swatches swatches--${size}">${cols.map((c) => html`<span class="swatch" style="background:${c.hex}" title="${c.part}: ${c.name || 'Unnamed'}${c.pantone ? ' · ' + c.pantone : ''}"></span>`)}</span>`;
  }

  const optLabel = (opt) => html`<span class="opt-num">${pad2(sel.optionNumber(opt))}</span>`;

  function emptyState(title, body, action = '') {
    return html`<div class="empty"><p class="empty__title">${title}</p><p class="empty__body">${body}</p>${action}</div>`;
  }

  function tags(list) {
    return html`<span class="tags">${(list || []).map((t) => html`<span class="tag">${t}</span>`)}</span>`;
  }

  /** Card used on dashboard, reviews list. */
  function reviewCard(r, { highlightVote = false } = {}) {
    const me = CR.store.me();
    const path = sel.categoryPath(r);
    const prog = sel.progress(r.id);
    const dprog = sel.decisionProgress(r.id);
    const myStatus = sel.participantStatus(r.id, me.id);
    const cover = sel.coverImage(r.id);
    return html`<article class="rcard">
      <a class="rcard__link" href="#/review/${r.id}" aria-label="Open ${r.title}"></a>
      ${media(cover, r.title, { ratio: 'wide' })}
      <div class="rcard__body">
        <div class="rcard__meta"><span class="eyebrow">${path.text}${r.season ? ' · ' + r.season : ''}</span>${demoChip(r.demo)}</div>
        <h3 class="rcard__title">${r.title}</h3>
        <div class="rcard__row">${statusPill(r.status)} ${due(r)}</div>
        <div class="rcard__row rcard__row--foot">
          <span class="person">${avatar(sel.user(r.ownerId), 'sm')}<span class="muted">${sel.user(r.ownerId)?.name}</span></span>
          ${r.status === 'final'
            ? html`<span class="muted small">${dprog.done}/${dprog.total} areas decided</span>`
            : html`<span class="muted small">${prog.done}/${prog.total} reviewers done</span>`}
        </div>
        ${highlightVote && myStatus ? html`<div class="rcard__cta">${myStatus === 'invited' ? 'You’re invited — not opened yet' : 'Your votes are incomplete'}</div>` : ''}
      </div>
    </article>`;
  }

  function filterBar(id, filters, fields) {
    const st = CR.store.state;
    const opts = {
      category: [['', 'All categories'], ...st.categories.map((c) => [c.id, c.name])],
      season: [['', 'All seasons'], ...sel.seasons().map((s) => [s, s])],
      status: [['', 'All statuses'], ...Object.entries(STATUS)],
      designer: [['', 'All designers'], ...sel.designers().map((u) => [u.id, u.name])],
      area: [['', 'All decision types'], ...Object.entries(CR.store.AREA_TYPES)],
    };
    const labels = { category: 'Category', season: 'Season', status: 'Status', designer: 'Designer', area: 'Decision type' };
    return html`<form class="filters" role="search" data-filter-form="${id}">
      <label class="field field--search"><span class="sr-only">Search</span>
        <input type="search" name="q" id="flt-q-${id}" placeholder="Search title or model" value="${filters.q || ''}" data-filter="q"></label>
      ${fields.map((f) => html`<label class="field"><span class="sr-only">${labels[f]}</span>
        <select data-filter="${f}" id="flt-${f}-${id}">${opts[f].map(([v, l]) => html`<option value="${v}" ${filters[f] === v ? raw('selected') : ''}>${l}</option>`)}</select></label>`)}
      ${Object.values(filters).some(Boolean) ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="clear-filters" data-id="${id}">Clear</button>` : ''}
    </form>`;
  }

  function applyFilters(reviews, f) {
    const q = (f.q || '').toLowerCase();
    return reviews.filter((r) => (!f.category || r.categoryId === f.category) && (!f.sub || r.subcategoryId === f.sub) && (!f.season || r.season === f.season)
      && (!f.status || r.status === f.status) && (!f.designer || r.ownerId === f.designer)
      && (!q || `${r.title} ${r.model}`.toLowerCase().includes(q)));
  }

  function swatchBlock(c) {
    return html`<span class="swatch-block" style="background:${c.hex};color:${inkOn(c.hex)}">${c.hex.toUpperCase()}</span>`;
  }

  CR.ui = { verdictIcon, icon, avatar, person, avatarStack, statusPill, demoChip, due, media, optionMedia, swatches, optLabel, emptyState, tags, reviewCard, filterBar, applyFilters, placeholderSvg, swatchBlock };
})(window.CR);
