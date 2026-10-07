/* Dashboard, Reviews list, Final selections, Settings. */
(function (CR) {
  const { html, raw, fmtDate, plural } = CR.util;
  const { sel, ROLES } = CR.store;
  const ui = CR.ui;

  const visibleReviews = () => CR.store.state.reviews.filter((r) => CR.perm.can('view', r));
  const newReviewBtn = () => (CR.perm.can('createReview', null)
    ? html`<button class="btn btn--primary" data-action="new-review">${ui.icon('plus')} New review</button>` : '');

  function section(title, count, body, link = '') {
    return html`<section class="dash-section" aria-labelledby="h-${title.replace(/\W/g, '')}">
      <header class="section-head"><h2 id="h-${title.replace(/\W/g, '')}">${title} ${count != null ? html`<span class="count">${count}</span>` : ''}</h2>${link}</header>
      ${body}</section>`;
  }

  /** Card representing one approved option. */
  function finalCard(d, optionId) {
    const opt = sel.option(optionId); if (!opt) return '';
    const r = sel.review(d.reviewId); const a = sel.area(d.areaId);
    const t = sel.tally(d.areaId);
    const p = t.per.get(optionId) || { select: [], hold: [], reject: [] };
    const isTop = t.leaders.includes(optionId);
    const note = t.total === 0 ? 'No reviewer verdicts' : isTop ? 'Also most-selected' : 'Approved over most-selected';
    return html`<article class="fcard">
      <a class="rcard__link" href="#/review/${r.id}/summary" aria-label="${opt.name} — ${r.title} summary"></a>
      ${ui.optionMedia(opt, 'wide')}
      <div class="fcard__body">
        <div class="rcard__meta"><span class="final-tag">${ui.icon('check')} Approved</span><span class="eyebrow">${a.title}</span>${ui.demoChip(r.demo)}</div>
        <h3 class="fcard__title">${ui.optLabel(opt)} ${opt.name}</h3>
        <div class="rcard__row">${ui.swatches(opt.id)}<span class="muted small">${r.title}</span></div>
        <div class="vote-line"><span class="vtag vtag--select">${p.select.length} Select</span> <span class="vtag vtag--hold">${p.hold.length} Hold</span> <span class="vtag vtag--reject">${p.reject.length} Reject</span>
          <span class="${isTop ? 'leader-text' : 'override-text'} small"> · ${note}</span></div>
        ${d.rationale ? html`<p class="clamp-2 small">${d.rationale}</p>` : ''}
        <div class="rcard__row rcard__row--foot"><span class="small muted">Approved by</span>${ui.person(sel.user(d.decidedBy))}<span class="muted small">${fmtDate(d.decidedAt)}</span></div>
      </div>
    </article>`;
  }

  /** Short "what is this page" callout shown at the top of each main page. */
  function about(text) {
    return html`<aside class="about" aria-label="About this page">${ui.icon('flag')}<p>${text}</p></aside>`;
  }

  function welcomeCard() {
    const approver = sel.approver();
    return html`<section class="welcome" aria-labelledby="h-welcome">
      <h2 id="h-welcome">New here? This is how it works.</h2>
      <p class="lede">Designers upload 2D concepts and benchmark images for each category, reviewers mark each option <strong>Select, Hold or Reject</strong>, and ${approver ? approver.name : 'the approver'} records the final approval. Pantone and WGSN come in as one colour study per season. Nothing has been added yet — everything is empty and ready for your data.</p>
      <ol class="welcome__steps">
        ${CR.store.mode === 'shared' || CR.store.mode === 'supabase'
          ? html`<li><strong>You’re signed in</strong><span>Your name appears on everything you do.</span></li>`
          : html`<li><strong>Pick who you are</strong><span>Top right, “Viewing as”.</span></li>`}
        <li><strong>Start a review in a category</strong><span>Reviews has a slot for every category and subcategory.</span></li>
        <li><strong>Upload concepts + benchmarks</strong><span>With the reason behind each one.</span></li>
        <li><strong>Add the season’s colour study</strong><span>Pantone &amp; WGSN, then link its colours.</span></li>
      </ol>
      <div class="welcome__actions">
        <a class="btn btn--primary" href="#/guide">Read how it works</a>
        <a class="btn" href="#/reviews">Go to Reviews</a>
        <a class="btn" href="#/benchmarks">Go to Benchmarks</a>
        <a class="btn" href="#/colours">Go to Pantone &amp; WGSN</a>
      </div>
    </section>`;
  }

  function dashboard() {
    const me = CR.store.me();
    const approver = sel.approver();
    const reviews = visibleReviews();
    const needs = reviews.filter((r) => sel.needsVote(r.id, me.id)).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    const active = reviews.filter((r) => r.status === 'in_review').sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    const drafts = reviews.filter((r) => r.status === 'draft' && CR.perm.can('editReview', r));
    const completed = reviews.filter((r) => r.status === 'final').sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, 4);
    const decisions = CR.store.state.decisions.filter((d) => sel.review(d.reviewId) && CR.perm.can('view', sel.review(d.reviewId)))
      .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
    const finals = decisions.flatMap((d) => d.optionIds.map((o) => [d, o])).slice(0, 6);
    const awaiting = reviews.filter((r) => r.status !== 'draft' && sel.decisionProgress(r.id).done < sel.decisionProgress(r.id).total);
    const toApprove = CR.perm.isApprover(me) ? awaiting : [];

    const head = html`
      <div class="page-head">
        <div>
          <p class="eyebrow">Cult footwear · Design review</p>
          <h1 class="display">Hello, ${me.name}.</h1>
          <p class="lede">${needs.length ? html`You have <strong>${plural(needs.length, 'review')}</strong> waiting for your Select / Hold / Reject.` : (reviews.length ? 'You’re all caught up on reviews.' : 'Welcome — nothing has been added yet.')}
            ${toApprove.length ? html` <strong>${plural(toApprove.length, 'review')}</strong> need${toApprove.length === 1 ? 's' : ''} your approval.` : ''}
            ${!CR.perm.isApprover(me) && approver ? html` Final approval is by ${approver.name}.` : ''}</p>
        </div>
        ${newReviewBtn()}
      </div>`;
    if (!CR.store.state.reviews.length) return html`${head}${welcomeCard()}`;

    return html`
      ${head}
      <dl class="stats">
        <div><dt>Needs my review</dt><dd>${needs.length}</dd></div>
        <div><dt>In review</dt><dd>${active.length}</dd></div>
        <div><dt>Awaiting approval</dt><dd>${awaiting.length}</dd></div>
        <div><dt>Approved selections</dt><dd>${decisions.reduce((n, d) => n + d.optionIds.length, 0)}</dd></div>
      </dl>
      ${toApprove.length ? section('Needs your approval', toApprove.length, html`<div class="card-grid">${toApprove.map((r) => ui.reviewCard(r))}</div>`) : ''}
      ${section('Needs my review', needs.length, needs.length
        ? html`<div class="card-grid">${needs.map((r) => ui.reviewCard(r, { highlightVote: true }))}</div>`
        : ui.emptyState('Nothing waiting for you', 'When a designer invites you to a review that’s open, it shows up here.'))}
      ${section('Active reviews', active.length, active.length
        ? html`<div class="card-grid">${active.map((r) => ui.reviewCard(r))}</div>`
        : ui.emptyState('No reviews open for voting', 'Create a review, upload concepts and move it to In review to start collecting verdicts.', newReviewBtn()), html`<a class="link" href="#/reviews">All reviews →</a>`)}
      ${drafts.length ? section('Drafts', drafts.length, html`<div class="card-grid">${drafts.map((r) => ui.reviewCard(r))}</div>`) : ''}
      ${section('Recently completed', null, completed.length
        ? html`<div class="card-grid">${completed.map((r) => ui.reviewCard(r))}</div>`
        : ui.emptyState('No completed reviews yet', 'Reviews appear here once they reach Final decision.'))}
      ${section('Latest approved selections', null, finals.length
        ? html`<div class="card-grid card-grid--finals">${finals.map(([d, o]) => finalCard(d, o))}</div>`
        : ui.emptyState('Nothing approved yet', `${approver ? approver.name : 'The approver'} records approvals on each review.`), html`<a class="link" href="#/finals">Browse all →</a>`)}
    `;
  }

  function reviewsPage() {
    const st = CR.store.state;
    const f = CR.app.filters('reviews');
    const visible = visibleReviews();
    const list = ui.applyFilters(visible, f).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const canCreate = CR.perm.can('createReview', null);
    const count = (c, s) => visible.filter((r) => r.categoryId === c && (!s || r.subcategoryId === s)).length;
    const filtering = Object.values(f).some(Boolean);
    return html`
      <div class="page-head"><div><p class="eyebrow">By category</p><h1 class="display display--sm">Reviews</h1></div>${newReviewBtn()}</div>
      ${about(html`Each <strong>review</strong> is one shoe or project for one season, with its 2D concepts, benchmarks, reasons and reviewer verdicts. Start a review in the category it belongs to — pick the slot below. ${canCreate ? '' : html`Only designers and the approver can start reviews; you can switch person at the top right.`}`)}

      <div class="slot-grid" aria-label="Start or browse a review by category">
        ${st.categories.map((c) => html`<section class="catpanel" aria-labelledby="cp-${c.id}">
          <header class="catpanel__head"><h2 id="cp-${c.id}">${c.name}</h2><span class="count" title="Reviews in ${c.name}">${count(c.id)}</span></header>
          <ul class="slot-list">${c.subcategories.map((s) => { const n = count(c.id, s.id); return html`<li class="slot ${n ? '' : 'slot--empty'}">
            <button class="slot__name ${f.category === c.id && f.sub === s.id ? 'is-on' : ''}" data-action="rev-sub" data-cat="${c.id}" data-sub="${s.id}" ${n ? '' : raw('disabled')} aria-label="${n ? 'Show' : 'No'} ${s.name} reviews in ${c.name}${n ? ' (' + n + ')' : ''}">
              <span>${s.name}</span><span class="slot__n">${n ? plural(n, 'review') : 'Empty'}</span></button>
            ${canCreate ? html`<button class="btn btn--sm" data-action="new-review" data-cat="${c.id}" data-sub="${s.id}" aria-label="New review in ${c.name}, ${s.name}">${ui.icon('plus')} New review</button>` : ''}
          </li>`; })}</ul>
        </section>`)}
      </div>

      <h2 class="section-title">${filtering ? 'Matching reviews' : 'All reviews'}</h2>
      ${ui.filterBar('reviews', f, ['category', 'season', 'status', 'designer'])}
      <p class="muted small" role="status">${plural(list.length, 'review')}</p>
      ${list.length ? html`<div class="card-grid">${list.map((r) => ui.reviewCard(r))}</div>`
        : (visible.length ? ui.emptyState('No reviews match these filters', 'Try clearing a filter or searching for a different model.')
          : ui.emptyState('No reviews yet', 'Pick a category slot above and choose “New review” to upload the first set of concepts.'))}
    `;
  }

  const TYPE_TABS = [['', 'All'], ['overall', 'Design'], ['colourway', 'Colour'], ['sole', 'Sole'], ['upper', 'Upper'], ['materials', 'Materials & detailing'], ['other', 'Other']];

  /** Card for an option that is currently most-selected by reviewers but not yet approved. */
  function leadCard(r, a, optionId) {
    const opt = sel.option(optionId); if (!opt) return '';
    const t = sel.tally(a.id);
    const p = t.per.get(optionId);
    return html`<article class="fcard fcard--lead">
      <a class="rcard__link" href="#/review/${r.id}" aria-label="${opt.name} — ${r.title}"></a>
      ${ui.optionMedia(opt, 'wide')}
      <div class="fcard__body">
        <div class="rcard__meta"><span class="leader-tag">${ui.icon('star')} ${t.leaders.length > 1 ? 'Tied most-selected' : 'Most selected'}</span><span class="eyebrow">${a.title}</span>${ui.demoChip(r.demo)}</div>
        <h3 class="fcard__title">${ui.optLabel(opt)} ${opt.name}</h3>
        <div class="rcard__row">${ui.swatches(opt.id)}<span class="muted small">${r.title}</span></div>
        <div class="vote-line"><span class="vtag vtag--select">${p.select.length} Select</span> <span class="vtag vtag--hold">${p.hold.length} Hold</span> <span class="vtag vtag--reject">${p.reject.length} Reject</span></div>
        <p class="small muted">${r.status === 'final' ? 'Voting closed' : 'Voting open'} · not yet approved${sel.approver() ? ` by ${sel.approver().name}` : ''}</p>
        <div class="rcard__row rcard__row--foot">${ui.person(sel.user(r.ownerId))}<span class="muted small">${plural(t.reviewers, 'reviewer')} so far</span></div>
      </div>
    </article>`;
  }

  function finalsPage() {
    const st = CR.store.state;
    const f = CR.app.filters('finals');
    const view = f.view || 'approved';
    const type = f.area || '';
    const reviews = ui.applyFilters(visibleReviews(), f);
    const entries = [];
    reviews.forEach((r) => sel.areas(r.id).forEach((a) => {
      const d = sel.decision(a.id);
      if (view === 'approved') { if (d) d.optionIds.forEach((o) => entries.push({ r, a, d, o })); }
      else if (!d && r.status !== 'draft') { const t = sel.tally(a.id); if (t.max > 0) t.leaders.forEach((o) => entries.push({ r, a, d: null, o })); }
    }));
    const shown = entries.filter((e) => !type || e.a.type === type);
    const groups = [...new Set(shown.map((e) => e.r))]
      .sort((x, y) => (y.closedAt || y.updatedAt).localeCompare(x.closedAt || x.updatedAt))
      .map((r) => ({ r, items: shown.filter((e) => e.r === r).sort((x, y) => x.a.order - y.a.order) }));
    const count = (t) => entries.filter((e) => !t || e.a.type === t).length;
    const approver = sel.approver();

    return html`
      <div class="page-head"><div><p class="eyebrow">Record of decisions</p><h1 class="display display--sm">Selections</h1>
        <p class="lede">${view === 'approved'
          ? `What ${approver ? approver.name : 'the approver'} approved — design, colour, sole, upper and detailing — with the reviewers’ Select / Hold / Reject result and the rationale.`
          : 'What reviewers are currently selecting most in open reviews. This is advisory — nothing here is approved until the approver records it.'}</p></div></div>
      <div class="season-bar" role="group" aria-label="View">
        <button class="season-tab ${view === 'approved' ? 'is-on' : ''}" aria-pressed="${view === 'approved'}" data-action="finals-view" data-id="approved">${ui.icon('check')} Approved</button>
        <button class="season-tab ${view === 'leading' ? 'is-on' : ''}" aria-pressed="${view === 'leading'}" data-action="finals-view" data-id="leading">${ui.icon('star')} Most selected (not yet approved)</button>
      </div>
      <div class="sub-tabs" role="group" aria-label="Type of selection">
        ${TYPE_TABS.map(([k, l]) => html`<button class="season-tab ${type === k ? 'is-on' : ''}" aria-pressed="${type === k}" data-action="finals-type" data-id="${k}">${l} <span class="count">${count(k)}</span></button>`)}
      </div>
      ${about(html`Nothing is uploaded on this page — it <strong>fills itself</strong> from reviews. When ${approver ? approver.name : 'the approver'} approves an option in a review it appears here under its category; “Most selected” shows what reviewers are leaning towards before that. Use the tabs to look at design, colour, sole or upper selections.`)}
      ${ui.filterBar('finals', f, ['category', 'season', 'designer'])}
      ${(f.category ? st.categories.filter((c) => c.id === f.category) : st.categories).map((c) => {
        const catGroups = groups.filter((g) => g.r.categoryId === c.id);
        const n = catGroups.reduce((k, g) => k + g.items.length, 0);
        return html`<section class="cat-section" aria-labelledby="fc-${c.id}">
          <header class="section-head cat-section__head"><h2 id="fc-${c.id}">${c.name} <span class="count">${n}</span></h2>
            <span class="muted small">${c.subcategories.map((s) => s.name).join(' · ')}</span></header>
          ${catGroups.length ? catGroups.map(({ r, items }) => html`
            <div class="final-group">
              <header class="section-head">
                <div><p class="eyebrow">${sel.categoryPath(r).text}${r.season ? ' · ' + r.season : ''} · ${sel.user(r.ownerId)?.name}</p>
                  <h3 class="group-title"><a class="link-plain" href="#/review/${r.id}/summary">${r.title}</a> ${ui.statusPill(r.status)} ${ui.demoChip(r.demo)}</h3></div>
                <a class="link" href="#/review/${r.id}${view === 'approved' ? '/summary' : ''}">${view === 'approved' ? 'Summary' : 'Open review'} →</a>
              </header>
              <div class="card-grid card-grid--finals">${items.map((e) => (view === 'approved' ? finalCard(e.d, e.o) : leadCard(e.r, e.a, e.o)))}</div>
            </div>`)
            : html`<div class="slot-empty"><p><strong>${view === 'approved' ? `No approved ${type ? TYPE_TABS.find((t) => t[0] === type)[1].toLowerCase() + ' ' : ''}selections in ${c.name} yet.` : `Nothing is leading in ${c.name} yet.`}</strong>
              ${view === 'approved' ? ' They appear here once the approver approves an option in a review.' : ' Options appear here once reviewers start marking Select in an open review.'}</p>
              ${CR.perm.can('createReview', null) ? html`<button class="btn btn--sm" data-action="new-review" data-cat="${c.id}">${ui.icon('plus')} Start a ${c.name} review</button>` : ''}</div>`}
        </section>`;
      })}
    `;
  }

  function settingsPage() {
    const st = CR.store.state;
    const canManage = CR.perm.can('manageSettings', null);
    const dis = canManage ? '' : raw('disabled');
    const used = (catId, subId) => st.reviews.some((r) => r.categoryId === catId && (!subId || r.subcategoryId === subId));
    const me = CR.store.me();
    const shared = CR.store.mode === 'shared';
    const hosted = CR.store.mode === 'supabase';
    const roleOpts = Object.entries(ROLES).filter(([k]) => k !== 'member');
    return html`
      <div class="page-head"><div><p class="eyebrow">Workspace</p><h1 class="display display--sm">Settings</h1>
        <p class="lede">People, roles and categories.${canManage ? '' : html` <strong>Only designers and the approver can change settings.</strong>`}</p></div></div>

      ${shared ? html`<section class="panel" aria-labelledby="h-people">
        <header class="section-head"><h2 id="h-people">People &amp; roles</h2></header>
        <p class="notice">People are the real claude.ai accounts that open this page — nobody is added by hand. <strong>Designers</strong> are people shared on the page as <em>Editor</em> (they create reviews and upload concepts, benchmarks and colour studies). <strong>Reviewers</strong> are people shared as <em>Contributor</em> (they give Select / Hold / Reject and comment). Choose the <strong>approver</strong> below; they also need <em>Editor</em> access so their approval can be saved.</p>
        <label class="field field--approver"><span class="field__label">Approver — records the final approval</span>
          <select id="approver-select" data-approver ${dis}><option value="">Not chosen yet</option>${st.users.map((u) => html`<option value="${u.id}" ${u.id === st.meta.approverId ? raw('selected') : ''}>${u.name}</option>`)}</select></label>
        <table class="table">
          <thead><tr><th scope="col">Person</th><th scope="col">Role here</th></tr></thead>
          <tbody>${st.users.map((u) => html`<tr><td>${ui.person(u)}</td><td>${u.id === me.id ? ROLES[u.role] + ' (you)' : (u.role === 'approver' ? 'Approver' : 'Team member')}</td></tr>`)}</tbody>
        </table>
        <p class="small muted">Someone appears here after they open the page once. To add a person, share the page with them from its Share menu on claude.ai, then ask them to open it.</p>
      </section>` : ''}

      ${!shared ? html`<section class="panel" aria-labelledby="h-people">
        <header class="section-head"><h2 id="h-people">People &amp; roles</h2></header>
        <p class="notice">${hosted
          ? html`${st.meta.openJoin ? html`Anyone you share the link with can sign in with their email and joins as a <strong>Reviewer</strong>.` : html`Only people added below can sign in.`} Change someone to <strong>Designer</strong> or <strong>Approver</strong> here, or add a person by email before they first sign in.`
          : html`There’s no sign-in yet. For now, each person picks their own name from <strong>Viewing as</strong> in the header (or adds themselves).`} <strong>Designer</strong>: creates reviews and uploads concepts, benchmarks and WGSN / Pantone data. <strong>Reviewer</strong>: marks each option Select, Hold or Reject. <strong>Approver</strong>: records the final approval (Sumant).</p>
        <table class="table">
          <thead><tr><th scope="col">Person</th><th scope="col">Name</th><th scope="col">Role</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>${st.users.map((u) => html`<tr>
            <td>${ui.person(u)} ${u.demo ? ui.demoChip(true) : ''}${hosted ? html`<br><span class="small muted">${u.id}</span>` : ''}</td>
            <td><input value="${u.name}" data-user-name="${u.id}" id="un-${u.id}" aria-label="Name" ${dis}></td>
            <td><select data-user-role="${u.id}" aria-label="Role for ${u.name}" ${dis}>${roleOpts.map(([k, l]) => html`<option value="${k}" ${u.role === k ? raw('selected') : ''}>${l}</option>`)}</select></td>
            <td>${canManage && u.id !== me.id ? html`<button class="icon-btn icon-btn--sm" data-action="remove-user" data-id="${u.id}" aria-label="Remove ${u.name}">${ui.icon('trash')}</button>` : ''}</td>
          </tr>`)}</tbody>
        </table>
        ${canManage ? html`<form class="inline-form" data-form="user-add">
          ${hosted ? html`<label class="field"><span class="field__label">Email</span><input name="email" type="email" required id="nu-email" placeholder="name@company.com"></label>` : ''}
          <label class="field"><span class="field__label">Name</span><input name="name" ${hosted ? '' : raw('required')} id="nu-name"></label>
          <label class="field"><span class="field__label">Role</span><select name="role" id="nu-role">${roleOpts.map(([k, l]) => html`<option value="${k}" ${k === 'reviewer' ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <button class="btn">${ui.icon('plus')} Add person</button></form>` : ''}
        ${hosted && canManage ? html`<label class="check check--row open-join"><input type="checkbox" id="open-join" data-open-join ${st.meta.openJoin ? raw('checked') : ''}>
          <span><strong>Anyone I share the link with can join.</strong> <span class="small muted">When on, anyone who signs in with an email address joins as a Reviewer and can see every review. Turn it off to allow only the people listed above.</span></span></label>` : ''}
      </section>` : ''}

      <section class="panel" aria-labelledby="h-cats">
        <header class="section-head"><h2 id="h-cats">Categories &amp; subcategories</h2></header>
        <p class="muted small">Seeded from the team’s category list. Rename, extend or remove — categories in use by a review can’t be deleted.</p>
        <div class="cat-list">
          ${st.categories.map((c, ci) => html`<div class="cat-row">
            <label class="field"><span class="field__label">Category</span>
              <input value="${c.name}" data-cat-name="${ci}" ${dis} aria-label="Category name"></label>
            <div class="cat-subs" role="list" aria-label="${c.name} subcategories">
              ${c.subcategories.map((s, si) => html`<span class="sub-chip" role="listitem">
                <input value="${s.name}" data-sub-name="${ci}:${si}" aria-label="Subcategory name" size="${Math.max(4, s.name.length)}" ${dis}>
                ${canManage && !used(c.id, s.id) ? html`<button class="icon-btn icon-btn--sm" data-action="cat-remove-sub" data-ci="${ci}" data-si="${si}" aria-label="Remove ${s.name}">${ui.icon('x')}</button>` : ''}
              </span>`)}
              ${canManage ? html`<form class="sub-add" data-form="cat-add-sub" data-ci="${ci}"><input name="name" placeholder="Add subcategory" aria-label="Add subcategory to ${c.name}"><button class="btn btn--sm">Add</button></form>` : ''}
            </div>
            ${canManage && !used(c.id) ? html`<button class="btn btn--ghost btn--sm" data-action="cat-remove" data-ci="${ci}">Delete</button>` : html`<span></span>`}
          </div>`)}
        </div>
        ${canManage ? html`<form class="inline-form" data-form="cat-add"><label class="field"><span class="field__label">New category</span><input name="name" required placeholder="e.g. Kids"></label><button class="btn">${ui.icon('plus')} Add category</button></form>` : ''}
      </section>

      ${shared ? html`<section class="panel" aria-labelledby="h-data">
        <header class="section-head"><h2 id="h-data">Where the data lives</h2></header>
        <p class="muted">Reviews, verdicts, comments, approvals and images are saved in this page’s shared storage on claude.ai, so everyone with access sees the same thing and changes appear live. Access is controlled by who the page is shared with.</p>
      </section>` : html`<section class="panel" aria-labelledby="h-data">
        <header class="section-head"><h2 id="h-data">${hosted ? 'Where the data lives' : 'Prototype data'}</h2></header>
        ${hosted ? html`<p class="muted">Everything is saved in the team’s shared database, so everyone sees the same reviews, verdicts, approvals and images, live.</p>` : html`
        <p class="muted">Reviews, verdicts and uploaded images are stored only in this browser (localStorage + IndexedDB). Nothing is sent to a server. Clearing site data removes them.</p>
        <button class="btn btn--danger" data-action="reset-demo">Reset everything</button>`}
      </section>`}
    `;
  }

  CR.ui.about = about;
  CR.views = Object.assign(CR.views || {}, { dashboard, reviewsPage, finalsPage, settingsPage, finalCard });
})(window.CR);
