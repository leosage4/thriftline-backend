import 'dotenv/config';

function optionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function numberWithDefault(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number.`);
  }

  return value;
}

export const env = {
  port: numberWithDefault('PORT', 3000),
  nodeEnv: optionalString('NODE_ENV') ?? 'development',
  corsOrigin: optionalString('CORS_ORIGIN') ?? '*',

  ebayClientId: optionalString('EBAY_CLIENT_ID'),
  ebayClientSecret: optionalString('EBAY_CLIENT_SECRET'),

  etsyApiKey: optionalString('ETSY_API_KEY'),
  etsyApiSecret: optionalString('ETSY_API_SECRET'),

  supabaseUrl: optionalString('SUPABASE_URL') ?? optionalString('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseKey: optionalString('SUPABASE_SERVICE_ROLE_KEY')
    ?? optionalString('SUPABASE_KEY')
    ?? optionalString('EXPO_PUBLIC_SUPABASE_KEY'),
};

export const configStatus = {
  ebayConfigured: Boolean(env.ebayClientId && env.ebayClientSecret),
  etsyConfigured: Boolean(env.etsyApiKey),
  supabaseConfigured: Boolean(env.supabaseUrl && env.supabaseKey),
};
