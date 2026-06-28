import { mockRepositoryRegistry } from "@/services/mock/repositories";
import { supabaseRepositoryRegistry } from "@/services/supabase/repositories";
import type { RepositoryRegistry } from "@/services/contracts";
import { getDataSource } from "@/lib/config/dataSource";

export const repositories: RepositoryRegistry = getDataSource() === "supabase" ? supabaseRepositoryRegistry : mockRepositoryRegistry;
