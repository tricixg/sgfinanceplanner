/** Parse a fetch Response as JSON; avoid opaque "<!DOCTYPE" errors when the API returns HTML. */
export async function parseJsonResponse<T = unknown>(
  res: Response
): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!contentType.includes("application/json")) {
    const preview = text.trim().slice(0, 80);
    console.error("[fetch-json] expected JSON", {
      url: res.url,
      status: res.status,
      contentType,
      preview,
    });
    throw new Error(
      res.status === 404
        ? `API not found (${res.url}). Restart the dev server or redeploy.`
        : `Server returned ${res.status} (expected JSON, got HTML).`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    console.error("[fetch-json] invalid JSON body", {
      url: res.url,
      status: res.status,
      preview: text.slice(0, 120),
    });
    throw new Error(`Invalid JSON from ${res.url}`);
  }
}

export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ res: Response; data: T }> {
  const res = await fetch(input, init);
  const data = await parseJsonResponse<T>(res);
  return { res, data };
}
