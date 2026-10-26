import { el } from './dom.js';

export function fillSelect(select, items, value) {
  select.replaceChildren(...items.map((item) => el('option', { value: item.id, textContent: item.title })));
  select.value = value;
}
