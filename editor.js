/* Create / edit review. Every field saves to the store as you type (this browser only). */
(function (CR) {
  const { html, raw, pad2, plural } = CR.util;
  const { sel, AREA_TYPES, INSPIRATION_TAGS, STATUS } = CR.store;
  const ui = CR.ui;
  const PARTS = ['Upper', 'Midsole', 'Midsole accent', 'Outsole', 'Overlay', 'Lining', 'Laces', 'Logo', 'Other'];

  const opt = (v, label, cur) => html`<option value="${v}" ${v === cur ? raw('selected') : ''}>${label}</option>`;

  function basics(r) {
    const cats = CR.store.state.categories;
    const cat = cats.find((c) => c.id === r.categoryId);
    const users = CR.store.state.users.filter((u) => u.role !== 'reviewer');
    return html`<section class="panel" id="basics" aria-labelledby="h-basics">
      <header class="section-head"><h2 id="h-basics">1 · Basics</h2></header>
      <div class="form-grid">
        <label class="field field--span2"><span class="field__label">Review title <span class="req">required</span></span>
          <input id="f-title" value="${r.title}" data-rev-field="title" data-id="${r.id}" required placeholder="e.g. Entry Running 3W — Colourways"></label>
        <label class="field"><span class="field__label">Shoe / project</span>
          <input id="f-model" value="${r.model}" data-rev-field="model" data-id="${r.id}" placeholder="e.g. Daily Trainer – Entry · 3W"></label>
        <label class="field"><span class="field__label">Season</span>
          <input id="f-season" value="${r.season}" data-rev-field="season" data-id="${r.id}" list="season-list" placeholder="e.g. SS28">
          <datalist id="season-list">${['SS27', 'AW27', 'SS28', 'AW28', 'SS29', ...sel.seasons()].filter((v, i, a) => a.indexOf(v) === i).map((s) => html`<option value="${s}">`)}</datalist></label>
        <label class="field"><span class="field__label">Category</span>
          <select id="f-cat" data-rev-select="categoryId" data-id="${r.id}">${cats.map((c) => opt(c.id, c.name, r.categoryId))}</select></label>
        <label class="field"><span class="field__label">Subcategory</span>
          <select id="f-sub" data-rev-select="subcategoryId" data-id="${r.id}">${(cat ? cat.subcategories : []).map((s) => opt(s.id, s.name, r.subcategoryId))}</select></label>
        <label class="field"><span class="field__label">Owner</span>
          <select id="f-owner" data-rev-select="ownerId" data-id="${r.id}">${users.map((u) => opt(u.id, `${u.name} (${CR.store.ROLES[u.role]})`, r.ownerId))}</select></label>
        <label class="field"><span class="field__label">Due date</span>
          <input id="f-due" type="date" value="${r.dueDate}" data-rev-field="dueDate" data-id="${r.id}"></label>
        <label class="field field--span2"><span class="field__label">Review notes <span class="muted">optional</span></span>
          <textarea id="f-notes" rows="3" data-rev-field="notes" data-id="${r.id}" placeholder="What should reviewers focus on?">${r.notes}</textarea></label>
        <label class="field field--span2"><span class="field__label">Design rationale <span class="muted">optional</span></span>
          <textarea id="f-rationale" rows="3" data-rev-field="rationale" data-id="${r.id}" placeholder="Concept story, target customer, price point, range role">${r.rationale}</textarea></label>
      </div>
      <p class="small muted">Categories are managed in <a class="link" href="#/settings">Settings</a>.</p>
    </section>`;
  }

  function reviewers(r) {
    const users = CR.store.state.users.filter((u) => u.id !== r.ownerId && u.role !== 'approver');
    const approver = sel.approver();
    return html`<section class="panel" id="reviewers" aria-labelledby="h-rev">
      <header class="section-head"><h2 id="h-rev">2 · Reviewers</h2></header>
      <p class="notice"><strong>Prototype sharing.</strong> Invitations are saved in this browser only. No emails are sent and nothing is access-controlled. Final approval is by <strong>${approver ? approver.name : 'the approver (none set)'}</strong>.</p>
      ${users.length ? html`<ul class="invite-list">${users.map((u) => { const p = sel.participant(r.id, u.id); const st = p && sel.participantStatus(r.id, u.id); return html`<li>
        <label class="check check--row"><input type="checkbox" id="inv-${u.id}" data-share-user="${u.id}" data-review="${r.id}" ${p ? raw('checked') : ''}> ${ui.person(u, 'md')}</label>
        <span class="small muted">${CR.store.ROLES[u.role]}</span>
        ${st ? html`<span class="status-label status-label--${st}">${st[0].toUpperCase() + st.slice(1)}</span>` : html`<span class="muted small">Not invited</span>`}</li>`; })}</ul>`
        : html`<p class="muted">No other people yet — add them in <a class="link" href="#/settings">Settings</a>.</p>`}
    </section>`;
  }

  /** Dropdown of colour-library entries (current review season first) to link to a colour. */
  function libraryOptions(r, c) {
    const refs = CR.store.state.colourRefs.filter((e) => !(c.refIds || []).includes(e.id));
    return html`<option value="">${refs.length ? 'Link a key colour from a colour study…' : 'No colour-study colours yet'}</option>${CR.library.studyColourOptions(refs, r.season)}`;
  }

  function colourEditor(c, r) {
    const linked = (c.refIds || []).map(sel.colourRef).filter(Boolean);
    return html`<div class="col-edit">
      <div class="col-edit__swatch">
        <label class="sr-only" for="hex-${c.id}">Swatch colour</label>
        <input type="color" id="hex-${c.id}" value="${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cccccc'}" data-col-field="hex" data-id="${c.id}">
      </div>
      <div class="col-edit__fields">
        <label class="field field--xs"><span class="field__label">Part</span><select data-col-select="part" data-id="${c.id}" id="part-${c.id}">${PARTS.map((p) => opt(p, p, c.part))}</select></label>
        <label class="field"><span class="field__label">Colour name</span><input value="${c.name}" data-col-field="name" data-id="${c.id}" id="cn-${c.id}" placeholder="e.g. Navy"></label>
        <label class="field"><span class="field__label">Pantone ref</span><input value="${c.pantone}" data-col-field="pantone" data-id="${c.id}" id="pt-${c.id}" placeholder="From your Pantone source"></label>
        <label class="field"><span class="field__label">WGSN trend / report</span><input value="${c.wgsn}" data-col-field="wgsn" data-id="${c.id}" id="wg-${c.id}" placeholder="Trend name, season or report ref"></label>
        <label class="field field--span2"><span class="field__label">Why it fits the concept &amp; customer</span><input value="${c.rationale}" data-col-field="rationale" data-id="${c.id}" id="ra-${c.id}"></label>
        <div class="field field--span2 field--link">
          <label class="field"><span class="field__label">Link a key colour from a colour study <a class="link small" href="#/colours">(add a study)</a></span>
            <select data-col-addref="${c.id}" id="lk-${c.id}">${libraryOptions(r, c)}</select></label>
          ${linked.length ? html`<span class="ref-chips">${linked.map((x) => CR.library.refChip(x, { removable: c.id }))}</span>` : ''}
        </div>
      </div>
      <button class="icon-btn icon-btn--sm" data-action="remove-colour" data-id="${c.id}" aria-label="Remove colour ${c.name}">${ui.icon('trash')}</button>
      ${c.isExample ? html`<p class="small muted col-edit__note">Demo value — approximate swatch; Pantone/WGSN not recorded.</p>` : ''}
    </div>`;
  }

  function optionEditor(o, a, i, n, r) {
    const cols = sel.colours(o.id);
    const showColours = a.type === 'colourway' || cols.length;
    const reviewBms = sel.benchmarks(r.id).concat(sel.allBenchmarks().filter((b) => !b.reviewId && sel.benchmarkCategory(b).categoryId === r.categoryId));
    const linked = (sel.benchmarksForOption(o).find((b) => (b.informsOptionIds || []).includes(o.id))) || null;
    return html`<article class="opt-edit" aria-label="Option ${i + 1}">
      <div class="opt-edit__media">
        <p class="cmp-label cmp-label--cult">Cult 2D concept</p>
        ${ui.optionMedia(o, 'wide')}
        <label class="btn btn--sm btn--block file-btn">${ui.icon('upload')} ${o.imageRef ? 'Replace 2D image' : 'Upload 2D image'}
          <input type="file" accept="image/*" data-upload="option-image" data-id="${o.id}" class="sr-only"></label>
        <p class="cmp-label cmp-label--bench">Benchmark shown beside it</p>
        ${linked ? ui.media(linked.imageRef, `${linked.brand} ${linked.name}`, { kind: 'benchmark', ratio: 'wide' }) : html`<div class="media media--wide media--bench"><span>No benchmark linked</span></div>`}
        <label class="btn btn--sm btn--block file-btn">${ui.icon('upload')} ${linked && linked.imageRef ? 'Replace benchmark image' : 'Upload benchmark image'}
          <input type="file" accept="image/*" data-upload="option-bench" data-id="${o.id}" class="sr-only"></label>
        ${reviewBms.length ? html`<label class="field"><span class="field__label">Or use an existing benchmark</span>
          <select data-opt-bench="${o.id}" id="ob-${o.id}"><option value="" ${linked ? '' : raw('selected')}>None</option>
            ${reviewBms.map((b) => html`<option value="${b.id}" ${linked && linked.id === b.id ? raw('selected') : ''}>${[b.brand, b.name].filter(Boolean).join(' ') || 'Untitled reference'}</option>`)}</select></label>` : ''}
      </div>
      <div class="opt-edit__fields">
        <div class="opt-edit__row">
          <span class="opt-num">${pad2(i + 1)}</span>
          <label class="field field--grow"><span class="sr-only">Option name</span><input value="${o.name}" data-opt-field="name" data-id="${o.id}" id="on-${o.id}" placeholder="Working name"></label>
          <button class="icon-btn icon-btn--sm" data-action="move-option" data-id="${o.id}" data-dir="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Move option up" id="ou-${o.id}">${ui.icon('up')}</button>
          <button class="icon-btn icon-btn--sm" data-action="move-option" data-id="${o.id}" data-dir="1" ${i === n - 1 ? raw('disabled') : ''} aria-label="Move option down" id="od-${o.id}">${ui.icon('down')}</button>
          <button class="icon-btn icon-btn--sm" data-action="remove-option" data-id="${o.id}" aria-label="Remove option ${o.name}">${ui.icon('trash')}</button>
        </div>
        <label class="field"><span class="field__label">${CR.store.WHY_LABEL[a.type] || 'Why this option'} — shown next to the image <span class="req">recommended</span></span>
          <textarea rows="3" data-opt-field="rationale" data-id="${o.id}" id="owhy-${o.id}" placeholder="Explain the thinking so reviewers and the approver can judge it: customer, trend, range role, cost, performance…">${o.rationale || ''}</textarea></label>
        ${showColours ? html`<div class="col-list"><p class="label">Colours</p>${cols.map((c) => colourEditor(c, r))}</div>` : ''}
        <button class="btn btn--ghost btn--sm" data-action="add-colour" data-id="${o.id}">${ui.icon('plus')} Add colour</button>
      </div>
    </article>`;
  }

  function areaEditor(a, i, n, r) {
    const opts = sel.options(a.id);
    const votes = sel.votes(a.id).length;
    return html`<section class="area-edit" id="ae-${a.id}" aria-label="Decision area ${a.title}">
      <header class="area-edit__head">
        <label class="field field--xs"><span class="field__label">Type</span><select data-area-select="type" data-id="${a.id}" id="at-${a.id}">${Object.entries(AREA_TYPES).map(([k, l]) => opt(k, l, a.type))}</select></label>
        <label class="field field--grow"><span class="field__label">Title</span><input value="${a.title}" data-area-field="title" data-id="${a.id}" id="an-${a.id}"></label>
        <label class="field field--xs"><span class="field__label">Max approvals</span><input type="number" min="1" max="10" value="${a.maxSelections}" data-area-select="maxSelections" data-id="${a.id}" id="am-${a.id}"></label>
        <div class="area-edit__tools">
          <button class="icon-btn icon-btn--sm" data-action="move-area" data-id="${a.id}" data-dir="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Move area up" id="au-${a.id}">${ui.icon('up')}</button>
          <button class="icon-btn icon-btn--sm" data-action="move-area" data-id="${a.id}" data-dir="1" ${i === n - 1 ? raw('disabled') : ''} aria-label="Move area down" id="ad-${a.id}">${ui.icon('down')}</button>
          <button class="icon-btn icon-btn--sm" data-action="remove-area" data-id="${a.id}" aria-label="Delete area ${a.title}">${ui.icon('trash')}</button>
        </div>
      </header>
      <label class="field"><span class="field__label">Question for reviewers <span class="muted">optional</span></span><input value="${a.description}" data-area-field="description" data-id="${a.id}" id="adesc-${a.id}" placeholder="e.g. Which sole unit best fits an entry price point?"></label>
      ${votes ? html`<p class="small muted">${plural(votes, 'verdict')} given in this area. Removing an option also removes its verdicts.</p>` : ''}
      <div class="opt-edit-list">${opts.map((o, j) => optionEditor(o, a, j, opts.length, r))}</div>
      <div class="dropzone" data-drop="area" data-id="${a.id}">
        ${ui.icon('upload')}
        <p><strong>Drop 2D concept images here</strong> — each image becomes an option.</p>
        <div class="dropzone__actions">
          <label class="btn btn--sm file-btn">Browse files<input type="file" accept="image/*" multiple data-upload="area" data-id="${a.id}" class="sr-only"></label>
          <button class="btn btn--ghost btn--sm" data-action="add-option" data-id="${a.id}">Add option without image</button>
        </div>
      </div>
    </section>`;
  }

  function benchmarkEditor(b, r) {
    const areas = sel.areas(r.id);
    return html`<article class="bm-edit">
      <div class="opt-edit__media">
        <p class="bcard__ribbon">Benchmark · reference only</p>
        ${ui.media(b.imageRef, `${b.brand} ${b.name}`, { kind: 'benchmark', ratio: 'wide' })}
        <label class="btn btn--sm btn--block file-btn">${ui.icon('upload')} ${b.imageRef ? 'Replace image' : 'Upload image'}
          <input type="file" accept="image/*" data-upload="bench-image" data-id="${b.id}" class="sr-only"></label>
      </div>
      <div class="opt-edit__fields">
        <div class="form-grid">
          <label class="field"><span class="field__label">Brand</span><input value="${b.brand}" data-bm-field="brand" data-id="${b.id}" id="bb-${b.id}"></label>
          <label class="field"><span class="field__label">Shoe name</span><input value="${b.name}" data-bm-field="name" data-id="${b.id}" id="bn-${b.id}"></label>
          <label class="field field--span2"><span class="field__label">Source URL or note</span><input value="${b.sourceUrl}" data-bm-field="sourceUrl" data-id="${b.id}" id="bu-${b.id}" placeholder="https://…"></label>
          <label class="field field--span2"><span class="field__label">What it informs and why</span><textarea rows="2" data-bm-field="note" data-id="${b.id}" id="bnote-${b.id}">${b.note}</textarea></label>
        </div>
        <fieldset class="checks"><legend class="label">Inspiration tags</legend>
          ${INSPIRATION_TAGS.map((t) => html`<label class="check"><input type="checkbox" data-bm-tag="${t}" data-id="${b.id}" ${b.tags.includes(t) ? raw('checked') : ''}> ${t}</label>`)}
        </fieldset>
        <fieldset class="checks"><legend class="label">Show next to</legend>
          ${areas.map((a) => html`<div class="checks__group">
            <label class="check"><input type="checkbox" data-bm-area="${a.id}" data-id="${b.id}" ${(b.informsAreaIds || []).includes(a.id) ? raw('checked') : ''}> <strong>${a.title}</strong> (all options)</label>
            ${sel.options(a.id).map((o) => html`<label class="check check--sm"><input type="checkbox" data-bm-opt="${o.id}" data-id="${b.id}" ${(b.informsOptionIds || []).includes(o.id) ? raw('checked') : ''}> #${pad2(sel.optionNumber(o))} ${o.name}</label>`)}
          </div>`)}
        </fieldset>
        ${CR.library.benchColourEditor(b, r.season)}
        <button class="btn btn--ghost btn--sm" data-action="remove-benchmark" data-id="${b.id}">${ui.icon('trash')} Remove benchmark</button>
      </div>
    </article>`;
  }

  function editorPage(id) {
    const r = sel.review(id);
    if (!r) return ui.emptyState('Review not found', 'It may have been deleted.', html`<a class="btn" href="#/">Dashboard</a>`);
    if (!CR.perm.can('editReview', r)) {
      return ui.emptyState('You can’t edit this review', `Only the owner (${sel.user(r.ownerId)?.name}) or a Lead can edit. Switch demo user in the header.`, html`<a class="btn" href="#/review/${r.id}">View review</a>`);
    }
    const areas = sel.areas(r.id);
    const bms = sel.benchmarks(r.id);
    const optCount = areas.reduce((n, a) => n + sel.options(a.id).length, 0);
    return html`
      <header class="review-head">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/reviews">Reviews</a><span aria-hidden="true">/</span><a href="#/review/${r.id}">${r.title}</a><span aria-hidden="true">/</span><span aria-current="page">Edit</span></nav>
        <div class="review-head__top">
          <div><p class="eyebrow">${STATUS[r.status]} · ${plural(optCount, 'option')} · ${plural(bms.length, 'benchmark')}</p>
            <h1 class="display display--sm">Edit review</h1>
            <p class="small muted" role="status" id="save-status">${ui.icon('check')} Changes save automatically in this browser.</p></div>
          <div class="review-head__actions">
            <button class="btn btn--ghost" data-action="delete-review" data-id="${r.id}">${ui.icon('trash')} Delete</button>
            <a class="btn" href="#/review/${r.id}">View review</a>
            ${r.status === 'draft' ? html`<button class="btn btn--primary" data-action="set-status" data-id="${r.id}" data-status="in_review">Open for review</button>` : ''}
          </div>
        </div>
      </header>
      <div class="editor-layout">
        <nav class="editor-nav" aria-label="Editor sections">
          <a href="#basics" data-action="scroll-to" data-target="basics">1 · Basics</a>
          <a href="#reviewers" data-action="scroll-to" data-target="reviewers">2 · Reviewers</a>
          <a href="#areas" data-action="scroll-to" data-target="areas">3 · Decision areas &amp; concepts</a>
          <a href="#benchmarks" data-action="scroll-to" data-target="benchmarks">4 · Benchmarks</a>
          <p class="small muted">PowerPoint import isn’t available yet — upload concept images directly.</p>
        </nav>
        <div class="editor-main">
          ${basics(r)}
          ${reviewers(r)}
          <section class="panel" id="areas" aria-labelledby="h-areas">
            <header class="section-head"><h2 id="h-areas">3 · Decision areas &amp; concepts</h2></header>
            <p class="small muted">Group 2D concepts into the decisions reviewers will rate. Each reviewer marks every option Select, Hold or Reject; “Max approvals” is how many options the approver can approve in the area. For each option, upload the 2D image, a benchmark image to show beside it, and explain why.</p>
            ${areas.map((a, i) => areaEditor(a, i, areas.length, r))}
            <div class="add-area">
              <span class="label">Add decision area</span>
              ${Object.entries(AREA_TYPES).map(([k, l]) => html`<button class="btn btn--sm" data-action="add-area" data-id="${r.id}" data-type="${k}">${ui.icon('plus')} ${l}</button>`)}
            </div>
          </section>
          <section class="panel" id="benchmarks" aria-labelledby="h-bme">
            <header class="section-head"><h2 id="h-bme">4 · Benchmarks &amp; inspiration</h2></header>
            <p class="notice">Benchmarks are reference shoes, shown beside the Cult concepts they inform. Only use images and sources the team is allowed to use internally.</p>
            <div class="bm-edit-list">${bms.map((b) => benchmarkEditor(b, r))}</div>
            <div class="dropzone" data-drop="bench" data-id="${r.id}">
              ${ui.icon('upload')}
              <p><strong>Drop benchmark images here</strong> — each becomes a reference card.</p>
              <div class="dropzone__actions">
                <label class="btn btn--sm file-btn">Browse files<input type="file" accept="image/*" multiple data-upload="bench" data-id="${r.id}" class="sr-only"></label>
                <button class="btn btn--ghost btn--sm" data-action="add-benchmark" data-id="${r.id}">Add without image</button>
              </div>
            </div>
          </section>
        </div>
      </div>`;
  }

  CR.views = Object.assign(CR.views || {}, { editorPage });
})(window.CR);
