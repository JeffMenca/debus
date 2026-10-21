export const MAX_EMAIL_ATTEMPTS = 8;
const FIRST_RETRY_MS = 60_000;
const LONGEST_RETRY_MS = 6 * 60 * 60_000;

// 1, 2, 4... minutes after each failure, so a mail server that is down for a while is not hammered.
export const retryDelayMs = (attempts: number): number =>
  Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), LONGEST_RETRY_MS);

export const isExhausted = (attempts: number): boolean => attempts >= MAX_EMAIL_ATTEMPTS;
