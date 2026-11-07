// The edit sheet (#edit-sheet in index.html): one sheet for every form in the app. A screen says what to ask (fields), what
// is there now (values) and what to do with the answer; the sheet draws the fields, checks them (the browser's own form
// checks: required, min, max) and calls back once on Save or Delete. A `warn` function can show problems under the form as
// the person changes it (a hand edit may still go ahead). A form the fields can't draw (a table, the Epic check) brings its
// own `body` and how to read it.
import { $, dialog, h, fill } from '../dom.js';

/**
 * @typedef {object} Field
 * @property {string} key
 * @property {string} label
 * @property {'text' | 'tel' | 'number' | 'date' | 'select' | 'check' | 'area'} [type]  default text
 * @property {[string, string][] | ((values: Record<string, any>) => [string, string][])} [options]  for a select (a function: the options follow the other fields)
 * @property {boolean} [required]
 * @property {number} [max]  text length, or the largest number
 * @property {number} [min]
 * @property {number} [step]  a number's step (default 1; 0.1 lets a weight be 0.2)
 * @property {string} [hint]  a line under the field
 * @property {number} [rows]  how tall a text area is, in lines (default 3)
 * @property {string} [list]  suggestions for a text field
 * @property {string} [follows]  a date field that moves with this other date field while it was not set later than it
 *   (the last day of leave follows the first, so one day away is one date to pick)
 *
 * @typedef {object} Spec
 * @property {string} title
 * @property {Field[]} fields
 * @property {Record<string, any>} [values]
 * @property {string} [note]  a line above the fields
 * @property {string} [saveLabel]
 * @property {string} [deleteLabel]  shows a Delete button when onDelete is given
 * @property {(values: Record<string, any>) => string[]} [warn]
 * @property {{ node: HTMLElement, read: () => Record<string, any> }} [body]  drawn after the fields; its values join theirs
 * @property {HTMLElement} [head]  drawn before the fields
 * @property {(values: Record<string, any>) => unknown} [onSave]
 * @property {() => unknown} [onDelete]
 */

/** @type {ReturnType<typeof make> | null} */
let shared = null;
/** the one sheet of the page, made on first use (every screen asks for it) */
export const editSheet = () => (shared ??= make());

function make() {
  const sheet = dialog('edit-sheet');
  /** @type {{ read: () => Record<string, any>, spec: Spec } | null} */
  let current = null;

  sheet.addEventListener('close', async () => {
    // The dialog keeps its returnValue, and Cancel, Esc, the backdrop and a drag close it with none: clear it after use
    // (and before each open) so a Cancel never runs the last sheet's Save or Delete again.
    const c = current, said = sheet.returnValue;
    current = null; sheet.returnValue = '';
    if (!c) return;
    if (said === 'save') await c.spec.onSave?.(c.read());
    else if (said === 'delete') await c.spec.onDelete?.();
  });
  $('edit-delete').addEventListener('click', () => sheet.close('delete'));

  /** @param {Spec} spec */
  function open(spec) {
    /** @type {Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>} */
    const controls = {};
    const values = { ...(spec.values ?? {}) };
    const warnBox = h('p', { class: 'small warn', role: 'status' });
    const read = () => {
      /** @type {Record<string, any>} */
      const out = { ...spec.body?.read() };
      for (const f of spec.fields) {
        const c = controls[f.key];
        out[f.key] = f.type === 'check' ? /** @type {HTMLInputElement} */ (c).checked
          : f.type === 'number' ? (c.value === '' ? null : Number(c.value)) : c.value.trim();
      }
      return out;
    };
    const warnNow = () => { warnBox.textContent = (spec.warn?.(read()) ?? []).join(' '); };
    const redrawOptions = () => {
      const now = read();
      for (const f of spec.fields) if (f.type === 'select' && typeof f.options === 'function') {
        const c = /** @type {HTMLSelectElement} */ (controls[f.key]), keep = c.value;
        fill(c, f.options(now).map(([v, l]) => h('option', { value: v }, l)));
        c.value = [...c.options].some(o => o.value === keep) ? keep : c.options[0]?.value ?? '';
      }
      warnNow();
    };
    const rows = spec.fields.map(f => {
      const type = f.type ?? 'text';
      let control;
      if (type === 'select') {
        const opts = typeof f.options === 'function' ? f.options(values) : f.options ?? [];
        control = h('select', { id: `ef-${f.key}` }, opts.map(([v, l]) => h('option', { value: v }, l)));
        const want = values[f.key] ?? '';
        if ([...control.querySelectorAll('option')].some(o => o.value === String(want))) /** @type {HTMLSelectElement} */ (control).value = String(want);
      } else if (type === 'area') {
        control = h('textarea', { id: `ef-${f.key}`, rows: f.rows ?? 3, maxlength: f.max, value: values[f.key] ?? '' });
      } else if (type === 'check') {
        control = h('input', { id: `ef-${f.key}`, type: 'checkbox', checked: !!values[f.key] });
      } else {
        control = h('input', { id: `ef-${f.key}`, type, value: values[f.key] ?? '', required: f.required, maxlength: type === 'text' || type === 'tel' ? f.max : null,
          min: type === 'number' ? f.min : null, max: type === 'number' ? f.max : null, step: type === 'number' ? f.step ?? null : null, autocomplete: 'off', list: f.list || null, inputmode: type === 'number' ? (f.step ? 'decimal' : 'numeric') : type === 'tel' ? 'tel' : null, 'aria-required': f.required ? 'true' : null });
      }
      controls[f.key] = /** @type {any} */ (control);
      if (f.hint) control.setAttribute('aria-describedby', `eh-${f.key}`);
      if (type === 'date') {
        const date = /** @type {HTMLInputElement} */ (control);
        let was = date.value;
        date.addEventListener('change', () => {
          for (const g of spec.fields) if (g.follows === f.key) {
            const c = controls[g.key];
            if (c && (c.value <= was || c.value < date.value)) c.value = date.value;
          }
          was = date.value;
        });
      }
      control.addEventListener(type === 'select' || type === 'check' || type === 'date' ? 'change' : 'input', redrawOptions);
      // the hint sits outside the label so it is read as the field's description, not part of its name
      const label = h('label', { for: `ef-${f.key}` }, f.label);
      return h('div', { class: type === 'check' ? 'field field-check' : 'field' },
        type === 'check' ? [control, label] : [label, control],
        f.hint && h('span', { class: 'small', id: `eh-${f.key}` }, f.hint));
    });
    $('edit-title').textContent = spec.title;
    fill($('edit-body'), spec.note && h('p', { class: 'small' }, spec.note), spec.head, rows, spec.body?.node, warnBox);
    spec.body?.node.addEventListener('input', warnNow);   // its own boxes warn as they are typed in too
    $('edit-save').textContent = spec.saveLabel ?? 'Save';
    $('edit-delete').hidden = !spec.onDelete;
    $('edit-delete').textContent = spec.deleteLabel ?? 'Delete';
    current = { read, spec };
    redrawOptions();
    // a warning there at open is set again once the sheet shows, so the live region reads it out
    warnBox.textContent = '';
    sheet.returnValue = '';
    sheet.showModal();
    requestAnimationFrame(warnNow);
    const first = Object.values(controls)[0] ?? spec.body?.node.querySelector('input');
    if (first && first.type !== 'date') first.focus();
  }
  return { open, close: () => { current = null; sheet.returnValue = ''; sheet.close(); } };
}
