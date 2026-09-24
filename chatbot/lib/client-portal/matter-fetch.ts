const MATTER_FETCH_TIMEOUT_MS = 1800;

type MatterFetchOptions = {
  baseUrl: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export async function fetchLegalMatterSnapshot(
  matterId: string,
  {
    baseUrl,
    apiKey,
    fetchImpl = fetch,
    timeoutMs = MATTER_FETCH_TIMEOUT_MS,
  }: MatterFetchOptions
): Promise<unknown | null> {
  if (!apiKey) {
    return null;
  }
  try {
    const response = await fetchImpl(
      `${baseUrl}/api/v1/matters/${encodeURIComponent(matterId)}`,
      {
        method: "GET",
        headers: { "X-API-Key": apiKey },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}
