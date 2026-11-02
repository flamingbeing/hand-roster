// What every screen is given (app.js makes it): the app (cloud.js start()), the page's records, a toast, and the person's
// role as the page knows it. Screens ask canWrite() before they show an edit control: the rules decide in the end.
/**
 * @typedef {object} Context
 * @property {import('../cloud.js').Started} app
 * @property {import('../store.js').Store} store
 * @property {(message: string) => unknown} toast
 * @property {() => boolean} canWrite  admin or member (the roster maker); a viewer (a junior on a phone) only reads
 * @property {(fn: () => void) => void} onRole  told when the role changes
 */
export {};
