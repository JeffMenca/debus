import { MAX_EMAIL_ATTEMPTS, isExhausted, retryDelayMs } from './email-rules';

const minutes = (value: number) => value * 60_000;

describe('email retry rules', () => {
  it('waits longer after each failure, up to six hours', () => {
    expect(retryDelayMs(1)).toBe(minutes(1));
    expect(retryDelayMs(2)).toBe(minutes(2));
    expect(retryDelayMs(3)).toBe(minutes(4));
    expect(retryDelayMs(20)).toBe(minutes(360));
  });

  it('gives up after the last attempt', () => {
    expect(isExhausted(MAX_EMAIL_ATTEMPTS - 1)).toBe(false);
    expect(isExhausted(MAX_EMAIL_ATTEMPTS)).toBe(true);
  });
});
