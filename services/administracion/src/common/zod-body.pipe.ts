import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';
import { MESSAGES } from '../accounts/messages';

export class ZodBody<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: z.ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new BadRequestException(MESSAGES.invalidData);
    return parsed.data;
  }
}

export const apiBody = (schema: z.ZodType) =>
  ApiBody({ schema: z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown> });
