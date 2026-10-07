/*
 * Permission rules, in one place. The UI asks `can(...)` and never checks roles inline.
 *
 * Roles: designer (creates reviews, uploads concepts, benchmarks, colour studies),
 *        reviewer (gives Select / Hold / Reject when invited), approver (records the final approval).
 *
 * Shared version (published on claude.ai): who you are comes from your claude.ai account.
 *   - Editors on the page are designers (and the approver) — they can add and change content and upload images.
 *   - Contributors are reviewers — they can give verdicts and comment.
 *   - The approver is chosen in Settings.
 * The shared database enforces the Editor / Contributor split. Who is "the approver" is an app rule (UI only).
 * Local version (browser only): roles are chosen from the "Viewing as" menu and are not enforced.
 */
(function (CR) {
  const { sel } = CR.store;

  const caps = () => CR.store.caps || { admin: true, write: true, upload: true };
  const isApprover = (u) => !!u && u.role === 'approver';
  const isDesigner = (u) => !!u && (u.role === 'designer' || u.role === 'approver');
  const isOwner = (u, r) => !!u && !!r && r.ownerId === u.id;
  const participant = (u, r) => (u && r ? sel.participant(r.id, u.id) : null);
  const manages = (u, r) => isOwner(u, r) || isDesigner(u);

  const rules = {
    editReview: manages,
    deleteReview: manages,
    changeStatus: manages,
    share: manages,
    vote: (u, r) => r.status === 'in_review' && !!participant(u, r) && caps().write,
    decide: (u, r) => r.status !== 'draft' && isApprover(u) && caps().admin,
    comment: (u, r) => caps().write && (r.status !== 'draft' ? (!!participant(u, r) || manages(u, r)) : manages(u, r)),
    view: (u, r) => r.status !== 'draft' || manages(u, r) || !!participant(u, r),
    createReview: (u) => isDesigner(u) && caps().admin,
    manageLibrary: (u) => isDesigner(u) && caps().admin,
    manageSettings: (u) => isDesigner(u) && caps().admin,
  };

  function can(action, review, user = CR.store.me()) {
    const rule = rules[action];
    return rule ? !!rule(user, review) : false;
  }

  /** Human-readable reason, used for disabled-control hints. */
  function why(action, review, user = CR.store.me()) {
    const approver = sel.approver();
    if (action === 'vote') {
      if (review.status === 'draft') return 'Voting opens when the designer moves this review to In review.';
      if (review.status === 'final') return 'Voting is closed — this review is at Final decision.';
      if (!participant(user, review)) return `${user.name} isn’t invited to this review, so can’t give verdicts.`;
      if (!caps().write) return 'You have view-only access to this page, so you can’t give verdicts.';
    }
    if (action === 'decide') return `Only the approver${approver ? ` (${approver.name})` : ''} can record the final approval.`;
    return 'Not available for you.';
  }

  CR.perm = { can, why, isOwner, isApprover };
})(window.CR);
