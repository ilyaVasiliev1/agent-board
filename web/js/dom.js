export const $ = (id) => document.getElementById(id);

const ARIA = { ariaSelected: 'aria-selected', ariaLabel: 'aria-label', ariaChecked: 'aria-checked' };

/** Создаёт элемент. Свойства: on (обработчики), dataset, style (строка), aria*; остальное идёт в свойства узла. */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'on') for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style') node.setAttribute('style', value);
    else if (ARIA[key]) node.setAttribute(ARIA[key], value);
    else node[key] = value;
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
