// The feedback recipe's data side (recipes/feedback.json): messages to the owner as plain documents in feedback/{id},
// not synced (any member writes one; only admins read, mark done or delete). cloud.js reaches it through
// data-modules.js and hands it the Firebase sdk, a new id and the signed-in user.
import { cleanFeedback, newFeedback, newestFirst } from './feedback.js';

const COLL = 'feedback';

/** @type {import('./data-modules.js').FeedbackData} */
export const feedbackData = {
  coll: COLL,
  api: ({ sdk, id, user }) => ({
    async send(text) {
      const u = user(), body = cleanFeedback(text);
      if (!u) throw new Error('Sign in first.');
      if (!body) throw new Error('Write something first.');
      const { F, db } = await sdk(), fid = id();
      await F.setDoc(F.doc(db, COLL, fid), newFeedback(fid, body, u, Date.now()));
    },
    // admins only: the rules refuse everyone else
    async list() {
      const { F, db } = await sdk();
      return newestFirst((await F.getDocs(F.collection(db, COLL))).docs.map(/** @param {any} d */ d => d.data()));
    },
    async setDone(fid, done) {
      const { F, db } = await sdk();
      await F.updateDoc(F.doc(db, COLL, fid), { done });
    },
  }),
};
