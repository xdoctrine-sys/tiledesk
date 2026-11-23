/**
 * Column geometry of the inbox (v4 identity): default / min / max widths, the 480 px floor of the conversation and the pure
 * solver that turns the agent's saved widths into the widths that actually fit the viewport.
 * Widths are CSS pixels; gaps between panels are the 8 px resize handles.
 */
export type ColId = 'side' | 'list' | 'ctx';
export interface ColSpec { def: number; min: number; max: number }
export interface Widths { side: number; list: number; ctx: number }

export const COLS: Record<ColId, ColSpec> = {
  side: { def: 240, min: 200, max: 320 },
  list: { def: 340, min: 280, max: 480 },
  ctx: { def: 320, min: 280, max: 420 },
};

export const CONV_MIN = 480;
export const GAP = 8;
export const RAIL = 64;
/** Handles (and docked panels) exist from this width; below it the sidebar and the contact panel are drawers (E-04). */
export const HANDLES_FROM = 1280;
/** The views sidebar needs a little more room than the contact panel to keep the conversation at 480 px. */
export const SIDEBAR_DOCK_FROM = 1360;
/** Dragging a collapsible column further than this below its minimum folds it. */
export const COLLAPSE_SLACK = 40;

export const DEFAULT_WIDTHS: Widths = { side: COLS.side.def, list: COLS.list.def, ctx: COLS.ctx.def };

export const clampCol = (id: ColId, w: number): number => Math.min(COLS[id].max, Math.max(COLS[id].min, Math.round(w)));

export interface Solved extends Widths { conv: number }

/**
 * `avail` = viewport width minus the rail and the outer margin. Every visible pair of neighbouring panels costs one 8 px
 * handle. When the conversation would drop under 480 px the context panel shrinks first, then the list, then the sidebar,
 * each down to its own minimum (the saved width is kept, so a larger window restores it).
 */
export function solveWidths(avail: number, stored: Widths, show: { side: boolean; ctx: boolean }): Solved {
  const handles = 1 + (show.side ? 1 : 0) + (show.ctx ? 1 : 0);
  const w: Widths = {
    side: show.side ? clampCol('side', stored.side) : 0,
    list: clampCol('list', stored.list),
    ctx: show.ctx ? clampCol('ctx', stored.ctx) : 0,
  };
  let deficit = CONV_MIN - (avail - handles * GAP - w.side - w.list - w.ctx);
  for (const id of ['ctx', 'list', 'side'] as ColId[]) {
    if (deficit <= 0 || !w[id]) continue;
    const take = Math.min(deficit, w[id] - COLS[id].min);
    w[id] -= take;
    deficit -= take;
  }
  return { ...w, conv: avail - handles * GAP - w.side - w.list - w.ctx };
}

/** Largest width a column may be dragged to right now (others keep their effective width, conversation keeps 480 px). */
export function roomMax(id: ColId, solved: Solved): number {
  const room = solved[id] + (solved.conv - CONV_MIN);
  return Math.max(COLS[id].min, Math.min(COLS[id].max, room));
}
