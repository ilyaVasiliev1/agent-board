import { $ } from './dom.js';
import { fillSelect } from './controls.js';
import { cloudProfile, defaults, isCloudAllowed, state } from './state.js';

const MAX_HEIGHT = 220;

/** Строка ввода: текст, модель, усилие, «без проверки». Сама ничего не отправляет: решение принимает onSubmit. */
export function createComposer({ onSubmit }) {
  const text = $('c-text');
  const send = $('c-send');
  const idea = $('c-idea');

  const autosize = () => { text.style.height = 'auto'; text.style.height = `${Math.min(text.scrollHeight, MAX_HEIGHT)}px`; };
  text.addEventListener('input', autosize);
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(!event.shiftKey); }
  });
  send.addEventListener('click', () => submit(true));
  idea.addEventListener('click', () => submit(false));

  function submit(toCloud) {
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    onSubmit({
      text: value,
      send: toCloud,
      model: $('c-model').value,
      effort: $('c-effort').value,
      auto: $('c-auto').checked && !$('c-auto-wrap').hidden,
    });
  }

  return {
    init() {
      const d = defaults();
      fillSelect($('c-model'), state.config.models, d.model);
      fillSelect($('c-effort'), state.config.efforts, d.effort);
    },
    /** Подпись и кнопки зависят от облачного профиля выбранного проекта. */
    render() {
      const profile = cloudProfile();
      const ok = isCloudAllowed();
      send.hidden = !ok;
      $('c-hint').textContent = ok ? (profile.mode === 'partial' ? `Облако частично: ${profile.summary ?? ''}` : '') : (profile.summary ?? 'Этот проект разрабатывается только локально.');
      $('c-hint').title = [
        profile.can.length ? `Можно в облако: ${profile.can.join('; ')}` : '',
        profile.cannot.length ? `Нельзя в облако: ${profile.cannot.join('; ')}` : '',
      ].filter(Boolean).join('\n');
      $('c-auto-wrap').hidden = !(ok && profile.autoAllowed);
    },
    clear() { text.value = ''; $('c-auto').checked = false; autosize(); },
    restore(value) { text.value = value; autosize(); },
    setBusy(busy) { send.disabled = idea.disabled = busy; },
    focus() { text.focus(); },
    setModel(id) { $('c-model').value = id; },
    setEffort(id) { $('c-effort').value = id; },
    selection: () => ({ model: $('c-model').value, effort: $('c-effort').value }),
  };
}
