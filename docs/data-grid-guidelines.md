# PLPass Data Grid Guidelines

## Shared Location

Use `src/components/data-display/PLPassDataGrid.tsx` for real data tables. Supporting files live beside it:

- `plpassDataGridTheme.ts`
- `plpassDataGridTypes.ts`
- `plpassDataGridRenderers.tsx`

`src/components/tables/DataTable.tsx` is a compatibility adapter for existing page column definitions. New work should prefer `PLPassDataGrid` directly with AG Grid Community column definitions.

## Defining Columns

Page authors define columns in the page or feature folder that owns the data. Keep data fetching unchanged:

Page -> React Query hook -> repository contract -> implementation -> Supabase

Do not query Supabase from a table component or page table callback.

## Renderers

Use shared render helpers from `plpassDataGridRenderers.tsx` when possible:

- `renderStatusBadge` for status cells.
- `renderDateValue` for date/time values.
- `renderRoleLabel` for role cells.
- `renderActionButton` for row action buttons.
- `renderEmptyValue` for nullable values.

Page-specific actions may stay inline when they need local state or navigation.

## Responsive Rules

Tables must scroll horizontally inside the grid shell only. The browser viewport should not overflow. Use sensible `minWidth` values for columns and let `PLPassDataGrid` handle pagination, resizing, and layout.

Do not wrap grids in extra overflow containers unless the wrapper has a clear fixed-height purpose such as a dialog.

## Accessibility

Always pass a meaningful `label` to `PLPassDataGrid`. Keep row actions as buttons or links with readable labels. Do not remove keyboard focus styles. Empty, loading, and error states should use the shared feedback components or the built-in props on `PLPassDataGrid`.

## Styling Rules

Do not style AG Grid internals inside page files. Do not add page-level `.ag-*` selectors. Theme changes belong in `.ag-theme-plpass` in `src/index.css` or the shared data-display files.

## Allowed Features

Allowed AG Grid Community features are pagination, sorting, column resizing, quick filtering, simple column visibility controls, row hover states, optional row selection where the existing workflow already needs it, and keyboard-friendly navigation.

## Forbidden Features

Do not use Enterprise-only features: server-side row model, pivoting, row grouping, advanced filter builder, Enterprise integrated charts, Enterprise export, or license keys. Do not install or import `ag-grid-enterprise`.
