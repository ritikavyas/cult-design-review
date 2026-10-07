/* Review detail, approval summary, and the review modals (option detail, compare, approve, share). */
(function (CR) {
  const { html, raw, fmtDate, relTime, pad2, plural, isSafeUrl, hostOf } = CR.util;
  const { sel, AREA_TYPES, WHY_LABEL, STATUS, VERDICTS, VERDICT_LABEL } = CR.store;
  const ui = CR.ui;

  const STATUS_HINT = {
    invited: 'Invited — hasn’t opened the review',
    pending: 'Started — not every option reviewed',
    completed: 'Reviewed every option',
  };

  function notFound() {
    return ui.emptyState('Review not found', 'It may have been deleted, or the demo data was reset.', html`<a class="btn" href="#/">Back to dashboard</a>`);
  }

  function stepper(status) {
    const steps = ['draft', 'in_review', 'final'];
    const cur = steps.indexOf(status);
    return html`<ol class="stepper" aria-label="Review stage">${steps.map((s, i) => html`
      <li class="${i < cur ? 'is-done' : i === cur ? 'is-current' : ''}" ${i === cur ? raw('aria-current="step"') : ''}>
        <span class="stepper__dot">${i < cur ? ui.icon('check') : i + 1}</span>${STATUS[s]}</li>`)}</ol>`;
  }

  function statusActions(r) {
    if (!CR.perm.can('changeStatus', r)) return '';
    if (r.status === 'draft') return html`<button class="btn btn--primary" data-action="set-status" data-id="${r.id}" data-status="in_review">Open for review</button>`;
    if (r.status === 'in_review') return html`<button class="btn btn--primary" data-action="set-status" data-id="${r.id}" data-status="final">Close voting</button>`;
    return html`<button class="btn" data-action="set-status" data-id="${r.id}" data-status="in_review">Reopen voting</button>`;
  }

  function reviewHeader(r, { summary = false } = {}) {
    const path = sel.categoryPath(r);
    const approver = sel.approver();
    return html`<header class="review-head">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/reviews">Reviews</a><span aria-hidden="true">/</span>
        ${summary ? html`<a href="#/review/${r.id}">${r.title}</a><span aria-hidden="true">/</span><span aria-current="page">Approval summary</span>` : html`<span aria-current="page">${r.title}</span>`}</nav>
      <div class="review-head__top">
        <div class="review-head__titles">
          <p class="eyebrow">${path.text}${r.season ? ' · ' + r.season : ''}${r.model ? ' · ' + r.model : ''} ${ui.demoChip(r.demo)}</p>
          <h1 class="display display--sm">${summary ? 'Approval summary — ' : ''}${r.title}</h1>
          <div class="meta-row">
            <span>Designer ${ui.person(sel.user(r.ownerId))}</span>
            ${approver ? html`<span>Approver ${ui.person(approver)}</span>` : ''}
            ${ui.due(r)}
          </div>
        </div>
        <div class="review-head__actions">
          ${summary
            ? html`${CR.store.mode === 'shared' ? '' : html`<button class="btn" data-action="print">${ui.icon('print')} Print / PDF</button>`}<a class="btn" href="#/review/${r.id}">Back to review</a>`
            : html`
              ${CR.perm.can('share', r) ? html`<button class="btn" data-action="open-share" data-id="${r.id}">${ui.icon('share')} Reviewers</button>` : ''}
              ${CR.perm.can('editReview', r) ? html`<a class="btn" href="#/review/${r.id}/edit">${ui.icon('edit')} Edit</a>` : ''}
              <a class="btn" href="#/review/${r.id}/summary">Approval summary</a>
              ${statusActions(r)}`}
        </div>
      </div>
      ${stepper(r.status)}
    </header>`;
  }

  // ───────────────────────── verdict controls ─────────────────────────

  function verdictControl(r, opt, { lg = false } = {}) {
    if (!CR.perm.can('vote', r)) return '';
    const mine = sel.myVerdict(opt.id, CR.store.me().id);
    return html`<div class="vgroup ${lg ? 'vgroup--lg' : ''}" role="group" aria-label="Your verdict on option ${sel.optionNumber(opt)}, ${opt.name}">
      ${VERDICTS.map((v) => html`<button class="vbtn vbtn--${v} ${mine && mine.verdict === v ? 'is-on' : ''}" aria-pressed="${mine && mine.verdict === v ? 'true' : 'false'}"
        data-action="verdict" data-opt="${opt.id}" data-verdict="${v}" id="v-${opt.id}-${v}${lg ? '-m' : ''}">${ui.verdictIcon(v)} ${VERDICT_LABEL[v]}</button>`)}
    </div>`;
  }

  function verdictTally(per) {
    return html`<ul class="vtally">${VERDICTS.map((v) => html`<li class="vtally__row vtally__row--${v}">
      <span class="vtally__k">${ui.verdictIcon(v)} ${VERDICT_LABEL[v]}</span><strong class="vtally__n">${per[v].length}</strong>${per[v].length ? ui.avatarStack(per[v], 5) : ''}</li>`)}</ul>`;
  }

  function myVerdictTag(r, opt) {
    const mine = sel.myVerdict(opt.id, CR.store.me().id);
    if (!mine) return '';
    return html`<span class="vtag vtag--${mine.verdict}">You: ${VERDICT_LABEL[mine.verdict]}</span>`;
  }

  // ───────────────────────── benchmark + concept pair ─────────────────────────

  function benchFig(b, extra = 0) {
    if (!b) {
      return html`<figure class="pair__item pair__item--bench pair__item--none">
        <figcaption class="cmp-label cmp-label--bench">Benchmark · reference only</figcaption>
        <div class="media media--wide media--bench"><span>No benchmark linked<br><small>The designer can add one in Edit</small></span></div>
      </figure>`;
    }
    return html`<figure class="pair__item pair__item--bench">
      <figcaption class="cmp-label cmp-label--bench">Benchmark · reference only${b.isPlaceholder ? ' · placeholder' : ''}</figcaption>
      ${ui.media(b.imageRef, `${b.brand} ${b.name}`.trim() || 'Benchmark', { kind: 'benchmark', ratio: 'wide' })}
      <p class="pair__cap small"><strong>${[b.brand, b.name].filter(Boolean).join(' ') || 'Untitled reference'}</strong>${b.tags && b.tags.length ? html` · informs ${b.tags.join(', ')}` : ''}${extra ? html` <span class="chip">+${extra} more</span>` : ''}</p>
    </figure>`;
  }

  function colourLines(opt) {
    const cols = sel.colours(opt.id);
    if (!cols.length) return '';
    return html`<ul class="colour-lines">${cols.map((c) => {
      const refs = (c.refIds || []).map(sel.colourRef).filter(Boolean);
      return html`<li><span class="swatch" style="background:${c.hex}"></span>
        <span><strong>${c.part}:</strong> ${c.name || 'Unnamed'}${c.pantone ? html` · Pantone ${c.pantone}` : ''}${c.wgsn ? html` · WGSN ${c.wgsn}` : ''}${refs.length ? html`<span class="ref-chips">${refs.map((x) => CR.library.refChip(x))}</span>` : ''}</span></li>`;
    })}</ul>`;
  }

  function whyBlock(r, a, opt) {
    return html`<div class="why">
      <p class="why__label">${WHY_LABEL[a.type] || 'Why this option'}</p>
      ${opt.rationale ? html`<p class="why__text">${opt.rationale}</p>`
        : html`<p class="why__text why__text--empty">The designer hasn’t added the reasoning yet.${CR.perm.can('editReview', r) ? html` <a class="link" href="#/review/${r.id}/edit#ae-${a.id}">Add it</a>` : ''}</p>`}
    </div>`;
  }

  // ───────────────────────── area section ─────────────────────────

  function leaderBox(a, t) {
    const opts = sel.options(a.id);
    let body;
    if (!t.max) body = html`<p class="outcome__main muted">No “Select” verdicts yet</p>`;
    else if (t.leaders.length > 1) {
      body = html`<p class="outcome__main">Tie · ${t.leaders.map((id) => { const o = sel.option(id); return `#${pad2(sel.optionNumber(o))} ${o.name}`; }).join(', ')}</p>
        <p class="small muted">${plural(t.max, 'Select')} each · ${plural(t.reviewers, 'reviewer')} so far</p>`;
    } else {
      const o = sel.option(t.leaderId);
      body = html`<p class="outcome__main">${ui.optLabel(o)} ${o.name}</p><p class="small muted">${plural(t.max, 'Select')} · ${plural(t.reviewers, 'reviewer')} so far · advisory</p>`;
    }
    const bars = opts.filter((o) => t.per.get(o.id).select.length).sort((x, y) => t.per.get(y.id).select.length - t.per.get(x.id).select.length);
    return html`<div class="outcome__box outcome__box--leader">
      <p class="outcome__label">${ui.icon('star')} Most selected</p>${body}
      ${bars.length ? html`<ul class="mini-bars" aria-label="Select count per option">${bars.map((o) => html`<li><span>#${pad2(sel.optionNumber(o))}</span><span class="mini-bar"><span style="width:${(t.per.get(o.id).select.length / t.max) * 100}%"></span></span><span>${t.per.get(o.id).select.length}</span></li>`)}</ul>` : ''}
    </div>`;
  }

  function finalBox(a, r, t) {
    const d = sel.decision(a.id);
    const canDecide = CR.perm.can('decide', r);
    const approver = sel.approver();
    if (!d) {
      return html`<div class="outcome__box outcome__box--pending">
        <p class="outcome__label">${ui.icon('flag')} Final approval</p>
        <p class="outcome__main muted">Not yet approved</p>
        <p class="small muted">${r.status === 'draft' ? 'Approval starts once the review is open.' : `Waiting for ${approver ? approver.name : 'the approver'} to approve.`}</p>
        ${canDecide ? html`<button class="btn btn--sm btn--primary" data-action="open-decide" data-id="${a.id}">Record approval</button>` : ''}
      </div>`;
    }
    const differs = d.leadersAtDecision && d.leadersAtDecision.length && !d.leadersAtDecision.some((l) => d.optionIds.includes(l));
    return html`<div class="outcome__box outcome__box--final">
      <p class="outcome__label">${ui.icon('check')} Approved by ${sel.user(d.decidedBy)?.name || 'approver'}</p>
      ${d.optionIds.length
        ? html`<ul class="final-list">${d.optionIds.map((id) => { const o = sel.option(id); return o ? html`<li>${ui.optLabel(o)} ${o.name} ${ui.swatches(o.id)}</li>` : ''; })}</ul>`
        : html`<p class="outcome__main muted">No option approved</p>`}
      ${d.rationale ? html`<p class="small">${d.rationale}</p>` : ''}
      ${differs || d.overrideReason ? html`<p class="small override-note"><strong>Differs from most-selected:</strong> ${d.overrideReason || '—'}</p>` : ''}
      <p class="small muted">${(d.holdIds || []).length ? `${plural(d.holdIds.length, 'option')} on hold · ` : ''}${(d.rejectedIds || []).length ? `${plural(d.rejectedIds.length, 'option')} rejected · ` : ''}${fmtDate(d.decidedAt)}</p>
      ${canDecide ? html`<button class="btn btn--sm" data-action="open-decide" data-id="${a.id}">Change</button>` : ''}
    </div>`;
  }

  function optionRow(r, a, opt, t, d) {
    const per = t.per.get(opt.id);
    const isTop = t.max > 0 && t.leaders.includes(opt.id);
    const dState = d ? (d.optionIds.includes(opt.id) ? 'approved' : (d.holdIds || []).includes(opt.id) ? 'hold' : (d.rejectedIds || []).includes(opt.id) ? 'reject' : null) : null;
    const cmp = CR.app.ui.compare;
    const inCompare = cmp.areaId === a.id && cmp.ids.includes(opt.id);
    const bms = sel.benchmarksForOption(opt);
    const nComments = sel.comments((c) => c.optionId === opt.id).length;
    return html`<article class="orow ${dState === 'approved' ? 'is-final' : ''} ${isTop ? 'is-leader' : ''}" aria-label="Option ${sel.optionNumber(opt)}: ${opt.name}">
      <div class="orow__pair">
        <figure class="pair__item pair__item--cult">
          <figcaption class="cmp-label cmp-label--cult">Cult concept</figcaption>
          <button class="orow__media" data-action="open-option" data-id="${opt.id}" aria-label="Open option ${sel.optionNumber(opt)}, ${opt.name}, larger with benchmark">
            ${ui.optionMedia(opt, 'wide')}<span class="ocard__zoom" aria-hidden="true">${ui.icon('expand')}</span></button>
        </figure>
        ${benchFig(bms[0], Math.max(0, bms.length - 1))}
      </div>
      <div class="orow__info">
        <div class="orow__head">
          <h3 class="ocard__title">${ui.optLabel(opt)}<span>${opt.name}</span></h3>
          <div class="orow__flags">
            ${dState === 'approved' ? html`<span class="final-tag">${ui.icon('check')} Approved</span>` : ''}
            ${dState === 'hold' ? html`<span class="vtag vtag--hold">Approver: on hold</span>` : ''}
            ${dState === 'reject' ? html`<span class="vtag vtag--reject">Approver: rejected</span>` : ''}
            ${isTop ? html`<span class="leader-tag">${ui.icon('star')} ${t.leaders.length > 1 ? 'Tied most-selected' : 'Most selected'}</span>` : ''}
            ${myVerdictTag(r, opt)}
          </div>
        </div>
        ${whyBlock(r, a, opt)}
        ${colourLines(opt)}
        ${verdictControl(r, opt)}
        ${verdictTally(per)}
        <div class="ocard__actions">
          <button class="btn btn--ghost btn--sm" data-action="open-option" data-id="${opt.id}">${ui.icon('expand')} Larger view</button>
          <button class="btn btn--ghost btn--sm" data-action="toggle-compare" data-area="${a.id}" data-opt="${opt.id}" aria-pressed="${inCompare ? 'true' : 'false'}" id="cmp-${opt.id}">${ui.icon('compare')} ${inCompare ? 'Comparing' : 'Compare options'}</button>
          <button class="btn btn--ghost btn--sm" data-action="open-option" data-id="${opt.id}" aria-label="${nComments} comments on option ${sel.optionNumber(opt)}">${ui.icon('chat')} ${nComments}</button>
        </div>
      </div>
    </article>`;
  }

  function commentThread({ r, areaId = null, optionId = null }) {
    const me = CR.store.me();
    const list = sel.comments((c) => c.reviewId === r.id && c.areaId === areaId && (optionId ? c.optionId === optionId : !c.optionId));
    const canComment = CR.perm.can('comment', r);
    const key = optionId || areaId;
    return html`<div class="thread">
      ${list.length ? html`<ul class="thread__list">${list.map((c) => html`<li class="comment">
        ${ui.avatar(sel.user(c.userId), 'sm')}
        <div><p class="comment__meta"><strong>${sel.user(c.userId)?.name}</strong> <span class="muted">${relTime(c.at)}</span>
          ${c.userId === me.id ? html`<button class="link-btn" data-action="delete-comment" data-id="${c.id}">Delete</button>` : ''}</p>
          <p class="comment__text">${c.text}</p></div></li>`)}</ul>` : html`<p class="muted small">No comments yet.</p>`}
      ${canComment ? html`<form class="comment-form" data-form="comment" data-review="${r.id}" data-area="${areaId || ''}" data-option="${optionId || ''}">
        <label class="sr-only" for="cf-${key}">Add a comment</label>
        <textarea id="cf-${key}" name="text" rows="2" required placeholder="Add a comment as ${me.name}…"></textarea>
        <button class="btn btn--sm">Post</button></form>` : ''}
    </div>`;
  }

  function areaSection(r, a) {
    const me = CR.store.me();
    const opts = sel.options(a.id);
    const t = sel.tally(a.id);
    const d = sel.decision(a.id);
    const canVote = CR.perm.can('vote', r);
    const areaComments = sel.comments((c) => c.areaId === a.id && !c.optionId).length;
    const open = CR.app.ui.openThreads.has(a.id);
    const mineDone = opts.filter((o) => sel.myVerdict(o.id, me.id)).length;
    let voteHint = '';
    if (opts.length) {
      if (canVote) {
        voteHint = mineDone === opts.length
          ? html`<p class="my-vote">${ui.icon('check')} You’ve reviewed all ${opts.length} options here. You can change any verdict until voting closes.</p>`
          : html`<p class="my-vote my-vote--todo">Mark each option <strong>Select</strong>, <strong>Hold</strong> or <strong>Reject</strong> — ${mineDone} of ${opts.length} done in ${a.title}.</p>`;
      } else if (r.status !== 'final') voteHint = html`<p class="my-vote my-vote--off">${CR.perm.why('vote', r)}</p>`;
    }
    return html`<section class="area" id="area-${a.id}" aria-labelledby="h-${a.id}">
      <header class="area__head">
        <div>
          <p class="eyebrow">${AREA_TYPES[a.type] || 'Decision area'} · ${plural(opts.length, 'option')}${a.maxSelections > 1 ? ` · approver can approve up to ${a.maxSelections}` : ''}</p>
          <h2 id="h-${a.id}">${a.title}</h2>
          ${a.description ? html`<p class="area__desc">${a.description}</p>` : ''}
        </div>
      </header>
      ${opts.length ? html`
        <div class="outcome">${leaderBox(a, t)}${finalBox(a, r, t)}</div>
        ${voteHint}
        <div class="orow-list">${opts.map((o) => optionRow(r, a, o, t, d))}</div>`
      : ui.emptyState('No options in this area yet', 'Upload 2D concepts for this decision area from Edit.', CR.perm.can('editReview', r) ? html`<a class="btn" href="#/review/${r.id}/edit">${ui.icon('upload')} Upload concepts</a>` : '')}
      <div class="area-discussion">
        <button class="disclosure" aria-expanded="${open ? 'true' : 'false'}" data-action="toggle-thread" data-id="${a.id}" id="thr-${a.id}">
          ${ui.icon('chat')} Discussion on ${a.title} <span class="count">${areaComments}</span></button>
        ${open ? commentThread({ r, areaId: a.id }) : ''}
      </div>
    </section>`;
  }

  // ───────────────────────── benchmarks & colours ─────────────────────────

  function benchmarkCard(b, { compact = false } = {}) {
    const linkedOpts = (b.informsOptionIds || []).map(sel.option).filter(Boolean);
    const linkedAreas = (b.informsAreaIds || []).map(sel.area).filter(Boolean);
    return html`<article class="bcard ${compact ? 'bcard--compact' : ''}">
      <p class="bcard__ribbon">Benchmark · reference only${b.isPlaceholder ? ' · placeholder' : ''}</p>
      ${ui.media(b.imageRef, `${b.brand} ${b.name}`.trim() || 'Benchmark', { kind: 'benchmark', ratio: 'wide' })}
      <div class="bcard__body">
        <h3 class="bcard__title">${b.brand ? html`<span class="muted">${b.brand}</span> ` : ''}${b.name || 'Untitled reference'}</h3>
        ${b.tags && b.tags.length ? html`<p class="small"><span class="muted">Informs</span> ${ui.tags(b.tags)}</p>` : ''}
        ${b.note ? html`<p class="small">${b.note}</p>` : ''}
        ${(b.colours || []).length ? html`<h4 class="label">Colours</h4>${CR.library.benchColours(b)}` : ''}
        ${b.sourceUrl ? (isSafeUrl(b.sourceUrl)
          ? html`<p class="small"><a class="link" href="${b.sourceUrl}" target="_blank" rel="noopener noreferrer">${ui.icon('link')} ${hostOf(b.sourceUrl)}<span class="sr-only"> (opens in new tab)</span></a></p>`
          : html`<p class="small muted">Source: ${b.sourceUrl}</p>`) : ''}
        ${!compact && (linkedOpts.length || linkedAreas.length) ? html`<p class="small"><span class="muted">Shown next to</span>
          ${linkedAreas.map((a) => html`<a class="chip" href="#area-${a.id}" data-action="scroll-to" data-target="area-${a.id}">${a.title} (all)</a> `)}
          ${linkedOpts.map((o) => html`<button class="chip" data-action="open-option" data-id="${o.id}">#${pad2(sel.optionNumber(o))} ${o.name}</button> `)}</p>` : ''}
      </div>
    </article>`;
  }

  function colourRef(c) {
    const refs = (c.refIds || []).map(sel.colourRef).filter(Boolean);
    return html`<div class="colour-ref">
      ${ui.swatchBlock(c)}
      <div class="colour-ref__body">
        <p class="colour-ref__name"><strong>${c.name || 'Unnamed colour'}</strong> <span class="muted">· ${c.part}</span>
          ${c.isExample ? html`<span class="chip chip--demo" title="Approximate swatch sampled from the render — not a verified colour reference">Approx.</span>` : ''}</p>
        <dl class="kv">
          <div><dt>Pantone</dt><dd>${c.pantone || html`<span class="muted">Not recorded</span>`}</dd></div>
          <div><dt>WGSN</dt><dd>${c.wgsn || html`<span class="muted">Not recorded</span>`}</dd></div>
          ${c.rationale ? html`<div class="kv--wide"><dt>Why it fits</dt><dd>${c.rationale}</dd></div>` : ''}
          ${c.sourceRef ? html`<div class="kv--wide"><dt>Source</dt><dd>${isSafeUrl(c.sourceRef) ? html`<a class="link" href="${c.sourceRef}" target="_blank" rel="noopener noreferrer">${hostOf(c.sourceRef)}</a>` : c.sourceRef}</dd></div>` : ''}
          ${refs.length ? html`<div class="kv--wide"><dt>From the season’s colour study</dt><dd class="ref-chips">${refs.map((x) => CR.library.refChip(x))}</dd></div>` : ''}
        </dl>
      </div>
    </div>`;
  }

  function colourSection(r) {
    const areas = sel.areas(r.id).filter((a) => a.type === 'colourway');
    const rows = areas.flatMap((a) => sel.options(a.id).map((o) => ({ a, o, cols: sel.colours(o.id) }))).filter((x) => x.cols.length);
    const anyRef = rows.some((x) => x.cols.some((c) => c.pantone || c.wgsn || (c.refIds || []).length));
    return html`<section class="block" aria-labelledby="h-colours" id="colours">
      <header class="section-head"><h2 id="h-colours">Colour references</h2><a class="link" href="#/colours">Open Pantone &amp; WGSN →</a></header>
      <p class="notice">Pantone and WGSN data is added by the designer as a <a class="link" href="#/colours">colour study for each season</a> and linked to colourways. This prototype isn’t connected to either service${anyRef ? '.' : ' — nothing has been linked on this review yet.'}</p>
      ${rows.length ? html`<div class="colour-table">${rows.map(({ o, cols }) => html`
        <div class="colour-row">
          <button class="colour-row__opt" data-action="open-option" data-id="${o.id}">${ui.optionMedia(o, 'wide')}<span>${ui.optLabel(o)} ${o.name}</span></button>
          <div class="colour-row__refs">${cols.map(colourRef)}</div>
        </div>`)}</div>`
      : ui.emptyState('No colourway colours recorded', 'Add colours (name, swatch, Pantone, WGSN link) to colourway options from Edit.')}
    </section>`;
  }

  function participantsPanel(r) {
    const ps = sel.participants(r.id);
    const groups = { invited: [], pending: [], completed: [] };
    ps.forEach((p) => groups[sel.participantStatus(r.id, p.userId)].push(p));
    const prog = sel.progress(r.id);
    const approver = sel.approver();
    return html`<section class="side-panel" aria-labelledby="h-people">
      <header class="side-panel__head"><h2 id="h-people">Reviewers</h2><span class="muted small">${prog.done}/${prog.total} done</span></header>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${prog.total}" aria-valuenow="${prog.done}" aria-label="Reviewers completed"><span style="width:${prog.total ? prog.done / prog.total * 100 : 0}%"></span></div>
      ${ps.length ? ['completed', 'pending', 'invited'].map((k) => groups[k].length ? html`
        <h3 class="side-sub">${k === 'completed' ? 'Completed' : k === 'pending' ? 'Pending' : 'Invited'} <span class="count">${groups[k].length}</span></h3>
        <ul class="people">${groups[k].map((p) => { const u = sel.user(p.userId); const pr = sel.reviewProgressFor(r.id, u.id); return html`<li>
          ${ui.avatar(u, 'md')}<div><p><strong>${u.name}</strong></p>
          <p class="small muted">${STATUS_HINT[k]}${k === 'pending' ? ` (${pr.done}/${pr.total})` : ''}</p></div><span class="status-dot status-dot--${k}" aria-hidden="true"></span></li>`; })}</ul>` : '')
        : html`<p class="muted small">No reviewers invited yet.</p>`}
      ${approver ? html`<h3 class="side-sub">Final approval</h3><ul class="people"><li>${ui.avatar(approver, 'md')}<div><p><strong>${approver.name}</strong></p><p class="small muted">Approver — records the final choice</p></div><span></span></li></ul>` : ''}
      ${CR.perm.can('share', r) ? html`<button class="btn btn--sm btn--block" data-action="open-share" data-id="${r.id}">Manage reviewers</button>` : ''}
    </section>`;
  }

  function myProgress(r) {
    const me = CR.store.me();
    if (!sel.participant(r.id, me.id)) return '';
    const areas = sel.areas(r.id).filter((a) => sel.options(a.id).length);
    return html`<section class="side-panel side-panel--me" aria-labelledby="h-me">
      <header class="side-panel__head"><h2 id="h-me">Your review</h2></header>
      <ul class="checklist">${areas.map((a) => { const opts = sel.options(a.id); const n = opts.filter((o) => sel.myVerdict(o.id, me.id)).length; const done = n === opts.length; return html`<li class="${done ? 'is-done' : ''}">
        <a href="#area-${a.id}" data-action="scroll-to" data-target="area-${a.id}">${done ? ui.icon('check') : html`<span class="ring"></span>`}<span>${a.title}</span></a>
        <span class="small muted">${n} of ${opts.length} options marked</span></li>`; })}</ul>
    </section>`;
  }

  function activityPanel(r) {
    const all = sel.activity(r.id);
    const showAll = CR.app.ui.showAllActivity;
    const list = showAll ? all : all.slice(0, 8);
    return html`<section class="side-panel" aria-labelledby="h-activity">
      <header class="side-panel__head"><h2 id="h-activity">Activity</h2></header>
      <ol class="activity">${list.map((e) => { const u = sel.user(e.userId); return html`<li class="act act--${e.type}">
        ${ui.avatar(u, 'sm')}<p><strong>${u ? u.name : 'Someone'}</strong> ${e.text}<br><time class="small muted" datetime="${e.at}">${relTime(e.at)}</time></p></li>`; })}</ol>
      ${all.length > 8 ? html`<button class="link-btn" data-action="toggle-activity">${showAll ? 'Show less' : `Show all ${all.length}`}</button>` : ''}
    </section>`;
  }

  function reviewPage(id) {
    const r = sel.review(id);
    if (!r) return notFound();
    if (!CR.perm.can('view', r)) return ui.emptyState('This review is a draft', `Only the designer, the approver and invited people can see drafts. You’re viewing as ${CR.store.me().name}.`);
    const areas = sel.areas(r.id);
    const bms = sel.benchmarks(r.id);
    const cmp = CR.app.ui.compare;
    return html`
      ${reviewHeader(r)}
      ${r.status === 'draft' ? html`<p class="notice notice--draft">This review is a <strong>Draft</strong>. Voting opens when the designer selects <em>Open for review</em>.</p>` : ''}
      ${r.status === 'final' ? html`<p class="notice notice--final">Voting is closed. Final approvals are on the <a class="link" href="#/review/${r.id}/summary">approval summary</a>.</p>` : ''}
      <div class="review-layout">
        <div class="review-main">
          ${r.notes || r.rationale ? html`<section class="brief">
            ${r.notes ? html`<div><h2 class="label">Review notes</h2><p>${r.notes}</p></div>` : ''}
            ${r.rationale ? html`<div><h2 class="label">Design rationale</h2><p>${r.rationale}</p></div>` : ''}
          </section>` : ''}
          <nav class="jump" aria-label="Jump to section">
            ${areas.map((a) => html`<a href="#area-${a.id}" data-action="scroll-to" data-target="area-${a.id}">${a.title}</a>`)}
            <a href="#benchmarks" data-action="scroll-to" data-target="benchmarks">Benchmarks <span class="count">${bms.length}</span></a>
            <a href="#colours" data-action="scroll-to" data-target="colours">Colour references</a>
          </nav>
          ${areas.length ? areas.map((a) => areaSection(r, a)) : ui.emptyState('No decision areas', 'Add decision areas such as Colourway, Sole or Upper from Edit.')}
          <section class="block" id="benchmarks" aria-labelledby="h-bm">
            <header class="section-head"><h2 id="h-bm">All benchmarks &amp; inspiration</h2></header>
            <p class="notice">Benchmarks are <strong>reference shoes from other brands</strong> — they are not Cult options and can’t be selected. Each is shown beside the concept it informs.</p>
            ${bms.length ? html`<div class="bench-grid">${bms.map((b) => benchmarkCard(b))}</div>`
              : ui.emptyState('No benchmarks yet', 'Add reference shoes and what they inform — silhouette, construction, sole, colour, materials or detailing.', CR.perm.can('editReview', r) ? html`<a class="btn" href="#/review/${r.id}/edit#benchmarks">Add benchmark</a>` : '')}
          </section>
          ${colourSection(r)}
        </div>
        <aside class="review-aside" aria-label="Review participants and activity">
          ${myProgress(r)}
          ${participantsPanel(r)}
          ${activityPanel(r)}
        </aside>
      </div>
      ${cmp.ids.length && sel.area(cmp.areaId)?.reviewId === r.id ? html`<div class="compare-tray" role="region" aria-label="Compare tray">
        <div class="compare-tray__thumbs">${cmp.ids.map((oid) => { const o = sel.option(oid); return o ? html`<span class="thumb">${ui.optionMedia(o, 'wide')}<span>#${pad2(sel.optionNumber(o))}</span></span>` : ''; })}</div>
        <p><strong>${cmp.ids.length}</strong> selected <span class="muted small">(up to 4)</span></p>
        <button class="btn btn--primary" data-action="open-compare" ${cmp.ids.length < 2 ? raw('disabled') : ''}>${ui.icon('compare')} Compare side by side</button>
        <button class="btn btn--ghost" data-action="clear-compare">Clear</button>
      </div>` : ''}
    `;
  }

  // ───────────────────────── approval summary ─────────────────────────

  function summaryPage(id) {
    const r = sel.review(id);
    if (!r) return notFound();
    if (!CR.perm.can('view', r)) return ui.emptyState('Not available', 'Drafts are visible to the designer, the approver and invited people only.');
    const areas = sel.areas(r.id);
    const dp = sel.decisionProgress(r.id);
    return html`
      ${reviewHeader(r, { summary: true })}
      ${r.status !== 'final' ? html`<p class="notice notice--draft">This review is still <strong>${STATUS[r.status]}</strong>. ${dp.done}/${dp.total} decision areas are approved; approvals may still change.</p>` : ''}
      ${r.rationale ? html`<section class="brief"><div><h2 class="label">Design rationale</h2><p>${r.rationale}</p></div></section>` : ''}
      ${areas.map((a) => {
        const d = sel.decision(a.id);
        const t = sel.tally(a.id);
        const opts = sel.options(a.id).slice().sort((x, y) => t.per.get(y.id).select.length - t.per.get(x.id).select.length || x.order - y.order);
        const differs = d && t.max && !t.leaders.some((l) => d.optionIds.includes(l));
        const state = (o) => d ? (d.optionIds.includes(o.id) ? 'approved' : (d.holdIds || []).includes(o.id) ? 'hold' : (d.rejectedIds || []).includes(o.id) ? 'reject' : '') : '';
        return html`<section class="sum-area" aria-labelledby="sh-${a.id}">
          <header class="section-head"><div><p class="eyebrow">${AREA_TYPES[a.type]}</p><h2 id="sh-${a.id}">${a.title}</h2></div>
            ${d ? html`<span class="final-tag final-tag--lg">${ui.icon('check')} Approved by ${sel.user(d.decidedBy)?.name}</span>` : html`<span class="pill pill--draft">Awaiting approval</span>`}</header>
          <div class="sum-grid">
            <div class="sum-finals">
              ${d ? d.optionIds.map((oid) => { const o = sel.option(oid); if (!o) return ''; const b = sel.benchmarksForOption(o)[0]; return html`<figure class="sum-final">
                <div class="sum-final__pair">${ui.optionMedia(o, 'wide')}${b ? ui.media(b.imageRef, `${b.brand} ${b.name}`, { kind: 'benchmark', ratio: 'wide' }) : ''}</div>
                <figcaption><span class="final-tag">${ui.icon('check')} Approved</span> ${ui.optLabel(o)} <strong>${o.name}</strong> ${ui.swatches(o.id, 'md')}
                  ${b ? html`<span class="small muted">Benchmark (reference only): ${[b.brand, b.name].filter(Boolean).join(' ')}</span>` : ''}
                  ${o.rationale ? html`<span class="small"><strong>${WHY_LABEL[a.type]}:</strong> ${o.rationale}</span>` : ''}</figcaption>
              </figure>`; })
              : t.leaderId ? html`<div class="muted">Currently most-selected: <strong>#${pad2(sel.optionNumber(sel.option(t.leaderId)))} ${sel.option(t.leaderId).name}</strong> — advisory, not approved.</div>`
              : html`<p class="muted">Nothing approved yet.</p>`}
            </div>
            <div class="sum-side">
              ${d ? html`<h3 class="label">Approver’s rationale</h3><p>${d.rationale || '—'}</p>
                ${differs || d.overrideReason ? html`<h3 class="label">Why it differs from most-selected</h3><p class="override-note">${d.overrideReason || '—'}</p>` : ''}
                <p class="small muted">Approved by ${sel.user(d.decidedBy)?.name} on ${fmtDate(d.decidedAt)}</p>` : ''}
              <h3 class="label">Reviewer verdicts <span class="muted small">(advisory · ${plural(t.reviewers, 'reviewer')})</span></h3>
              <ul class="result-list">${opts.map((o) => { const per = t.per.get(o.id); const st = state(o); return html`<li class="${st === 'approved' ? 'is-final' : ''}">
                <span class="result-list__name">${ui.optLabel(o)} ${o.name}
                  ${st === 'approved' ? html`<span class="final-tag final-tag--sm">Approved</span>` : st === 'hold' ? html`<span class="vtag vtag--hold">Hold</span>` : st === 'reject' ? html`<span class="vtag vtag--reject">Rejected</span>` : ''}</span>
                <span class="result-counts"><span class="vtag vtag--select">${per.select.length} S</span><span class="vtag vtag--hold">${per.hold.length} H</span><span class="vtag vtag--reject">${per.reject.length} R</span></span>
                </li>`; })}</ul>
            </div>
          </div>
        </section>`;
      })}
      ${sel.benchmarks(r.id).length ? html`<section class="block"><header class="section-head"><h2>Benchmarks referenced</h2></header>
        <div class="bench-grid bench-grid--compact">${sel.benchmarks(r.id).map((b) => benchmarkCard(b, { compact: true }))}</div></section>` : ''}
      <section class="block"><header class="section-head"><h2>Reviewers</h2></header>
        <ul class="people people--inline">${sel.participants(r.id).map((p) => { const st = sel.participantStatus(r.id, p.userId); return html`<li>${ui.avatar(sel.user(p.userId))}<span><strong>${sel.user(p.userId).name}</strong><br><span class="small muted">${st[0].toUpperCase() + st.slice(1)}</span></span></li>`; })}</ul>
      </section>
    `;
  }

  // ───────────────────────── modals ─────────────────────────

  function optionModal({ id }) {
    const o = sel.option(id); if (!o) return null;
    const r = sel.review(o.reviewId); const a = sel.area(o.areaId);
    const t = sel.tally(a.id); const d = sel.decision(a.id);
    const per = t.per.get(o.id);
    const siblings = sel.options(a.id); const idx = siblings.findIndex((x) => x.id === o.id);
    const prev = siblings[idx - 1], next = siblings[idx + 1];
    const bms = sel.benchmarksForOption(o);
    const cols = sel.colours(o.id);
    const isFinal = d && d.optionIds.includes(o.id);
    const isTop = t.max && t.leaders.includes(o.id);
    return html`
      <header class="modal__head">
        <div><p class="eyebrow">${r.title} · ${a.title} · option ${idx + 1} of ${siblings.length}</p>
          <h2 id="modal-title" class="modal__title">${ui.optLabel(o)} ${o.name}
            ${isFinal ? html`<span class="final-tag">${ui.icon('check')} Approved</span>` : ''}${isTop ? html`<span class="leader-tag">${ui.icon('star')} ${t.leaders.length > 1 ? 'Tied most-selected' : 'Most selected'}</span>` : ''}</h2></div>
        <div class="modal__nav">
          <button class="icon-btn" data-action="open-option" data-id="${prev ? prev.id : ''}" ${prev ? '' : raw('disabled')} aria-label="Previous option" id="m-prev">${ui.icon('arrowL')}</button>
          <button class="icon-btn" data-action="open-option" data-id="${next ? next.id : ''}" ${next ? '' : raw('disabled')} aria-label="Next option" id="m-next">${ui.icon('arrowR')}</button>
          <button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button>
        </div>
      </header>
      <div class="pair pair--lg">
        <figure class="pair__item pair__item--cult"><figcaption class="cmp-label cmp-label--cult">Cult concept</figcaption>${ui.optionMedia(o, 'wide')}</figure>
        ${benchFig(bms[0], 0)}
      </div>
      ${bms.length > 1 ? html`<div class="bm-side"><p class="cmp-label cmp-label--bench">More benchmarks for this option — reference only</p>
        <div class="bm-side__grid">${bms.slice(1).map((b) => html`<figure class="bm-fig">${ui.media(b.imageRef, `${b.brand} ${b.name}`, { kind: 'benchmark', ratio: 'wide' })}
          <figcaption><strong>${b.brand} ${b.name}</strong> ${ui.tags(b.tags)}${b.note ? html`<br><span class="small muted">${b.note}</span>` : ''}</figcaption></figure>`)}</div></div>` : ''}
      ${bms[0] && (bms[0].note || (bms[0].colours || []).length) ? html`<div class="bench-note">${bms[0].note ? html`<p class="small"><strong>What the benchmark informs:</strong> ${bms[0].note}</p>` : ''}${(bms[0].colours || []).length ? html`<p class="label">Benchmark colours</p>${CR.library.benchColours(bms[0])}` : ''}</div>` : ''}
      <div class="opt-detail">
        <div class="opt-detail__visual">
          ${whyBlock(r, a, o)}
          <h3 class="label">Colours</h3>
          ${cols.length ? cols.map(colourRef) : html`<p class="small muted">No colours recorded.</p>`}
        </div>
        <div class="opt-detail__info">
          <div class="vote-panel">
            ${CR.perm.can('vote', r) ? html`<p class="label">Your verdict</p>${verdictControl(r, o, { lg: true })}` : html`<p class="small muted">${CR.perm.why('vote', r)}</p>`}
            <h3 class="label">Reviewer verdicts</h3>
            ${verdictTally(per)}
          </div>
          <h3 class="label">Comments on this option</h3>
          ${commentThread({ r, areaId: a.id, optionId: o.id })}
        </div>
      </div>`;
  }

  function compareModal({ areaId, ids }) {
    const a = sel.area(areaId); if (!a) return null;
    const r = sel.review(a.reviewId);
    const t = sel.tally(areaId); const d = sel.decision(areaId);
    const opts = ids.map(sel.option).filter(Boolean);
    return html`
      <header class="modal__head"><div><p class="eyebrow">${r.title}</p><h2 id="modal-title" class="modal__title">Compare · ${a.title}</h2></div>
        <div class="modal__nav"><button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button></div></header>
      <div class="cmp-grid" style="--cols:${opts.length}">
        ${opts.map((o) => { const per = t.per.get(o.id); const bm = sel.benchmarksForOption(o)[0]; return html`<div class="cmp-col">
          <p class="cmp-label cmp-label--cult">Cult concept</p>
          ${ui.optionMedia(o, 'wide')}
          <h3 class="ocard__title">${ui.optLabel(o)}<span>${o.name}</span></h3>
          <div class="rcard__row">${d && d.optionIds.includes(o.id) ? html`<span class="final-tag">${ui.icon('check')} Approved</span>` : ''}${t.max && t.leaders.includes(o.id) ? html`<span class="leader-tag">${ui.icon('star')} Most selected</span>` : ''}</div>
          ${ui.swatches(o.id, 'lg')}
          ${whyBlock(r, a, o)}
          ${verdictControl(r, o, { lg: true })}
          ${verdictTally(per)}
          ${bm ? html`<div class="cmp-bench"><p class="cmp-label cmp-label--bench">Benchmark · reference only</p>
            ${ui.media(bm.imageRef, `${bm.brand} ${bm.name}`, { kind: 'benchmark', ratio: 'wide' })}<p class="small"><strong>${[bm.brand, bm.name].filter(Boolean).join(' ')}</strong> ${ui.tags(bm.tags)}</p></div>` : ''}
        </div>`; })}
      </div>`;
  }

  function decideModal({ areaId }) {
    const a = sel.area(areaId); if (!a) return null;
    const r = sel.review(a.reviewId);
    const t = sel.tally(areaId); const d = sel.decision(areaId);
    const opts = sel.options(areaId);
    const approver = sel.approver();
    const initial = (o) => {
      if (d) return d.optionIds.includes(o.id) ? 'approve' : (d.rejectedIds || []).includes(o.id) ? 'reject' : 'hold';
      return t.leaderId === o.id ? 'approve' : 'hold';
    };
    return html`
      <header class="modal__head"><div><p class="eyebrow">${r.title}</p><h2 id="modal-title" class="modal__title">Approval · ${a.title}</h2></div>
        <div class="modal__nav"><button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button></div></header>
      <form class="decide-form" data-form="decide" data-area="${a.id}">
        <p class="notice">Reviewer verdicts are advisory. ${approver ? html`<strong>${approver.name}</strong>` : 'The approver'} approves, holds or rejects each option; up to ${a.maxSelections} can be approved.
          ${t.max ? html`Most selected by reviewers: <strong>${t.leaders.map((id) => `#${pad2(sel.optionNumber(sel.option(id)))} ${sel.option(id).name}`).join(', ')}</strong>${t.leaders.length > 1 ? ' (tie)' : ''}.` : 'No reviewer has selected an option yet.'}</p>
        <div class="decide-list">${opts.map((o) => { const per = t.per.get(o.id); const cur = initial(o); return html`<fieldset class="decide-row">
          <legend class="sr-only">Decision for option ${sel.optionNumber(o)}, ${o.name}</legend>
          <div class="decide-row__media">${ui.optionMedia(o, 'wide')}</div>
          <div class="decide-row__text">
            <p class="ocard__title">${ui.optLabel(o)}<span>${o.name}</span></p>
            <p class="small muted">${per.select.length} Select · ${per.hold.length} Hold · ${per.reject.length} Reject${o.rationale ? ' — ' + o.rationale : ''}</p>
          </div>
          <div class="seg" role="radiogroup" aria-label="Decision for option ${sel.optionNumber(o)}">
            ${[['approve', 'Approve'], ['hold', 'Hold'], ['reject', 'Reject']].map(([k, l]) => html`<label class="seg__opt seg__opt--${k}"><input type="radio" name="d-${o.id}" value="${k}" ${cur === k ? raw('checked') : ''} data-decide-opt><span>${l}</span></label>`)}
          </div>
        </fieldset>`; })}</div>
        <div class="form-actions form-actions--tight"><button type="button" class="btn btn--sm" data-action="decide-reject-rest">Reject all not approved</button><span class="small muted">Approved: <strong id="decide-count">${opts.filter((o) => initial(o) === 'approve').length}</strong> of ${a.maxSelections}</span></div>
        <label class="field"><span class="field__label">Rationale <span class="req">required</span></span>
          <textarea name="rationale" rows="3" required placeholder="Why these options? e.g. fit with the range, customer, cost, manufacturability">${d ? d.rationale : ''}</textarea></label>
        <label class="field" id="override-field"><span class="field__label">Reason for differing from the most-selected option <span class="req" id="override-req" hidden>required</span></span>
          <textarea name="overrideReason" rows="2" placeholder="Only needed when no approved option is among the most-selected">${d ? d.overrideReason : ''}</textarea></label>
        <p class="form-error" role="alert" id="decide-error"></p>
        <div class="form-actions">
          ${d ? html`<button type="button" class="btn btn--ghost" data-action="clear-decision" data-id="${a.id}">Clear approval</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button class="btn btn--primary" type="submit">Save approval</button>
        </div>
      </form>`;
  }

  function shareModal({ reviewId }) {
    const r = sel.review(reviewId); if (!r) return null;
    const users = CR.store.state.users.filter((u) => u.id !== r.ownerId && u.role !== 'approver');
    return html`
      <header class="modal__head"><div><p class="eyebrow">${r.title}</p><h2 id="modal-title" class="modal__title">Reviewers</h2></div>
        <div class="modal__nav"><button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button></div></header>
      <p class="notice"><strong>Prototype sharing.</strong> Invitations are saved in this browser only — no email or link is sent and access isn’t enforced. Real sharing needs sign-in and a backend. The approver (${sel.approver()?.name || 'none set'}) can always see the review.</p>
      ${users.length ? html`<table class="table">
        <thead><tr><th scope="col">Invite</th><th scope="col">Person</th><th scope="col">Status</th></tr></thead>
        <tbody>${users.map((u) => { const p = sel.participant(r.id, u.id); const st = p ? sel.participantStatus(r.id, u.id) : null; return html`<tr>
          <td><input type="checkbox" id="inv-${u.id}" data-share-user="${u.id}" data-review="${r.id}" ${p ? raw('checked') : ''} aria-label="Invite ${u.name}"></td>
          <td><label for="inv-${u.id}">${ui.person(u)} <span class="small muted">${CR.store.ROLES[u.role]}</span></label></td>
          <td>${st ? html`<span class="status-label status-label--${st}">${st[0].toUpperCase() + st.slice(1)}</span>` : html`<span class="muted small">Not invited</span>`}</td></tr>`; })}</tbody>
      </table>` : ui.emptyState('No one to invite yet', 'Add people in Settings first.', html`<a class="btn" href="#/settings">Open Settings</a>`)}
      <div class="form-actions"><span class="spacer"></span><button class="btn btn--primary" data-action="close-modal">Done</button></div>`;
  }

  function personModal(m = {}) {
    const people = CR.store.state.users;
    const hasApprover = !!sel.approver();
    return html`
      <header class="modal__head"><div><p class="eyebrow">${m.first ? 'Welcome to Cult Design Review' : 'Switch person'}</p><h2 id="modal-title" class="modal__title">Who are you?</h2></div>
        <div class="modal__nav"><button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button></div></header>
      <p class="notice">There’s no sign-in yet. Choose who you are so your name appears next to what you do — your verdicts, uploads and comments. You can switch person any time from the top right. ${m.first ? html`New here? <a class="link" href="#/guide">Read how it works</a> first.` : ''}</p>
      ${people.length ? html`<h3 class="label">I’m already listed</h3>
        <ul class="pick-list">${people.map((u) => html`<li><button class="btn btn--block pick-btn" data-action="pick-person" data-id="${u.id}">${ui.avatar(u, 'md')}<span><strong>${u.name}</strong><span class="small muted"> · ${CR.store.ROLES[u.role]}</span></span></button></li>`)}</ul>` : ''}
      <h3 class="label">${people.length ? 'Or add me' : 'Add me'}</h3>
      <form data-form="person-add" class="person-form">
        <label class="field"><span class="field__label">Your name <span class="req">required</span></span><input name="name" required autocomplete="off" id="pa-name"></label>
        <label class="field"><span class="field__label">I am a</span>
          <select name="role" id="pa-role"><option value="designer">Designer — I create reviews and upload concepts</option><option value="reviewer">Reviewer — I give Select / Hold / Reject</option>${hasApprover ? '' : html`<option value="approver">Approver — I record the final approval</option>`}</select></label>
        <div class="form-actions"><span class="spacer"></span><button class="btn btn--primary">Continue</button></div>
      </form>`;
  }

  CR.views = Object.assign(CR.views || {}, { reviewPage, summaryPage, benchmarkCard, colourRef });
  CR.modals = { option: optionModal, compare: compareModal, decide: decideModal, share: shareModal, person: personModal };
})(window.CR);
