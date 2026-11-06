// What a person's new name carries along: their leave and requests, and the lists they lead (consultant, consultant2,
// consultant3). Leave, requests and lists are keyed by the name, so without this a rename leaves them under the old one.
// Past leave and requests are the person's own records too (past leave still feeds last month's call counts), so they
// follow. Calls already made and built weeks keep the old name as history. Pure: the People sheet saves the patches.

/** the list fields that hold a consultant's name */
export const CONSULTANT_KEYS = /** @type {const} */ (['consultant', 'consultant2', 'consultant3']);

/** @template R @typedef {[R, Record<string, string>][]} Patches  each row with the fields to change on it */
/** @typedef {{ id: string, _deleted?: boolean, name?: string } & Record<string, any>} NamedRow */
/** @typedef {{ id: string, _deleted?: boolean, consultant?: string | null, consultant2?: string | null, consultant3?: string | null } & Record<string, any>} ListLike */

/**
 * The rows a rename changes, and how: exact name match only, deleted rows left alone.
 * @template {NamedRow} L @template {NamedRow} Q @template {ListLike} T
 * @param {{ from: string, to: string, leave: L[], requests: Q[], lists: T[] }} o
 * @returns {{ leave: Patches<L>, requests: Patches<Q>, lists: Patches<T> }}
 */
export function renamePlan({ from, to, leave, requests, lists }) {
  if (!from || !to || from === to) return { leave: [], requests: [], lists: [] };
  /** @template {NamedRow} R @param {R[]} rows @returns {Patches<R>} */
  const byName = rows => rows.filter(r => !r._deleted && r.name === from).map(r => [r, { name: to }]);
  return {
    leave: byName(leave),
    requests: byName(requests),
    lists: lists.filter(r => !r._deleted).flatMap(r => {
      const patch = Object.fromEntries(CONSULTANT_KEYS.filter(k => r[k] === from).map(k => [k, to]));
      return Object.keys(patch).length ? [/** @type {[T, Record<string, string>]} */ ([r, patch])] : [];
    }),
  };
}

/** @param {{ leave: unknown[], requests: unknown[], lists: unknown[] }} plan @returns {number} rows it changes */
export const planSize = plan => plan.leave.length + plan.requests.length + plan.lists.length;

/**
 * The plan in words: '3 leave, 2 requests and 4 lists' ('' when it changes nothing).
 * @param {{ leave: unknown[], requests: unknown[], lists: unknown[] }} plan
 */
export function planText(plan) {
  const parts = [
    plan.leave.length ? `${plan.leave.length} leave` : '',
    plan.requests.length ? `${plan.requests.length} ${plan.requests.length === 1 ? 'request' : 'requests'}` : '',
    plan.lists.length ? `${plan.lists.length} ${plan.lists.length === 1 ? 'list' : 'lists'}` : '',
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}
