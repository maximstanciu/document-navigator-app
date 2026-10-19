import { toLlmJsonSchema, type JsonSchema } from './json-schema';
import { ANALYSIS_BOUNDS, DOCUMENT_TYPES, llmAnalysisSchema } from './schema';

// The structured-output subset common to the provider candidates (SPEC §7.3, task 0.3).
const PORTABLE_KEYWORDS = [
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'anyOf',
  'description',
];
const MAX_OBJECT_DEPTH = 5;

/** Every schema node with the number of objects it is nested in. */
function walk(node: JsonSchema, depth = 0): { node: JsonSchema; depth: number }[] {
  const children = [
    ...Object.values((node.properties as Record<string, JsonSchema> | undefined) ?? {}),
    ...(node.items ? [node.items as JsonSchema] : []),
    ...((node.anyOf as JsonSchema[] | undefined) ?? []),
  ];
  const childDepth = node.type === 'object' ? depth + 1 : depth;
  return [{ node, depth }, ...children.flatMap((child) => walk(child, childDepth))];
}

const schema = toLlmJsonSchema();
const nodes = walk(schema);

describe('toLlmJsonSchema', () => {
  it('describes an object without a $schema header', () => {
    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('$schema');
  });

  it('uses only keywords every provider candidate accepts', () => {
    const keywords = new Set(nodes.flatMap(({ node }) => Object.keys(node)));
    expect([...keywords].filter((keyword) => !PORTABLE_KEYWORDS.includes(keyword))).toEqual([]);
  });

  it('closes every object and requires all of its fields', () => {
    const objects = nodes.filter(({ node }) => node.type === 'object');
    expect(objects.length).toBeGreaterThan(5);
    for (const { node } of objects) {
      expect(node.additionalProperties).toBe(false);
      expect(node.required).toEqual(Object.keys(node.properties as object));
    }
  });

  it('uses anyOf only to make a value nullable', () => {
    for (const { node } of nodes) {
      if (!node.anyOf) continue;
      const branches = node.anyOf as JsonSchema[];
      expect(branches).toHaveLength(2);
      expect(branches[1]).toEqual({ type: 'null' });
    }
  });

  it('nests objects no deeper than the strictest provider allows', () => {
    expect(Math.max(...nodes.map(({ depth }) => depth))).toBeLessThanOrEqual(MAX_OBJECT_DEPTH);
  });

  it('keeps enums, leaves out the schema version, and states the bounds in descriptions', () => {
    const properties = schema.properties as Record<string, JsonSchema>;
    expect(Object.keys(properties)).toEqual(Object.keys(llmAnalysisSchema.shape));
    expect(properties).not.toHaveProperty('schemaVersion');
    expect(properties.documentType.enum).toEqual([...DOCUMENT_TYPES]);
    expect(properties.summary.description).toBe(
      `2–4 sentences in plain language. At most ${ANALYSIS_BOUNDS.summary} characters.`
    );
    expect(properties.deadlines.description).toBe(`At most ${ANALYSIS_BOUNDS.deadlines} items.`);
  });

  it('gives each deadline a nullable rule the server counts computed dates by (SPEC §7.3)', () => {
    const properties = schema.properties as Record<string, JsonSchema>;
    const deadline = (properties.deadlines.items as JsonSchema).properties as Record<
      string,
      JsonSchema
    >;
    const [rule, empty] = deadline.rule.anyOf as JsonSchema[];
    expect(empty).toEqual({ type: 'null' });
    expect(Object.keys(rule.properties as object)).toEqual([
      'from',
      'fromDate',
      'direction',
      'amount',
      'unit',
      'endOf',
    ]);

    const fields = rule.properties as Record<string, JsonSchema>;
    expect(fields.from.enum).toEqual(['document_date', 'receipt', 'date_in_text']);
    expect(fields.direction.enum).toEqual(['after', 'before']);
    expect(fields.unit.enum).toEqual(['day', 'week', 'month', 'year']);
    expect(fields.amount).toEqual({
      type: 'integer',
      description: 'Whole number greater than zero.',
    });
    expect((fields.endOf.anyOf as JsonSchema[])[0].enum).toEqual(['month', 'quarter', 'year']);
  });
});
