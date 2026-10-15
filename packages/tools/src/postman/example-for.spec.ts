import { exampleFor } from './example-for';

describe('exampleFor', () => {
  describe('with another variable naming', () => {
    const rename = (name: string) => `test${name.charAt(0).toUpperCase()}${name.slice(1)}`;

    it('names the variables of ids and tokens with the given function', () => {
      expect(exampleFor({ type: 'string', format: 'uuid' }, 'busId', { variable: rename })).toBe(
        '{{testBusId}}',
      );
      expect(exampleFor({ type: 'string' }, 'refreshToken', { variable: rename })).toBe(
        '{{testRefreshToken}}',
      );
    });

    it('applies it inside objects and arrays, and leaves the dynamic values alone', () => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: { categoryId: { type: 'string', format: 'uuid' } },
              required: ['categoryId'],
            },
          },
          email: { type: 'string' },
          day: { type: 'string', format: 'date' },
        },
        required: ['id', 'lines', 'email', 'day'],
      };
      expect(exampleFor(schema, '', { variable: rename })).toEqual({
        id: '{{$guid}}',
        lines: [{ categoryId: '{{testCategoryId}}' }],
        email: '{{email}}',
        day: '{{today}}',
      });
    });
  });

  describe('strings', () => {
    it('uses the variable named like the field for a uuid', () => {
      expect(exampleFor({ type: 'string', format: 'uuid' }, 'busId')).toBe('{{busId}}');
      expect(exampleFor({ type: 'string', format: 'uuid' }, 'destinationBranchId')).toBe(
        '{{destinationBranchId}}',
      );
    });

    it('generates a new uuid for the id of the thing being created', () => {
      expect(exampleFor({ type: 'string', format: 'uuid' }, 'id')).toBe('{{$guid}}');
      expect(exampleFor({ type: 'string', format: 'uuid' })).toBe('{{$guid}}');
    });

    it('uses the date variable for a date and a dynamic timestamp for a date-time', () => {
      expect(exampleFor({ type: 'string', format: 'date' }, 'serviceDate')).toBe('{{today}}');
      expect(exampleFor({ type: 'string', format: 'date-time' }, 'departureAt')).toBe(
        '{{$isoTimestamp}}',
      );
    });

    it('uses the email variable for an email, by format or by name', () => {
      expect(exampleFor({ type: 'string', format: 'email' }, 'contact')).toBe('{{email}}');
      expect(exampleFor({ type: 'string' }, 'email')).toBe('{{email}}');
      expect(exampleFor({ type: 'string' }, 'billingEmail')).toBe('{{email}}');
    });

    it.each([
      ['code', 'TST'],
      ['phone', '55550000'],
      ['dpi', '2345678901234'],
      ['plate', 'C123ABC'],
      ['licenseNumber', 'LIC12345'],
      ['refreshToken', '{{refreshToken}}'],
      ['token', '{{token}}'],
    ])('knows what a %s looks like', (name, expected) => {
      expect(exampleFor({ type: 'string' }, name)).toBe(expected);
    });

    it('falls back to a short text that respects the length limits', () => {
      expect(exampleFor({ type: 'string' }, 'brand')).toBe('texto');
      expect(exampleFor({ type: 'string', minLength: 8 }, 'something')).toBe('textoxxx');
      expect(exampleFor({ type: 'string', maxLength: 3 }, 'something')).toBe('tex');
    });

    it('takes the first value of an enum', () => {
      expect(exampleFor({ type: 'string', enum: ['SYSTEM_ADMIN', 'CASHIER'] }, 'role')).toBe(
        'SYSTEM_ADMIN',
      );
    });
  });

  describe('numbers', () => {
    it('uses the minimum', () => {
      expect(exampleFor({ type: 'integer', minimum: 10, maximum: 80 }, 'capacity')).toBe(10);
      expect(exampleFor({ type: 'number', minimum: 13.7 }, 'latitude')).toBe(13.7);
    });

    it('goes one above an exclusive minimum', () => {
      expect(exampleFor({ type: 'number', exclusiveMinimum: 0, maximum: 2000 }, 'distanceKm')).toBe(
        1,
      );
    });

    it('stays under the maximum', () => {
      expect(exampleFor({ type: 'number', exclusiveMinimum: 0, maximum: 0.5 }, 'ratio')).toBe(0.5);
    });

    it('is zero when nothing limits it', () => {
      expect(exampleFor({ type: 'number' }, 'amount')).toBe(0);
    });
  });

  it('gives true for a boolean', () => {
    expect(exampleFor({ type: 'boolean' }, 'active')).toBe(true);
  });

  describe('objects and arrays', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        plate: { type: 'string' },
        capacity: { type: 'integer', minimum: 10 },
        assignedDriverId: { type: 'string', format: 'uuid' },
        note: { type: 'string' },
      },
      required: ['plate', 'capacity', 'assignedDriverId'],
    };

    it('fills the required fields only', () => {
      expect(exampleFor(schema)).toEqual({
        plate: 'C123ABC',
        capacity: 10,
        assignedDriverId: '{{assignedDriverId}}',
      });
    });

    it('fills every field when none is required', () => {
      expect(
        exampleFor({
          type: 'object',
          properties: { name: { type: 'string' }, active: { type: 'boolean' } },
        }),
      ).toEqual({ name: 'texto', active: true });
    });

    it('goes into nested objects and arrays, one item each', () => {
      expect(
        exampleFor({
          type: 'object',
          properties: {
            admin: {
              type: 'object',
              properties: { email: { type: 'string' } },
              required: ['email'],
            },
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: { categoryId: { type: 'string', format: 'uuid' } },
                required: ['categoryId'],
              },
              minItems: 1,
            },
          },
          required: ['admin', 'lines'],
        }),
      ).toEqual({ admin: { email: '{{email}}' }, lines: [{ categoryId: '{{categoryId}}' }] });
    });

    it('has no properties to fill for an object without them', () => {
      expect(exampleFor({ type: 'object' })).toEqual({});
    });
  });

  describe('other shapes', () => {
    it('takes the first option that is not null', () => {
      expect(exampleFor({ anyOf: [{ type: 'null' }, { type: 'string', enum: ['A'] }] })).toBe('A');
      expect(exampleFor({ oneOf: [{ type: 'integer', minimum: 3 }] })).toBe(3);
    });

    it('merges allOf', () => {
      expect(
        exampleFor({
          allOf: [
            { type: 'object', properties: { a: { type: 'integer', minimum: 1 } }, required: ['a'] },
            { type: 'object', properties: { b: { type: 'boolean' } }, required: ['b'] },
          ],
        }),
      ).toEqual({ a: 1, b: true });
    });

    it('uses a const or a default when there is one', () => {
      expect(exampleFor({ const: 'fijo' })).toBe('fijo');
      expect(exampleFor({ type: 'string', default: 'activo' })).toBe('activo');
    });

    it('is null for a schema it cannot read', () => {
      expect(exampleFor({})).toBeNull();
      expect(exampleFor({ $ref: '#/components/schemas/x' })).toBeNull();
      expect(exampleFor({ type: 'null' })).toBeNull();
    });
  });
});
