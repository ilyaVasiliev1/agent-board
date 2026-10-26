import { useCallback, useState } from 'react';
import { AppHeader } from '@/components/app-header';
import { Board } from '@/components/board/board';
import { Composer, COMPOSER_ID } from '@/components/composer';
import { HelpDialog } from '@/components/help-dialog';
import { TaskPane } from '@/components/pane/task-pane';
import { SettingsDialog } from '@/components/settings-dialog';
import { useBoard } from '@/hooks/board';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { useTheme } from '@/hooks/use-theme';

export function App() {
  const { readOnly, selected, prefs } = useBoard();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);

  useTheme(prefs.theme ?? 'auto');
  useShortcuts({ composerId: COMPOSER_ID, onHelp: openHelp });

  return (
    <div className="flex h-full flex-col">
      <AppHeader onSettings={() => setSettingsOpen(true)} onHelp={openHelp} />
      {!readOnly && <Composer />}
      <main className="flex min-h-0 flex-1 gap-3.5 px-5 pb-4 max-md:flex-col max-md:overflow-y-auto">
        <Board />
        {selected && <TaskPane key={selected.id} task={selected} />}
      </main>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
