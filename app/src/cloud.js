// Sign-in, roles and sync for the app, on the shared engine's modules: createApp({ config, modules: [auth(), sync(),
// update()] }) from app-sync (an exact version from core.anawj.com, named once in index.html's import map).
//
// Firestore layout (rules in firestore.app.rules):
//   members/{uid}              { role: admin | member | viewer, v }   the role doc (source of truth; admins change it
//                              through the Worker's /api/members/, which revokes a removed person's access)
//   spaces/_/people/{id}      { name, grade, rank?, site?, active?, noCall?, moCalls?, siteOnly?, byHand?, works?, clinicsOnly?, extra?, createdAt, updatedAt, serverAt, _edits }  the doctors
//   spaces/_/lists/{id}       { site, kind, name, wd, session, consultant?, rooms?, patients?, need, status, ... }  the weekly template of OT lists and clinics
//   spaces/_/leave/{id}       { name, from, to, session?, note?, ... }  leave, all day or AM or PM
//   spaces/_/requests/{id}    { name, date, type: cannot | want, tier?, ... }  call requests
//   spaces/_/rosters/{YYYY-MM} { calls: [{ date, con, reg, moNuh, moNtf }], locked, holidays, problems, ... }  a month's on-call roster
//   spaces/_/weeks/{Monday}   { grid: [{ day, session, list, juniors }], lists, overrides, ... }  a week's daily roster
//                              (every record: createdAt, updatedAt, serverAt, _edits: who changed each field, and when;
//                              '_' is the single group)
//   spaces/_/bin/{coll:id}     { id, kind, data, deletedAt, … }       a deleted item's last version (delete to bin)
//
// Roles reach the rules as custom claims ({ g: { _: role }, v }), a cache of the role doc: the Worker's /api/claims
// writes them. The auth module reads the role doc live (claims.watch) and asks for new claims whenever its v is ahead
// of the token's; the page then shows what the token says.
//
// Every save goes to a durable outbox first (the sync module's write queue), then to the server in a transaction; a
// save that meets a change made elsewhere is kept as a conflict until the person chooses, and one the server refuses
// waits in a list until it is retried or discarded. Sign-out keeps this device's copy and its unsent saves (they send
// when the same account signs in again); another account signing in wipes them first (refused while any are unsent),
// and "Forget this device" wipes them on purpose.
import { createApp } from '@core/app';
import { auth } from '@core/auth';
import { sync, leaveEntry } from '@core/sync';
import { update } from '@core/update';
import { settings } from '@core/settings';
import * as register from 'app-update/register.js';
import { firebaseConfig, APP } from './config.js';
import { emulator, configured, roleOf, needsClaims } from './roles.js';
import { setHint } from './hint.js';
import { OPTIONS, SETTINGS_COLL } from './options.js';
import { dataModules } from './data-modules.js';
import { kindOps } from './data/ops.js';
import * as people from './data/people.js';
import * as lists from './data/lists.js';
import * as leaveData from './data/leave.js';
import { rosters, weeks } from './data/plans.js';

export { usingEmulator } from './roles.js';
export { lastSignedIn } from './hint.js';
const SPACE = '_';
export { REFUSED } from './items.js';

/** the roster's kinds of record: each one a collection under spaces/_/ and a data module (src/data/) saying what it allows */
export const KINDS = /** @type {const} */ ({ people, lists, leave: leaveData, requests: leaveData.requests, rosters, weeks });
/** @typedef {keyof typeof KINDS} Kind */
/** @typedef {import('./items.js').User} User */
/** @typedef {import('./items.js').Phase} Phase */
/** @typedef {import('./items.js').State} State */

/** @type {Promise<{ A: typeof import('firebase/auth'), F: typeof import('firebase/firestore'), auth: any, db: any, emulator: boolean }> | null} */
let fb = null;
// The Firebase SDK, loaded once for every module (the import map names its version).
/** A Firestore for the app: no SDK offline cache (the engine keeps the device copy and the outbox). */
function firestoreFor(/** @type {any} */ F, /** @type {any} */ a) {
  const db = F.getFirestore(a);
  if (emulator) F.connectFirestoreEmulator(db, '127.0.0.1', emulator.fs);
  return db;
}

export function sdk() {
  if (fb) return fb;
  fb = (async () => {
    const [app, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    // the emulator project is always demo-<name> (tools/fill.mjs keeps it in step with the tests), never the live one
    const cfg = emulator ? { apiKey: 'demo-key', projectId: 'demo-hand-roster', authDomain: 'localhost', appId: 'demo' }
      : { ...firebaseConfig, authDomain: firebaseConfig.authDomain || APP.host };
    const a = app.initializeApp(cfg);
    const auth = A.getAuth(a);
    const db = firestoreFor(F, a);
    if (emulator) {
      A.connectAuthEmulator(auth, `http://127.0.0.1:${emulator.auth}`, { disableWarnings: true });
    }
    return { A, F, auth, db, emulator: !!emulator };
  })();
  fb.catch(() => { fb = null; });
  return fb;
}

// Tests only (?emulator): sign in as a made-up Google account.
/** @param {string} email */
export async function emulatorSignIn(email) {
  if (!emulator) throw new Error('Only with ?emulator');
  const { A, auth } = await sdk();
  await A.signInWithCredential(auth, A.GoogleAuthProvider.credential(JSON.stringify({ sub: email.replace(/\W/g, ''), email, email_verified: true })));
}

// This phone's name for the popup ('Phone', 'Tablet', 'Computer'), from the browser; the app may let people set one.
function deviceName() {
  try {
    const ua = navigator.userAgent || '';
    return /iPad|Tablet/.test(ua) ? 'Tablet' : /iPhone|Android.*Mobile|Mobile/.test(ua) ? 'Phone' : 'Computer';
  } catch { return ''; }
}

/** @param {Record<string, unknown>} rec */
const binCopy = ({ serverAt, ...rest }) => JSON.parse(JSON.stringify(rest));
/**
 * @typedef {object} Hooks
 * @property {(s: State) => void} onState
 * @property {(kind: Kind, rows: import('./data/ops.js').Row[], changed: Set<string>) => void} onData  one kind's records as this
 *   device has them, with unsent saves laid over; changed: the ids whose copy changed since the last call (none the first time)
 */
/** @typedef {NonNullable<Awaited<ReturnType<typeof start>>>} Started */

// start({ canReload }) -> the modules' apis (for the UI kit) and the app's actions, or null when the app isn't set up.
// canReload: with a service worker, the app's own "nothing open" answer for the update's reload (it also waits for
// unsent saves); none: no update module. Nothing shows until follow(hooks).
/** @param {{ canReload?: (() => boolean | Promise<boolean>) | null }} o */
export async function start({ canReload = null }) {
  if (!configured) return null;
  let claimsStatus = 0, unsent = 0;
  /** @type {() => Promise<void>} */
  let show = async () => {};
  /** @type {Hooks | null} */
  let hooks = null;
  const modules = [
    auth({
      // roles: the role doc, read live, against the token's claims; /api/claims writes new ones
      claims: {
        url: '/api/claims', watch: true, doc: (/** @type {User} */ u) => ['members', u.uid],
        behind: (/** @type {any} */ doc, /** @type {any} */ claims) => needsClaims(claims, doc),
        onClaims: (/** @type {{ status: number }} */ { status }) => { if (status) claimsStatus = status; void show(); },
      },
    }),
    sync({
      colls: [...Object.keys(KINDS), SETTINGS_COLL, ...(dataModules.files ? [dataModules.files.coll] : [])], path: (/** @type {string} */ space, /** @type {string} */ coll) => ['spaces', space, coll],
      scope: () => SPACE, device: deviceName(), wake: true,
      // a delete writes the item's last version to the bin in the same transaction ({ id, kind, data, deletedAt }:
      // the other devices drop the item from it, and data keeps the deleted version)
      // held: a same-field clash is kept on the phone that made the save until its person chooses (never overwritten);
      // edits: each write records who changed each field and when, for the popup
      // commitRetry: a send refused with permission-denied just after sign-in (the role check still catching up) is tried
      // once more after 500 ms, as app-sync advises for rules that read a document another write is creating
      backend: { stampMode: 'server', writeId: false, held: true, edits: '_edits', commitRetry: { codes: ['permission-denied'], delay: 500 },
        onCommit: (/** @type {any} */ { scope, coll, before, after, at, fields }) => coll in KINDS && !after && before && binOn()
          ? [{ path: ['spaces', scope, 'bin', `${coll}:${before.id}`], data: { ...leaveEntry(coll, before, at), data: binCopy(before), ...fields } }] : [] },
      hub: { bin: 'bin' }, stores: { metaOnly: ['bin'] },
      // a save the server refused is set aside (kept, with its code) until the person retries or discards it
      onRefused: () => 'archive',
      // after another account's sign-in wipes this device's copy (Firestore ends with it): a new Firestore in place of
      // the ended one, so the switch needs no reload (a reload would lose an email-link sign-in half way)
      reopen: async (/** @type {{ sdk: any }} */ { sdk: s }) => firestoreFor(s.F, s.db.app),
    }),
    ...(dataModules.files ? [dataModules.files.engine(SPACE)] : []),
    settings({ options: OPTIONS, collection: SETTINGS_COLL, scope: SPACE }),
    ...(canReload ? [update({ register, app: 'app', sw: 'sw.js', canReload })] : []),
  ];
  const app = createApp({ config: { name: APP.name, sdk }, modules });
  // the bin is on unless its option (the bin recipe's) is off: a deleted item is then not copied there
  const binOn = () => { try { return app.settings.get('binOn') !== false; } catch { return true; } };
  await app.ready;
  const { auth: fa } = await sdk();
  // Firebase restores the saved sign-in a moment after it starts: until it has, "no user" is not yet "signed out"
  const settled = fa.authStateReady?.() ?? Promise.resolve();

  app.status$((/** @type {{ unsent: number }} */ st) => { unsent = st.unsent; });

  /** @type {Map<string, () => void>} the live listens, by collection */
  const offs = new Map();
  let seq = 0;
  // the token Firestore has been told about: its own token listener (added when the SDK started, so before this one)
  // runs in the same notification and restarts its connection with the new token. A list listen sent before that goes
  // out with the old token, the rules refuse it, and the engine doesn't listen again; so the list waits for this.
  let tokenSeen = '';
  fa.onIdTokenChanged(async (/** @type {any} */ u) => { tokenSeen = u ? await u.getIdToken().catch(() => '') : ''; void show(); });
  /** @type {(() => void) | null} */
  let offSettings = null;
  // the claims of the token Firebase last had (User.toJSON keeps it), for when it can't get a new one
  /** @param {any} u */
  const lastToken = u => {
    const token = u.toJSON?.()?.stsTokenManager?.accessToken || '';
    let claims = {};
    try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { /* none */ }
    return { token, claims, stale: true };
  };
  const stopList = () => { for (const off of offs.values()) off(); offs.clear(); offSettings?.(); offSettings = null; };
  // the token as it is now decides what the page shows (after sign-in, and after every claims ask); the newest call wins
  show = async () => {
    if (!hooks) return;
    const { onState, onData } = hooks;
    const n = ++seq;
    await settled;
    if (n !== seq) return;
    const u = fa.currentUser, me = app.auth.user();
    if (u && !me) return;   // Firebase has the person; the engine's own copy of the user follows (onUser calls back)
    if (!u || !me || me.uid !== u.uid) { stopList(); setHint(false); onState({ phase: 'signed-out' }); return; }
    if (claimsStatus === 503) { setHint(false); onState({ phase: 'not-set-up' }); return; }
    // offline with an expired token Firebase can't refresh it (auth/network-request-failed): the role comes from the
    // last token it holds, so the saved list still shows; back online, the fresh token calls back (onIdTokenChanged)
    const t = await u.getIdTokenResult().catch(() => lastToken(u)), role = roleOf(t.claims);
    if (n !== seq) return;
    if (role && t.token !== tokenSeen && !t.stale) return;   // a new token Firestore hasn't seen yet: onIdTokenChanged calls back
    const user = { uid: me.uid, email: me.email, name: me.name };
    if (!role) { stopList(); setHint(false); onState({ phase: 'no-access', user, role: '' }); return; }
    setHint(true);
    onState({ phase: 'ready', user, role });
    offSettings ??= app.settings.follow();   // the account's options, heard from other devices (listening needs the role)
    for (const coll of /** @type {Kind[]} */ (Object.keys(KINDS))) {
      if (offs.has(coll)) continue;
      let first = true;
      offs.set(coll, app.sync.watch(SPACE, coll, (/** @type {import('./data/ops.js').Row[]} */ list, /** @type {{ changed?: string[] }} */ meta) => {
        onData(coll, list.filter(x => !x._deleted), new Set(first ? [] : meta?.changed || []));
        first = false;
      }));
    }
  };
  app.auth.onUser(() => { claimsStatus = 0; void show(); });

  /** @param {string} method @param {string} uid @param {unknown} [body] @returns {Promise<string>} */
  const membersCall = async (method, uid, body) => {
    try {
      const token = await fa.currentUser?.getIdToken();
      if (!token) return 'Sign in first.';
      const r = await fetch(`/api/members/${encodeURIComponent(uid)}`, { method, headers: { Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return r.ok ? '' : (await r.json().catch(() => ({}))).error || `Refused (${r.status})`;
    } catch { return 'Offline: try again.'; }
  };
  const id = () => (crypto.randomUUID?.() || String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');
  const save = (/** @type {string} */ coll, /** @type {Record<string, unknown>} */ record, /** @type {unknown} */ base) => app.sync.save(coll, SPACE, record, base);
  // the writes of each kind: add, edit, upsert (a month or a week, named by its key), put, remove; every one resolves to ''
  // when the save is stored or queued, or to the reason when the server refused it at once
  const data = /** @type {{ [K in Kind]: ReturnType<typeof kindOps> }} */ (Object.fromEntries(Object.entries(KINDS).map(([coll, m]) => {
    const ops = kindOps({ save, id }, coll, m.clean);
    return [coll, { ...ops, remove: (/** @type {import('./data/ops.js').Row} */ row) => { void app.sync.hub.drop(SPACE, coll, [row.id]); return ops.remove(row); } }];
  })));
  return {
    // the modules' apis, for the UI kit's parts (update: with a service worker only, else null)
    auth: app.auth, sync: app.sync, settings: app.settings, update: app.update || null, files: app.files,
    // the feedback recipe's messages to the owner (undefined without it)
    feedback: dataModules.feedback?.api({ sdk, id, user: () => app.auth.user() }),
    // the whole app's status (sync and the modules): { state, count, unsent }
    /** @param {(st: { state: string, count: number, unsent: number }) => void} fn */
    status$: fn => app.status$(fn),
    // from now on: onState with what the page shows, onData with each kind's records once they are shown
    /** @param {Hooks} h */
    follow(h) { hooks = h; void show(); },
    data,
    // admins: set someone's role, or remove them (they lose access at once; their sessions end). -> '' or the reason
    members: {
      /** @param {string} uid @param {'admin' | 'member' | 'viewer'} role */
      setRole: (uid, role) => membersCall('PUT', uid, { role }),
      /** @param {string} uid */
      remove: uid => membersCall('DELETE', uid),
    },
    // Sign-out keeps this device's copy and unsent saves. -> how many are still unsent (they send at the next sign-in)
    async signOut() { await app.auth.signOut(); return unsent; },
  };
}
