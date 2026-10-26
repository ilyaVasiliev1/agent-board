export type Status = 'backlog' | 'running' | 'review' | 'failed' | 'done' | 'closed';
export type CloudMode = 'full' | 'partial' | 'local';

export interface TaskEvent { t: string; text: string }
export interface Commit { t: string; text: string }
export interface PrComment { t: string; body: string }
export interface Check { name: string; result: string }

export interface PullRequest {
  number: number;
  url: string;
  state: string;
  updatedAt: string;
  body?: string;
  isDraft?: boolean;
}

export interface Links {
  site?: string;
  report?: string;
  desktop?: string;
  mobile?: string;
  tests?: string;
}

export interface TaskLog {
  events: TaskEvent[];
  commits: Commit[];
  comments: PrComment[];
  checks: Check[];
  pr: PullRequest | null;
}

export interface Task {
  id: number;
  /** Настоящий номер задачи; на странице просмотра id синтетический и уникален между проектами. */
  number?: number;
  projectId: string;
  title: string;
  body: string;
  status: Status;
  model: string | null;
  effort: string | null;
  auto: boolean;
  createdAt: string;
  sentAt?: string;
  events: TaskEvent[];
  branch?: string;
  pr?: PullRequest;
  links?: Links | null;
  sessionUrl?: string | null;
  syncError?: string;
  /** Встроенный журнал: есть только в снимках страницы просмотра. */
  log?: TaskLog;
}

export interface CloudProfile {
  mode: CloudMode;
  summary?: string;
  can: string[];
  cannot: string[];
  autoAllowed: boolean;
}

export interface Project {
  id: string;
  title: string;
  repo?: string;
  stagingUrl?: string;
  prodUrl?: string;
  cloud: CloudProfile;
}

export interface Option { id: string; title: string }

export interface Config {
  models: Option[];
  efforts: Option[];
  defaultModel: string | null;
  defaultEffort: string | null;
  projects: Project[];
}

export interface BoardSnapshot {
  tasks: Task[];
  projects?: Project[];
  /** Когда собран снимок (страница просмотра). */
  generatedAt?: string | null;
}

export interface NewTaskInput {
  text: string;
  send: boolean;
  model: string;
  effort: string;
  auto: boolean;
}

export type Mode = 'live' | 'static';
