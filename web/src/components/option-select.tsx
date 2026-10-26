import type { Option } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange(value: string): void;
  options: Option[];
  label: string;
  /** Подпись слева внутри контрола («Модель»): превращает выбор в таблетку с названием. */
  prefix?: string;
  className?: string;
}

/** Выбор из списка {id, title} на shadcn Select (Base UI): значение показывается названием, а не идентификатором. */
export function OptionSelect({ value, onChange, options, label, prefix, className }: Props) {
  const select = (
    <Select value={value} onValueChange={(next) => { if (typeof next === 'string') onChange(next); }} items={options.map((o) => ({ value: o.id, label: o.title }))}>
      <SelectTrigger aria-label={label} size="sm" className={cn(prefix && 'border-0 bg-transparent px-1 font-semibold shadow-none dark:bg-transparent', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  if (!prefix) return select;
  return (
    <div className="inline-flex h-8 items-center gap-1 rounded-full border border-input pl-3 pr-1 text-xs text-muted-foreground hover:bg-muted">
      <span>{prefix}</span>
      {select}
    </div>
  );
}
