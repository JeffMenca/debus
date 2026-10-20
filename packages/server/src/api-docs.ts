import { HttpCode, applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';

const DESCRIPTIONS = {
  400: 'Invalid data or invalid link.',
  401: 'Missing session or wrong credentials.',
  403: 'The role does not allow this action.',
  404: 'The requested resource does not exist.',
  409: 'Conflict with the current state: it already exists, was already used or cannot be changed.',
  410: 'The link has expired.',
  422: 'The request was understood but cannot be carried out in the current state.',
  423: 'Account temporarily locked after failed attempts.',
  429: 'Too many emails sent to this account in the last hour.',
  502: 'Another service answered with an error.',
  503: 'Another service did not answer in time. Try again.',
} as const;

export type DocumentedError = keyof typeof DESCRIPTIONS;

export function apiErrors(...statuses: DocumentedError[]): MethodDecorator {
  return applyDecorators(
    ...statuses.map((status) => ApiResponse({ status, description: DESCRIPTIONS[status] })),
  );
}

const SUCCESS = {
  200: 'Done.',
  201: 'Created.',
  202: 'Accepted. The response is the same whether or not the account exists.',
  204: 'Done, no content.',
} as const;

export type DocumentedSuccess = keyof typeof SUCCESS;

// Sets the status the route answers and documents it in one place, so both never disagree. Nest
// only documents the success response when no other response is declared, so it is declared too.
// With a schema, the shape of the answer is documented as well.
export function apiSuccess(status: DocumentedSuccess, schema?: z.ZodType): MethodDecorator {
  return applyDecorators(
    HttpCode(status),
    ApiResponse({
      status,
      description: SUCCESS[status],
      ...(schema && {
        schema: z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>,
      }),
    }),
  );
}

// Documents another success status that a route may answer with, next to the one it sets by default.
export function apiAlsoSuccess(
  status: DocumentedSuccess,
  description: string,
  schema?: z.ZodType,
): MethodDecorator {
  return applyDecorators(
    ApiResponse({
      status,
      description,
      ...(schema && {
        schema: z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>,
      }),
    }),
  );
}
