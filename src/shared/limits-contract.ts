import { z } from 'zod';

/** `GET /api/v1/limits` (SPEC §7.2): what is left of the device's daily limit. */
export const limitsResponseSchema = z.object({
  dailyLimit: z.number().int().min(0),
  remaining: z.number().int().min(0),
  /** The next midnight UTC; the app shows it in local time (ANL-9). */
  resetsAt: z.iso.datetime(),
});

export type LimitsResponse = z.infer<typeof limitsResponseSchema>;
