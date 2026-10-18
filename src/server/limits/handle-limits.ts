import { ApiFailure, errorResponse } from '../http/api-failure';
import { readClientHeaders } from '../http/client-headers';
import { hashDeviceId } from '../privacy/pseudonyms';
import type { ServerDeps } from '../server-deps';
import { StoreUnavailableError } from '../store/counter-store';

/**
 * `GET /api/v1/limits` (SPEC §7.2): `{ dailyLimit, remaining, resetsAt }` for the device in
 * `X-Device-Id`, for the settings screen (SET-4). The same header checks as analysis, 426 included.
 */
export async function handleLimits(request: Request, deps: ServerDeps): Promise<Response> {
  try {
    const client = readClientHeaders(request.headers, deps.minAppVersion);
    const device = await hashDeviceId(client.deviceId, deps.deviceHashKey);
    return Response.json(await deps.usage.remaining(device));
  } catch (error) {
    if (error instanceof ApiFailure) return error.toResponse();
    if (error instanceof StoreUnavailableError) {
      return errorResponse('unavailable', 'Limits are unavailable.');
    }
    throw error;
  }
}
