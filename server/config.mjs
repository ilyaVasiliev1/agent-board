import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLOUD_MODES = ['full', 'partial', 'local'];

function fail(message) {
  throw new Error(`config.json: ${message}`);
}

function validateProject(project) {
  for (const key of ['id', 'title', 'repo', 'dir']) {
    if (typeof project[key] !== 'string' || !project[key]) fail(`у проекта нет поля «${key}»`);
  }
  const mode = project.cloud?.mode ?? 'full';
  if (!CLOUD_MODES.includes(mode)) fail(`проект ${project.id}: cloud.mode должен быть одним из ${CLOUD_MODES.join(', ')}`);
  return { ...project, cloud: { mode, autoAllowed: false, can: [], cannot: [], ...project.cloud } };
}

/**
 * Загружает config.json и поверх него config.local.json (адреса своих серверов и прочее личное,
 * в git не попадает). Локальный файл меняет только поля проектов по их id и верхнеуровневые ключи.
 */
export function loadConfig(root) {
  const base = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
  const localFile = join(root, 'config.local.json');
  const local = existsSync(localFile) ? JSON.parse(readFileSync(localFile, 'utf8')) : {};

  const projects = (base.projects ?? []).map((p) => validateProject({ ...p, ...(local.projects?.[p.id] ?? {}) }));
  if (!projects.length) fail('нет ни одного проекта');
  const { projects: _base, ...baseRest } = base;
  const { projects: _local, ...localRest } = local;
  const config = { ...baseRest, ...localRest, projects };

  for (const key of ['models', 'efforts']) {
    if (!Array.isArray(config[key]) || !config[key].length) fail(`нет списка «${key}»`);
  }
  if (!config.models.some((m) => m.id === config.defaultModel)) fail('defaultModel не из списка models');
  if (!config.efforts.some((e) => e.id === config.defaultEffort)) fail('defaultEffort не из списка efforts');
  return config;
}

export const findProject = (config, id) => config.projects.find((p) => p.id === id);
export const isCloudAllowed = (project) => project.cloud.mode !== 'local';
export const expandHome = (path) => path.replace(/^~(?=$|\/)/, homedir());
