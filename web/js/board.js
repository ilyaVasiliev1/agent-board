import { el } from './dom.js';
import { ago } from './format.js';
import { effortName, emptyText, modelName, projectTasks, state, taskNumber, visibleColumns } from './state.js';

/** Доска: колонки создаются один раз, карточки обновляются точечно по подписи, без перерисовки всего списка. */
export function createBoard({ container, onSelect }) {
  const cards = new Map();
  const columns = new Map();

  for (const column of visibleColumns()) {
    const count = el('span', { className: 'n' });
    const list = el('div', { className: 'col-list' });
    const section = el('section', { className: 'col', dataset: { col: column.id } }, el('div', { className: 'col-head' }, el('span', { textContent: column.title }), count), list);
    columns.set(column.id, { section, count, list, spec: column });
    container.append(section);
  }

  const signature = (t) => JSON.stringify([
    t.title, t.status, t.model, t.effort, t.auto, t.pr?.number, t.links?.desktop, t.links?.site,
    t.status === 'running' ? Math.floor(Date.now() / 60000) : 0, t.id === state.selectedId, t.events.at(-1)?.text,
  ]);

  function buildCard(t) {
    const meta = el('div', { className: 'm' }, el('b', { textContent: `#${taskNumber(t)}` }), t.model ? el('span', { textContent: modelName(t.model) }) : null, t.effort ? el('span', { textContent: effortName(t.effort) }) : null);
    if (t.auto) meta.append(el('span', { textContent: 'без проверки' }));
    if (t.status === 'running') meta.prepend(el('span', { className: 'live', textContent: t.pr ? 'пишет код' : 'запускается' }), el('span', { textContent: ago(t.sentAt) }));

    const card = el('div', { className: 'card' + (t.id === state.selectedId ? ' sel' : ''), role: 'listitem', tabIndex: 0, on: { click: () => onSelect(t.id), keydown: (e) => { if (e.key === 'Enter') onSelect(t.id); } } },
      el('div', { className: 't', textContent: t.title }), meta);
    if (t.status === 'review' && t.links?.desktop) card.append(el('img', { className: 'thumb', src: t.links.desktop, alt: '', loading: 'lazy' }));
    if (t.status === 'review' && t.links?.site) {
      const stop = { click: (e) => e.stopPropagation() };
      card.append(el('div', { className: 'card-links' },
        el('a', { href: t.links.site, target: '_blank', rel: 'noopener', textContent: 'Сайт', on: stop }),
        t.links.report ? el('a', { href: t.links.report, target: '_blank', rel: 'noopener', textContent: 'Отчёт', on: stop }) : null));
    }
    if (t.status === 'failed') card.append(el('div', { className: 'err', textContent: (t.events.at(-1)?.text ?? '').slice(0, 140) }));
    return card;
  }

  function render() {
    const tasks = projectTasks();
    const shown = new Set(tasks.filter((t) => columns.has(t.status)).map((t) => t.id));
    for (const [id, node] of cards) if (!shown.has(id)) { node.remove(); cards.delete(id); }

    for (const { section, count, list, spec } of columns.values()) {
      const items = tasks.filter((t) => t.status === spec.id).sort((a, b) => b.id - a.id);
      count.textContent = items.length || '';
      section.classList.toggle('quiet', !items.length && !emptyText(spec));
      list.querySelector('.col-empty')?.remove();

      let previous = null;
      for (const t of items) {
        const sig = signature(t);
        let node = cards.get(t.id);
        if (!node || node.dataset.sig !== sig) {
          const fresh = buildCard(t);
          fresh.dataset.sig = sig;
          node?.replaceWith(fresh);
          node = fresh;
          cards.set(t.id, node);
        }
        const expected = previous ? previous.nextSibling : list.firstChild;
        if (expected !== node) list.insertBefore(node, expected);
        previous = node;
      }
      if (!items.length && emptyText(spec)) list.append(el('div', { className: 'col-empty', textContent: emptyText(spec) }));
    }
  }

  function reset() {
    cards.clear();
    for (const { list } of columns.values()) list.replaceChildren();
  }

  return { render, reset, scrollTo: (id) => cards.get(id)?.scrollIntoView({ block: 'nearest' }) };
}
