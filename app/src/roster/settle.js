// How a week's lists stand once the week's facts are in, before anyone is placed. A public holiday closes every list of
// that day. A consultant away (on leave, or marked Away in the Epic check) closes their clinics, but their OT list stays as
// an emergency (EOT) slot: a registrar must lead it, an MO joins only when nobody else needs them (owner, 6 Nov 2026). A
// list with no patients booked (Epic says 0) needs nobody; an MSP list runs as usual. Each list wants `need` juniors and cannot run with fewer than
// its minimum. Pure, and the same answer when run again on its own output.
import { leaveIndex } from './model.js';

/** @typedef {import('./model.js').ListSlot} ListSlot */

/** an emergency slot: one registrar, and an MO when spare */
export const EOT = { need: 2, min: 1 };

/** @param {ListSlot} l @returns {number} the juniors a list cannot run without: its own `min`, else 1 when it wants any; never above `need` */
export const minOf = l => Math.min(l.need, l.min ?? (l.need > 0 ? 1 : 0));

/**
 * @param {ListSlot[]} lists
 * @param {{ leave?: import('./model.js').Leave[], holidays?: string[] }} o
 * @returns {ListSlot[]} new slots: status, need and min settled, and the flags `holiday`, `consultantOnLeave`, `emergency`
 */
export function settleLists(lists, { leave = [], holidays = [] }) {
  const lv = leaveIndex(leave);
  return lists.map(l => {
    const x = { ...l };
    if (holidays.includes(x.day)) {
      x.holiday = true;
      if (x.status === 'open') x.status = 'closed';
    }
    const gone = !!x.consultant && (!!x.away || lv.blocks(x.consultant, x.day, x.session));
    if (gone) x.consultantOnLeave = true;
    if (gone && x.status === 'open') {
      if (x.kind === 'clinic' || x.kind === 'hot') x.status = 'closed';
      else if (x.kind === 'ot' && !x.external) { x.emergency = true; x.need = EOT.need; x.min = EOT.min; }
    }
    if (x.status !== 'open' || x.external || (x.patients === 0 && !x.emergency)) { x.need = 0; delete x.min; delete x.emergency; }
    if (x.min != null && x.min > x.need) x.min = x.need;
    return x;
  });
}
