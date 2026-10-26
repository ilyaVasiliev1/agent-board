import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useBoard } from '@/hooks/board';
import { LOCAL_ONLY, makeTask, renderWithBoard } from '@/test/utils';
import { PaneActions } from './pane-actions';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));

// Достаём выбранную задачу из контекста, как это делает панель.
function Harness({ id }: { id: number }) {
  const { tasks } = useBoard();
  const task = tasks.find((t) => t.id === id);
  return task ? <PaneActions key={task.status} task={task} /> : null;
}

beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(api).mockResolvedValue({}); localStorage.clear(); });

describe('PaneActions', () => {
  it('на проверке: принять, доработать, отклонить', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'review' })] });
    expect(await screen.findByRole('button', { name: 'Принять' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Доработать' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeInTheDocument();
  });

  it('«Принять» отправляет запрос и показывает подтверждение', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'review' })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Принять' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/tasks/1/accept', { method: 'POST', body: {} }));
    expect(await screen.findByText('Принято: влито в staging.')).toBeInTheDocument();
  });

  it('доработка: пустую правку отправить нельзя, текст уходит на сервер', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'review' })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Доработать' }));
    const send = screen.getByRole('button', { name: 'Отправить правку' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: 'Что исправить' }), 'сделай цену 300');
    await userEvent.click(send);
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/tasks/1/rework', { method: 'POST', body: { text: 'сделай цену 300' } }));
  });

  it('ошибка сервера показывается пользователю', async () => {
    vi.mocked(api).mockRejectedValue(new Error('GitHub не принял слияние: есть конфликты'));
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'review' })] });
    await userEvent.click(await screen.findByRole('button', { name: 'Принять' }));
    expect(await screen.findByText(/есть конфликты/)).toBeInTheDocument();
  });

  it('идея: отправка в облако доступна, удаление тоже', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask()] });
    expect(await screen.findByRole('button', { name: 'Отправить в облако' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Удалить из идей' })).toBeInTheDocument();
  });

  it('проект только для локальной работы: отправка заблокирована и объяснена', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask()], config: LOCAL_ONLY });
    expect(await screen.findByRole('button', { name: 'Отправить в облако' })).toBeDisabled();
    expect(screen.getByText('Только локально: нужен Xcode.')).toBeInTheDocument();
  });

  it('после ошибки доступна повторная отправка', async () => {
    renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'failed' })] });
    expect(await screen.findByRole('button', { name: 'Отправить снова' })).toBeInTheDocument();
  });

  it('на странице просмотра действий нет', async () => {
    const { container } = renderWithBoard(<Harness id={1} />, { tasks: [makeTask({ status: 'review' })], mode: 'static' });
    await waitFor(() => expect(api).not.toHaveBeenCalled());
    expect(container.querySelector('button')).toBeNull();
  });
});
