import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CONFIG, makeTask } from '@/test/utils';
import { TaskCard } from './task-card';

const NOW = new Date('2026-10-26T10:05:00Z').getTime();
const setup = (task = makeTask(), selected = false) => {
  const onSelect = vi.fn();
  render(<TaskCard task={task} config={CONFIG} selected={selected} now={NOW} onSelect={onSelect} />);
  return onSelect;
};

describe('TaskCard', () => {
  it('показывает заголовок, номер, модель и усилие', () => {
    setup();
    expect(screen.getByText('Добавить Раф')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('Sonnet 5.5')).toBeInTheDocument();
    expect(screen.getByText('высокий')).toBeInTheDocument();
  });

  it('у работающей задачи видно, сколько она идёт и что делает', () => {
    setup(makeTask({ status: 'running', sentAt: '2026-10-26T10:00:00Z', pr: { number: 3, url: 'u', state: 'OPEN', updatedAt: 'x' } }));
    expect(screen.getByText('пишет код')).toBeInTheDocument();
    expect(screen.getByText('5 мин')).toBeInTheDocument();
  });

  it('на проверке показывает ссылки, и клик по ссылке не выбирает карточку', async () => {
    const onSelect = setup(makeTask({ status: 'review', links: { site: 'https://s.test/', report: 'https://r.test/' } }));
    await userEvent.click(screen.getByRole('link', { name: 'Сайт' }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Отчёт' })).toHaveAttribute('href', 'https://r.test/');
    await userEvent.click(screen.getByText('Добавить Раф'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('карточку можно выбрать с клавиатуры', async () => {
    const onSelect = setup();
    screen.getByRole('listitem').focus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('ошибка показывается на карточке полностью, без обрезки по символам', () => {
    const text = 'Claude просит подтвердить доверие к папке. Папка: /Users/x/data/dispatch/p';
    setup(makeTask({ status: 'failed', events: [{ t: 'x', text }] }));
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
