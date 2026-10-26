import { InfoIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OptionSelect } from '@/components/option-select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Kbd } from '@/components/ui/kbd';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBoard } from '@/hooks/board';

const MAX_HEIGHT = 220;
export const COMPOSER_ID = 'composer-text';

/** Строка ввода: текст задачи, модель, усилие, режим «без проверки». Профиль проекта решает, можно ли в облако. */
export function Composer() {
  const { config, project, prefs, updatePrefs, actions } = useBoard();
  const profile = project.cloud;
  const cloudOk = profile.mode !== 'local';
  const model = prefs.model ?? config.defaultModel ?? '';
  const effort = prefs.effort ?? config.defaultEffort ?? '';
  const [text, setText] = useState('');
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  const submit = async (send: boolean) => {
    const value = text.trim();
    if (!value) { area.current?.focus(); return; }
    setBusy(true);
    setText('');
    try {
      await actions.create({ text: value, send: send && cloudOk, model, effort, auto: auto && profile.autoAllowed && cloudOk });
      setAuto(false);
    } catch {
      setText(value); // сервер отказал: текст возвращается в поле, ничего не теряется
    } finally {
      setBusy(false);
    }
  };

  const hint = cloudOk ? (profile.mode === 'partial' ? `Облако частично: ${profile.summary ?? ''}` : '') : (profile.summary ?? 'Этот проект разрабатывается только локально.');
  const details = [
    profile.can.length ? `Можно в облако: ${profile.can.join('; ')}` : '',
    profile.cannot.length ? `Нельзя в облако: ${profile.cannot.join('; ')}` : '',
  ].filter(Boolean);

  return (
    <section aria-label="Новая задача" className="mx-5 mb-3.5 shrink-0 rounded-xl border bg-card px-3.5 pt-3 pb-2.5 transition-colors focus-within:border-foreground">
      <Textarea
        id={COMPOSER_ID}
        ref={area}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(!e.shiftKey); } }}
        placeholder="Что нужно сделать? Опишите своими словами, первая строка станет заголовком"
        aria-label="Текст задачи"
        className="min-h-0 resize-none border-0 bg-transparent px-0 py-0.5 text-[15px] leading-snug shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2.5">
        <OptionSelect prefix="Модель" label="Модель" value={model} onChange={(id) => updatePrefs({ model: id })} options={config.models} />
        <OptionSelect prefix="Усилие" label="Уровень усилий" value={effort} onChange={(id) => updatePrefs({ effort: id })} options={config.efforts} />
        {cloudOk && profile.autoAllowed && (
          <Tooltip>
            <TooltipTrigger render={<label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/80" />}>
              <Checkbox checked={auto} onCheckedChange={(checked) => setAuto(checked === true)} aria-label="Без проверки при зелёных тестах" />
              Без проверки при зелёных тестах
            </TooltipTrigger>
            <TooltipContent>Если тесты в облаке зелёные, результат сразу вливается в staging без вашей проверки</TooltipContent>
          </Tooltip>
        )}
        {hint && (
          <Tooltip>
            <TooltipTrigger render={<span className="inline-flex max-w-[34ch] items-center gap-1 truncate text-xs text-muted-foreground" />}>
              <InfoIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{hint}</span>
            </TooltipTrigger>
            {details.length > 0 && <TooltipContent className="max-w-xs whitespace-pre-line">{details.join('\n')}</TooltipContent>}
          </Tooltip>
        )}
        <span className="flex-1" />
        <Button variant="outline" disabled={busy} onClick={() => void submit(false)}>Сохранить в идеи</Button>
        {cloudOk && (
          <Button disabled={busy} onClick={() => void submit(true)}>
            Отправить в облако <Kbd className="bg-primary-foreground/15 text-primary-foreground">⌘↵</Kbd>
          </Button>
        )}
      </div>
    </section>
  );
}
