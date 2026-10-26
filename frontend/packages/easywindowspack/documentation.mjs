import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

export function documentationFiles(language = 'zh-CN', directory = fileURLToPath(new URL('./assets/docs/', import.meta.url))) {
  if (!['zh-CN', 'en'].includes(language)) throw new TypeError('Unsupported documentation language');
  const html = join(directory, 'index.html');
  const markdown = join(directory, language === 'en' ? 'guide.en.md' : 'guide.md');
  const capabilities = join(directory, 'capabilities.json');
  for (const file of [html, markdown, capabilities]) if (!existsSync(file)) {
    throw new Error(language === 'en'
      ? `Bundled documentation is missing: ${file}. Reinstall easywindowspack; in a framework checkout, run npm --prefix frontend run prepare:npm.`
      : `缺少内置文档：${file}。请重新安装 easywindowspack；框架仓库内可运行 npm --prefix frontend run prepare:npm。`);
  }
  const url = pathToFileURL(html);
  url.searchParams.set('lang', language);
  return { html, markdown, capabilities, url: url.href };
}

export function openDocumentation(url, { platform = process.platform, env = process.env, launch = spawn } = {}) {
  const command = platform === 'win32' ? join(env.SystemRoot || 'C:\Windows', 'System32', 'rundll32.exe') : platform === 'darwin' ? 'open' : 'xdg-open';
  const args = platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) => {
    const child = launch(command, args, { stdio: 'ignore', windowsHide: true, shell: false });
    const timer = setTimeout(() => { child.unref?.(); reject(new Error('Browser opener did not respond')); }, 5000);
    timer.unref?.();
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Browser opener exited with ${code}`));
    });
  });
}

export async function runDocs({ language = 'zh-CN', open = true, print = false } = {}, {
  log = console.log, warn = console.error, openBrowser = openDocumentation, directory
} = {}) {
  const files = documentationFiles(language, directory);
  if (print) { log(readFileSync(files.markdown, 'utf8')); return 0; }
  log(files.url);
  if (open) {
    try { await openBrowser(files.url); }
    catch (error) { warn(language === 'en'
      ? `Could not open the browser: ${error.message}. Open the local URL above manually.`
      : `无法自动打开浏览器：${error.message}。请手动打开上方本地地址。`); }
  }
  return 0;
}
