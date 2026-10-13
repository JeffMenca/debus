import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { DECORATORS } from '@nestjs/swagger';
import { apiErrors, apiSuccess } from './api-docs';

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
});
