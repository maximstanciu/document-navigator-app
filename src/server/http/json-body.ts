import { ApiFailure } from './api-failure';
import { limitedBody } from './limited-body';

/**
 * Parses a small JSON body, reading at most `maxBytes` of it. A body that is too long, empty or not
 * JSON is `400 invalid_request`; the message never quotes it.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes || !request.body) {
    throw new ApiFailure('invalid_request', `Expected a JSON body of at most ${maxBytes} bytes.`);
  }
  const { stream, exceeded } = limitedBody(request.body, maxBytes);
  try {
    return JSON.parse(await new Response(stream).text());
  } catch {
    throw new ApiFailure(
      'invalid_request',
      exceeded() ? `The body is larger than ${maxBytes} bytes.` : 'The body is not JSON.'
    );
  }
}
