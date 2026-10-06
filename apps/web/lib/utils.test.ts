import { cn } from './utils';

describe('cn', () => {
  it('merges conflicting tailwind classes keeping the last one', () => {
    expect(cn('px-2 py-1', false && 'hidden', 'px-4')).toBe('py-1 px-4');
  });
});
