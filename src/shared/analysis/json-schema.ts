import { z } from 'zod';

import { llmAnalysisSchema } from './schema';

export type JsonSchema = { [keyword: string]: unknown };

/**
 * Keywords that not every structured-output candidate accepts (SPEC §7.3, task 0.3): string and
 * number constraints, array sizes, formats and patterns. Dropping them leaves every field required,
 * `null` for "no value", `additionalProperties: false` and `anyOf` only for nullable values.
 */
const DROPPED_KEYWORDS = new Set([
  '$schema',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
]);

function toPortable(node: JsonSchema): JsonSchema {
  const result: JsonSchema = {};
  for (const [keyword, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(keyword)) continue;
    if (keyword === 'properties') {
      result.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([name, child]) => [
          name,
          toPortable(child),
        ])
      );
    } else if (keyword === 'items') {
      result.items = toPortable(value as JsonSchema);
    } else if (keyword === 'anyOf') {
      result.anyOf = (value as JsonSchema[]).map(toPortable);
    } else {
      result[keyword] = value;
    }
  }
  // The model still sees the bounds as text; the server trims whatever runs over them (task 3.3).
  const hints = [
    typeof node.maxLength === 'number' && `At most ${node.maxLength} characters.`,
    typeof node.maxItems === 'number' && `At most ${node.maxItems} items.`,
  ].filter((hint): hint is string => Boolean(hint));
  if (hints.length > 0) {
    result.description = [node.description, ...hints].filter(Boolean).join(' ');
  }
  return result;
}

/**
 * JSON Schema of the model's output, in the subset every provider candidate supports. The provider
 * (task 3.2) passes it as its structured-output schema.
 */
export function toLlmJsonSchema(): JsonSchema {
  return toPortable(z.toJSONSchema(llmAnalysisSchema) as JsonSchema);
}
