import { z } from 'zod';

import type { UiLocale } from '@/shared/ui-locales';

import { EXPO_PUSH_ERRORS, type PushOutcome } from '../../limits/usage-keys';
import type { ServerEnv } from '../../server-deps';
import type { JobResult } from './analysis-job';

/**
 * The push about a finished job (ANL-12, SPEC §7.1): no title, a neutral text in the interface
 * language, and in the data only the job's id, which the app finds the document by.
 */
export type AnalysisPushMessage = {
  to: string;
  body: string;
  data: { type: 'analysis'; jobId: string };
  channelId: 'analysis';
  priority: 'high';
};

/** Sends one push and tells how it went. Never rejects. */
export type PushSender = (message: AnalysisPushMessage) => Promise<PushOutcome>;

/** Like the reminders' neutral texts (REM-12): nothing about the document. */
const PUSH_TEXTS: Record<UiLocale, Record<JobResult['status'], string>> = {
  ru: {
    done: 'Документ разобран. Откройте приложение, чтобы посмотреть результат.',
    failed: 'Не удалось разобрать документ. Откройте приложение, чтобы повторить.',
  },
  en: {
    done: 'A document has been analyzed. Open the app to see the result.',
    failed: "A document couldn't be analyzed. Open the app to try again.",
  },
};

export function analysisPushMessage({
  to,
  jobId,
  uiLocale,
  status,
}: {
  to: string;
  jobId: string;
  uiLocale: UiLocale;
  status: JobResult['status'];
}): AnalysisPushMessage {
  return {
    to,
    body: PUSH_TEXTS[uiLocale][status],
    data: { type: 'analysis', jobId },
    channelId: 'analysis',
    priority: 'high',
  };
}

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 2_000;

/** Answers worth one more try: none at all, `5xx` or `429` (Expo asks to retry these later). */
const TRANSIENT: readonly PushOutcome[] = ['network', 'server_error', 'TOO_MANY_REQUESTS'];

const ticketSchema = z.object({
  status: z.string(),
  details: z.object({ error: z.string().optional() }).nullish(),
});

/** One message gets one ticket, or an `errors` list when the whole request failed. */
const responseSchema = z.object({
  data: z.union([ticketSchema, z.array(ticketSchema)]).optional(),
  errors: z.array(z.object({ code: z.string() })).optional(),
});

/**
 * Sends the push through Expo Push Service with plain `fetch` (SPEC §7.1), the access token of the
 * EAS project's push security as `Authorization`. A request without an answer, a `5xx` or a `429`
 * is retried once, `retryDelayMs` later; delivery receipts are not checked in the MVP, so an error
 * (`DeviceNotRegistered`, say) is only the outcome to log.
 */
export function expoPushSender({
  accessToken,
  fetch = globalThis.fetch,
  timeoutMs = TIMEOUT_MS,
  retryDelayMs = RETRY_DELAY_MS,
}: {
  accessToken: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}): PushSender {
  const post = async (message: AnalysisPushMessage): Promise<PushOutcome> => {
    let response: Response;
    try {
      response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return 'network';
    }
    if (response.status === 429) return 'TOO_MANY_REQUESTS';
    if (response.status >= 500) return 'server_error';
    const body = responseSchema.safeParse(await response.json().catch(() => null));
    if (!body.success) return 'unexpected';
    const { data, errors } = body.data;
    const ticket = Array.isArray(data) ? data[0] : data;
    if (response.ok && ticket) {
      return ticket.status === 'ok' ? 'ok' : expoError(ticket.details?.error);
    }
    return expoError(errors?.[0]?.code);
  };

  return async (message) => {
    const outcome = await post(message);
    if (!TRANSIENT.includes(outcome)) return outcome;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    return post(message);
  };
}

function expoError(code: string | undefined): PushOutcome {
  return EXPO_PUSH_ERRORS.find((known) => known === code) ?? 'unexpected';
}

/**
 * The push sender from server environment variables:
 *
 * - `EXPO_ACCESS_TOKEN`: an access token of the Expo account, with push security on in the EAS
 *   project (SPEC §7.1); a secret. Unset — no push: the app gets the result when it is opened.
 */
export function createPushSender(env: ServerEnv): PushSender | null {
  const accessToken = env.EXPO_ACCESS_TOKEN;
  return accessToken ? expoPushSender({ accessToken }) : null;
}
