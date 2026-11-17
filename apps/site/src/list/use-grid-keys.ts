import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react';

interface Position {
  row: number;
  col: number;
}

const moves: Record<string, (at: Position, last: Position) => Position> = {
  ArrowUp: (at) => ({ ...at, row: at.row - 1 }),
  ArrowDown: (at) => ({ ...at, row: at.row + 1 }),
  ArrowLeft: (at) => ({ ...at, col: at.col - 1 }),
  ArrowRight: (at) => ({ ...at, col: at.col + 1 }),
  Home: (at) => ({ ...at, col: 0 }),
  End: (at, last) => ({ ...at, col: last.col }),
};

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function lastCol(table: HTMLTableElement, row: number): number {
  return (table.rows[row]?.cells.length ?? 1) - 1;
}

/** The position moved inside the table. */
function within(table: HTMLTableElement, { row, col }: Position): Position {
  const inRow = clamp(row, table.rows.length - 1);
  return { row: inRow, col: clamp(col, lastCol(table, inRow)) };
}

/** The element of a cell that takes focus: its link or button, else the cell. */
function focusTarget(table: HTMLTableElement, { row, col }: Position): HTMLElement | undefined {
  const cell = table.rows[row]?.cells[col];
  return cell === undefined ? undefined : (cell.querySelector<HTMLElement>('a, button') ?? cell);
}

/** Grid keys for a table: one tab stop, arrow keys between cells, Home and End within a row. */
export function useGridKeys(ref: RefObject<HTMLTableElement | null>) {
  const [active, setActive] = useState<Position>({ row: 0, col: 0 });

  // Runs after every render, as rows and columns change with the table state.
  useEffect(() => {
    const table = ref.current;
    if (table === null) return;
    for (const element of table.querySelectorAll<HTMLElement>('th, td, a, button')) element.tabIndex = -1;
    const target = focusTarget(table, within(table, active));
    if (target !== undefined) target.tabIndex = 0;
  });

  function onKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    const move = moves[event.key];
    const table = ref.current;
    if (move === undefined || table === null) return;
    const at = within(table, move(active, { row: table.rows.length - 1, col: lastCol(table, active.row) }));
    const target = focusTarget(table, at);
    if (target === undefined) return;
    event.preventDefault();
    setActive(at);
    target.focus();
  }

  function onFocus(event: { target: EventTarget }) {
    const cell = event.target instanceof Element ? event.target.closest('td, th') : null;
    if (!(cell instanceof HTMLTableCellElement) || !(cell.parentElement instanceof HTMLTableRowElement)) return;
    setActive({ row: cell.parentElement.rowIndex, col: cell.cellIndex });
  }

  return { onKeyDown, onFocus };
}
