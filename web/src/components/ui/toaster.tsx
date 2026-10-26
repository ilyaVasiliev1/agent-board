import { Toast } from '@base-ui/react/toast';
import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        'pointer-events-auto flex w-full items-start gap-2 rounded-lg px-3.5 py-2.5 text-sm shadow-lg transition-all duration-200',
        'data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        toast.type === 'error' ? 'bg-destructive text-white' : 'bg-primary text-primary-foreground',
      )}
    >
      <Toast.Content className="flex-1">
        <Toast.Title className="leading-snug" />
      </Toast.Content>
      <Toast.Close aria-label="Закрыть" className="-mr-1 rounded p-0.5 opacity-70 hover:opacity-100">
        <XIcon className="size-3.5" />
      </Toast.Close>
    </Toast.Root>
  ));
}

/** Уведомления на Base UI Toast: внизу слева, ошибки красным. */
export function Toaster({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={4500} limit={4}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="pointer-events-none fixed bottom-5 left-5 z-50 flex w-[min(420px,calc(100vw-2.5rem))] flex-col gap-2">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

export function useToast() {
  const manager = Toast.useToastManager();
  return {
    success: (title: string) => manager.add({ title, type: 'success' }),
    error: (title: string) => manager.add({ title, type: 'error', timeout: 7000 }),
  };
}
