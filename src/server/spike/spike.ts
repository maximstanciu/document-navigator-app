// Spike 0.2 (IMPLEMENTATION_PLAN): measures EAS Hosting limits for the analyze request.
// Throwaway code: it is removed once docs/spikes/0.2-eas-hosting.md is written.

const SPIKE_TOKEN = '1be2d2a9bf6eec9cfa8be658e45420db';
const MAX_WAIT_MS = 120_000;
const MB = 1024 * 1024;

type SpikeEvent = { at: number; name: string; detail?: unknown };
type EventStore = Map<string, SpikeEvent[]>;
type BufferLike = { from(bytes: Uint8Array): { toString(encoding: 'base64'): string } };
// The global FormData typings come from React Native (client), not from the Workers runtime.
type UploadedFile = { size: number; type: string; arrayBuffer(): Promise<ArrayBuffer> };

function isUploadedFile(value: unknown): value is UploadedFile {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value;
}

// Lives as long as the isolate does, so a follow-up request can read what happened after a client abort.
const spikeGlobal = globalThis as unknown as { __spikeEvents?: EventStore; Buffer?: BufferLike };
spikeGlobal.__spikeEvents ??= new Map();
const store = spikeGlobal.__spikeEvents;

function record(rid: string, name: string, detail?: unknown) {
  const events = store.get(rid) ?? [];
  events.push({ at: Date.now(), name, detail });
  store.set(rid, events);
  console.log(`[spike] ${rid} ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
}

function deny(request: Request): Response | null {
  return request.headers.get('x-spike-token') === SPIKE_TOKEN
    ? null
    : Response.json({ error: 'unauthorized' }, { status: 401 });
}

function numberParam(params: URLSearchParams, name: string): number {
  const value = Number(params.get(name) ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Mimics POST /api/v1/analyze up to the LLM call:
 * multipart → bytes → base64 → JSON body → outbound fetch.
 * Query: rid, stage (parse | encode | full), extraMb, target (self-slow | URL), waitMs,
 * outbound (post | get), linkSignal (1 passes request.signal to the outbound fetch).
 */
export async function handleUpload(request: Request): Promise<Response> {
  const denied = deny(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const rid = params.get('rid') ?? crypto.randomUUID();
  const stage = params.get('stage') ?? 'full';
  const extraMb = numberParam(params, 'extraMb');
  const waitMs = Math.min(numberParam(params, 'waitMs'), MAX_WAIT_MS);
  const target = params.get('target');
  const outboundGet = params.get('outbound') === 'get';
  const linkSignal = params.get('linkSignal') === '1';

  request.signal.addEventListener('abort', () => record(rid, 'client-abort'));
  record(rid, 'start', {
    contentLength: request.headers.get('content-length'),
    stage,
    extraMb,
    target,
    waitMs,
    linkSignal,
  });

  const form = await request.formData();
  const files = (form.getAll('files') as unknown[]).filter(isUploadedFile);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  record(rid, 'parsed', { files: files.length, totalBytes });
  if (stage === 'parse') {
    return Response.json({ rid, stage, files: files.length, totalBytes, events: store.get(rid) });
  }

  const NodeBuffer = spikeGlobal.Buffer;
  if (!NodeBuffer) {
    record(rid, 'no-buffer');
    return Response.json({ rid, error: 'Buffer global is missing' }, { status: 500 });
  }
  const parts: { inline_data: { mime_type: string; data: string } }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    parts.push({
      inline_data: {
        mime_type: file.type || 'application/octet-stream',
        data: NodeBuffer.from(bytes).toString('base64'),
      },
    });
  }
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [...parts, { text: 'spike' }] }],
  });
  record(rid, 'encoded', { bodyLength: body.length });

  // Extra live allocations on top of the request path, to find the headroom before the memory limit.
  const held: Uint8Array[] = [];
  for (let i = 0; i < extraMb; i++) {
    held.push(new Uint8Array(MB).fill((i % 255) + 1));
  }
  if (extraMb) record(rid, 'extra-allocated', { extraMb: held.length });

  const summary = {
    rid,
    stage,
    files: files.length,
    totalBytes,
    bodyLength: body.length,
    heldMb: held.length,
  };
  if (stage === 'encode' || !target) {
    return Response.json({ ...summary, events: store.get(rid) });
  }

  const url =
    target === 'self-slow'
      ? `${new URL(request.url).origin}/api/spike/slow?rid=${encodeURIComponent(rid)}&waitMs=${waitMs}`
      : target;
  record(rid, 'outbound-start', { target, method: outboundGet ? 'GET' : 'POST' });
  try {
    const response = await fetch(url, {
      method: outboundGet ? 'GET' : 'POST',
      body: outboundGet ? undefined : body,
      headers: { 'content-type': 'application/json', 'x-spike-token': SPIKE_TOKEN },
      signal: linkSignal ? request.signal : undefined,
    });
    const text = await response.text();
    record(rid, 'outbound-done', { status: response.status, bytes: text.length });
    return Response.json({
      ...summary,
      outbound: { status: response.status, body: text.slice(0, 300) },
      events: store.get(rid),
    });
  } catch (error) {
    record(rid, 'outbound-error', { message: String(error) });
    return Response.json(
      { ...summary, error: String(error), events: store.get(rid) },
      { status: 502 }
    );
  }
}

/** Stand-in for a slow LLM: drains the body, then waits `waitMs`. */
export async function handleSlow(request: Request): Promise<Response> {
  const denied = deny(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const rid = params.get('rid') ?? crypto.randomUUID();
  const waitMs = Math.min(numberParam(params, 'waitMs'), MAX_WAIT_MS);

  request.signal.addEventListener('abort', () => record(rid, 'slow-abort'));
  const received = request.method === 'POST' ? (await request.arrayBuffer()).byteLength : 0;
  record(rid, 'slow-received', { received });
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  record(rid, 'slow-done', { waitMs });
  return Response.json({ received, waitMs });
}

/** Events recorded in this isolate, for one request id or the list of ids. */
export function handleEvents(request: Request): Response {
  const denied = deny(request);
  if (denied) return denied;

  const rid = new URL(request.url).searchParams.get('rid');
  return Response.json(rid ? { rid, events: store.get(rid) ?? null } : { rids: [...store.keys()] });
}
