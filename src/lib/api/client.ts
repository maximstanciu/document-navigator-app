import { env } from '@/lib/env';

import { getClientHeaders } from './client-headers';

/** Thrown for any non-2xx response. `body` is the parsed JSON (or raw text) the server sent. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
    /** Response headers, e.g. `Retry-After` of a `429`. */
    readonly headers: Headers = new Headers()
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Thrown when no response arrived within `timeoutMs`; the request is aborted. */
export class ApiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiTimeoutError';
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

export type RequestOptions = Omit<RequestInit, 'body' | 'headers' | 'method'> & {
  /** `FormData` is sent as `multipart/form-data` as it is; anything else is serialized as JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Appended as a query string; `undefined` values are skipped. */
  query?: QueryParams;
  /** Aborts the request with an `ApiTimeoutError` if the response hasn't arrived by then. */
  timeoutMs?: number;
};

type AccessTokenGetter = () => string | null | undefined | Promise<string | null | undefined>;

let getAccessToken: AccessTokenGetter | undefined;

/** Register where the client reads the bearer token from (e.g. your auth store). */
export function setAccessTokenGetter(getter: AccessTokenGetter | undefined) {
  getAccessToken = getter;
}

export function buildUrl(path: string, query?: QueryParams, baseUrl = env.apiUrl) {
  const url = `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  if (!query) return url;

  const params = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return params ? `${url}?${params}` : url;
}

function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Aborts `fetch` after `timeoutMs`, and also when the caller's own signal aborts. `timedOut()` tells
 * the two apart. Hermes has no `AbortSignal.timeout()` or `AbortSignal.any()`, hence the controller.
 */
function abortAfter(timeoutMs: number | undefined, signal: AbortSignal | null | undefined) {
  if (timeoutMs === undefined) return { signal, timedOut: () => false, clear: () => {} };
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, timeoutMs);
  const forward = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forward);
  return {
    signal: controller.signal,
    timedOut: () => expired,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, query, timeoutMs, signal, ...init } = options;
  const isForm = body instanceof FormData;
  const [token, clientHeaders] = await Promise.all([getAccessToken?.(), getClientHeaders()]);
  const abort = abortAfter(timeoutMs, signal);

  try {
    const response = await fetch(buildUrl(path, query), {
      ...init,
      method,
      signal: abort.signal,
      headers: {
        Accept: 'application/json',
        // FormData sets its own multipart Content-Type with the boundary.
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...clientHeaders,
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });

    const data = parseBody(await response.text());
    if (!response.ok) {
      throw new ApiError(
        `${method} ${path} failed with ${response.status}`,
        response.status,
        data,
        response.headers
      );
    }
    return data as T;
  } catch (error) {
    if (abort.timedOut()) {
      throw new ApiTimeoutError(`${method} ${path} got no response in ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    abort.clear();
  }
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
