/*
 * Benchmark shoes, browsed by the team's category / subcategory structure.
 * A benchmark is a reference shoe from another brand — never a Cult option. Each one records what it informs,
 * its colours (with Pantone / WGSN references), and which Cult designs it inspired.
 */
(function (CR) {
  const { html, raw, pad2, plural, isSafeUrl, hostOf } = CR.util;
  const { sel, INSPIRATION_TAGS } = CR.store;
  const ui = CR.ui;

  const catOf = (b) => sel.benchmarkCategory(b);

  function inspiredList(b) {
    const opts = sel.inspiredOptions(b);
    if (!opts.length) return html`<p class="small muted">No Cult design is linked to this benchmark yet. Link it from an option in a review (Edit).</p>`;
    return html`<ul class="insp-list">${opts.map((o) => {
      const r = sel.review(o.reviewId); const a = sel.area(o.areaId);
      return html`<li><button class="insp" data-action="open-option" data-id="${o.id}" aria-label="Open ${o.name} in ${r ? r.title : 'review'}">
        <span class="insp__img">${ui.optionMedia(o, 'wide')}</span>
        <span class="insp__text"><strong>${ui.optLabel(o)} ${o.name}</strong>
          <span class="small muted">${a ? a.title : ''} · ${r ? r.title : ''}</span>
          ${sel.isApproved(o.id) ? html`<span class="final-tag final-tag--sm">Approved</span>` : ''}</span></button></li>`;
    })}</ul>`;
  }

  function readCard(b) {
    const { categoryId, subcategoryId } = catOf(b);
    const cat = sel.category(categoryId); const sub = cat && cat.subcategories.find((s) => s.id === subcategoryId);
    const r = b.reviewId ? sel.review(b.reviewId) : null;
    const editable = CR.perm.can('manageLibrary', null);
    return html`<article class="bcard bcard--lib">
      <p class="bcard__ribbon">Benchmark · reference only${b.isPlaceholder ? ' · placeholder' : ''}</p>
      ${ui.media(b.imageRef, `${b.brand} ${b.name}`.trim() || 'Benchmark', { kind: 'benchmark', ratio: 'wide' })}
      <div class="bcard__body">
        <p class="rcard__meta"><span class="eyebrow">${[cat && cat.name, sub && sub.name].filter(Boolean).join(' › ') || 'Uncategorised'}</span>${r ? html`<a class="chip" href="#/review/${r.id}">From review: ${r.title}</a>` : ''}</p>
        <h3 class="bcard__title">${b.brand ? html`<span class="muted">${b.brand}</span> ` : ''}${b.name || 'Untitled reference'}</h3>
        ${b.tags && b.tags.length ? html`<p class="small"><span class="muted">Informs</span> ${ui.tags(b.tags)}</p>` : ''}
        ${b.note ? html`<p class="small">${b.note}</p>` : ''}
        ${b.sourceUrl ? (isSafeUrl(b.sourceUrl)
          ? html`<p class="small"><a class="link" href="${b.sourceUrl}" target="_blank" rel="noopener noreferrer">${ui.icon('link')} ${hostOf(b.sourceUrl)}<span class="sr-only"> (opens in new tab)</span></a></p>`
          : html`<p class="small muted">Source: ${b.sourceUrl}</p>`) : ''}
        <h4 class="label">Colours</h4>${CR.library.benchColours(b)}
        <h4 class="label">Cult designs it inspired</h4>${inspiredList(b)}
        ${editable ? html`<div class="rcard__row rcard__row--foot"><button class="btn btn--sm" data-action="bench-edit" data-id="${b.id}">${ui.icon('edit')} Edit</button></div>` : ''}
      </div>
    </article>`;
  }

  function editCard(b) {
    const { categoryId, subcategoryId } = catOf(b);
    const cats = CR.store.state.categories;
    const cat = sel.category(categoryId);
    const r = b.reviewId ? sel.review(b.reviewId) : null;
    return html`<article class="bcard bcard--lib bcard--edit">
      <p class="bcard__ribbon">Editing benchmark${r ? ` · from review “${r.title}”` : ''}</p>
      ${ui.media(b.imageRef, `${b.brand} ${b.name}`.trim() || 'Benchmark', { kind: 'benchmark', ratio: 'wide' })}
      <div class="bcard__body">
        <div class="lcard__tools">
          <label class="btn btn--sm file-btn">${ui.icon('upload')} ${b.imageRef ? 'Replace image' : 'Upload image'}
            <input type="file" accept="image/*" class="sr-only" data-upload="bench-image" data-id="${b.id}"></label>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--primary" data-action="bench-edit" data-id="${b.id}">Done</button>
        </div>
        <div class="form-grid form-grid--tight">
          <label class="field"><span class="field__label">Brand</span><input value="${b.brand}" data-bm-field="brand" data-id="${b.id}" id="lbb-${b.id}"></label>
          <label class="field"><span class="field__label">Shoe name</span><input value="${b.name}" data-bm-field="name" data-id="${b.id}" id="lbn-${b.id}"></label>
          <label class="field"><span class="field__label">Category</span>
            <select data-bm-cat="${b.id}" id="lbc-${b.id}">${cats.map((c) => html`<option value="${c.id}" ${c.id === categoryId ? raw('selected') : ''}>${c.name}</option>`)}</select></label>
          <label class="field"><span class="field__label">Subcategory</span>
            <select data-bm-sub="${b.id}" id="lbs-${b.id}">${(cat ? cat.subcategories : []).map((s) => html`<option value="${s.id}" ${s.id === subcategoryId ? raw('selected') : ''}>${s.name}</option>`)}</select></label>
          <label class="field field--span2"><span class="field__label">Source link or note</span><input value="${b.sourceUrl}" data-bm-field="sourceUrl" data-id="${b.id}" id="lbu-${b.id}" placeholder="https://… (product page, article, photo source)"></label>
          <label class="field field--span2"><span class="field__label">What it informs, and why</span><textarea rows="3" data-bm-field="note" data-id="${b.id}" id="lbnote-${b.id}">${b.note}</textarea></label>
        </div>
        <fieldset class="checks"><legend class="label">Inspiration tags</legend>
          ${INSPIRATION_TAGS.map((t) => html`<label class="check"><input type="checkbox" data-bm-tag="${t}" data-id="${b.id}" ${b.tags.includes(t) ? raw('checked') : ''}> ${t}</label>`)}
        </fieldset>
        ${CR.library.benchColourEditor(b, r ? r.season : '')}
        <h4 class="label">Cult designs it inspired</h4>${inspiredList(b)}
        <button class="btn btn--ghost btn--sm" data-action="remove-benchmark" data-id="${b.id}">${ui.icon('trash')} Delete benchmark</button>
      </div>
    </article>`;
  }

  function benchmarksPage() {
    const st = CR.store.state;
    const B = CR.app.ui.bench;
    const editable = CR.perm.can('manageLibrary', null);
    const all = sel.allBenchmarks();
    const q = (B.q || '').toLowerCase();
    const matchBase = (b) => (!B.tag || (b.tags || []).includes(B.tag)) && (!q || `${b.brand} ${b.name} ${b.note}`.toLowerCase().includes(q));
    const inCat = (b, c) => catOf(b).categoryId === c;
    const list = all.filter((b) => matchBase(b) && (!B.category || inCat(b, B.category)) && (!B.sub || catOf(b).subcategoryId === B.sub))
      .sort((a, b2) => st.categories.findIndex((c) => c.id === catOf(a).categoryId) - st.categories.findIndex((c) => c.id === catOf(b2).categoryId) || (a.brand + a.name).localeCompare(b2.brand + b2.name));
    const cat = sel.category(B.category);
    const dropCat = B.category || (st.categories[0] || {}).id || '';
    const dropSub = B.sub || (cat && cat.subcategories[0] ? cat.subcategories[0].id : '');

    return html`
      <div class="page-head"><div><p class="eyebrow">Reference shoes · by category</p><h1 class="display display--sm">Benchmarks</h1>
        <p class="lede">The shoes our designs are inspired by — what each one informs, its colours with Pantone and WGSN references, and which Cult designs it led to.</p></div>
        ${editable ? html`<button class="btn btn--primary" data-action="add-bench-lib">${ui.icon('plus')} Add benchmark</button>` : ''}</div>
      ${ui.about(html`A <strong>benchmark</strong> is a reference shoe from another brand that inspired a Cult design. File it under the category it belongs to: upload its image, note what it informs (silhouette, construction, sole, colour, materials, detailing), record its colours with Pantone / WGSN, and link it to the Cult design it inspired. Benchmarks are <strong>references, not Cult options</strong> and can’t be voted on. Add only images and sources your team can use internally.`)}

      <div class="cat-tiles" role="group" aria-label="Category">
        <button class="cat-tile ${!B.category ? 'is-on' : ''}" aria-pressed="${!B.category}" data-action="bench-cat" data-id=""><span>All shoes</span><span class="count">${all.filter(matchBase).length}</span></button>
        ${st.categories.map((c) => html`<button class="cat-tile ${B.category === c.id ? 'is-on' : ''}" aria-pressed="${B.category === c.id}" data-action="bench-cat" data-id="${c.id}"><span>${c.name}</span><span class="count">${all.filter((b) => matchBase(b) && inCat(b, c.id)).length}</span></button>`)}
      </div>
      ${cat ? html`<div class="sub-tabs" role="group" aria-label="${cat.name} subcategory">
        <button class="season-tab ${!B.sub ? 'is-on' : ''}" aria-pressed="${!B.sub}" data-action="bench-sub" data-id="">All ${cat.name}</button>
        ${cat.subcategories.map((s) => html`<button class="season-tab ${B.sub === s.id ? 'is-on' : ''}" aria-pressed="${B.sub === s.id}" data-action="bench-sub" data-id="${s.id}">${s.name} <span class="count">${all.filter((b) => matchBase(b) && inCat(b, cat.id) && catOf(b).subcategoryId === s.id).length}</span></button>`)}
      </div>` : ''}

      <form class="filters" role="search">
        <label class="field field--search"><span class="sr-only">Search benchmarks</span>
          <input type="search" id="bench-q" placeholder="Search brand, shoe or note" value="${B.q || ''}" data-bench-q></label>
        <label class="field"><span class="sr-only">Informs</span>
          <select id="bench-tag" data-bench-tag><option value="">Informs: anything</option>${INSPIRATION_TAGS.map((t) => html`<option value="${t}" ${B.tag === t ? raw('selected') : ''}>Informs: ${t}</option>`)}</select></label>
        ${B.tag || B.q ? html`<button type="button" class="btn btn--ghost btn--sm" data-action="bench-clear">Clear</button>` : ''}
        <span class="muted small" role="status">${plural(list.length, 'benchmark')}${cat ? ` in ${cat.name}${B.sub ? ' › ' + cat.subcategories.find((s) => s.id === B.sub)?.name : ''}` : ''}</span>
      </form>

      <h2 class="section-title">${editable ? 'Add benchmarks by category' : 'Categories'}</h2>
      <p class="muted small">${editable ? 'Each line below is a place to upload. Drag shoe images onto a subcategory, or press Upload — every image becomes a benchmark card in that subcategory.' : 'Reference shoes are filed under these categories.'}</p>
      <div class="slot-grid slot-grid--bench">
        ${(cat ? [cat] : st.categories).map((c) => html`<section class="catpanel" aria-labelledby="bp-${c.id}">
          <header class="catpanel__head"><h3 id="bp-${c.id}">${c.name}</h3><span class="count">${all.filter((b) => inCat(b, c.id)).length}</span></header>
          <ul class="slot-list">${c.subcategories.map((s) => { const n = all.filter((b) => inCat(b, c.id) && catOf(b).subcategoryId === s.id).length; return html`<li class="slot ${n ? '' : 'slot--empty'}" ${editable ? raw(`data-drop="bench-lib" data-id="${c.id}|${s.id}"`) : ''}>
            <button class="slot__name ${B.category === c.id && B.sub === s.id ? 'is-on' : ''}" data-action="bench-slot" data-cat="${c.id}" data-sub="${s.id}"><span>${s.name}</span><span class="slot__n">${n ? plural(n, 'benchmark') : 'Empty'}</span></button>
            ${editable ? html`<label class="btn btn--sm file-btn">${ui.icon('upload')} Upload<input type="file" accept="image/*" multiple data-upload="bench-lib" data-id="${c.id}|${s.id}" class="sr-only" aria-label="Upload benchmark images for ${c.name}, ${s.name}"></label>` : ''}
          </li>`; })}</ul>
        </section>`)}
      </div>

      <h2 class="section-title">${cat ? `${cat.name}${B.sub ? ' › ' + cat.subcategories.find((s) => s.id === B.sub)?.name : ''} benchmarks` : 'All benchmarks'}</h2>

      ${list.length ? html`<div class="bench-grid bench-grid--lib">${list.map((b) => (CR.app.ui.benchEditing.has(b.id) && editable ? editCard(b) : readCard(b)))}</div>`
        : ui.emptyState('No benchmarks here yet', editable ? 'Upload a reference shoe image, then add its brand, what it informs and its colours.' : 'A designer adds reference shoes for each category here.',
          editable ? html`<button class="btn" data-action="add-bench-lib">${ui.icon('plus')} Add benchmark</button>` : '')}
    `;
  }

  CR.views = Object.assign(CR.views || {}, { benchmarksPage });
  void pad2;
})(window.CR);
