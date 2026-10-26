export function renderHelp({ version, language, colors, model }) {
  const en = language === 'en';
  const say = (zh, english) => en ? english : zh;
  const available = command => !model || model.tasks.some(task => task.command === command);
  const native = model && model.backend !== 'python';
  const command = (usage, description) => `  ${colors.command(usage.padEnd(33))} ${description}`;
  const section = (title, rows) => ['', colors.title(title), ...rows];
  const lines = [
    `${colors.title('Easy Windows Pack')} ${colors.dim(`v${version} / Node >=22.12`)}`,
    colors.dim(say('Windows 桌面应用开发工具', 'Windows desktop application toolkit')),
    '', command(say('用法：ewp <command> [options]', 'Usage: ewp <command> [options]'), say('项目根目录运行', 'Run from the project root')),
    command('npm run <task> -- [options]', say('在 frontend 内运行', 'Run inside frontend')),
    ...section(say('开始', 'Start'), [
      command('ewp create [name]', say('创建项目；ewp create -h 查看模板与选项', 'Create a project; ewp create -h lists templates and options')),
      command('ewp init', say('安装 / 校验依赖；失败后可重复运行', 'Install / reconcile dependencies; safe to retry after failure')),
      command('ewp menu', say('只列出当前后端和环境可执行的任务', 'List tasks supported by the current backend and environment')),
      command('ewp help / ewp -h', say('显示分组命令帮助', 'Show grouped command help')),
      command('ewp docs', say('打开内置离线文档；兼容 ews docs', 'Open bundled offline documentation; ews docs is an alias'))
    ])
  ];
  if (model) {
    lines.push('', `${colors.success(say('当前后端', 'Current backend'))}: ${model.capability.name}  ${colors.dim(model.capability.modes.join(' / '))}`);
  } else {
    lines.push('', colors.dim(say('未绑定项目：以下为完整命令；项目内帮助会按后端和环境调整。', 'No project context: all commands are listed; project help adapts to its backend and environment.')));
  }
  const development = [
    ['dev', 'ewp dev [--web]', say('桌面 HMR；--web 仅启动浏览器', 'Desktop HMR; --web starts only the browser')],
    ['browser', 'ewp browser', say('浏览器 HMR，无需后端工具链', 'Browser HMR, without a backend toolchain')],
    ['demo', 'ewp demo --debug', say('编译前端后启动桌面演示', 'Build frontend and open the desktop demo')],
    ['frontend', 'ewp frontend', say('编译到 output/frontend/', 'Compile into output/frontend/')],
    ['frontend:preview', 'ewp frontend:preview', say('预览已编译前端，无 HMR', 'Preview the built frontend, without HMR')]
  ].filter(([id]) => available(id)).map(([, usage, description]) => command(usage, description));
  if (development.length) lines.push(...section(say('开发与预览', 'Develop and preview'), development));
  const packaging = [
    ['app', 'ewp app', say(native ? '按配置构建目录版应用' : '按 ewp.pack.json 构建应用', native ? 'Build a configured directory application' : 'Build using ewp.pack.json')],
    ['installer', 'ewp installer', say(native ? '目录版应用 + NSIS 安装包（需 NSIS 3）' : '应用 + Python 安装器', native ? 'Directory application + NSIS setup (requires NSIS 3)' : 'Application + Python installer')],
    ['exe', 'ewp build / ewp exe', say(native ? '兼容入口：EXE + 前端资源目录，不是单文件' : '兼容入口：默认单文件 EXE', native ? 'Legacy entry: EXE + assets directory, not a single file' : 'Legacy entry: single-file EXE by default')],
    ['wheel', 'ewp wheel / ewp build -w', say('仅 Python；构建 wheel', 'Python only; build a wheel')],
    ['bundle', 'ewp bundle', say('仅打包源码，不是可运行应用', 'Package source code, not a runnable application')],
    ['build:all', 'ewp build:all', say('测试并执行所选后端的完整构建', 'Test and run the selected backend full build')]
  ].filter(([id]) => available(id)).map(([, usage, description]) => command(usage, description));
  if (packaging.length) lines.push(...section(say('构建与分发', 'Build and distribute'), packaging));
  lines.push(...section(say('打包模式与参数', 'Packaging modes and options'), [
    command(native ? '--mode onedir' : '--mode onefile|onedir', say(native ? '原生后端目前只支持目录版' : 'onefile 仅 Python；onedir 适用于四种后端', native ? 'Native backends currently support directory deployment only' : 'onefile is Python-only; onedir supports every backend')),
    command('--config PATH', say('相对项目根；默认 ewp.pack.json；路径含空格加引号', 'Relative to the project root; default ewp.pack.json; quote spaces')),
    command('--installer', say('同时生成安装包；不能与 build --wheel 组合', 'Also create an installer; conflicts with build --wheel')),
    `  ${colors.dim(say('app: output/apps/  |  setup: output/installers/  |  兼容 exe: output/exe/', 'app: output/apps/  |  setup: output/installers/  |  legacy exe: output/exe/'))}`,
    `  ${colors.warning(say('setup.exe 是安装程序，不代表安装后的应用是单文件；运行端仍需 WebView2。', 'setup.exe is an installer, not a single-file application; WebView2 is still required.'))}`
  ]));
  lines.push(...section(say('检查与更多入口', 'Inspect and learn'), [
    ...[
      ['test', 'ewp test', say('后端测试；Go / C++ 同时验证编译', 'Backend tests; Go / C++ also validate compilation')],
      ['check', 'ewp check', say('Node 运行时导出与前端构建检查', 'Node runtime exports and frontend build checks')],
      ['info', 'ewp info', say('项目信息与当前后端', 'Project information and backend')]
    ].filter(([id]) => available(id)).map(([, usage, description]) => command(usage, description)),
    command('ewp backend:build', say('仅编译宿主；Python 映射到 exe', 'Build the host; Python maps this to exe')),
    command('ewp docs --print', say('输出详细 Markdown，适合 AI 和终端读取', 'Print detailed Markdown for AI and terminal reading')),
    command('ewp docs --no-open', say('输出离线 HTML 地址，不打开浏览器', 'Print the offline HTML URL without opening a browser')),
    command('ewp --version / -v / -V', say('显示版本', 'Show version'))
  ]));
  if (model?.hidden.length) {
    const groups = new Map();
    for (const task of model.hidden) {
      const tasks = groups.get(task.reason) ?? [];
      tasks.push(`ewp ${task.command}`);
      groups.set(task.reason, tasks);
    }
    lines.push(...section(say('当前环境不可用', 'Unavailable in this environment'), [...groups].map(([reason, tasks]) =>
      `  ${colors.warning(tasks.join(', '))}\n    ${colors.dim(reason)}`)));
    lines.push(...model.guidance.map(line => colors.warning(`  ${line}`)));
  }
  lines.push(...section(say('常用参数与 npm', 'Options and npm'), [
    command('--port <0..65535> / --no-open', say('dev / browser / frontend:preview；默认动态端口', 'dev / browser / frontend:preview; dynamic port by default')),
    command('--lang zh-CN|en', say('本次语言；命令前后均可使用', 'Invocation language; accepted before or after the command')),
    `  ${colors.dim('--lang zh-CN|en > EWP_LANG > frontend/package.json ewp.language > zh-CN')}`,
    `  ${colors.command('npm --prefix frontend run ewp -- <task>')}  ${colors.dim(say('无需全局安装', 'No global install required'))}`,
    `  ${colors.command('npm run app -- --mode onedir --config "configs/My App.json" --installer')}`,
    ...(!native ? [`  ${colors.command('npm run build -- -w')}  ${colors.dim(say('npm 的 -w 是 workspace 参数，必须用 -- 转发', 'npm reserves -w for workspaces; forward it after --'))}`] : []),
    `  ${colors.dim(say('兼容别名：frontend:dev = browser；frontend:build = frontend；full-build = build:all；build:app = app。', 'Aliases: frontend:dev = browser; frontend:build = frontend; full-build = build:all; build:app = app.'))}`,
    `  ${colors.dim(say('Ctrl+C 关闭 Vite 与桌面进程树。NO_COLOR 关闭颜色；FORCE_COLOR=1 强制颜色。', 'Ctrl+C closes Vite and desktop processes. NO_COLOR disables color; FORCE_COLOR=1 enables it.'))}`,
    '', `  ${colors.command('ewp docs')}  ${say('完整模块文档、配置示例与故障排查', 'Complete module reference, configuration examples and troubleshooting')}`, ''
  ]));
  return lines.join('\n');
}
