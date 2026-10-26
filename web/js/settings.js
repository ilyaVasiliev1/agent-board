import { $ } from './dom.js';
import { fillSelect } from './controls.js';
import { defaults, state, updateSettings } from './state.js';

function applyTheme() {
  const theme = state.settings.theme ?? 'auto';
  document.documentElement.dataset.theme = theme;
  for (const button of document.querySelectorAll('#s-theme button')) button.setAttribute('aria-checked', String(button.dataset.v === theme));
}

/**
 * Настройки: тема (везде) и модель с усилием по умолчанию (только на странице с вводом задач).
 * onDefaultsChange вызывается, когда значения для новых задач изменились.
 */
export function initSettings({ onDefaultsChange }) {
  if (!state.readOnly) {
    const d = defaults();
    fillSelect($('s-model'), state.config.models, d.model);
    fillSelect($('s-effort'), state.config.efforts, d.effort);
    $('s-model').addEventListener('change', (e) => { updateSettings({ model: e.target.value }); onDefaultsChange(); });
    $('s-effort').addEventListener('change', (e) => { updateSettings({ effort: e.target.value }); onDefaultsChange(); });
  }
  for (const button of document.querySelectorAll('#s-theme button')) {
    button.addEventListener('click', () => { updateSettings({ theme: button.dataset.v }); applyTheme(); });
  }
  $('btn-settings').addEventListener('click', () => $('dlg-settings').showModal());
  $('btn-help').addEventListener('click', () => $('dlg-help').showModal());
  applyTheme();
}
