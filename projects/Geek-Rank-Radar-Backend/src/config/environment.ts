import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5004),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  BING_SEARCH_API_KEY: z.string().min(1).optional(),
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),
  BING_MAPS_API_KEY: z.string().min(1).optional(),
  DEFAULT_GRID_SIZE: z.coerce.number().default(7),
  MAX_CONCURRENT_ENGINES: z.coerce.number().default(3),
  STORE_RAW_HTML: z.coerce.boolean().default(false),
  CORS_ORIGIN: z.string().default('https://geekatyourspot.com'),
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
