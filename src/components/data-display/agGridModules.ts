import {
  CellStyleModule,
  ClientSideRowModelModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  PaginationModule,
  RenderApiModule,
  RowApiModule,
  RowSelectionModule,
  RowStyleModule,
  TextFilterModule,
  TooltipModule,
  type Module,
} from "ag-grid-community";

// Keep the grid feature set explicit so unused Community modules can be
// removed from lazy route chunks by the production bundler.
export const plpassAgGridModules: Module[] = [
  ClientSideRowModelModule,
  PaginationModule,
  RowSelectionModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  CellStyleModule,
  RowStyleModule,
  RenderApiModule,
  RowApiModule,
  TooltipModule,
];

ModuleRegistry.registerModules(plpassAgGridModules);
