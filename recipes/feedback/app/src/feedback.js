// Feedback's pure parts (the feedback recipe, recipes/feedback.json): a private message to the owner, written by any
// member (feedback/{id}) and read by admins. Nothing here touches the page or Firestore.
export const MAX_FEEDBACK = 2000;

/** @typedef {{ id: string, text: string, uid?: string, by?: string, at: number, done: boolean }} Feedback */

/** @param {unknown} text -> the text kept (trimmed, at most MAX_FEEDBACK characters), or '' when there is none */
export const cleanFeedback = text => String(text ?? '').trim().slice(0, MAX_FEEDBACK);

/** the document a new message is stored as (the rules check each field again) @param {string} id @param {string} text
 * @param {{ uid: string, email?: string | null }} user @param {number} at -> Feedback & { uid: string, by: string } */
export const newFeedback = (id, text, user, at) => ({ id, text, uid: user.uid, by: String(user.email || '').slice(0, 200), at, done: false });

/** newest first, a copy @param {Feedback[]} list */
export const newestFirst = list => [...list].sort((a, b) => b.at - a.at);

/** a to-do line to paste into a task list @param {Pick<Feedback, 'text' | 'by' | 'at'>} f */
export const asTask = f => {
  const d = new Date(f.at);
  return `- [ ] ${f.text.replace(/\s*\n\s*/g, ' ')} (feedback${f.by ? ` from ${f.by}` : ''}, ${Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'undated'})`;
};
