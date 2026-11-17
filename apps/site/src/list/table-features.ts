import {
  columnVisibilityFeature,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
} from '@tanstack/react-table';

// Filtering runs before the table (filter-rows.ts), so the table registers sorting, visibility and pages only.
export const features = tableFeatures({
  rowSortingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { basic: sortFn_basic, text: sortFn_text },
});

export const pageSize = 50;
