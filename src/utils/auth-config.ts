export function getSupabaseConfiguration(url: string | undefined, key: string | undefined) {
  if (!url?.trim() || !key?.trim()) {
    return { error: "Configura EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY para iniciar sesión." };
  }
  try {
    const parsed = new URL(url.trim());
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.search || parsed.hash) {
      throw new Error();
    }
  } catch {
    return { error: "EXPO_PUBLIC_SUPABASE_URL debe ser una URL HTTP o HTTPS válida, sin query ni fragmento." };
  }
  return { url: url.trim(), key: key.trim(), error: null };
}
