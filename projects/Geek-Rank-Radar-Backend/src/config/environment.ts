import { z } from 'zod';

/** Treat empty strings as undefined so optional env vars don't fail .min(1) */
const optionalKey = z.string().min(1).optional().or(z.literal('').transform(() => undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5004),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  BING_SEARCH_API_KEY: optionalKey,
  GOOGLE_PLACES_API_KEY: optionalKey,
  BING_MAPS_API_KEY: optionalKey,
  DEFAULT_GRID_SIZE: z.coerce.number().default(7),
  MAX_CONCURRENT_ENGINES: z.coerce.number().default(3),
  STORE_RAW_HTML: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().default('https://geekatyourspot.com'),
  PROXY_LIST: optionalKey,
  PROXY_FILE: optionalKey,
});

export type Environment = z.infer<typeof envSchema>;

let env: Environment;

export function loadEnvironment(): Environment {
  if (env) return env;
  env = envSchema.parse(process.env);
  return env;
}

export function getEnv(): Environment {
  if (!env) return loadEnvironment();
  return env;
}
