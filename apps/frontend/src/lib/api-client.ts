/** Error for any non-2xx response, carrying the status code and parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(
      typeof body === 'object' && body !== null && 'message' in body
        ? String((body as { message: unknown }).message)
        : `Request failed with status ${status}`,
    );
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

/** Thin JSON wrapper around fetch. Paths are same-origin (`/api/...`). */
export async function apiRequest<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data);
  return { status: response.status, data: data as T };
}
