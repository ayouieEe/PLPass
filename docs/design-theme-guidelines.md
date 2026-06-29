# PLPass Design Theme Guidelines

## Theme Direction

PLPass uses a calm academic workspace theme: soft mint page backgrounds, white primary surfaces, fresh green actions, dark green text, and a small blue-purple accent for rare emphasis. The interface should feel clear, steady, and work-focused across Admin, Faculty, Organizer, and Student portals.

## Semantic Tokens

Use semantic tokens from `src/index.css` and Tailwind color aliases from `tailwind.config.ts`. Page files should not hardcode arbitrary color values.

- `--background`: app shell background, currently soft mint.
- `--surface`: white or dark-mode elevated surface.
- `--surface-muted`: quiet mint panel and secondary information background.
- `--primary`: main green action color.
- `--primary-hover`: green hover color for primary actions.
- `--sidebar`: workspace sidebar background.
- `--sidebar-active`: active navigation fill.
- `--foreground`: main text color.
- `--muted-foreground`: supporting text color.
- `--border`: soft structural borders.
- `--focus-ring`: visible keyboard and input focus color.
- `--accent`: blue-purple accent for small highlights only.

## Light And Dark Mode

Light mode uses mint backgrounds, white surfaces, dark green-black headings, gray-green supporting text, and soft green active states. Dark mode must keep the same hierarchy with dark green surfaces, bright readable text, visible borders, and the same green focus treatment.

Do not make separate role-specific palettes unless a shared semantic token cannot express the requirement.

## Shared Component Rules

Cards, dialogs, empty states, forms, filters, and chart frames should use `bg-surface`, `bg-surface-muted`, `border-border`, `text-foreground`, and `text-muted-foreground`. Rounded panels should generally use 14px to 18px radii and light shadows.

Primary buttons use `primary`. Secondary buttons should be white or surface-based with soft borders and green text/icons. Inputs must use `plpass-field` or the same token recipe, including a green focus ring.

## Blue-Purple Accent

The accent token is reserved for small emphasis: selected chart series, tiny callouts, or non-primary badges. Do not use it as a dominant gradient, page background, large card fill, or primary action color.

## Hardcoded Color Rule

New page-level hardcoded hex, one-off Tailwind palette colors, and role-specific overrides are not allowed for shared UI surfaces. Prefer semantic utilities and shared components. Exceptions should be local illustrations, generated images, charts, or status colors that already map to a shared status token.

## Charts

Chart cards should use `ChartFrame` or the same surface rules. Empty charts must show a centered empty state instead of axes, gridlines, or blank plotting areas. Use the `--chart-*` tokens so colors remain readable in light and dark mode.

## AG Grid Theme

All real data tables use `PLPassDataGrid` from `src/components/data-display/PLPassDataGrid.tsx`. The grid theme is defined by `.ag-theme-plpass` in `src/index.css`, consuming the same semantic tokens as the rest of the app.

Page files may define columns and row actions, but they must not style AG Grid internals directly. Grid styling changes belong in the shared data-display component or global AG Grid theme.

## Page Columns And Row Actions

Keep page-specific column definitions in the owning page or feature folder. Shared formatting belongs in `src/components/data-display/plpassDataGridRenderers.tsx`, including status badges, date values, role labels, action buttons, and empty values.

## Allowed AG Grid Community Features

Allowed features include pagination, sorting, column resizing, quick filtering, optional row selection, keyboard navigation, responsive horizontal scrolling inside the grid, and simple column visibility controls.

## Forbidden Enterprise Features

Do not install or import `ag-grid-enterprise`. Do not use server-side row model, pivoting, row grouping, advanced filter builder, Enterprise integrated charts, Enterprise export, license keys, or Enterprise-only modules.
