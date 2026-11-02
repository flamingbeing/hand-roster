// Settings > Send feedback (the feedback recipe's glue, recipes/feedback.json): any member writes a private message to the
// owner; admins also see the inbox, tick messages done and copy one as a to-do line. The dialog is built here (no
// index.html edits). The pure parts are ../feedback.js, the data side ../feedback-data.js (app.feedback); the slot is
// modules.js's "feedback". A static app has no app.feedback, so it gets no page.
import { MAX_FEEDBACK, cleanFeedback, asTask } from '../feedback.js';

// Lucide "message-square" (https://lucide.dev, ISC licence)
/** @type {import('app-ui/icons/lucide.js').IconNodes} */
const MESSAGE = [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }]];

/** an element with its attributes and children @param {string} tag @param {Record<string, string>} [attrs] @param {(Node | string)[]} [kids] */
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
};

/** @type {import('../shell.js').SettingsSlot} */
export function feedbackSettings({ app }) {
  const api = /** @type {import('../cloud.js').Started | any} */ (app).feedback;
  if (!api) return null;
  /** @type {HTMLDialogElement | null} */
  let sheet = null;
  /** @param {string} message */
  const say = message => { const m = document.getElementById('feedback-msg'); if (m) m.textContent = message; };

  /** the inbox: only an admin's read is allowed, so a refusal means there is none to show */
  const drawInbox = async (/** @type {HTMLElement} */ inbox, /** @type {HTMLElement} */ items) => {
    /** @type {import('../feedback.js').Feedback[]} */ let list;
    try { list = await api.list(); } catch { inbox.hidden = true; return; }
    inbox.hidden = false;
    items.replaceChildren(...list.map(f => {
      const li = el('li', { 'data-feedback': f.id }, [el('span', {}, [`${f.done ? 'Done: ' : ''}${f.text}`])]);
      const act = (/** @type {string} */ label, /** @type {() => Promise<void>} */ run) => {
        const b = el('button', { type: 'button' }, [label]);
        b.addEventListener('click', () => run().catch(e => say(/** @type {Error} */ (e).message)));
        li.append(b);
      };
      act(f.done ? 'Not done' : 'Done', async () => { await api.setDone(f.id, !f.done); void drawInbox(inbox, items); });
      act('Copy as task', async () => { await navigator.clipboard.writeText(asTask(f)); say('Copied.'); });
      return li;
    }));
  };

  const build = () => {
    const text = /** @type {HTMLTextAreaElement} */ (el('textarea', { id: 'feedback-text', rows: '4', maxlength: String(MAX_FEEDBACK) }));
    const send = el('button', { type: 'button', id: 'feedback-send', class: 'ui-primary' }, ['Send']);
    const close = el('button', { type: 'button', id: 'feedback-close' }, ['Close']);
    const items = el('ul', { id: 'feedback-items' });
    const inbox = el('div', { id: 'feedback-inbox', hidden: '' }, [el('h3', {}, ['Inbox']), items]);
    const d = /** @type {HTMLDialogElement} */ (el('dialog', { id: 'feedback', class: 'ui-sheet', 'aria-labelledby': 'feedback-title' }, [
      el('h2', { id: 'feedback-title' }, ['Send feedback']),
      el('label', { class: 'kit-field' }, ['Private to the owner', text]),
      el('div', { class: 'row' }, [send, close]),
      el('p', { id: 'feedback-msg', class: 'small', role: 'status' }),
      inbox,
    ]));
    send.addEventListener('click', async () => {
      const body = cleanFeedback(text.value);
      if (!body) { say('Write something first.'); return; }
      try { await api.send(body); text.value = ''; say('Sent. Thank you.'); void drawInbox(inbox, items); }
      catch (e) { say(`Not sent: ${/** @type {Error} */ (e).message}`); }
    });
    close.addEventListener('click', () => d.close());
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    void drawInbox(inbox, items);
    return d;
  };

  return {
    title: 'Send feedback', icon: MESSAGE, visible: 'feedbackOn', sub: 'A private message to the owner', group: 'Other', find: 'feedback message report idea bug inbox',
    mount(host) {
      const open = el('button', { type: 'button', id: 'open-feedback', class: 'ui-primary' }, ['Write feedback']);
      open.addEventListener('click', () => { sheet?.remove(); sheet = build(); sheet.showModal(); });
      host.append(el('p', { class: 'small' }, ['Tell the owner what works and what does not. Only the owner and admins can read it.']), open);
      return () => { sheet?.remove(); sheet = null; };
    },
  };
}
