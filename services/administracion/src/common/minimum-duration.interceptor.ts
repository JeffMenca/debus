import { type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { type Observable, defer, lastValueFrom } from 'rxjs';

// Endpoints that answer the same to every case (known email, unknown email) must also take the
// same time to answer, or the response time tells the cases apart.
export class MinimumDurationInterceptor implements NestInterceptor {
  constructor(private readonly minimumMs: number) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return defer(async () => {
      const startedAt = Date.now();
      try {
        return await lastValueFrom(next.handle());
      } finally {
        const remaining = this.minimumMs - (Date.now() - startedAt);
        if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    });
  }
}
