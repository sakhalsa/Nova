const DEFAULT_TIMEOUT_MS = 30_000;

let defaultTimeoutMs = DEFAULT_TIMEOUT_MS;

export function setDefaultFetchTimeoutMs(ms: number): void {
  defaultTimeoutMs = Math.max(1000, ms);
}

export function getDefaultFetchTimeoutMs(): number {
  return defaultTimeoutMs;
}

export async function timedFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = defaultTimeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
