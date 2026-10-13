import { BadRequestException, type PipeTransform, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { SERVER_MESSAGES } from './messages';

export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(SERVER_MESSAGES.invalidData);
    return parsed.data;
  }
}

export const apiBody = (schema: z.ZodType) =>
  ApiBody({ schema: z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown> });

export const apiQuery = (schema: z.ZodObject) =>
  applyDecorators(...Object.keys(schema.shape).map((name) => ApiQuery({ name, required: false })));
