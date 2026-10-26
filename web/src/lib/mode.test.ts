import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectMode } from './source';

afterEach(() => vi.restoreAllMocks());

const respond = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));

describe('detectMode', () => {
  it('«live» только если mode.json так говорит', async () => {
    respond({ mode: 'live' });
    expect(await detectMode()).toBe('live');
  });

  it('статический mode.json, пустой ответ и сбой сети дают просмотр', async () => {
    respond({ mode: 'static' });
    expect(await detectMode()).toBe('static');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>'));
    expect(await detectMode()).toBe('static');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await detectMode()).toBe('static');
  });
});
