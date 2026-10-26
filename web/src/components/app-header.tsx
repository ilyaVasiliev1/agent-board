import { SettingsIcon } from 'lucide-react';
import { OptionSelect } from '@/components/option-select';
import { Button, buttonVariants } from '@/components/ui/button';
import { useBoard } from '@/hooks/board';
import { clock } from '@/lib/format';
import { cn } from '@/lib/utils';

export function AppHeader({ onSettings, onHelp }: { onSettings(): void; onHelp(): void }) {
  const { readOnly, projects, project, setProject, updatedAt, online } = useBoard();
  const envLinks = [['Бета', project.stagingUrl], ['Прод', project.prodUrl]].filter((l): l is [string, string] => Boolean(l[1]));
  const sync = !online ? (readOnly ? 'нет данных' : 'нет связи с доской') : readOnly ? `данные от ${updatedAt ? clock(updatedAt) : '—'}` : `обновлено ${updatedAt ? clock(updatedAt) : ''}`;

  return (
    <header className="flex shrink-0 items-center gap-3.5 px-5 py-2.5">
      <div className="flex items-center gap-2 text-[15px] font-bold tracking-tight">
        <span aria-hidden className="relative size-3.5 rounded-[4px] bg-foreground after:absolute after:inset-1 after:rounded-[1.5px] after:bg-background" />
        {readOnly ? 'Облако' : 'Агенты'}
      </div>
      <OptionSelect label="Проект" value={project.id} onChange={setProject} options={projects.map((p) => ({ id: p.id, title: p.title }))} className="border-0 bg-transparent font-semibold shadow-none dark:bg-transparent" />
      <nav aria-label="Стенды проекта" className="flex gap-1.5">
        {envLinks.map(([name, url]) => (
          <a key={name} href={url} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-full')}>{name} ↗</a>
        ))}
      </nav>
      <span className="flex-1" />
      <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden className={cn('size-1.5 rounded-full', online ? 'bg-state-done' : 'bg-state-fail')} />
        {sync}
      </span>
      <Button variant="ghost" size="icon" aria-label={readOnly ? 'Вид' : 'Настройки'} title={readOnly ? 'Вид' : 'Настройки'} onClick={onSettings}><SettingsIcon /></Button>
      <Button variant="ghost" size="icon" aria-label="Горячие клавиши" title="Горячие клавиши (?)" onClick={onHelp} className="font-bold">?</Button>
    </header>
  );
}
