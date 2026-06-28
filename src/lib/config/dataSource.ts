export const DATA_SOURCES = ["mock", "supabase"] as const;

export type DataSource = (typeof DATA_SOURCES)[number];

export function getDataSource(): DataSource {
  const rawValue = import.meta.env.VITE_DATA_SOURCE;
  if (rawValue === "supabase") {
    return "supabase";
  }
  return "mock";
}

export function isSupabaseDataSource() {
  return getDataSource() === "supabase";
}
