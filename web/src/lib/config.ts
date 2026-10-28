// web/src/lib/config.ts
// Client-side config cache

let configCache: Record<string, unknown> | null = null;
let configPromise: Promise<Record<string, unknown>> | null = null;

export async function getConfig(): Promise<Record<string, unknown>> {
  if (configCache) return configCache;
  if (configPromise) return configPromise;
  
  configPromise = (async () => {
    const { api } = await import('../api');
    configCache = await api.getConfig();
    return configCache;
  })();
  
  return configPromise;
}

export function getConfigValue<T>(key: string): T | undefined {
  return configCache?.[key] as T | undefined;
}

export function clearConfigCache() {
  configCache = null;
  configPromise = null;
}