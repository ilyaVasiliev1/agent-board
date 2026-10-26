import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { makeTask, renderWithBoard } from '@/test/utils';

vi.mock('@/lib/api', () => ({ api: vi.fn().mockResolvedValue({}) }));

const TASKS = [
  makeTask({ id: 1, title: 'Первая идея' }),
  makeTask({ id: 2, title: 'Вторая в работе', status: 'running', sentAt: '2026-10-26T10:00:00Z' }),
  makeTask({ id: 3, title: 'Готовая к проверке', status: 'review', links: { site: 'https://s.test/' } }),
];

beforeEach(() => localStorage.clear());

describe('App', () => {
  it('режим управления: есть строка ввода, колонка идей и все задачи', async () => {
    renderWithBoard(<App />, { tasks: TASKS });
    expect(await screen.findByText('Первая идея')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Текст задачи' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Идеи/ })).toBeInTheDocument();
    expect(screen.getByText('Вторая в работе')).toBeInTheDocument();
  });

  it('режим просмотра: ни строки ввода, ни колонки идей, заголовок «Облако»', async () => {
    renderWithBoard(<App />, { tasks: TASKS.slice(1), mode: 'static' });
    expect(await screen.findByText('Вторая в работе')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Текст задачи' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Идеи/ })).toBeNull();
    expect(screen.getByText('Облако')).toBeInTheDocument();
  });

  it('клик по карточке открывает панель, Esc закрывает', async () => {
    renderWithBoard(<App />, { tasks: TASKS });
    await userEvent.click(await screen.findByText('Готовая к проверке'));
    expect(await screen.findByRole('complementary', { name: 'Задача' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Принять' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Задача' })).toBeNull());
  });

  it('клавиши J и K переходят между карточками, N возвращает в строку ввода', async () => {
    renderWithBoard(<App />, { tasks: TASKS });
    await screen.findByText('Первая идея');
    await userEvent.keyboard('j');
    expect(await screen.findByRole('heading', { level: 2, name: 'Первая идея' })).toBeInTheDocument();
    await userEvent.keyboard('j');
    expect(await screen.findByRole('heading', { level: 2, name: 'Вторая в работе' })).toBeInTheDocument();
    await userEvent.keyboard('k');
    expect(await screen.findByRole('heading', { level: 2, name: 'Первая идея' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}n');
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Текст задачи' })).toHaveFocus());
  });

  it('пустая задача не отправляется', async () => {
    const { api } = await import('@/lib/api');
    renderWithBoard(<App />, { tasks: [] });
    await userEvent.click(await screen.findByRole('button', { name: 'Сохранить в идеи' }));
    expect(api).not.toHaveBeenCalledWith('/api/tasks', expect.anything());
  });

  it('задача из строки ввода уходит на сервер с выбранными параметрами', async () => {
    const { api } = await import('@/lib/api');
    renderWithBoard(<App />, { tasks: [] });
    await userEvent.type(await screen.findByRole('textbox', { name: 'Текст задачи' }), 'Новая задача');
    await userEvent.click(screen.getByRole('button', { name: /Отправить в облако/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/tasks', {
      method: 'POST',
      body: { text: 'Новая задача', send: true, model: 'sonnet', effort: 'high', auto: false, project: 'p' },
    }));
  });
});
