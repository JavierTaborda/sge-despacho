import { create } from "zustand";

import { supabase, supabaseConfigurationError } from "@/lib/supabase";
import { AuthError, createAuthState } from "./auth-state";

export const useAuthStore = create(createAuthState(() => {
  if (!supabase) throw new AuthError(supabaseConfigurationError ?? "Supabase no está configurado.");
  return supabase.auth;
}));
