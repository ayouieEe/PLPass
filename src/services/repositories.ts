import { supabaseRepositoryRegistry } from "@/services/supabase/repositories";
import type { RepositoryRegistry } from "@/services/contracts";

export const repositories: RepositoryRegistry = supabaseRepositoryRegistry;
