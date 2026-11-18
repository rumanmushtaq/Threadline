import "server-only";
import { cookies } from "next/headers";
import { supabaseForCookies } from "./clients";

/** Supabase client bound to the current request's cookies. */
export async function supabaseServer() {
  const store = await cookies();
  return supabaseForCookies({
    getAll: () => store.getAll(),
    setAll: (list) => {
      try {
        for (const { name, value, options } of list) store.set(name, value, options);
      } catch {
        // Server Components cannot set cookies; proxy.ts keeps the session cookies fresh.
      }
    },
  });
}
