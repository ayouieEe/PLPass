import { supabaseRepositoryRegistry } from "@/services/supabase/repositories";
import { simulatedRepositoryRegistry } from "@/test-support/repositories";
import type { RepositoryRegistry } from "@/services/contracts";

export const repositories: RepositoryRegistry = new Proxy({} as RepositoryRegistry, {
  get(_target, prop: keyof RepositoryRegistry) {
    const registry =
      import.meta.env.VITE_DATA_SOURCE === "mock"
        ? simulatedRepositoryRegistry
        : supabaseRepositoryRegistry;
    return registry[prop];
  }
});
