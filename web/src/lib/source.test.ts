import { describe, expect, it } from 'vitest';
import { fromSnapshots } from './source';
import { makeTask } from '@/test/utils';

const snapshot = (id: string, numbers: number[]) => ({
  repo: `o/${id}`, generatedAt: '2026-10-26T10:00:00Z', project: { id, title: id },
  tasks: numbers.map((n) => makeTask({ id: n, number: n, projectId: id })),
});

describe('fromSnapshots', () => {
  it('номера задач разных проектов не пересекаются, а настоящий номер сохраняется', () => {
    const { tasks } = fromSnapshots([snapshot('a', [1, 2]), snapshot('b', [1])]);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(3);
    expect(tasks.map((t) => t.number)).toEqual([1, 2, 1]);
  });

  it('без снимков остаётся заглушка проекта, а время берётся самое свежее', () => {
    expect(fromSnapshots([]).projects[0]?.id).toBe('none');
    const later = { ...snapshot('b', []), generatedAt: '2026-10-26T11:00:00Z' };
    expect(fromSnapshots([snapshot('a', []), later]).generatedAt).toBe('2026-10-26T11:00:00Z');
  });
});
