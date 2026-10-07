/*
 * Starting data. The workspace starts EMPTY: no reviews, benchmarks, colour entries or images.
 * What is seeded:
 *  - the team's category / subcategory list
 *  - Sumant as the approver
 *  - nobody else: each person picks 'who are you?' on first open and adds themselves (name + role).
 */
(function (CR) {
  const CATEGORIES = [
    ['running', 'Running', ['Essentials', 'Light Jogging', 'Daily']],
    ['training', 'Training', ['GYM', 'HIIT']],
    ['barefoot', 'Barefoot', ['Sandals', 'Training', 'Water Sport']],
    ['walking', 'Walking', ['Laceup', 'Slip ons']],
    ['outdoor', 'Outdoor', ['Hiking', 'Trail Running']],
    ['open', 'Open Footwear', ['Sliders', 'Sandals', 'Flip Flops']],
    ['casual', 'Casual', ['Sport', 'Sneakers']],
  ];
  const SCHEMA = 7;
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  function build() {
    return {
      schemaVersion: SCHEMA,
      meta: { currentUserId: null, seededAt: new Date().toISOString(), extraSeasons: [] },
      users: [
        { id: 'u_sumant', name: 'Sumant', initials: 'SU', role: 'approver', hue: 280, demo: false },
      ],
      categories: CATEGORIES.map(([id, name, subs]) => ({ id, name, subcategories: subs.map((n) => ({ id: `${id}-${slug(n)}`, name: n })) })),
      reviews: [], participants: [], areas: [], options: [], colours: [], colourRefs: [], colourStudies: [], benchmarks: [],
      votes: [], comments: [], decisions: [], activity: [], opened: [], people: [],
    };
  }

  const categories = () => CATEGORIES.map(([id, name, subs], i) => ({ id, name, order: i, subcategories: subs.map((n) => ({ id: `${id}-${slug(n)}`, name: n })) }));

  /** An empty state for the shared backend: people, approver and categories come from the shared store. */
  function empty() {
    const s = build();
    s.users = []; s.categories = [];
    s.meta = { currentUserId: null, extraSeasons: [], approverId: null };
    return s;
  }

  CR.seed = { build, empty, categories, SCHEMA };
})(window.CR);
