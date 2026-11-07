// The Rules tab (#rules-host, loaded when first opened): every rule the week builder and the call maker keep, as cards in
// plain words (roster/rule-cards.js), must-hold rules first, then warnings, then preferences by priority, with a search box.
// Makers turn a card on or off (its switch), and open it to set its priority, weight or numbers and its wording; a fixed
// card (the builders depend on it) is always on. "+ Add rule" picks one of @core/roster's rule types and opens the one
// builder: the type's own fields, who it covers (tags), level and priority. A changed default is saved as a copy under its
// id (spaces/_/rules, data/plans.js); "Reset to default" deletes the copy. Viewers read the same cards.
import { icon } from '@core/ui';
import { RULE_TYPES, describeRule, validateRule, whoWords } from '@core/roster';
import { ICONS } from '../icons.js';
import { $, h, fill } from '../dom.js';
import { REFUSED } from '../items.js';
import { KINDS } from '../data/lists.js';
import { TIERS, TIER_LABEL } from '../roster/model.js';
import { rulesOf, ordered, wordsOf, defaultOf, savedFields } from '../roster/rule-cards.js';
import { editSheet } from './sheet.js';
import { heading } from './rows.js';

/** @typedef {import('../roster/rule-cards.js').RuleCard} RuleCard */
/** @typedef {import('./sheet.js').Field} Field */

const LEVELS = /** @type {[RuleCard['level'], string, string][]} */ ([
  ['block', 'Must hold', 'Build never breaks it.'],
  ['warn', 'Warnings', 'Build breaks it only when there is no other way.'],
  ['soft', 'Preferences', 'Build weighs it against the other preferences, by priority and weight.'],
]);
const LEVEL_NAME = { block: 'Must hold', warn: 'Warning', soft: 'Preference' };
const PRIORITIES = /** @type {[string, string][]} */ ([['1', '1 (most important)'], ['2', '2'], ['3', '3 (least important)']]);
const TOPICS = /** @type {[string, string][]} */ ([['week', 'The week'], ['calls', 'The calls']]);
// the people tags the cards can name (roster/problem.js gives them to people)
const PEOPLE_TAGS = /** @type {[string, string][]} */ ([['junior', 'Juniors'], ['registrar', 'Registrars'], ['r3', 'R3s']]);
const TAG_NAME = Object.fromEntries(PEOPLE_TAGS);
const DESCRIBE = (/** @type {RuleCard} */ r) => describeRule(/** @type {any} */ (r));
const PROBLEMS = (/** @type {RuleCard} */ r) => validateRule(/** @type {any} */ (r));
/** @param {RuleCard} r */
const words = r => wordsOf(r, DESCRIBE);

/** slot choices by topic: a week's list kinds, a month's call tiers @param {string} topic @returns {[string, string][]} */
const slotChoices = topic => (topic === 'calls'
  ? [['', 'Any call'], ...TIERS.map(t => /** @type {[string, string]} */ ([t, `${TIER_LABEL[t]} calls`])), ['off-day', 'Weekend and holiday calls']]
  : [['', 'Any list'], ...KINDS.map(([k, l]) => /** @type {[string, string]} */ ([k, l]))]);

/** a slot filter -> the builder's choice @param {any} f @param {string} topic */
const slotPick = (f, topic) => (topic === 'calls' ? f?.tags?.[0] : f?.kinds?.[0]) ?? '';
/** the builder's choice -> a slot filter @param {string} pick @param {string} session @param {string} topic */
const slotFilter = (pick, session, topic) => (topic === 'calls'
  ? { kinds: ['call'], ...(pick ? { tags: [pick] } : {}) }
  : { ...(pick ? { kinds: [pick] } : {}), ...(session ? { sessions: [session] } : {}) });

/**
 * The builder's fields for a rule type's params (@core/roster RULE_TYPES[type].params), keyed `p.<key>` (a slot filter:
 * `.kind` and, for the week, `.session`; who: `.tag` and `.not`).
 * @param {string} type @returns {Field[]}
 */
function paramFields(type) {
  return (RULE_TYPES[type]?.params ?? []).flatMap(/** @returns {Field[]} */ s => {
    const k = `p.${s.key}`;
    if (s.kind === 'slots') return [
      { key: `${k}.kind`, label: s.label, type: 'select', options: v => slotChoices(v.topic) },
      { key: `${k}.session`, label: `${s.label}: session`, type: 'select', options: v => (v.topic === 'calls' ? [['', 'Any']] : [['', 'AM or PM'], ['AM', 'AM'], ['PM', 'PM']]) },
    ];
    if (s.kind === 'who') return [
      { key: `${k}.tag`, label: s.label, type: 'select', options: [['', 'Anyone'], ...PEOPLE_TAGS] },
      { key: `${k}.not`, label: `${s.label}: everyone but them`, type: 'check' },
    ];
    if (s.kind === 'choice') return [{ key: k, label: s.label, type: 'select', options: (s.choices ?? []).map(c => /** @type {[string, string]} */ ([c, c])) }];
    if (s.kind === 'int' || s.kind === 'number') return [{ key: k, label: s.label, type: 'number', min: s.kind === 'int' ? -14 : 0, max: 100 }];
    return [{ key: k, label: s.label, max: 80, hint: s.kind === 'keys' ? 'Separate them with commas.' : undefined }];
  });
}

/** a rule's params -> the builder's values @param {string} type @param {Record<string, any>} params @param {string} topic */
function paramValues(type, params, topic) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const s of RULE_TYPES[type]?.params ?? []) {
    const k = `p.${s.key}`, v = params[s.key] ?? s.default;
    if (s.kind === 'slots') { out[`${k}.kind`] = slotPick(v, topic); out[`${k}.session`] = v?.sessions?.[0] ?? ''; }
    else if (s.kind === 'who') { out[`${k}.tag`] = v?.tags?.[0] ?? ''; out[`${k}.not`] = !!v?.not; }
    else if (s.kind === 'keys') out[k] = Array.isArray(v) ? v.join(', ') : '';
    else out[k] = v ?? (s.kind === 'int' || s.kind === 'number' ? null : '');
  }
  return out;
}

/** the builder's values -> params (blank numbers left out) @param {string} type @param {Record<string, any>} v */
function paramsOf(type, v) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const s of RULE_TYPES[type]?.params ?? []) {
    const k = `p.${s.key}`;
    if (s.kind === 'slots') out[s.key] = slotFilter(v[`${k}.kind`], v[`${k}.session`], v.topic);
    else if (s.kind === 'who') out[s.key] = v[`${k}.tag`] ? { tags: [v[`${k}.tag`]], ...(v[`${k}.not`] ? { not: true } : {}) } : {};
    else if (s.kind === 'keys') out[s.key] = String(v[k] ?? '').split(',').map(x => x.trim()).filter(Boolean);
    else if (s.kind === 'int' || s.kind === 'number') { if (v[k] != null) out[s.key] = v[k]; }
    else if (v[k] !== '') out[s.key] = v[k];
  }
  return out;
}

/** @param {import('./context.js').Context} ctx */
export function create(ctx) {
  const { app, store, toast } = ctx;
  const sheet = editSheet();
  const host = $('rules-host');
  const search = h('input', { type: 'search', id: 'rules-search', class: 'ru-search', placeholder: 'Find a rule', 'aria-label': 'Find a rule', autocomplete: 'off', oninput: () => draw() });
  const add = h('button', { type: 'button', class: 'ui-primary', id: 'rules-add', onclick: () => pickType() }, icon(ICONS.plus), 'Add rule');
  const bar = h('div', { class: 'rl-bar' }, search, add);
  const body = h('div', { class: 'ru-body' });
  host.append(bar, body);
  store.on(['rules'], () => draw());
  ctx.onRole(() => draw());

  /** the saved copies and own cards (spaces/_/rules) @returns {import('../data/plans.js').RuleRow[]} */
  const saved = () => /** @type {any[]} */ (store.get('rules')).filter(r => !r._deleted);
  const savedRow = (/** @type {string} */ id) => saved().find(r => r.id === id);

  /** saves a card whole (a default's copy under its id, or an own card) @param {RuleCard} r */
  async function put(r) {
    toast(await app.data.rules.upsert(r.id, /** @type {any} */ (savedRow(r.id)), savedFields(r)) ? REFUSED : 'Saved');
  }

  /** @param {RuleCard} r @param {boolean} on */
  const turn = (r, on) => put({ ...r, on });

  /** a default card's own numbers, as the builders read them (rule-cards.js weekRules, callRules) @param {RuleCard} r @param {RuleCard} d @returns {Field[]} */
  const numberFields = (r, d) => [
    ...(r.id === 'week-post-call' ? [/** @type {Field} */ ({ key: 'pc', label: 'Post-call takes', type: 'select', options: [['pm', 'The PM only'], ['day', 'The whole day']] })] : []),
    ...(r.id === 'calls-gap' ? [/** @type {Field} */ ({ key: 'gap', label: 'Clear days between calls', type: 'number', min: 1, max: 7, hint: 'A month\'s own "Days clear" setting wins over this.' })] : []),
    ...(r.id === 'calls-spacing' ? [/** @type {Field} */ ({ key: 'spaced', label: 'Spaced out up to (days after a call)', type: 'number', min: 2, max: 14 })] : []),
    ...(typeof d.params.points === 'number' ? [/** @type {Field} */ ({ key: 'points', label: 'Weight', type: 'number', min: 0, max: 100, hint: `How much it counts when Build weighs a choice (default ${d.params.points}).` })] : []),
  ];

  /** a default card's sheet: on, priority, numbers, wording; Reset to default when changed @param {RuleCard} r @param {RuleCard} d */
  function openDefault(r, d) {
    const row = savedRow(r.id), s = r.params?.then?.sessions;
    sheet.open({
      title: 'Rule', saveLabel: 'Save',
      note: `${words(r)}. ${LEVEL_NAME[r.level]}: ${LEVELS.find(l => l[0] === r.level)?.[2]}${r.fixed ? ' Always on: Build depends on it.' : ''}`,
      values: { on: r.on !== false, priority: String(r.priority), words: r.words ?? '', points: r.params?.points ?? null,
        pc: Array.isArray(s) && s.length && !s.includes('AM') ? 'pm' : 'day', gap: r.params?.to ?? null, spaced: r.params?.to ?? null },
      fields: [
        ...(r.fixed ? [] : [/** @type {Field} */ ({ key: 'on', label: 'On', type: 'check' })]),
        ...(r.level === 'soft' ? [/** @type {Field} */ ({ key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES })] : []),
        ...numberFields(r, d),
        { key: 'words', label: 'Wording', max: 200, hint: 'Your own words for it (empty: the standard words).' },
      ],
      deleteLabel: 'Reset to default',
      onDelete: row ? async () => { toast(await app.data.rules.remove(row) ? REFUSED : 'Back to the default'); } : undefined,
      onSave: v => {
        const params = { ...r.params };
        if (r.id === 'week-post-call') params.then = v.pc === 'pm' ? { sessions: ['PM'] } : {};
        if (r.id === 'calls-gap' && v.gap != null) params.to = Math.round(v.gap);
        if (r.id === 'calls-spacing' && v.spaced != null) params.to = Math.round(v.spaced);
        if ('points' in v) params.points = v.points ?? d.params.points;
        return put({ ...r, on: r.fixed ? true : v.on, priority: /** @type {1 | 2 | 3} */ (Number(v.priority) || r.priority), words: v.words, params });
      },
    });
  }

  /** the one builder: a new rule of a type (r: null) or an own card @param {RuleCard | null} r @param {string} type @param {string} topic */
  function openBuilder(r, type, topic) {
    const t = RULE_TYPES[type];
    /** @param {Record<string, any>} v @returns {RuleCard} */
    const cardOf = v => ({
      id: r?.id ?? `own-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, type, topic: v.topic, words: v.words,
      level: v.level, priority: /** @type {1 | 2 | 3} */ (Number(v.priority) || 2), on: v.on,
      tags: PEOPLE_TAGS.map(([k]) => k).filter(k => v[`tag.${k}`]), params: paramsOf(type, v),
    });
    sheet.open({
      title: r ? `Rule: ${t?.label ?? type}` : `New rule: ${t?.label ?? type}`, saveLabel: r ? 'Save' : 'Add rule',
      note: 'Your own rules are listed and checked; Build does not place people by them yet.',
      values: { topic, level: r?.level ?? t?.level ?? 'soft', priority: String(r?.priority ?? 2), on: r ? r.on !== false : true, words: r?.words ?? '',
        ...Object.fromEntries(PEOPLE_TAGS.map(([k]) => [`tag.${k}`, !!r?.tags?.includes(k)])), ...paramValues(type, r?.params ?? {}, topic) },
      fields: [
        { key: 'topic', label: 'For', type: 'select', options: TOPICS },
        ...paramFields(type),
        ...PEOPLE_TAGS.map(([k, l]) => /** @type {Field} */ ({ key: `tag.${k}`, label: `Covers ${l.toLowerCase()}`, type: 'check' })),
        { key: 'level', label: 'Level', type: 'select', options: LEVELS.map(([k]) => /** @type {[string, string]} */ ([k, LEVEL_NAME[k]])) },
        { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES },
        { key: 'on', label: 'On', type: 'check' },
        { key: 'words', label: 'Wording', max: 200, hint: 'Empty: words made from the fields.' },
      ],
      warn: v => PROBLEMS(cardOf(v)),
      onDelete: r ? async () => { const row = savedRow(r.id); if (row) toast(await app.data.rules.remove(row) ? REFUSED : 'Deleted'); } : undefined,
      onSave: v => {
        const c = cardOf(v), bad = PROBLEMS(c);
        if (bad.length) { toast(`Not saved: ${bad[0]}`); return; }
        return put(c);
      },
    });
  }

  /** "+ Add rule": which kind of rule first, then the builder */
  function pickType() {
    sheet.open({
      title: 'Add rule', saveLabel: 'Next',
      values: { type: 'limit', topic: 'week' },
      fields: [
        { key: 'type', label: 'Kind of rule', type: 'select', options: Object.entries(RULE_TYPES).map(([k, t]) => /** @type {[string, string]} */ ([k, t.label])) },
        { key: 'topic', label: 'For', type: 'select', options: TOPICS },
      ],
      onSave: v => { openBuilder(null, v.type, v.topic); },
    });
  }

  /** @param {RuleCard} r @param {boolean} canWrite */
  function cardRow(r, canWrite) {
    const d = defaultOf(r.id), off = r.on === false;
    const sub = [
      r.topic === 'calls' ? 'Calls' : 'Week',
      r.level === 'soft' && `Priority ${r.priority}`,
      !d && r.tags?.length && `For ${r.tags.map(t => TAG_NAME[t] ?? t).join(', ').toLowerCase()}`,
      !d && r.params?.who && Object.keys(r.params.who).length && whoWords(r.params.who),
      d ? savedRow(r.id) && 'Changed' : 'Your rule, not used by Build yet',
      r.fixed && 'Always on',
    ].filter(Boolean).join(' · ');
    const text = [h('span', { class: 'rl-main' }, words(r)), h('span', { class: 'rl-sub small' }, sub)];
    const open = () => (d ? openDefault(r, d) : openBuilder(r, r.type, r.topic ?? 'week'));
    return h('li', { class: `rl-row ru-row${off ? ' is-dim' : ''}`, dataset: { rule: r.id } },
      canWrite ? h('button', { type: 'button', class: 'ui-row rl-open', onclick: open }, text) : h('div', { class: 'ui-row' }, text),
      canWrite && !r.fixed ? h('input', { type: 'checkbox', role: 'switch', class: 'ui-switch ru-switch', checked: !off, 'aria-label': `On: ${words(r)}`,
        onchange: (/** @type {Event} */ e) => turn(r, /** @type {HTMLInputElement} */ (e.target).checked) })
        : off && h('span', { class: 'ru-off small' }, 'Off'));
  }

  function draw() {
    const canWrite = ctx.canWrite();
    add.hidden = !canWrite;
    const q = /** @type {HTMLInputElement} */ (search).value.trim().toLowerCase();
    const cards = ordered(rulesOf(/** @type {any} */ (saved()), PROBLEMS))
      .filter(r => !q || `${words(r)} ${r.topic} ${LEVEL_NAME[r.level]}`.toLowerCase().includes(q));
    fill(body,
      LEVELS.map(([lv, title]) => {
        const mine = cards.filter(r => r.level === lv);
        return mine.length > 0 && h('section', { class: 'rl-block' }, heading(title, mine.length),
          h('ul', { class: 'ui-list rl-list', 'aria-label': title }, mine.map(r => cardRow(r, canWrite))));
      }),
      !cards.length && h('p', { class: 'small' }, q ? 'No rule matches.' : 'No rules yet.'));
  }
  draw();
  return { draw };
}
