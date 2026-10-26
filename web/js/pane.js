import { el } from './dom.js';
import { ago, clock, md } from './format.js';
import { STATE_COLOR, STATE_NAME, cloudProfile, defaults, effortName, isCloudAllowed, modelName, selectedTask, state } from './state.js';
import { fillSelect } from './controls.js';

const TABS = [['result', 'Результат'], ['progress', 'Ход работы'], ['task', 'Задача']];
const CHECK_LABEL = { SUCCESS: 'успешно', FAILURE: 'провал', ERROR: 'ошибка', IN_PROGRESS: 'идёт', QUEUED: 'в очереди' };

/**
 * Панель выбранной задачи: результат, ход работы, текст задачи и действия по состоянию.
 * Перерисовывается только при изменении данных, поэтому не мигает и не теряет набранную правку.
 */
export function createPane({ container, loadLog, actions }) {
  const drafts = new Map();
  const logs = new Map();
  let lastSignature = '';

  const initialLog = (t) => logs.get(t.id) ?? { events: t.events, commits: [], comments: [], checks: [], pr: t.pr ?? null };

  /** Отрисовка из того, что уже известно: мгновенно, без обращения к серверу. */
  function draw(t, log) {
    const signature = JSON.stringify([t.id, t.status, state.tab, state.reworkOpen, t.events.length, t.links, t.auto, log.commits.length, log.comments.length, log.pr?.updatedAt, log.pr?.body, log.checks]);
    if (signature === lastSignature) return;
    lastSignature = signature;

    const typing = container.querySelector('.p-actions textarea');
    if (typing) drafts.set(t.id, typing.value);
    const scroll = container.querySelector('.p-body')?.scrollTop ?? 0;

    container.replaceChildren(header(t), tabs(), el('div', { className: 'p-body' }, ...body(t, log)), footer(t));
    container.querySelector('.p-body').scrollTop = scroll;
    const textarea = container.querySelector('.p-actions textarea');
    if (textarea && drafts.has(t.id)) textarea.value = drafts.get(t.id);
  }

  /**
   * Сначала мгновенно рисует из кэша, затем (если refresh) подтягивает ход работы с сервера и дорисовывает.
   * Действия интерфейса (вкладка, правка) вызывают render без refresh и потому не ждут сети.
   */
  async function render({ refresh = true } = {}) {
    const t = selectedTask();
    if (!t) { container.hidden = true; return; }
    container.hidden = false;
    draw(t, { ...initialLog(t), events: t.events });
    if (!refresh || !t.branch || t.status === 'backlog') return;

    const fresh = await loadLog(t.id).catch(() => null);
    if (!fresh || state.selectedId !== t.id) return;
    logs.set(t.id, fresh);
    draw(t, { ...fresh, events: t.events });
  }

  function header(t) {
    return el('div', { className: 'p-head', style: `--c: var(--s-${STATE_COLOR[t.status] ?? 'idea'})` },
      el('h2', { textContent: t.title }),
      el('button', { className: 'p-close', textContent: '×', ariaLabel: 'Закрыть', title: 'Закрыть (Esc)', on: { click: actions.closePane } }),
      el('div', { className: 'pills' },
        el('span', { className: 'pill state', textContent: STATE_NAME[t.status] ?? t.status }),
        el('span', { className: 'pill', textContent: `#${t.id}` }),
        el('span', { className: 'pill', textContent: modelName(t.model) }),
        el('span', { className: 'pill', textContent: `усилие ${effortName(t.effort)}` }),
        t.auto ? el('span', { className: 'pill', textContent: 'без проверки' }) : null));
  }

  const tabs = () => el('div', { className: 'p-tabs', role: 'tablist' },
    ...TABS.map(([id, label]) => el('button', { role: 'tab', textContent: label, ariaSelected: String(state.tab === id), on: { click: () => actions.setTab(id) } })));

  function body(t, log) {
    if (state.tab === 'task') return taskTab(t);
    if (state.tab === 'progress') return progressTab(t, log);
    return resultTab(t, log);
  }

  const taskTab = (t) => [
    el('h3', { textContent: 'Текст задачи' }), el('div', { className: 'doc', innerHTML: md(t.body || t.title) }),
    el('h3', { textContent: 'Создана' }), el('div', { textContent: new Date(t.createdAt).toLocaleString('ru-RU') }),
  ];

  function progressTab(t, log) {
    const out = [];
    if (t.status === 'running' && !log.pr && t.sentAt && Date.now() - new Date(t.sentAt) > 30 * 60000) {
      out.push(el('div', { className: 'notice', textContent: `PR не появился уже ${ago(t.sentAt)}. Откройте сессию Claude: возможно, она ждёт вашего ответа.` }));
    }
    if (t.status === 'failed') out.push(el('div', { className: 'notice bad', textContent: t.events.at(-1)?.text ?? 'Сбой.' }));
    if (t.syncError) out.push(el('div', { className: 'notice', textContent: `Не удаётся обновить данные из GitHub: ${t.syncError}` }));
    if (log.pr?.body && !log.pr.body.startsWith('## Отчёт')) out.push(el('h3', { textContent: 'Что делает агент' }), el('div', { className: 'doc', innerHTML: md(log.pr.body) }));
    const rows = [
      ...log.events.map((e) => ({ t: e.t, text: e.text })),
      ...log.commits.map((c) => ({ t: c.t, text: `коммит: ${c.text}`, commit: true })),
      ...log.comments.map((c) => ({ t: c.t, text: `комментарий в PR: ${c.body.split('\n')[0]}` })),
    ].sort((a, b) => new Date(a.t) - new Date(b.t));
    out.push(el('h3', { textContent: 'События' }), el('ul', { className: 'timeline' },
      ...rows.map((r, i) => el('li', { className: `${r.commit ? 'commit ' : ''}${i === rows.length - 1 ? 'last' : ''}` }, el('time', { textContent: clock(r.t) }), r.text))));
    return out;
  }

  function resultTab(t, log) {
    const out = [];
    const links = el('div', { className: 'links' });
    const link = (text, href, main = false) => links.append(el('a', { textContent: text, href, target: '_blank', rel: 'noopener', className: main ? 'main' : '' }));
    if (t.links?.site) link('Открыть превью сайта', t.links.site, true);
    if (t.links?.report) link('Отчёт тестов', t.links.report);
    if (log.pr) link(`PR #${log.pr.number}`, log.pr.url);
    if (t.sessionUrl) link('Сессия Claude', t.sessionUrl);
    if (t.status === 'done') {
      if (state.project.stagingUrl) link('Бета', state.project.stagingUrl);
      if (state.project.prodUrl) link('Прод', state.project.prodUrl);
    }
    if (links.children.length) out.push(links);

    if (t.links?.desktop) {
      const shots = [t.links.desktop, t.links.mobile].filter(Boolean).map((src, i) =>
        el('a', { href: src, target: '_blank', rel: 'noopener', title: i ? 'Телефон' : 'Компьютер' }, el('img', { src, alt: i ? 'Скриншот на телефоне' : 'Скриншот на компьютере', loading: 'lazy' })));
      out.push(el('h3', { textContent: 'Как выглядит страница' }), el('div', { className: 'shots' }, ...shots));
    }
    if (log.checks.length) {
      out.push(el('h3', { textContent: 'Проверки' }), el('div', { className: 'checks' }, ...log.checks.map((c) =>
        el('span', { className: `chk ${c.result === 'SUCCESS' ? 'ok' : ['FAILURE', 'ERROR'].includes(c.result) ? 'bad' : ''}`, textContent: `${c.name}: ${CHECK_LABEL[c.result] ?? c.result.toLowerCase()}` }))));
    }
    if (log.pr?.body?.startsWith('## Отчёт')) out.push(el('h3', { textContent: 'Отчёт агента' }), el('div', { className: 'doc', innerHTML: md(log.pr.body) }));
    if (!out.length) out.push(el('div', { className: 'col-empty', textContent: t.status === 'running' ? 'Результата пока нет: агент ещё работает. Ход работы смотрите на соседней вкладке.' : 'Результата пока нет.' }));
    return out;
  }

  function footer(t) {
    const box = el('div', { className: 'p-actions' });
    const act = (handler) => (event) => { event.currentTarget.disabled = true; handler(); };

    if (t.status === 'backlog' || t.status === 'failed') {
      const d = defaults();
      const model = el('select'); fillSelect(model, state.config.models, t.model ?? d.model);
      const effort = el('select'); fillSelect(effort, state.config.efforts, t.effort ?? d.effort);
      box.append(
        el('div', { className: 'row' },
          el('label', { className: 'pick' }, el('span', { textContent: 'Модель' }), model),
          el('label', { className: 'pick' }, el('span', { textContent: 'Усилие' }), effort),
          el('span', { className: 'spacer' }),
          el('button', { className: 'primary', textContent: t.status === 'failed' ? 'Отправить снова' : 'Отправить в облако', disabled: !isCloudAllowed(), on: { click: act(() => actions.send(t, { model: model.value, effort: effort.value })) } })),
        isCloudAllowed() ? null : el('div', { className: 'note', textContent: cloudProfile().summary ?? 'Для этого проекта облако недоступно.' }),
        el('div', { className: 'row' }, el('button', { className: 'danger', textContent: t.status === 'failed' ? 'Закрыть' : 'Удалить из идей', on: { click: act(() => actions.discard(t, 'Закрыто.')) } })));
    } else if (t.status === 'review' && state.reworkOpen) {
      const textarea = el('textarea', { rows: 3, placeholder: 'Что исправить? Опишите, как для человека: правка уйдёт в ту же облачную сессию.' });
      box.append(textarea, el('div', { className: 'row' },
        el('button', { className: 'primary', textContent: 'Отправить правку', on: { click: act(() => { const text = textarea.value; drafts.delete(t.id); actions.rework(t, text); }) } }),
        el('button', { textContent: 'Отмена', on: { click: () => { drafts.set(t.id, textarea.value); actions.toggleRework(false); } } })));
    } else if (t.status === 'review') {
      box.append(el('div', { className: 'row' },
        el('button', { className: 'primary', textContent: 'Принять', title: 'Влить в staging', on: { click: act(() => actions.accept(t)) } }),
        el('button', { textContent: 'Доработать', on: { click: () => actions.toggleRework(true) } }),
        el('span', { className: 'spacer' }),
        el('button', { className: 'danger', textContent: 'Отклонить', title: 'Закрыть PR и удалить ветку', on: { click: act(() => actions.discard(t, 'Отклонено: PR закрыт, ветка удалена.')) } })));
    } else if (t.status === 'running') {
      box.append(el('div', { className: 'row' },
        el('span', { className: 'note', textContent: 'Облако работает. Ноутбук можно закрыть: результат появится в GitHub.' }),
        el('span', { className: 'spacer' }),
        el('button', { className: 'danger', textContent: 'Закрыть без выполнения', on: { click: act(() => actions.discard(t, 'Закрыто. Облачная сессия могла продолжить работу: остановите её на claude.ai.')) } })));
    } else {
      box.hidden = true;
    }
    return box;
  }

  return { render, invalidate: () => { lastSignature = ''; }, forget: (id) => { logs.delete(id); drafts.delete(id); } };
}
