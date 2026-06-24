// M6 schema-extension tests.
//
// Locks the v0.10 input-schema contract: items (array element
// schema), nested properties (object property schema), $ref (named
// sub-schema), and the existing flat shape. Error messages carry
// the dotted/bracketed path so callers see e.g.
// `field 'sources[0].file' must be string`.
//
// Pure unit tests: validateInputSchema is called directly with
// hand-rolled input and schemas. No filesystem side effects.

import test from 'node:test';
import assert from 'node:assert/strict';

const { validateInputSchema } = await import('../../packages/core/src/schema.ts');

// ---------------------------------------------------------------------------
// Flat shape (regression — pre-M6 behaviour)
// ---------------------------------------------------------------------------

test('schema: flat string with minLength is enforced', () => {
  assert.throws(
    () => validateInputSchema({ name: "" }, {
      properties: { name: { type: 'string', minLength: 1 } }
    }),
    /field 'name' must have minLength 1/
  );
});

test('schema: flat string with enum is enforced', () => {
  assert.throws(
    () => validateInputSchema({ level: 'critical' }, {
      properties: { level: { type: 'string', enum: ['high', 'medium', 'low'] } }
    }),
    /field 'level' must be one of: high, medium, low/
  );
});

test('schema: required field missing is rejected', () => {
  assert.throws(
    () => validateInputSchema({}, { required: ['name'] }),
    /missing field: name/
  );
});

test('schema: additionalProperties=false rejects unknown top-level field', () => {
  assert.throws(
    () => validateInputSchema({ name: 'a', extra: 1 }, {
      properties: { name: { type: 'string' } },
      additionalProperties: false
    }),
    /unexpected field: extra/
  );
});

// ---------------------------------------------------------------------------
// items (array element schema)
// ---------------------------------------------------------------------------

test('schema: items validates every array element', () => {
  const schema = {
    properties: {
      tags: {
        type: 'array',
        items: { type: 'string', minLength: 1 }
      }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({ tags: ['a', 'b'] }, schema));
  assert.throws(
    () => validateInputSchema({ tags: ['a', ''] }, schema),
    /field 'tags\[1\]' must have minLength 1/
  );
});

test('schema: items error path is bracketed-index', () => {
  const schema = {
    properties: {
      items: {
        type: 'array',
        items: { type: 'string' }
      }
    }
  };
  assert.throws(
    () => validateInputSchema({ items: ['a', 1, 'c'] }, schema),
    /field 'items\[1\]' must be string/
  );
});

test('schema: nested array-of-arrays (items.items) recurses', () => {
  const schema = {
    properties: {
      matrix: {
        type: 'array',
        items: {
          type: 'array',
          items: { type: 'number' }
        }
      }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({ matrix: [[1, 2], [3]] }, schema));
  assert.throws(
    () => validateInputSchema({ matrix: [[1, 'x']] }, schema),
    /field 'matrix\[0\]\[1\]' must be number/
  );
});

test('schema: array without items is accepted (untyped elements)', () => {
  const schema = { properties: { raw: { type: 'array' } } };
  assert.doesNotThrow(() => validateInputSchema({ raw: [1, 'x', null, { ok: true }] }, schema));
});

// ---------------------------------------------------------------------------
// Nested properties (object property schema)
// ---------------------------------------------------------------------------

test('schema: nested object properties are validated', () => {
  const schema = {
    properties: {
      address: {
        type: 'object',
        properties: {
          city: { type: 'string', minLength: 1 },
          zip: { type: 'string' }
        }
      }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({ address: { city: 'Berlin', zip: '10115' } }, schema));
  assert.throws(
    () => validateInputSchema({ address: { city: '' } }, schema),
    /field 'address.city' must have minLength 1/
  );
});

test('schema: nested object required fields', () => {
  const schema = {
    properties: {
      config: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' } }
      }
    }
  };
  assert.throws(
    () => validateInputSchema({ config: {} }, schema),
    /missing field: config.name/
  );
});

test('schema: nested additionalProperties=false rejects unknown child', () => {
  const schema = {
    properties: {
      inner: {
        type: 'object',
        properties: { a: { type: 'string' } },
        additionalProperties: false
      }
    }
  };
  assert.throws(
    () => validateInputSchema({ inner: { a: 'x', b: 1 } }, schema),
    /unexpected field: inner.b/
  );
});

// ---------------------------------------------------------------------------
// $ref (named sub-schema)
// ---------------------------------------------------------------------------

test('schema: $ref to SourceRef accepts a valid source', () => {
  const schema = {
    properties: {
      source: { $ref: 'SourceRef' }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({
    source: { file: 'src/routes/orders.ts', line: 6, repo: 'sample-app' }
  }, schema));
});

test('schema: $ref to SourceRef rejects missing file', () => {
  const schema = {
    properties: { source: { $ref: 'SourceRef' } }
  };
  assert.throws(
    () => validateInputSchema({ source: { line: 6 } }, schema),
    /missing field: source.file/
  );
});

test('schema: $ref to ConfidenceBlock accepts a valid block', () => {
  const schema = {
    properties: {
      confidence: { $ref: 'ConfidenceBlock' }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({
    confidence: { level: 'high', kind: 'fact' }
  }, schema));
});

test('schema: $ref to ConfidenceBlock rejects bad enum value', () => {
  const schema = {
    properties: { confidence: { $ref: 'ConfidenceBlock' } }
  };
  assert.throws(
    () => validateInputSchema({ confidence: { level: 'critical', kind: 'fact' } }, schema),
    /field 'confidence.level' must be one of: high, medium, low/
  );
});

test('schema: $ref to unknown name is ignored (passes through)', () => {
  // Unknown $ref values are treated as no-op (the resolved def is the
  // original). This keeps the validator forward-compatible with new
  // named refs that may be added later.
  const schema = {
    properties: { x: { $ref: 'NotARealRef' } }
  };
  assert.doesNotThrow(() => validateInputSchema({ x: 'anything' }, schema));
});

// ---------------------------------------------------------------------------
// Combined — items + properties + $ref in one schema
// ---------------------------------------------------------------------------

test('schema: real-world input — sources array of $ref SourceRef objects', () => {
  const schema = {
    properties: {
      sources: {
        type: 'array',
        items: { $ref: 'SourceRef' }
      },
      confidence: { $ref: 'ConfidenceBlock' }
    }
  };
  assert.doesNotThrow(() => validateInputSchema({
    sources: [
      { file: 'a.ts', line: 1, repo: 'x' },
      { file: 'b.ts', line: 2, repo: 'x' }
    ],
    confidence: { level: 'high', kind: 'fact' }
  }, schema));
  assert.throws(
    () => validateInputSchema({
      sources: [
        { file: 'a.ts' },
        { line: 2 }
      ],
      confidence: { level: 'high', kind: 'fact' }
    }, schema),
    /missing field: sources\[1\].file/
  );
});

// ---------------------------------------------------------------------------
// Backwards compatibility — schema shape additions are additive
// ---------------------------------------------------------------------------

test('schema: existing pre-M6 schemas still work (string property, no items/nested/$ref)', () => {
  const schema = {
    required: ['name'],
    properties: { name: { type: 'string', minLength: 1 } },
    additionalProperties: false
  };
  assert.doesNotThrow(() => validateInputSchema({ name: 'a' }, schema));
  assert.throws(() => validateInputSchema({}, schema), /missing field: name/);
  assert.throws(
    () => validateInputSchema({ name: 'a', x: 1 }, schema),
    /unexpected field: x/
  );
});
