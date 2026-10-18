import { z } from 'zod';

// Analysis result (SPEC §7.3): the single source of truth for its TypeScript type, runtime
// validation and the JSON Schema sent to the model (`toLlmJsonSchema()` in ./json-schema.ts).
//
// The strict schema checks shape and bounds. The server first checks only the shape
// (`llmAnalysisShapeSchema`); its post-processing (task 3.3) then trims text that runs over a bound,
// drops dates out of range and unlinks actions from missing deadlines, so the result it returns
// always passes `analysisResultSchema`. Descriptions are for the model.

export const ANALYSIS_SCHEMA_VERSION = 1;

/** Upper bounds: they cap output tokens and protect the layout (SPEC §7.3). Strings in characters. */
export const ANALYSIS_BOUNDS = {
  id: 40,
  title: 120,
  languageTag: 35,
  senderName: 200,
  summary: 600,
  description: 300,
  computation: 300,
  quote: 500,
  explanation: 400,
  factLabel: 80,
  factValue: 200,
  actions: 20,
  deadlines: 20,
  risks: 20,
  keyFacts: 30,
  fraudSignals: 10,
} as const;

export const DOCUMENT_TYPES = [
  'letter',
  'invoice',
  'contract',
  'official_notice',
  'fine',
  'tax',
  'insurance',
  'bank',
  'medical',
  'other',
  'unknown',
] as const;

export const DEADLINE_KINDS = [
  'payment',
  'response',
  'submission',
  'appointment',
  'cancellation',
  'renewal',
  'other',
] as const;

export const SENDER_KINDS = ['government', 'company', 'individual', 'unknown'] as const;

/** Risk severity, action priority and deadline confidence share one scale. */
export const LEVELS = ['high', 'medium', 'low'] as const;

export const KEY_FACT_KINDS = [
  'amount',
  'reference',
  'account',
  'period',
  'contact',
  'other',
] as const;

export const QUALITY_ISSUES = [
  'blurry',
  'cropped',
  'dark',
  'not_a_document',
  'partial',
  'handwritten',
] as const;

const B = ANALYSIS_BOUNDS;

/** A BCP 47 language tag, loosely: "de", "pt-BR", "und". */
export const LANGUAGE_TAG = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$/;

/**
 * Builds the model's output schema. `strict` checks bounds and formats as well as the shape; without
 * it only the fields, types, enums and nulls are checked — what the server's post-processing needs
 * before it repairs the rest (task 3.3). One builder keeps both in step with the JSON Schema.
 */
function buildLlmAnalysisSchema(strict: boolean) {
  const text = (max: number) => (strict ? z.string().max(max) : z.string());
  const list = <T extends z.ZodType>(item: T, max: number) =>
    strict ? z.array(item).max(max) : z.array(item);
  const id = strict ? z.string().min(1).max(B.id) : z.string();
  const level = z.enum(LEVELS);
  const calendarDate = (strict ? z.iso.date() : z.string()).describe('Calendar date, YYYY-MM-DD.');
  const quote = text(B.quote).describe(
    'Verbatim quote from the original, in the language of the original.'
  );
  const page = (strict ? z.number().int().min(1) : z.number())
    .nullable()
    .describe('1-based page number, null if unknown.');

  const senderSchema = z.object({
    name: text(B.senderName),
    kind: z.enum(SENDER_KINDS),
  });

  const actionSchema = z.object({
    id: id.describe('Short id, unique within this response, e.g. "a1".'),
    description: text(B.description),
    priority: level,
    deadlineId: id.nullable().describe('The id of the deadline this action must be done by.'),
  });

  const deadlineSchema = z.object({
    id: id.describe('Short id, unique within this response, e.g. "d1".'),
    kind: z.enum(DEADLINE_KINDS),
    description: text(B.description).describe('What has to be done by this date.'),
    date: calendarDate,
    time: (strict ? z.iso.time({ precision: -1 }) : z.string())
      .nullable()
      .describe('Time of day if the document gives one, HH:mm (24-hour).'),
    dateSource: z
      .enum(['explicit', 'computed'])
      .describe('"computed" when the date is derived, e.g. "within 14 days of the letter".'),
    computation: text(B.computation)
      .nullable()
      .describe('For computed dates: how the date was derived. Null for explicit dates.'),
    sourceQuote: quote,
    page,
    confidence: level,
  });

  const riskSchema = z.object({
    severity: level,
    title: text(B.title),
    explanation: text(B.explanation).describe(
      'What happens if nothing is done, or what the catch is.'
    ),
    sourceQuote: quote.nullable(),
    page,
  });

  const keyFactSchema = z.object({
    kind: z.enum(KEY_FACT_KINDS),
    label: text(B.factLabel).describe('E.g. "Amount due", "Contract number".'),
    value: text(B.factValue).describe('Exactly as written in the document.'),
  });

  const fraudSignalSchema = z.object({
    explanation: text(B.explanation),
    sourceQuote: quote.nullable(),
    page,
  });

  return z.object({
    documentType: z.enum(DOCUMENT_TYPES),
    title: text(B.title).describe('Short name of the document, e.g. "Electricity bill, Sep 2026".'),
    documentLanguage: (strict
      ? z.string().regex(LANGUAGE_TAG).max(B.languageTag)
      : z.string()
    ).describe('BCP 47 tag of the language of the original, e.g. "de"; "und" if unknown.'),
    sender: senderSchema.nullable(),
    documentDate: calendarDate.nullable(),
    summary: text(B.summary).describe('2–4 sentences in plain language.'),
    actions: list(actionSchema, B.actions),
    deadlines: list(deadlineSchema, B.deadlines),
    risks: list(riskSchema, B.risks),
    keyFacts: list(keyFactSchema, B.keyFacts),
    fraudSignals: list(fraudSignalSchema, B.fraudSignals).describe(
      'Signs of possible fraud; empty if there are none.'
    ),
    quality: z.object({
      readable: z.boolean(),
      issues: list(z.enum(QUALITY_ISSUES), QUALITY_ISSUES.length),
    }),
  });
}

/**
 * What the model returns. `schemaVersion` is not in it: the server adds it, so the model's JSON
 * Schema stays free of constants.
 */
export const llmAnalysisSchema = buildLlmAnalysisSchema(true);

/**
 * The model's output with the same fields and enums but without bounds and formats: text of any
 * length, dates and times as strings, any page number. The server checks this first; what fails it
 * is worth a retry, what fails only `llmAnalysisSchema` post-processing repairs (SPEC §7.4).
 */
export const llmAnalysisShapeSchema = buildLlmAnalysisSchema(false);

/** The analysis as the API returns it and the app stores it (SPEC §7.3). */
export const analysisResultSchema = z.object({
  schemaVersion: z.literal(ANALYSIS_SCHEMA_VERSION),
  ...llmAnalysisSchema.shape,
});

export type LlmAnalysis = z.infer<typeof llmAnalysisSchema>;
export type LlmAnalysisShape = z.infer<typeof llmAnalysisShapeSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
export type AnalysisAction = AnalysisResult['actions'][number];
export type AnalysisDeadline = AnalysisResult['deadlines'][number];
export type AnalysisRisk = AnalysisResult['risks'][number];
export type KeyFact = AnalysisResult['keyFacts'][number];
export type FraudSignal = AnalysisResult['fraudSignals'][number];

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];
export type Level = (typeof LEVELS)[number];
