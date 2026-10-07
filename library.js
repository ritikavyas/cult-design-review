/*
 * Pantone & WGSN: one or more COLOUR STUDIES per season (e.g. "Colour study S/S 28").
 * A study is made of pages (images — such as the palette, theme and colour-strategy slides the team
 * keeps today) plus the key colours with their Pantone codes and WGSN trends.
 * Nothing is fetched from WGSN or Pantone and nothing is pre-filled: the designer adds what the team is licensed to use.
 * Key colours can be linked from Cult concept colours and benchmark colours (see the editors).
 */
(function (CR) {
  const { html, raw, fmtDate, isSafeUrl, hostOf, inkOn, plural } = CR.util;
  const { sel } = CR.store;
  const ui = CR.ui;

  const SOURCES = { wgsn: 'WGSN', pantone: 'Pantone', other: 'Other' };
  const seasonLabel = (s) => (s || '').replace(/^(SS|AW)\s?(\d{2})$/i, (m, a, b) => `${a.toUpperCase() === 'SS' ? 'S/S' : 'A/W'} ${b}`);

  const usedIn = (id) => CR.store.state.colours.filter((c) => (c.refIds || []).includes(id)).length
    + CR.store.state.benchmarks.reduce((n, b) => n + (b.colours || []).filter((c) => (c.refIds || []).includes(id)).length, 0);
  const sourceBadge = (src) => html`<span class="src src--${src}">${SOURCES[src] || src}</span>`;

  /**
   * Compact read-only reference chip (swatch · source · name · Pantone code · trend · season).
   * `removable` = Cult colour id to unlink from; `remove` = {bid, cid} to unlink from a benchmark colour.
   */
  function refChip(ref, { removable = null, remove = null } = {}) {
    if (!ref) return '';
    return html`<span class="ref-chip">
      <span class="ref-chip__sw" style="background:${ref.hex}"></span>
      <span class="ref-chip__text">${sourceBadge(ref.source)} <strong>${ref.name || 'Unnamed'}</strong>${ref.code ? html` · Pantone ${ref.code}` : ''}${ref.trend ? html` · ${ref.trend}` : ''}<span class="muted"> · ${ref.season}</span></span>
      ${removable ? html`<button class="icon-btn icon-btn--sm" data-action="remove-colref-link" data-colour="${removable}" data-ref="${ref.id}" aria-label="Unlink ${ref.name}">${ui.icon('x')}</button>` : ''}
      ${remove ? html`<button class="icon-btn icon-btn--sm" data-action="remove-bc-link" data-bid="${remove.bid}" data-cid="${remove.cid}" data-ref="${ref.id}" aria-label="Unlink ${ref.name}">${ui.icon('x')}</button>` : ''}
    </span>`;
  }

  /** Read-only list of a benchmark shoe's colours, with Pantone / WGSN codes and library links. */
  function benchColours(b) {
    const cols = b.colours || [];
    if (!cols.length) return html`<p class="small muted">No colours recorded for this shoe.</p>`;
    return html`<ul class="colour-lines colour-lines--bench">${cols.map((c) => {
      const refs = (c.refIds || []).map(sel.colourRef).filter(Boolean);
      return html`<li><span class="swatch" style="background:${c.hex}"></span>
        <span><strong>${c.part}:</strong> ${c.name || 'Unnamed'}${c.pantone ? html` · Pantone ${c.pantone}` : ''}${c.wgsn ? html` · WGSN ${c.wgsn}` : ''}${!c.pantone && !c.wgsn && !refs.length ? html` <span class="muted">· no Pantone / WGSN recorded</span>` : ''}${refs.length ? html`<span class="ref-chips">${refs.map((x) => refChip(x))}</span>` : ''}</span></li>`;
    })}</ul>`;
  }

  /** `<option>`s of every key colour in the colour studies, grouped by season (the given season first). */
  function studyColourOptions(avail, season) {
    const seasons = [season, ...sel.seasons()].filter((s, i, a) => s && a.indexOf(s) === i);
    return seasons.map((s) => {
      const list = avail.filter((e) => e.season === s);
      return list.length ? html`<optgroup label="${s}">${list.map((e) => html`<option value="${e.id}">${SOURCES[e.source]} · ${e.name || 'Unnamed'}${e.code ? ' · ' + e.code : ''}</option>`)}</optgroup>` : '';
    });
  }

  /** Editable colours for a benchmark shoe. `season` lists that season's study colours first. */
  function benchColourEditor(b, season = '') {
    return html`<div class="col-list"><p class="label">Colours of this shoe</p>
      ${(b.colours || []).map((c) => {
        const linked = (c.refIds || []).map(sel.colourRef).filter(Boolean);
        const avail = CR.store.state.colourRefs.filter((e) => !(c.refIds || []).includes(e.id));
        return html`<div class="col-edit">
          <div class="col-edit__swatch"><label class="sr-only" for="bch-${c.id}">Swatch colour</label>
            <input type="color" id="bch-${c.id}" value="${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cccccc'}" data-bc-field="hex" data-bid="${b.id}" data-cid="${c.id}"></div>
          <div class="col-edit__fields">
            <label class="field field--xs"><span class="field__label">Part</span><select data-bc-select="part" data-bid="${b.id}" data-cid="${c.id}" id="bcp-${c.id}">${['Upper', 'Midsole', 'Midsole accent', 'Outsole', 'Overlay', 'Lining', 'Laces', 'Logo', 'Other'].map((p) => html`<option ${p === c.part ? raw('selected') : ''}>${p}</option>`)}</select></label>
            <label class="field"><span class="field__label">Colour name</span><input value="${c.name}" data-bc-field="name" data-bid="${b.id}" data-cid="${c.id}" id="bcn-${c.id}"></label>
            <label class="field"><span class="field__label">Pantone</span><input value="${c.pantone}" data-bc-field="pantone" data-bid="${b.id}" data-cid="${c.id}" id="bcpt-${c.id}" placeholder="From your Pantone source"></label>
            <label class="field"><span class="field__label">WGSN trend / ref</span><input value="${c.wgsn}" data-bc-field="wgsn" data-bid="${b.id}" data-cid="${c.id}" id="bcw-${c.id}" placeholder="Trend name or report ref"></label>
            <div class="field field--span2 field--link">
              <label class="field"><span class="field__label">Link a key colour from a colour study</span>
                <select data-bc-addref data-bid="${b.id}" data-cid="${c.id}" id="bcl-${c.id}"><option value="">${avail.length ? 'Link a colour…' : 'No colour-study colours yet'}</option>${studyColourOptions(avail, season)}</select></label>
              ${linked.length ? html`<span class="ref-chips">${linked.map((x) => refChip(x, { remove: { bid: b.id, cid: c.id } }))}</span>` : ''}
            </div>
          </div>
          <button class="icon-btn icon-btn--sm" data-action="remove-bcolour" data-bid="${b.id}" data-cid="${c.id}" aria-label="Remove colour ${c.name}">${ui.icon('trash')}</button>
        </div>`;
      })}
      <button class="btn btn--ghost btn--sm" data-action="add-bcolour" data-id="${b.id}">${ui.icon('plus')} Add colour</button>
    </div>`;
  }

  // ───────────────────────── colour studies ─────────────────────────

  function colourRow(c, editable) {
    const n = usedIn(c.id);
    if (!editable) {
      return html`<li class="sc-row sc-row--read"><span class="swatch swatch--lg" style="background:${c.hex}"></span>
        <span class="sc-row__main"><strong>${c.name || 'Unnamed colour'}</strong>
          <span class="small">${c.code ? html`Pantone ${c.code}` : html`<span class="muted">No Pantone code</span>`}${c.trend ? html` · ${c.trend}` : ''}</span></span>
        <span class="small muted">Used in ${plural(n, 'colour')}</span></li>`;
    }
    return html`<li class="sc-row">
      <div class="col-edit__swatch"><label class="sr-only" for="sch-${c.id}">Swatch colour</label>
        <input type="color" id="sch-${c.id}" value="${/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : '#cccccc'}" data-cr-field="hex" data-id="${c.id}"></div>
      <label class="field"><span class="field__label">Colour name</span><input value="${c.name}" data-cr-field="name" data-id="${c.id}" id="scn-${c.id}" placeholder="As named in the study"></label>
      <label class="field"><span class="field__label">Pantone code</span><input value="${c.code}" data-cr-field="code" data-id="${c.id}" id="scc-${c.id}" placeholder="From your Pantone guide"></label>
      <label class="field"><span class="field__label">WGSN trend / reference</span><input value="${c.trend}" data-cr-field="trend" data-id="${c.id}" id="sct-${c.id}" placeholder="Trend or theme name"></label>
      <button class="icon-btn icon-btn--sm" data-action="remove-colref" data-id="${c.id}" aria-label="Delete colour ${c.name || ''}">${ui.icon('trash')}</button>
      <p class="small muted sc-row__used">Used in ${plural(n, 'colour')}</p>
    </li>`;
  }

  function pageTile(st, p, i, editable) {
    const n = st.pages.length;
    return html`<figure class="page-tile">
      <button class="page-tile__img" data-action="open-page" data-study="${st.id}" data-page="${p.id}" aria-label="Open page ${i + 1}${p.caption ? ': ' + p.caption : ''} larger">${ui.media(p.imageRef, p.caption || `Page ${i + 1}`, { ratio: 'slide' })}</button>
      ${editable ? html`<div class="page-tile__edit">
        <label class="sr-only" for="spc-${p.id}">Caption for page ${i + 1}</label>
        <input id="spc-${p.id}" value="${p.caption}" data-sp-caption data-study="${st.id}" data-page="${p.id}" placeholder="e.g. Neutral colour palette">
        <button class="icon-btn icon-btn--sm" data-action="move-page" data-study="${st.id}" data-page="${p.id}" data-dir="-1" ${i === 0 ? raw('disabled') : ''} aria-label="Move page ${i + 1} earlier">${ui.icon('arrowL')}</button>
        <button class="icon-btn icon-btn--sm" data-action="move-page" data-study="${st.id}" data-page="${p.id}" data-dir="1" ${i === n - 1 ? raw('disabled') : ''} aria-label="Move page ${i + 1} later">${ui.icon('arrowR')}</button>
        <button class="icon-btn icon-btn--sm" data-action="remove-page" data-study="${st.id}" data-page="${p.id}" aria-label="Delete page ${i + 1}">${ui.icon('trash')}</button>
      </div>` : (p.caption ? html`<figcaption class="small">${p.caption}</figcaption>` : '')}
    </figure>`;
  }

  function studyCard(st, editable) {
    const colours = sel.studyColours(st.id);
    const seasons = sel.seasons();
    const adder = sel.user(st.addedBy);
    return html`<article class="study" id="study-${st.id}">
      ${editable ? html`<header class="study__head">
        <div class="form-grid form-grid--tight">
          <label class="field field--span2"><span class="field__label">Colour study title</span>
            <input value="${st.title}" data-st-field="title" data-id="${st.id}" id="stt-${st.id}" placeholder="e.g. Colour study S/S 28"></label>
          <label class="field"><span class="field__label">Season</span>
            <select data-st-select="season" data-id="${st.id}" id="sts-${st.id}">${[...new Set([st.season, ...seasons].filter(Boolean))].map((s) => html`<option value="${s}" ${s === st.season ? raw('selected') : ''}>${s}</option>`)}</select></label>
          <label class="field"><span class="field__label">Source</span>
            <select data-st-select="source" data-id="${st.id}" id="stsrc-${st.id}">${Object.entries(SOURCES).map(([k, l]) => html`<option value="${k}" ${k === st.source ? raw('selected') : ''}>${l}</option>`)}</select></label>
          <label class="field field--span2"><span class="field__label">What this study covers</span>
            <textarea rows="2" data-st-field="summary" data-id="${st.id}" id="stsum-${st.id}" placeholder="e.g. Tracks the key colour directions and their evolution toward S/S 28">${st.summary}</textarea></label>
          <label class="field"><span class="field__label">Report / reference</span>
            <input value="${st.report}" data-st-field="report" data-id="${st.id}" id="strep-${st.id}" placeholder="Report title, edition, date"></label>
          <label class="field"><span class="field__label">Source link</span>
            <input value="${st.sourceUrl}" data-st-field="sourceUrl" data-id="${st.id}" id="stu-${st.id}" placeholder="https://… (optional)"></label>
        </div>
        <button class="btn btn--ghost btn--sm" data-action="remove-study" data-id="${st.id}">${ui.icon('trash')} Delete study</button>
      </header>`
      : html`<header class="study__head study__head--read">
        <p class="rcard__meta">${sourceBadge(st.source)}<span class="eyebrow">${seasonLabel(st.season)}</span></p>
        <h3 class="study__title">${st.title}</h3>
        ${st.summary ? html`<p>${st.summary}</p>` : ''}
        <p class="small muted">${st.report ? `${st.report} · ` : ''}${isSafeUrl(st.sourceUrl) ? html`<a class="link" href="${st.sourceUrl}" target="_blank" rel="noopener noreferrer">${hostOf(st.sourceUrl)}</a> · ` : ''}added by ${adder ? adder.name : 'someone'}, ${fmtDate(st.addedAt)}</p>
      </header>`}

      <h4 class="label">Pages <span class="count">${st.pages.length}</span></h4>
      ${st.pages.length ? html`<div class="page-grid">${st.pages.map((p, i) => pageTile(st, p, i, editable))}</div>`
        : html`<p class="small muted">No pages uploaded yet.</p>`}
      ${editable ? html`<div class="dropzone dropzone--inline" data-drop="study-pages" data-id="${st.id}">
        ${ui.icon('upload')}<p><strong>Drop pages here</strong> — screenshots or exported slides of this colour study (palettes, themes, colour strategies).</p>
        <div class="dropzone__actions"><label class="btn btn--sm file-btn">Browse files<input type="file" accept="image/*" multiple data-upload="study-pages" data-id="${st.id}" class="sr-only"></label></div>
      </div>` : ''}

      <h4 class="label">Key colours <span class="count">${colours.length}</span></h4>
      ${colours.length ? html`<ul class="sc-list">${colours.map((c) => colourRow(c, editable))}</ul>` : html`<p class="small muted">No key colours recorded.${editable ? ' Add the colours this study highlights, with their Pantone codes and WGSN trends.' : ''}</p>`}
      ${editable ? html`<button class="btn btn--sm" data-action="add-study-colour" data-id="${st.id}">${ui.icon('plus')} Add key colour</button>` : ''}
    </article>`;
  }

  function seasonBlock(season, editable) {
    const studies = sel.studies(season);
    return html`<section class="season-block" aria-labelledby="sb-${season}">
      <header class="section-head"><h2 id="sb-${season}">${season} <span class="muted season-block__sub">${seasonLabel(season)}</span> <span class="count" title="Colour studies">${studies.length}</span></h2>
        ${editable && studies.length ? html`<button class="btn btn--sm" data-action="add-study" data-season="${season}">${ui.icon('plus')} Add another colour study</button>` : ''}</header>
      ${studies.length ? studies.map((s) => studyCard(s, editable))
        : html`<div class="slot-empty slot-empty--drop" ${editable ? raw(`data-drop="study-new" data-id="${season}"`) : ''}>
            <p><strong>No colour study for ${season} yet.</strong> ${editable ? 'Add the season’s WGSN / Pantone colour study — or drop its pages here to start one.' : 'A designer adds the season’s colour study here.'}</p>
            ${editable ? html`<span class="slot__tools"><button class="btn btn--primary btn--sm" data-action="add-study" data-season="${season}">${ui.icon('plus')} Add colour study</button>
              <label class="btn btn--sm file-btn">${ui.icon('upload')} Upload pages<input type="file" accept="image/*" multiple data-upload="study-new" data-id="${season}" class="sr-only" aria-label="Upload colour study pages for ${season}"></label></span>` : ''}
          </div>`}
    </section>`;
  }

  function libraryPage() {
    const st = CR.store.state;
    const L = CR.app.ui.library;
    const seasons = sel.seasons();
    if (!L.season) L.season = 'all';
    const all = L.season === 'all';
    const editable = CR.perm.can('manageLibrary', null);
    const shown = all ? seasons : [L.season];

    return html`
      <div class="page-head"><div><p class="eyebrow">WGSN &amp; Pantone · season by season</p><h1 class="display display--sm">Pantone &amp; WGSN</h1>
        <p class="lede">One colour study per season — the pages, and the key colours with their Pantone codes and WGSN trends.</p></div></div>
      ${ui.about(html`A <strong>colour study</strong> is the season’s colour direction from WGSN or Pantone — for example <em>Colour study S/S 28</em>, with its palette, colour-theme and colour-strategy pages. The designer adds one for each season: upload the pages, then list the key colours with their codes. Colours here can be linked from a Cult concept or a benchmark shoe. Nothing is connected to WGSN or Pantone or filled in automatically — add only content your team is licensed to use internally.`)}

      <div class="season-bar" role="group" aria-label="Season">
        <button class="season-tab ${all ? 'is-on' : ''}" aria-pressed="${all}" data-action="lib-season" data-season="all">All seasons <span class="count">${st.colourStudies.length}</span></button>
        ${seasons.map((s) => html`<button class="season-tab ${L.season === s ? 'is-on' : ''}" aria-pressed="${L.season === s}" data-action="lib-season" data-season="${s}">${s} <span class="count">${sel.studies(s).length}</span></button>`)}
        ${editable ? html`<form class="season-add" data-form="season-add"><label class="sr-only" for="new-season">Add a season</label><input id="new-season" name="name" placeholder="+ Season (e.g. SS30)" maxlength="8" pattern="(SS|AW|ss|aw)\\s?\\d{2}" title="Format: SS28 or AW28"><button class="btn btn--sm">Add</button></form>` : ''}
      </div>

      ${shown.map((s) => seasonBlock(s, editable))}
    `;
  }

  // ───────────────────────── page viewer (modal) ─────────────────────────

  function studyPageModal({ studyId, pageId }) {
    const st = sel.study(studyId); if (!st) return null;
    const i = st.pages.findIndex((p) => p.id === pageId); if (i < 0) return null;
    const p = st.pages[i]; const prev = st.pages[i - 1]; const next = st.pages[i + 1];
    return html`
      <header class="modal__head"><div><p class="eyebrow">${st.title} · ${seasonLabel(st.season)} · page ${i + 1} of ${st.pages.length}</p>
        <h2 id="modal-title" class="modal__title">${p.caption || `Page ${i + 1}`}</h2></div>
        <div class="modal__nav">
          <button class="icon-btn" data-action="open-page" data-study="${st.id}" data-page="${prev ? prev.id : ''}" ${prev ? '' : raw('disabled')} aria-label="Previous page" id="m-prev">${ui.icon('arrowL')}</button>
          <button class="icon-btn" data-action="open-page" data-study="${st.id}" data-page="${next ? next.id : ''}" ${next ? '' : raw('disabled')} aria-label="Next page" id="m-next">${ui.icon('arrowR')}</button>
          <button class="icon-btn" data-action="close-modal" aria-label="Close">${ui.icon('x')}</button>
        </div></header>
      <div class="page-viewer">${ui.media(p.imageRef, p.caption || `Page ${i + 1}`, { ratio: 'slide' })}</div>`;
  }

  CR.views = Object.assign(CR.views || {}, { libraryPage });
  CR.modals = Object.assign(CR.modals || {}, { studyPage: studyPageModal });
  CR.library = { refChip, sourceBadge, SOURCES, benchColours, benchColourEditor, studyColourOptions, seasonLabel };
})(window.CR);
