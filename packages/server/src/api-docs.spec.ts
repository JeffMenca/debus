import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { z } from 'zod';
import { apiAlsoSuccess, apiErrors, apiSuccess } from './api-docs';

describe('apiErrors', () => {
  it('documents each error status with what it means for the caller', () => {
    class Controller {
      @apiErrors(400, 409, 423)
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string }>;

    expect(Object.keys(responses)).toEqual(['400', '409', '423']);
    expect(responses['409']?.description).toMatch(/conflict|already/i);
    expect(responses['423']?.description).toMatch(/locked/i);
  });
});

describe('apiErrors 429', () => {
  it('documents the hourly email limit', () => {
    class Controller {
      @apiErrors(429)
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string }>;

    expect(responses['429']?.description).toBe(
      'Too many emails sent to this account in the last hour.',
    );
  });
});

describe('apiErrors 502 and 503', () => {
  it('documents the failures of the services called synchronously', () => {
    class Controller {
      @apiErrors(502, 503)
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string }>;

    expect(responses['502']?.description).toBe('Another service answered with an error.');
    expect(responses['503']?.description).toBe(
      'Another service did not answer in time. Try again.',
    );
  });
});

describe('apiErrors 422', () => {
  it('documents a request the service understood but refused to carry out', () => {
    class Controller {
      @apiErrors(422)
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string }>;

    expect(responses['422']?.description).toMatch(/understood|refus|cannot/i);
  });
});

describe('apiSuccess', () => {
  it('documents the success status next to the errors', () => {
    class Controller {
      @apiSuccess(202)
      @apiErrors(400)
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, unknown>;

    expect(Object.keys(responses).sort()).toEqual(['202', '400']);
  });

  it('makes the route answer with the documented status', () => {
    class Controller {
      @apiSuccess(204)
      handler() {}
    }

    expect(Reflect.getMetadata(HTTP_CODE_METADATA, Controller.prototype.handler)).toBe(204);
  });

  it('documents the shape of the answer when it is given a schema', () => {
    class Controller {
      @apiSuccess(200, z.object({ balance: z.number(), email: z.email().optional() }))
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string; schema?: { properties: Record<string, unknown> } }>;

    expect(Object.keys(responses['200']?.schema?.properties ?? {})).toEqual(['balance', 'email']);
    expect(responses['200']?.description).toBe('Done.');
  });
});

describe('apiAlsoSuccess', () => {
  it('documents another success status without changing the one the route answers', () => {
    class Controller {
      @apiSuccess(201)
      @apiAlsoSuccess(202, 'Accepted: still being confirmed.', z.object({ status: z.string() }))
      handler() {}
    }

    const responses = Reflect.getMetadata(
      DECORATORS.API_RESPONSE,
      Controller.prototype.handler,
    ) as Record<string, { description: string; schema?: { properties: Record<string, unknown> } }>;

    expect(Object.keys(responses).sort()).toEqual(['201', '202']);
    expect(responses['202']?.description).toBe('Accepted: still being confirmed.');
    expect(Object.keys(responses['202']?.schema?.properties ?? {})).toEqual(['status']);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, Controller.prototype.handler)).toBe(201);
  });
});
