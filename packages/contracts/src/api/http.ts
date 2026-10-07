import { z } from 'zod';

export const CORRELATION_HEADER = 'x-correlation-id';

export const errorResponseSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  correlationId: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
