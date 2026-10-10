import type { CallHandler } from '@nestjs/common';
import { Observable, lastValueFrom, of, throwError } from 'rxjs';
import { MinimumDurationInterceptor } from './minimum-duration.interceptor';

describe('MinimumDurationInterceptor', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const run = (handler: CallHandler, ms = 300) =>
    lastValueFrom(new MinimumDurationInterceptor(ms).intercept({} as never, handler));

  it('holds a fast answer until the minimum time has passed', async () => {
    let settled = false;
    const result = run({ handle: () => of('ok') }).then((value) => {
      settled = true;
      return value;
    });

    await jest.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(await result).toBe('ok');
  });

  it('holds a fast error as well, so failures cannot be told apart by time', async () => {
    let settled = false;
    const result = run({ handle: () => throwError(() => new Error('conflict')) }).catch(
      (error: Error) => {
        settled = true;
        return error.message;
      },
    );

    await jest.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(await result).toBe('conflict');
  });

  it('adds nothing to an answer that already took longer', async () => {
    const slow: CallHandler = {
      handle: () =>
        new Observable<string>((subscriber) => {
          setTimeout(() => {
            subscriber.next('slow');
            subscriber.complete();
          }, 500);
        }),
    };
    const result = run(slow);

    await jest.advanceTimersByTimeAsync(500);

    expect(await result).toBe('slow');
    expect(jest.getTimerCount()).toBe(0);
  });
});
