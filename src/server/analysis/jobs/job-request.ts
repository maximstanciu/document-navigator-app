import { isAnalysisJobId } from '@/shared/analysis/contract';

import { ApiFailure } from '../../http/api-failure';
import { readClientHeaders, type ClientHeaders } from '../../http/client-headers';
import { hashDeviceId } from '../../privacy/pseudonyms';
import type { ServerDeps } from '../../server-deps';

export type JobRequest = {
  client: ClientHeaders;
  /** Lower case, as the store keys it. */
  jobId: string;
  /** Pseudonym of the device: the owner of the job. */
  device: string;
};

/**
 * What every method of `/api/v1/analyses/{jobId}` checks first (SPEC §7.2): the app version (426),
 * the other client headers and the job id (400).
 */
export async function readJobRequest(
  request: Request,
  jobId: unknown,
  deps: Pick<ServerDeps, 'minAppVersion' | 'deviceHashKey'>
): Promise<JobRequest> {
  const client = readClientHeaders(request.headers, deps.minAppVersion);
  if (!isAnalysisJobId(jobId)) {
    throw new ApiFailure('invalid_request', 'The job id must be a UUID v4.');
  }
  const device = await hashDeviceId(client.deviceId, deps.deviceHashKey);
  return { client, jobId: jobId.toLowerCase(), device };
}
