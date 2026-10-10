import { BadRequestException } from '@nestjs/common';
import { emailRequestSchema } from '@debus/contracts';
import { DECORATORS } from '@nestjs/swagger';
import { ZodBody, apiBody } from './zod-body.pipe';

describe('ZodBody', () => {
  it('returns the parsed value', () => {
    expect(new ZodBody(emailRequestSchema).transform({ email: ' A@B.COM ' })).toEqual({
      email: 'a@b.com',
    });
  });

  it('answers 400 with a friendly message', () => {
    expect(() => new ZodBody(emailRequestSchema).transform({ email: 'x' })).toThrow(
      new BadRequestException('Revisa los datos marcados e intenta de nuevo.'),
    );
  });
});

describe('apiBody', () => {
  it('documents the body with the JSON Schema of the zod schema', () => {
    class Controller {
      @apiBody(emailRequestSchema)
      handler() {}
    }

    const parameters = Reflect.getMetadata(
      DECORATORS.API_PARAMETERS,
      Controller.prototype.handler,
    ) as { in: string; schema: { properties: Record<string, unknown> } }[];

    expect(parameters[0]?.in).toBe('body');
    expect(Object.keys(parameters[0]?.schema.properties ?? {})).toEqual(['email']);
  });
});
