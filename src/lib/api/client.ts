import { env } from '@/lib/env';

/** Thrown for any non-2xx response. `body` is the parsed JSON (or raw text) the server sent. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type QueryParams = Record<string, string | number | boolean | undefined>;

export type RequestOptions = Omit<RequestInit, 'body' | 'headers' | 'method'> & {
  /** Serialized as JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Appended as a query string; `undefined` values are skipped. */
  query?: QueryParams;
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

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, query, ...init } = options;
  const token = await getAccessToken?.();

  const response = await fetch(buildUrl(path, query), {
    ...init,
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = parseBody(await response.text());
  if (!response.ok) {
    throw new ApiError(`${method} ${path} failed with ${response.status}`, response.status, data);
  }
  return data as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>('POST', path, options),
  put: <T>(path: string, options?: RequestOptions) => request<T>('PUT', path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>('PATCH', path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
};
