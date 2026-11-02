// The bin's pure parts (the bin recipe, recipes/bin.json): a deleted item's entry ({ id, kind, data, deletedAt }, written
// by the delete itself, cloud.js onCommit) is kept 30 days, can be restored, then is purged. Nothing here touches the
// page or the network.
export const BIN_DAYS = 30;
const DAY = 864e5;

/** whole days an entry has left (0 once past the 30) @param {number} deletedAt @param {number} [now] */
export const daysLeft = (deletedAt, now = Date.now()) => Math.max(0, Math.ceil((deletedAt + BIN_DAYS * DAY - now) / DAY));

/** past 30 days; an entry with no date, or one in the future, is kept and never purged
 * @param {{ deletedAt?: unknown }} entry @param {number} [now] */
export const isExpired = (entry, now = Date.now()) => {
  const at = Number(entry.deletedAt);
  return Number.isFinite(at) && at > 0 && at <= now && at < now - BIN_DAYS * DAY;
};

/** "deleted 2 days ago · 28 days left" @param {{ deletedAt: number }} entry @param {number} [now] */
export function binLabel(entry, now = Date.now()) {
  const ago = Math.max(0, Math.floor((now - entry.deletedAt) / DAY)), left = daysLeft(entry.deletedAt, now);
  return `deleted ${ago === 0 ? 'today' : ago === 1 ? '1 day ago' : `${ago} days ago`} · ${left} ${left === 1 ? 'day' : 'days'} left`;
}

/** the item an entry holds, ready to save again (the server's stamps and the delete mark left off), or null
 * @param {{ kind?: unknown, data?: any }} entry @param {string} coll the items' collection */
export function itemOf(entry, coll) {
  const d = entry?.data;
  if (entry?.kind !== coll || !d || typeof d.id !== 'string' || !d.id) return null;
  const { serverAt, updatedAt, _deleted, _edits, ...item } = d;
  return item;
}

/** the entries to show (items only), newest delete first, and the ones past 30 days to purge
 * @template {{ kind?: unknown, deletedAt: number, data?: any }} E
 * @param {E[]} entries @param {string} coll @param {number} [now] */
export function sortBin(entries, coll, now = Date.now()) {
  const live = entries.filter(e => !isExpired(e, now));
  return {
    show: live.filter(e => itemOf(e, coll)).sort((a, b) => (Number(b.deletedAt) || 0) - (Number(a.deletedAt) || 0)),
    purge: entries.filter(e => isExpired(e, now)),
  };
}
