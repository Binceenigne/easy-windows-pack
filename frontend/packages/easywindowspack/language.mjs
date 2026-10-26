import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { createColors } from 'create-ewp/terminal';
import { renderHelp } from './help.mjs';

const languages = new AsyncLocalStorage();
const valid = value => value === 'zh-CN' || value === 'en';
export const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export const withLanguage = (language, action) => languages.run(language, action);
export const text = (zh, en) => languages.getStore() === 'en' ? en : zh;

export function projectLanguage(cwd = process.cwd()) {
  for (let current = resolve(cwd); ; current = dirname(current)) {
    try {
      const manifest = JSON.parse(readFileSync(join(current, 'frontend/package.json'), 'utf8').replace(/^\uFEFF/, ''));
      // The closest project owns the setting, including an unset/invalid value.
      return valid(manifest.ewp?.language) ? manifest.ewp.language : 'zh-CN';
    } catch { /* Help must work without a readable project manifest. */ }
    if (dirname(current) === current) return 'zh-CN';
  }
}

export function languageArgs(argv = [], { env = process.env, cwd = process.cwd() } = {}) {
  const fallback = valid(env.EWP_LANG) ? env.EWP_LANG : projectLanguage(cwd);
  const args = [];
  const values = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--lang') {
      values.push(argv[i + 1] && !argv[i + 1].startsWith('-') ? argv[++i] : undefined);
    } else if (arg.startsWith('--lang=')) values.push(arg.slice(7));
    else args.push(arg);
  }
  const language = values.findLast(valid) ?? fallback;
  return withLanguage(language, () => {
    if (values.some(value => !valid(value))) throw new Error(text('--lang 需要 zh-CN 或 en。', '--lang requires zh-CN or en.'));
    if (new Set(values).size > 1) throw new Error(text('--lang 参数冲突，请只选择一种语言。', 'Conflicting --lang options; choose one language.'));
    return { args, language, explicit: values.length > 0 };
  });
}

export function helpText(language = 'zh-CN', { colors = createColors(), model } = {}) {
  return renderHelp({ version: VERSION, language, colors, model });
}
