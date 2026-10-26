import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { BoardProvider } from '@/hooks/board';
import { createStaticSource, detectMode, liveSource } from '@/lib/source';
import type { Config } from '@/types';
import './index.css';

const EMPTY: Config = {
  models: [], efforts: [], defaultModel: null, defaultEffort: null,
  projects: [{ id: 'none', title: 'Пока нет данных', cloud: { mode: 'full', can: [], cannot: [], autoAllowed: false } }],
};

const source = (await detectMode()) === 'live' ? liveSource : createStaticSource();
document.title = source.mode === 'live' ? 'Доска агентов' : 'Облако: что сейчас делают агенты';
// На странице просмотра данных может ещё не быть (первая публикация): показываем пустую доску, а не ошибку.
const config = await source.loadConfig().catch(() => EMPTY);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Toaster>
      <TooltipProvider>
        <BoardProvider source={source} initialConfig={config}>
          <App />
        </BoardProvider>
      </TooltipProvider>
    </Toaster>
  </StrictMode>,
);
