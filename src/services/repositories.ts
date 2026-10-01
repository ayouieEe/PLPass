import { supabaseRepositoryRegistry } from "@/services/supabase/repositories";
import { simulatedRepositoryRegistry } from "@/test-support/repositories";
import type { RepositoryRegistry } from "@/services/contracts";

export const repositories: RepositoryRegistry = new Proxy({} as RepositoryRegistry, {
  get(_target, prop: keyof RepositoryRegistry) {
    // Simulated repositories are test-only. Runtime builds always use the
    // linked Supabase project, even if an old environment file still carries
    // VITE_DATA_SOURCE=mock.
    const registry = import.meta.env.MODE === "test" ? simulatedRepositoryRegistry : supabaseRepositoryRegistry;
    return registry[prop];
  }
});
