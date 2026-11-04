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

function toPortable(node: JsonSchema, keepMaxItems: boolean): JsonSchema {
  const result: JsonSchema = {};
  for (const [keyword, value] of Object.entries(node)) {
    if (DROPPED_KEYWORDS.has(keyword) && !(keepMaxItems && keyword === 'maxItems')) continue;
    if (keyword === 'properties') {
      result.properties = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema>).map(([name, child]) => [
          name,
          toPortable(child, keepMaxItems),
        ])
      );
    } else if (keyword === 'items') {
      result.items = toPortable(value as JsonSchema, keepMaxItems);
    } else if (keyword === 'anyOf') {
      result.anyOf = (value as JsonSchema[]).map((child) => toPortable(child, keepMaxItems));
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
 * (task 3.2) passes it as its structured-output schema. `maxItems` keeps the array sizes for a
 * provider whose grammar enforces them (llama.cpp in Ollama): the model then can't write more
 * items than the bounds, which is what caps its output (SPEC §7.3). Lengths stay out: the grammar
 * would cut a quote mid-word, and the server trims long text anyway.
 */
export function toLlmJsonSchema({ maxItems = false }: { maxItems?: boolean } = {}): JsonSchema {
  return toPortable(z.toJSONSchema(llmAnalysisSchema) as JsonSchema, maxItems);
}
