// "This is me" on the Week tab, apart from week.js so the first screen loads less: the picker (More, This is me) and the
// My week card, loaded only when the picker is opened or a name is set. The name stays on this device (the `me` option):
// no email, no account link. The card's lines come from roster/mine.js, from what the Week grid draws. Under them, who else
// is on call on the next call day, each with a call link when they have a phone (7 Nov 2026).
import { h, telLink } from '../dom.js';
import { GRADES } from '../data/people.js';
import { dayLabel, myWeek, nextCall, nextCallWith } from '../roster/mine.js';
import { editSheet } from './sheet.js';

/** whether the card is open (it opens by default; a close is kept until the page reloads) */
let open = true;

/**
 * More, This is me: one select, Nobody or an active person (consultants, registrars, then medical officers, each by name).
 * @param {{ settings: { get: (k: string) => unknown, set: (k: string, v: unknown) => unknown } }} app
 * @param {import('../roster/model.js').Person[]} people  the active people
 */
export function pickMe(app, people) {
  const order = Object.fromEntries(GRADES.map(([g], i) => [g, i]));
  const short = /** @type {Record<string, string>} */ ({ con: 'Consultant', reg: 'Registrar', mo: 'MO' });
  const sorted = [...people].sort((a, b) => (order[a.grade] ?? 9) - (order[b.grade] ?? 9) || a.name.localeCompare(b.name));
  editSheet().open({
    title: 'This is me',
    note: 'Your name stands out on Week and Calls, with your days at the top. Kept on this device only.',
    fields: [{ key: 'me', label: 'Name', type: 'select', options: [['', 'Nobody'], ...sorted.map(p => /** @type {[string, string]} */ ([p.name, `${p.name} (${short[p.grade] ?? p.grade})`]))] }],
    values: { me: String(app.settings.get('me') || '') },
    onSave: v => app.settings.set('me', String(v.me ?? '')),
  });
}

/**
 * The My week card: a details block, open by default; the summary names the person and their next call, then a line a day.
 * @param {Parameters<typeof myWeek>[0] & { rosters: { calls?: import('../roster/model.js').CallDay[] }[], today: string, phones: Map<string, string> }} o
 * @returns {HTMLElement}
 */
export function mineCard(o) {
  const next = nextCall(o.name, o.rosters, o.today);
  const days = myWeek(o);
  const others = next ? nextCallWith(o.name, o.rosters, o.today) : [];
  const card = /** @type {HTMLDetailsElement} */ (h('details', { class: 'wk-mine', ontoggle: () => { open = card.open; } },
    h('summary', {}, h('b', {}, `My week: ${o.name}`), next && h('span', { class: 'small' }, ` · ${next}`)),
    h('ul', {}, days.map(d => h('li', { class: d.day === o.today ? 'is-today' : '', dataset: { day: d.day } },
      h('b', {}, dayLabel(d.day)), ` · ${d.facts.length ? d.facts.join(' · ') : '–'}`))),
    others.length > 0 && h('p', { class: 'small wk-mine-with' }, 'On call with you: ', others.map(([tier, n], i) => [i > 0 && ' · ', `${tier} ${n} `, telLink(o.phones, n)])),
    !o.built && h('p', { class: 'small' }, 'Lists show once the week is built.')));
  card.open = open;
  return card;
}
