# Shared Layout Guidelines

These files control the authenticated portal shell for Admin, Faculty, Organizer, and Student routes:

| Area | Shared files |
| --- | --- |
| App shell and authenticated layout | `src/app/layouts/DashboardLayout.tsx`, `src/app/layouts/RoleShellLayout.tsx`, `src/app/layouts/AppLayout.tsx` |
| Desktop sidebar and mobile drawer contents | `src/components/shared/RoleBasedSidebar.tsx` |
| Header, filters, and main content width | `src/app/layouts/DashboardLayout.tsx`, `src/components/layout/PageContainer.tsx` |
| Global layout tokens and shared utility classes | `src/index.css`, `tailwind.config.ts` |
| Page headings | `src/components/shared/PageHeader.tsx` |
| Shared cards and chart surfaces | `src/components/shared/StatCard.tsx`, `src/components/charts/ChartFrame.tsx` |
| Chart empty states | `src/components/feedback/ChartEmptyState.tsx` |

## Page Author Rules

- Put route-specific screen composition in the role page file under `src/features/[role]/pages/`.
- Let `DashboardLayout` provide the outer shell, header alignment, sidebar offsets, and responsive page gutters.
- Use `PageHeader` as the first visible page heading inside portal pages.
- Use normal full-width sections, grids, and tables inside the page. The shared shell already controls the page width.
- Keep page root wrappers simple, usually `className="space-y-6"`.
- Keep reusable UI shared by two or more roles in `src/components/`.
- Keep role-only reusable UI in `src/features/[role]/components/`.

## Classes Page Authors Must Not Override

Do not add route-page classes that fight the shared shell:

- Do not add page-level `max-w-*`, `container`, `mx-auto`, or fixed viewport-width wrappers around the whole page.
- Do not add outer `overflow-y-auto`, `h-screen`, `h-dvh`, or nested scrolling containers for normal portal pages.
- Do not add sidebar padding offsets such as `lg:pl-*`; `DashboardLayout` owns sidebar spacing.
- Do not make page content wider than the shell with `w-screen`, negative margins, or fixed pixel widths.
- Do not put portal pages in their own app shell, sidebar, top header, or mobile drawer.

## Shared Page Container

`PageContainer` is used by `DashboardLayout` for:

- Top header content
- Header filter rows
- Main portal content

Page authors usually should not import `PageContainer` directly. Use it only for shared shell-level additions that must align exactly with the header and main content gutters.

## Sidebar Rules

- Expanded desktop sidebar width is `260px`.
- Collapsed desktop sidebar width is `76px`.
- The navigation region is the only sidebar area that scrolls internally.
- The account/footer region is pinned after the navigation and must not overlap nav items.
- Collapsed icon links must keep `aria-label` and `title` text so icons remain understandable.
- Mobile navigation remains a drawer below the existing `lg` breakpoint.

## Chart Empty States

Use shared chart components such as `AttendanceTrendChart`, `PresentLateAbsentPieChart`, `ParticipationBarChart`, and `RiskSummaryChart` instead of rendering Recharts directly in pages.

Shared charts now pass `empty` to `ChartFrame` when their dataset has no meaningful values. `ChartFrame` renders `ChartEmptyState` with:

> No attendance data is available yet.

Do not render empty axes or gridlines for no-data chart states. If a new chart is added, give `ChartFrame` an `empty` condition and an optional `emptyMessage`.

