import { describe, expect, it } from 'vitest';
import { ago } from './format';

describe('ago', () => {
  const base = new Date('2026-10-26T10:00:00Z').getTime();
  it('показывает минуты и часы', () => {
    expect(ago('2026-10-26T10:00:00Z', base + 20_000)).toBe('меньше минуты');
    expect(ago('2026-10-26T10:00:00Z', base + 5 * 60_000)).toBe('5 мин');
    expect(ago('2026-10-26T10:00:00Z', base + 95 * 60_000)).toBe('1 ч 35 мин');
  });
});
