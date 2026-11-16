import { ApiFailure, handleApiFailures } from '../http/api-failure';
import { readClientHeaders } from '../http/client-headers';
import { hashDeviceId } from '../privacy/pseudonyms';
import type { ServerDeps } from '../server-deps';
import { StoreUnavailableError } from '../store/counter-store';

/**
 * `GET /api/v1/limits` (SPEC §7.2): `{ dailyLimit, remaining, resetsAt }` for the device in
 * `X-Device-Id`, for the settings screen (SET-4). `remaining` leaves out the device's unfinished
 * jobs (SPEC §8.3). The same header checks as analysis, 426 included.
 */
export function handleLimits(request: Request, deps: ServerDeps): Promise<Response> {
  return handleApiFailures(async () => {
    const client = readClientHeaders(request.headers, deps.minAppVersion);
    const device = await hashDeviceId(client.deviceId, deps.deviceHashKey);
    try {
      return Response.json(await deps.usage.remaining(device, deps.jobs.unfinished(device)));
    } catch (error) {
      if (error instanceof StoreUnavailableError) {
        throw new ApiFailure('unavailable', 'Limits are unavailable.');
      }
      throw error;
    }
  });
}
