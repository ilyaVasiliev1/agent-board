import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { useBoard } from '@/hooks/board';

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { readOnly } = useBoard();
  const rows: [string[], string, boolean][] = [
    [['N'], 'Новая задача', true],
    [['J', 'K'], 'Следующая и предыдущая карточка', false],
    [['Esc'], 'Закрыть панель задачи', false],
    [['⌘', '↵'], 'Отправить задачу в облако', true],
    [['⌘', '⇧', '↵'], 'Сохранить в идеи', true],
    [['?'], 'Эта подсказка', false],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Горячие клавиши</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5">
          {rows.filter(([, , liveOnly]) => !(readOnly && liveOnly)).map(([keys, text]) => (
            <div key={text} className="contents">
              <dt><KbdGroup>{keys.map((k) => <Kbd key={k}>{k}</Kbd>)}</KbdGroup></dt>
              <dd className="text-foreground/80">{text}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
