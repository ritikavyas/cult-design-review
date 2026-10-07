/* "How it works" — an orientation page for someone who has never seen the tool. */
(function (CR) {
  const { html } = CR.util;
  const ui = CR.ui;

  const stepsList = () => [
    ['Sign in with your email', CR.store.mode === 'shared'
      ? 'You’re recognised by your claude.ai account, so your name appears next to your verdicts, uploads and comments. Designers are shared on the page as Editors and reviewers as Contributors; the approver is chosen in Settings.'
      : (CR.store.mode === 'supabase'
        ? 'Enter your email and click the link we send you — no password. Your name appears next to your verdicts, uploads and comments. New people join as Reviewers; a designer can make someone a Designer or the Approver in Settings.'
        : 'Use “Viewing as” at the top right: pick your name, or choose “＋ Add a person…” and enter your name and role. (This local copy has no sign-in.)'), null],
    ['Start a review in a category', 'Go to Reviews. Every category and subcategory (Running › Daily, Training › HIIT …) has its own slot with a “New review” button. A review is one shoe or project for one season.', ['#/reviews', 'Open Reviews']],
    ['Upload the 2D concepts', 'In the review’s Edit page, create decision areas — Overall design, Colourway, Sole, Upper, Materials & detailing — and drop the 2D images into each. Every image becomes an option reviewers can judge.', null],
    ['Add a benchmark and the reason for each concept', 'Under each concept, upload the benchmark shoe image it was inspired by, and write “Why this colour / design / sole”. Reviewers then see the Cult concept, the benchmark and the reason side by side.', ['#/benchmarks', 'See Benchmarks']],
    ['Add the season’s colour study', 'On the Pantone & WGSN page, find the season (SS28, AW28 …) and add its colour study: upload its pages (palettes, themes, colour strategies) and list the key colours with their Pantone codes and WGSN trends. Then link those colours from a concept or a benchmark.', ['#/colours', 'Open Pantone & WGSN']],
    ['Invite reviewers and open the review', 'Tick the reviewers, then click “Open for review”. The review moves from Draft to In review.', null],
    ['Reviewers mark every option', 'Each reviewer marks each option Select, Hold or Reject. Selecting means “take this forward”, Hold means “not sure yet — discuss”, Reject means “drop it”. They can change their mind until voting closes, and add comments.', null],
    ['Sumant approves', 'The approver sees the most-selected option and who chose what, then approves, holds or rejects each option with a short reason. Reviewer verdicts are advice; the approval is the decision.', null],
    ['Find the result', 'Approved designs appear on the Selections page, by type (design, colour, sole, upper) and by category. Each review also has a printable approval summary that replaces the PowerPoint.', ['#/finals', 'Open Selections']],
  ];

  const TABS = [
    ['Dashboard', 'What needs your attention: reviews waiting for your verdict (or approval) and the latest approved selections.'],
    ['Reviews', 'All design reviews, organised by category and subcategory. Start a new review here.'],
    ['Selections', 'The record of decisions: what was approved, and what reviewers are currently selecting most — by design, colour, sole and upper.'],
    ['Benchmarks', 'Reference shoes from other brands, by category: what each informs, its colours (with Pantone / WGSN) and the Cult designs it inspired.'],
    ['Pantone & WGSN', 'One colour study per season (for example Colour study S/S 28): its pages, and the key colours with Pantone codes and WGSN trends.'],
    ['Settings', 'People and roles, and the category list (add or rename categories and subcategories).'],
  ];

  function guidePage() {
    const approver = CR.store.sel.approver();
    return html`
      <div class="page-head"><div><p class="eyebrow">Start here</p><h1 class="display display--sm">How design reviews work</h1>
        <p class="lede">This replaces the design-review PowerPoint. Concepts, benchmarks, colours, reviewer verdicts and the final approval for each shoe live in one shared place.</p></div>
        <a class="btn btn--primary" href="#/reviews">${ui.icon('plus')} Start a review</a></div>

      <section class="panel" aria-labelledby="h-roles">
        <header class="section-head"><h2 id="h-roles">Who does what</h2></header>
        <div class="role-grid">
          <div class="role-card"><p class="role-card__t">Designer</p><p>Creates reviews, uploads 2D concepts and benchmark images, explains each concept, adds the season’s Pantone and WGSN data, and invites reviewers.</p></div>
          <div class="role-card"><p class="role-card__t">Reviewer</p><p>Opens a review they’re invited to and marks every option <strong>Select</strong>, <strong>Hold</strong> or <strong>Reject</strong>. Can comment and change a verdict until voting closes.</p></div>
          <div class="role-card"><p class="role-card__t">Approver${approver ? ` — ${approver.name}` : ''}</p><p>Makes the final call for each decision area. Reviewer verdicts are advisory; the approval is recorded separately with a reason.</p></div>
        </div>
      </section>

      <section class="panel" aria-labelledby="h-steps">
        <header class="section-head"><h2 id="h-steps">The steps</h2></header>
        <ol class="steps">${stepsList().map(([t, d, link]) => html`<li><div><p class="steps__t">${t}</p><p>${d}</p>${link ? html`<a class="link" href="${link[0]}">${link[1]} →</a>` : ''}</div></li>`)}</ol>
      </section>

      <section class="panel" aria-labelledby="h-tabs">
        <header class="section-head"><h2 id="h-tabs">What each tab is for</h2></header>
        <dl class="tab-list">${TABS.map(([t, d]) => html`<div><dt>${t}</dt><dd>${d}</dd></div>`)}</dl>
      </section>

      <p class="notice"><strong>Good to know.</strong> This is a first version: there is no sign-in yet, and everything is saved in this browser only. Pantone and WGSN are not connected — your team adds the data it is licensed to use. Benchmarks are references from other brands, never Cult options.</p>
    `;
  }

  CR.views = Object.assign(CR.views || {}, { guidePage });
})(window.CR);
