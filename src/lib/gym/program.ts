import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Program, WarmupItem, CooldownItem } from './types';

export * from './program-shared';

const CONTENT = join(process.cwd(), 'content', 'gym');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(join(CONTENT, file), 'utf8')) as T;
}

export async function loadProgram(): Promise<Program> {
  return readJson<Program>('program.json');
}
export async function loadWarmups(): Promise<{ lower: WarmupItem[]; upper: WarmupItem[] }> {
  return readJson('warmups.json');
}
export async function loadCooldowns(): Promise<Record<string, CooldownItem>> {
  return readJson('cooldowns.json');
}
export async function loadRirGuide(): Promise<{ rir: string; desc: string; highlight?: boolean }[]> {
  return readJson('rir-guide.json');
}
