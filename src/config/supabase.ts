import { createClient } from '@supabase/supabase-js';

import { env } from './env';

if (!env.supabaseUrl || !env.supabaseKey) {
  throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_KEY.');
}

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
