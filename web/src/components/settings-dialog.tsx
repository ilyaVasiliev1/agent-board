import { OptionSelect } from '@/components/option-select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useBoard } from '@/hooks/board';
import type { Theme } from '@/lib/prefs';

const THEMES: { id: Theme; title: string }[] = [
  { id: 'auto', title: 'Как в системе' },
  { id: 'light', title: 'Светлая' },
  { id: 'dark', title: 'Тёмная' },
];

/** Настройки: модель и усилие по умолчанию (только в режиме управления) и тема. */
export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { readOnly, config, prefs, updatePrefs } = useBoard();
  const theme = prefs.theme ?? 'auto';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{readOnly ? 'Вид' : 'Настройки'}</DialogTitle>
          {!readOnly && <DialogDescription>Значения по умолчанию подставляются в новые задачи. Менять их для отдельной задачи можно при отправке.</DialogDescription>}
        </DialogHeader>
        {!readOnly && (
          <div className="grid gap-3.5">
            <div className="grid gap-1.5 text-[13px] font-semibold text-foreground/80">
              Модель по умолчанию
              <OptionSelect label="Модель по умолчанию" value={prefs.model ?? config.defaultModel ?? ''} onChange={(id) => updatePrefs({ model: id })} options={config.models} className="w-full" />
            </div>
            <div className="grid gap-1.5 text-[13px] font-semibold text-foreground/80">
              Уровень усилий по умолчанию
              <OptionSelect label="Уровень усилий по умолчанию" value={prefs.effort ?? config.defaultEffort ?? ''} onChange={(id) => updatePrefs({ effort: id })} options={config.efforts} className="w-full" />
            </div>
          </div>
        )}
        <div className="grid gap-1.5">
          <span className="text-[13px] font-semibold text-foreground/80">Тема</span>
          <ToggleGroup variant="outline" value={[theme]} onValueChange={(value) => { const next = value[0] as Theme | undefined; if (next) updatePrefs({ theme: next }); }} aria-label="Тема">
            {THEMES.map((t) => <ToggleGroupItem key={t.id} value={t.id}>{t.title}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </DialogContent>
    </Dialog>
  );
}
