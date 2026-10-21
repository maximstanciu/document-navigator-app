/**
 * The request body as a stream that errors once more than `maxBytes` came in, so an oversized body
 * never fills the memory (SPEC §7.1). `exceeded()` tells that apart from a broken body.
 *
 * A plain pull stream rather than pipeThrough(): Jest's globals and Node's fetch use streams from
 * different realms, which pipeThrough() rejects.
 */
export function limitedBody(
  body: ReadableStream<Uint8Array>,
  maxBytes: number
): { stream: ReadableStream<Uint8Array>; exceeded: () => boolean } {
  const reader = body.getReader();
  let received = 0;
  let exceeded = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        exceeded = true;
        controller.error(new Error('Body limit exceeded'));
        await reader.cancel();
        return;
      }
      controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
  return { stream, exceeded: () => exceeded };
}
