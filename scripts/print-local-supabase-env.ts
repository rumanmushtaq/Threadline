import { LOCAL_SUPABASE_URL, localSupabaseKeys } from "./local-supabase";

const keys = localSupabaseKeys();
console.log(`SUPABASE_URL=${LOCAL_SUPABASE_URL}`);
console.log(`SUPABASE_PUBLISHABLE_KEY=${keys.publishableKey}`);
console.log(`SUPABASE_SECRET_KEY=${keys.secretKey}`);
