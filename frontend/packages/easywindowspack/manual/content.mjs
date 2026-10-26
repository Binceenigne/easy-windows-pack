const p = text => ({ type: 'paragraph', text });
const h = (id, text) => ({ type: 'heading', id, text });
const code = (language, text) => ({ type: 'code', language, text: text.trim() });
const list = (...items) => ({ type: 'list', items });
const table = (headers, rows) => ({ type: 'table', headers, rows });
const note = (title, text) => ({ type: 'note', title, text });
const section = (id, title, summary, ...blocks) => ({ id, title, summary, blocks });

const basicConfig = language => JSON.stringify({
  schemaVersion: 1,
  application: { id: 'my-app', name: 'My App', version: '0.1.0' },
  build: { mode: 'onedir', installer: false },
  installer: { language },
  features: [], prerequisites: [], hooks: {},
  postInstall: [
    { id: 'startup', name: language === 'en' ? 'Start with Windows' : '开机启动', type: 'startup', default: false },
    { id: 'launch', name: language === 'en' ? 'Launch after installation' : '安装后运行', type: 'launch', default: false }
  ]
}, null, 2);

const frameExample = `import 'easywindowspack/frame.css';
import { mountFrame, call, setTitleBarMode } from 'easywindowspack';

const content = document.createElement('main');
content.textContent = 'Hello, desktop';
const frame = mountFrame('#app', {
  title: 'My App', mode: 'default', windowStyle: 'windows',
  resizable: true, content,
  onError: result => console.error(result.error)
});
frame.update({ title: 'My App · Ready' });

// Run from a user action after the desktop bridge is ready.
async function inspectWindow() {
  const state = await call('get_window_state');
  if (state.ok === false) throw new Error(String(state.error));
  const result = await setTitleBarMode('minimal');
  if (result.ok === false) throw new Error(String(result.error));
  return { state, result };
}
// During application teardown: frame.dispose();`;

const vueExample = `<script setup>
import { ref } from 'vue';
import { WindowFrame } from 'easywindowspack/vue';
import 'easywindowspack/frame.css';
const count = ref(0);
const reportError = result => console.error(result.error);
</script>

<template>
  <WindowFrame title="My App" mode="default" window-style="windows"
    :resizable="true" @error="reportError">
    <main><button @click="count++">{{ count }}</button></main>
  </WindowFrame>
</template>`;

const reactExample = `import { useState } from 'react';
import { WindowFrame } from 'easywindowspack/react';
import 'easywindowspack/frame.css';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <WindowFrame title="My App" mode="default" windowStyle="windows"
      resizable onError={result => console.error(result.error)}>
      <main><button onClick={() => setCount(n => n + 1)}>{count}</button></main>
    </WindowFrame>
  );
}`;

const themeExample = `/* Application stylesheet; the manual's theme is independent. */
[data-ewp-window-frame] {
  --ewp-surface: #f8fafc;
  --ewp-surface-strong: #ffffff;
  --ewp-border: #d7dee8;
  --ewp-text: #1e293b;
  --ewp-muted: #64748b;
  --ewp-accent: #4f46e5;
}
@media (prefers-color-scheme: dark) {
  [data-ewp-window-frame] {
    --ewp-surface: #111827;
    --ewp-surface-strong: #172033;
    --ewp-border: #374151;
    --ewp-text: #e5e7eb;
    --ewp-muted: #a1a9b8;
  }
}`;

const componentExample = `import 'easywindowspack/desktop.css';
import {
  createMatrixProgress, createEntrance, createBootCurtain
} from 'easywindowspack/desktop-components.js';

const progress = createMatrixProgress(document.querySelector('#progress'), {
  value: 35, remaining: 65, size: 4, label: 'Download'
});
const entrance = createEntrance(document.querySelector('#workspace'));
const curtain = createBootCurtain(document.querySelector('#curtain'), {
  onComplete({ reason }) {
    entrance.reveal();
    if (reason === 'timeout') showStartupError();
  }
});

// Call only when your real application is ready.
function applicationReady() {
  progress.update({ value: 100, remaining: 0 });
  curtain.setReady();
}
// On unmount: progress.dispose(); entrance.dispose(); curtain.dispose();`;

const updateExample = `import { createDesktopUpdateClient } from 'easywindowspack/desktop-updates.js';

const updates = createDesktopUpdateClient({
  host: 'turtleclaw', // Or 'api-tools', matching a real host adapter.
  onState: state => renderUpdateState(state),
  onError: error => showUpdateError(error)
});
// After the actual UI and settings have finished loading:
await updates.markFrontendReady({ checkOnStartup: false });
// Bind these to explicit user actions; do not install inside onState.
// await updates.check(false);
// await updates.download();
// await updates.install(currentState.install_token);
// On unmount: updates.dispose();`;

function capabilityTable(capabilities, english) {
  const yes = english ? 'Yes' : '支持';
  const no = english ? 'No' : '不支持';
  return table(english
    ? ['Backend', 'Application modes', 'Wheel', 'Installer builder', 'Advanced installer']
    : ['后端', '应用模式', 'Wheel', '安装器构建方式', '高级安装配置'],
  Object.values(capabilities).map(value => [
    value.name, value.modes.map(mode => `\`${mode}\``).join(' / '),
    value.wheel ? yes : no,
    value.installer === 'nsis' ? 'NSIS 3 · makensis' : 'Python · PyInstaller',
    value.advancedInstaller ? yes : no
  ]));
}

export function createGuide(language, capabilities) {
  return language === 'en' ? englishGuide(capabilities) : chineseGuide(capabilities);
}

function chineseGuide(capabilities) {
  return {
    language: 'zh-CN', title: 'Easy Windows Pack 使用手册',
    tagline: '从第一个窗口，到可靠的 Windows 分发。',
    introduction: '用熟悉的前端技术构建 Windows 桌面应用。这里涵盖创建、开发、窗口 API、桌面组件和打包分发，可离线浏览，也可直接交给 AI 阅读。',
    groups: [
      ['开始使用', ['quick-start', 'creator', 'environment', 'commands', 'development']],
      ['运行时与模块', ['window-frame', 'composition', 'bridge', 'desktop-components', 'updates']],
      ['构建与分发', ['capabilities', 'packaging', 'configuration', 'advanced-installer', 'install-uninstall']],
      ['参考与排错', ['outputs', 'validation', 'troubleshooting', 'preferences', 'ai-reading']]
    ],
    sections: [
      section('quick-start', '快速开始', '创建项目，初始化环境，打开第一个桌面窗口。',
        p('先安装 Node.js >=22.12，再按后端安装 Python 或原生编译工具链。Windows 桌面运行还需要 WebView2 Runtime；完整检查见[环境准备](#zh-CN-environment)。以下命令在 PowerShell 执行。'),
        code('powershell', `npm create ewp@latest "My App" -- --template vue-ts --backend python --lang zh-CN --no-install --no-start
Set-Location '.\\My App'
npm --prefix frontend install
npm --prefix frontend run init
npm --prefix frontend run dev`),
        p('创建器也可以交互选择语言、后端、前端和 AI 指引。希望自动安装、初始化并启动时使用 --start；希望先阅读和修改项目时保留 --no-install --no-start。'),
        code('powershell', `# Install the CLI globally only if desired.
npm install --global easywindowspack
ewp help
ewp docs
# From an existing project root:
ewp menu`),
        p('未全局安装时，从项目根执行 `npm --prefix frontend run ewp -- <任务>`，或进入 frontend 后执行 `npm run <任务>`。欢迎页、帮助和内置文档不要求当前目录是项目。应用前端在 `frontend\\src`，生产资源在 `output\\frontend`。'),
        note('下一步', '浏览器开发见[开发与 HMR](#zh-CN-development)，添加窗口见[窗口外壳](#zh-CN-window-frame)，分发前先核对[后端能力](#zh-CN-capabilities)。')),

      section('creator', '创建器与六种模板', '前端模板与后端相互独立，按应用需求组合。',
        table(['模板', '界面层', '语言'], [
          ['`vanilla`', '原生 DOM', 'JavaScript'], ['`vanilla-ts`', '原生 DOM', 'TypeScript'],
          ['`vue`', 'Vue 3', 'JavaScript'], ['`vue-ts`', 'Vue 3', 'TypeScript'],
          ['`react`', 'React', 'JavaScript'], ['`react-ts`', 'React', 'TypeScript']
        ]),
        p('六个模板都可选 `python`、`golang`、`rust`、`cpp`。Python 适合 Python 服务与 wheel；Go、Rust、C++ 使用各自原生宿主。框架共享窗口外壳，不代表所有后端都有相同业务 API 或安装功能。`frontend\\package.json` 的 `ewp.backend` 决定任务路由；旧项目缺省按 Python 处理。'),
        table(['创建参数', '行为'], [
          ['`--template NAME`', '指定上表之一；非交互默认 vanilla。'],
          ['`--backend NAME`', 'python（默认）/ golang / rust / cpp。'],
          ['`--dir PATH`', '指定目标目录，含空格时加引号；必须为空，存在 .git 也会拒绝。'],
          ['`--ai codex,claude,copilot`', '可组合生成相应 AI 入口；默认 none。'],
          ['`--lang zh-CN|en`', '选择生成内容语言；交互时先选语言，再选后端和前端。'],
          ['`--yes` / `-y`', '跳过提问；默认不安装、不启动。'],
          ['`--install` / `--no-install`', '仅控制依赖安装；--install 不等于完成桌面初始化。'],
          ['`--start` / `--no-start`', '--start 安装依赖、初始化所选后端并启动；不能与 --no-install 组合。'],
          ['`--help` / `-h`', '显示创建器帮助。']
        ]),
        code('powershell', `npm create ewp@latest "Native App" -- --backend rust --template react-ts --ai codex,copilot --lang en --no-start
ewp create "Simple App" --template vanilla --backend python --yes --no-install --no-start
ewp create -h`),
        p('应用版本默认 0.1.0，与框架版本独立。Python 模板默认 onefile，原生模板默认 onedir，均默认不生成安装器；请按项目实际 ewp.pack.json 确认。')),

      section('environment', '环境与初始化', '开发工具由开发者安装，应用运行环境单独检查。',
        table(['范围', '要求与官方下载'], [
          ['所有前端', '[Node.js >=22.12](https://nodejs.org/en/download)（含 npm）。'],
          ['Python', '[Python >=3.10](https://www.python.org/downloads/)，桌面使用 pywebview / WebView2。'],
          ['Go', '[Go >=1.22](https://go.dev/dl/)、[MinGW-w64 C++ / MSYS2](https://www.msys2.org/) 和 Windows SDK，宿主使用 webview_go / CGO。'],
          ['Rust', '[Rust / Cargo](https://rustup.rs/) 的 Windows MSVC 工具链、[Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) 和 Windows SDK，宿主使用 Wry + tao。'],
          ['C++', '[CMake >=3.24](https://cmake.org/download/)、C++17 编译器、Visual Studio C++ Build Tools 和 [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/)，宿主使用 webview/webview。'],
          ['Windows 桌面运行', '[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)。开发机和用户机器都须具备。'],
          ['原生安装器构建', '[NSIS 3](https://nsis.sourceforge.io/Download) 的 makensis；只构建 onedir 应用时不需要 NSIS。']
        ]),
        h('init-retries', '初始化可以重试'),
        p('在 frontend 运行 `npm run init`。Python 创建或复用项目根 `.venv`，安装前端依赖、编译资源并完成 editable Python 安装。原生 init 每次安装/校验前端依赖（包含 devDependencies）、检测工具链，再编译前端与调试宿主；不会生成 Python runtime、pyproject.toml 或 dev.py。'),
        p('缺少工具时按提示安装，并重新打开终端后再次运行相同 init 命令。工具链不会自动下载；重试保留源码、有效环境和已有编译缓存。无效 Python 环境会报错，不会被静默删除。第一次原生编译可能需要下载已固定版本的宿主依赖。'),
        code('powershell', `# Only set overrides for tools already installed on your machine.
$env:EWP_GO = 'C:\\Tools\\Go\\bin\\go.exe'
$env:EWP_CARGO = 'C:\\Users\\me\\.cargo\\bin\\cargo.exe'
$env:EWP_CMAKE = 'C:\\Tools\\CMake\\bin\\cmake.exe'
$env:EWP_MAKENSIS = 'C:\\Program Files (x86)\\NSIS\\makensis.exe'
$env:EWP_CMAKE_ARGS = '["-G","Visual Studio 17 2022","-A","x64"]'
npm --prefix frontend run init`),
        note('构建与运行分开', 'Node、Python 和编译器属于开发工具。原生 onedir 分发通常不要求用户安装 Node/Python，但仍需 WebView2，且 Go 分发需检查编译器带来的 DLL。框架不自动下载 WebView2；不声明 macOS 原生打包支持。')),

      section('commands', '菜单、帮助与命令', '按当前后端和机器可用能力选择任务。',
        p('`ewp` 显示欢迎页；`ewp help`、`ewp -h`、`ewp --help` 显示帮助；`ewp --version`（或 -v / -V）显示版本。`ewp menu` 和项目根 `startup.cmd` 打开任务菜单，0 退出。菜单及项目帮助隐藏不支持的任务与缺少强制构建前提的操作，并显示原因和官方下载链接；任务结束后刷新可用性。能力表描述产品支持范围，不等于本机工具已经安装。'),
        table(['任务与别名', '用途'], [
          ['`init`', '初始化所选后端和前端。'], ['`dev [--web]`', '桌面 HMR；--web 仅浏览器。'],
          ['`browser` / `frontend:dev`', '浏览器 HMR。'], ['`frontend` / `frontend:build`', '编译前端。'],
          ['`frontend:preview` / `preview`', '预览已编译前端。'], ['`demo [--debug]`', '先编译再运行桌面演示；--debug 启用开发者工具。'],
          ['`backend:build`', '编译原生宿主；Python 映射到 exe。'], ['`app` / `build:app`', '按配置构建应用。'],
          ['`installer`', '构建应用并强制生成 setup。'], ['`exe` / `build:exe`', '无配置参数时使用 legacy EXE 输出。'],
          ['`wheel` / `build:wheel`', '仅 Python wheel。'], ['`bundle`', '打包源码 ZIP。'],
          ['`build`', '默认 EXE；--wheel / -w、--exe / -e、--all 互斥。'],
          ['`build:all` / `full-build`', '完整构建，按后端执行，失败立即停止。'],
          ['`test` / `check` / `info`', '后端测试 / Node 检查 / 项目与环境信息。'],
          ['`docs`', '打开本机随包文档，不要求项目；ews docs 为别名。']
        ]),
        h('command-options', '常用参数'),
        table(['参数', '范围与约束'], [
          ['`--mode onefile|onedir`', 'app / installer / exe / build / full-build 的应用阶段；实际可用模式见能力表。'],
          ['`--config PATH`', '同上；相对项目根，默认 ewp.pack.json；不得越界，含空格加引号。'],
          ['`--installer`', '同上；应用构建后附带安装器。不能与 build --wheel / -w 及其配置参数组合。'],
          ['`--port 0..65535`', 'dev / browser / frontend:dev / frontend:preview；0 为动态端口。'],
          ['`--no-open`', '上述开发/预览命令不自动打开页面；docs 输出本地 file URL。'],
          ['`--print`', 'docs 输出当前语言的原始 Markdown。'],
          ['`--lang zh-CN|en`', '本次调用的输出语言，可放命令前后。']
        ]),
        code('powershell', `ewp docs --no-open
ewp docs --print --lang en
ews docs
npm --prefix frontend run ewp -- docs --print --lang zh-CN
npm --prefix frontend run build -- -w
npm --prefix frontend run app -- --mode onedir --config 'configs\\My App.json' --installer`),
        p('npm 参数用 `--` 传给任务；裸 `-w` 是 npm workspace 参数。配置参数不能用于 wheel 目标。底层 Python `easy-windows-pack build` 仍是 test → wheel → bundle，不等同于 Node CLI 默认的 EXE 构建。')),

      section('development', '开发、浏览器与 HMR', '用浏览器调 UI，用桌面宿主验证原生行为。',
        code('powershell', `# From the project root:
npm --prefix frontend run dev
npm --prefix frontend run dev -- --web
npm --prefix frontend run browser -- --port 5173 --no-open
npm --prefix frontend run frontend:build
npm --prefix frontend run frontend:preview
npm --prefix frontend run demo -- --debug`),
        p('dev 等待 Vite 就绪后启动调试桌面宿主，使用实际本地 Vite URL；前端修改通过 HMR 更新。browser / dev --web 仅运行浏览器界面。服务绑定 127.0.0.1，默认动态端口；端口或自动打开失败时使用终端打印的真实 URL。Ctrl+C 关闭服务与桌面进程树并释放端口。'),
        p('demo 先编译前端，再从生产资源运行桌面，没有 HMR；--debug 用于开发者工具。frontend:preview 只预览已有构建，不会替你重新编译。生产分发使用 output\\frontend，不依赖 Vite 服务。'),
        p('界面入口以模板的 frontend\\src\\main.js、main.ts、main.jsx 或 main.tsx 为准。Python 宿主是 backend\\src\\demo.py；Go 是 backend\\main_windows.go；Rust 是 backend\\src\\main.rs；C++ 是 backend\\src\\main.cpp。业务 API 留在所选宿主中。'),
        note('验证边界', '浏览器可验证布局和组件，但没有真实原生窗口桥接，不能证明拖拽、缩放、贴靠、托盘、安装或重启有效。宿主代码变化后需重新运行相应桌面任务。')),

      section('window-frame', '运行时：窗口外壳与主题', '通过公开入口组合窗口，保留应用对内容的所有权。',
        p('窗口包为 `easywindowspack`。显式导入 `easywindowspack/frame.css`，使用 `mountFrame(target, options)`；target 为已有 Element 或选择器，要求浏览器 DOM。同一容器重新挂载会释放旧实例。字符串 content 按文本处理；富界面传 DOM 节点或使用 Vue/React 组合。'),
        code('javascript', frameExample),
        table(['FrameOptions', '类型与语义'], [
          ['`title` / `icon`', 'string；icon 也可为 null。使用本地资源路径。'],
          ['`mode` / `titleBarMode`', 'native / default / minimal；mode 优先，titleBarMode 是别名。'],
          ['`windowStyle`', 'windows / macos；只改变外观，不增加 macOS 原生打包能力。'],
          ['`resizable`', 'boolean；控制外壳缩放手柄。真实能力仍由宿主决定。'],
          ['`content`', 'Node / string / null。'],
          ['`onError`', '回调接收 { ok: false, error: string }。']
        ]),
        p('句柄包含 frame、content，以及返回同一句柄的 update(options)。dispose() 释放事件并移除窗口 DOM，remove() 等价；组件卸载时必须清理。native 使用系统标题栏，default 为自定义标准标题栏，minimal 为紧凑标题栏。跨 native/custom 边界的模式请求可能返回 restartRequired，需重启宿主才真正改变系统 chrome。'),
        h('frame-theme', '主题与外观'),
        p('`setWindowStyle("windows" | "macos")` 修改全部已挂载窗口的外观；`setTitleBarMode(mode)` 向宿主发送异步请求。框架没有公开 setTheme() API。窗口 CSS 依据系统深浅色，并可通过 --ewp-* 变量局部覆盖。手册顶栏的主题切换只影响手册。'),
        code('css', themeExample)),

      section('composition', 'Vue 与 React 组合', '使用当前前端框架的生命周期，不把交互内容转成 HTML 字符串。',
        h('vue', 'Vue 3'),
        p('从 easywindowspack/vue 导入 WindowFrame，使用 slot 放应用内容。包装层挂载后创建外壳，监听 props 更新，卸载时 dispose；@error 接收窗口错误，组件实例暴露 frame。只在 Vue 模板安装 Vue。'),
        code('vue', vueExample),
        h('react', 'React'),
        p('从 easywindowspack/react 导入 WindowFrame，children 由 React 管理；props 与 onError 更新到外壳。包装层处理布局 effect 清理与 StrictMode 重新挂载。只在 React 模板安装 React。'),
        code('jsx', reactExample),
        p('两个包装层接受 title、icon、mode、windowStyle、resizable；其余 DOM 属性传给宿主容器。不要在 React/Vue 管理的节点上手动替换 children。需要自定义生命周期时再使用 mountFrame，并在组件卸载时释放。')),

      section('bridge', '窗口桥接 API', '类型契约与宿主能力共同决定可调用的方法。',
        table(['公开导出', '契约'], [
          ['`call(method, ...args)`', 'Promise<Record<string, unknown>>；不提供业务结果的静态类型保证。'],
          ['`getWindowApi()`', '返回共享窗口 API（bind、unbind、call 等），无浏览器 DOM 时为 null；不表示原生宿主已就绪。'],
          ['`setTitleBarMode(mode)`', 'Promise<Record<string, unknown>>，检查 ok / error / restartRequired。'],
          ['`setWindowStyle(style)`', '同步更新窗口外观。'],
          ['`isSupportedResizeDirection(direction)`', '验证 left/right/top/bottom 及 top-left/top-right/bottom-left/bottom-right，不验证系统操作是否成功。']
        ]),
        p('共享桥最终调用 window.pywebview.api，原生宿主提供兼容接口。pywebviewready 表示桥接就绪；页面已渲染不代表宿主 API 已存在。缺失方法或宿主异常通常转换为 {ok:false,error}，业务应检查返回值；DOM 不存在时模块辅助调用也可能抛错。公开类型返回 Record，使用字段前要验证类型。'),
        code('javascript', `import { call } from 'easywindowspack';

async function refreshWindowState() {
  const result = await call('get_window_state');
  if (result.ok === false) {
    console.error(result.error);
    return;
  }
  // Validate host-specific fields before using them.
}
if (window.pywebview?.api) void refreshWindowState();
else window.addEventListener('pywebviewready', refreshWindowState, { once: true });`),
        table(['宿主方法', '用途与限制'], [
          ['`get_window_state()`', '窗口状态快照。'], ['`window_action(action)`', '窗口控件动作，例如 minimize、maximize、close；支持性由宿主决定。'],
          ['`native_drag(direction)`', 'move 或八种缩放方向，交给 Windows 处理；由外壳绑定真实鼠标操作。'],
          ['`set_titlebar_mode(mode)`', '更改标题栏模式，留意 restartRequired。'],
          ['`set_always_on_top(bool)` / `toggle_always_on_top()` / `get_always_on_top()`', 'Python WindowApi 暴露的置顶能力；其他宿主须检查实际实现。'],
          ['`set_window_size(width,height)` / `hide_window()` / `show_window()`', 'Python WindowApi 的窗口方法；不假定所有业务宿主都支持。'],
          ['`get_adapter_capabilities()`', '可选 Python 桌面适配器的方法列表；未接入时不保证存在。']
        ]),
        note('可信本地界面', '桥接用于可信本地前端；原生生产页面限制在应用 frontend 资源，开发页面限制 loopback origin。不要向远程文档授予窗口或业务方法。不要使用任意 API 名称推断跨后端功能一致。')),

      section('desktop-components', '桌面组件与启动状态', '轻量原生 DOM 组件，样式和状态显式接入。',
        p('导入 easywindowspack/desktop.css 和 easywindowspack/desktop-components.js。组件不依赖 Vue、网络字体或图标服务；浏览器模块需要真实 DOM。页面最初可使用以下语义结构，再初始化组件。'),
        code('html', `<div id="curtain">Loading application…</div>
<main id="workspace" data-ewp-entry="pending">
  <h1 data-ewp-enter>My App</h1>
  <div id="progress" data-ewp-enter></div>
</main>`),
        code('javascript', componentExample),
        table(['组件', '实际能力'], [
          ['`createMatrixProgress(element, options)`', 'value 表示已填充百分比；remaining 独立决定阈值颜色，不自动等于 100-value。size 为 2/3/4，支持 unlimited、label/unlimitedLabel，小空间回退线性条，ResizeObserver 响应尺寸；update 更新，dispose 释放。'],
          ['`createEntrance(workspace)`', 'prepare 设置 pending 与 inert/ARIA；reveal 播放 data-ewp-enter 区域动效并恢复状态；dispose 恢复原属性并清理计时器。'],
          ['`createBootCurtain(element, {onComplete, timeout})`', '真实服务 ready 后 setReady()。默认 12 秒 watchdog 撤下装饰并回调 reason=timeout，不证明业务启动成功；dispose 清理事件与计时器。']
        ]),
        p('示例中的 showStartupError 需由应用实现，超时后应保留可操作的错误或重试界面。prefers-reduced-motion 或 html[data-motion="off"] 关闭装饰动效。首次 pending 标记必须在初始 HTML 中，减少首屏闪现；加载动画不能代替真实就绪、权限和错误检查。')),

      section('updates', '桌面适配器与更新模块', '前端状态客户端需要真实宿主，不自带通用更新服务。',
        p('`easywindowspack/desktop-updates.js` 导出 createDesktopUpdateClient({host, bridge?, onState?, onError?})。host 仅 api-tools 或 turtleclaw；默认从 window.pywebview.api 取得接口。API_TOOLS 与 TurtleClaw 是可选外部宿主适配，不会因安装 npm 包自动接入它们的后端。'),
        code('javascript', updateExample),
        table(['客户端方法', '行为'], [
          ['`markFrontendReady({checkOnStartup, includePrereleases})`', '真实前端和设置就绪后调用；checkOnStartup 默认 false；TurtleClaw 此时确认 confirm_update_ready。'],
          ['`refresh()` / `check(includePrereleases=false)`', '读取状态 / 主动检查；API_TOOLS 不传 prerelease 参数。'],
          ['`download()` / `cancel()`', '请求下载 / 取消下载；API_TOOLS 不提供 cancel_update_download，调用会拒绝。'],
          ['`install(token)`', 'TurtleClaw 调 install_update(token)；API_TOOLS 调 restart_update()；由用户明确触发。'],
          ['`restart()`', '调用宿主 restart_app；仅宿主真实暴露时可用。'], ['`dispose()`', '停止轮询并移除事件。']
        ]),
        p('markFrontendReady 后空闲轮询 4 秒、checking/downloading/installing 时 500ms，仅同步状态；不会自动下载、安装或重启。onState 不应触发 install。API_TOOLS 读取 get_state().update，进度字段为 percent；TurtleClaw 读取 get_update_state()，保留 progress、install_token、can_install 等宿主字段，不强行统一状态模型。'),
        h('host-adapters', 'Python 宿主适配'),
        p('公开 Python 导入为 easy_windows_pack。ApiToolsAdapter 可暴露密钥管理、刷新、阈值/偏好设置、资源初始化和更新命令；TurtleClawAdapter 暴露更新状态、检查、下载、取消、token 安装与就绪确认。DesktopApi(*adapters) 只合并不重名能力，重复方法报错；两个宿主的 check_for_updates 参数不同，不直接组合。'),
        p('适配器通过 get_adapter_capabilities() 省略缺失方法。TurtleClaw 的 restart_app 仅在显式提供 restart 回调时暴露。安装 token、活跃任务、下载校验、退出、替换、回滚、重启由宿主负责；不可用 reset_all_data 代替普通重启。此模块不证明任何线上更新、EXE 替换或重启已成功。')),

      section('capabilities', '后端能力一览', '表格直接来自随包共享 capabilities 对象。',
        capabilityTable(capabilities, false),
        p('此表与 [capabilities.json](capabilities.json) 使用同一构建输入；没有传入共享对象时使用当前发行版的独立预览默认值。它不探测本机 PATH。原生后端仅 onedir，wheel 仅 Python；原生 setup 由 NSIS 3 封装目录，不能据此称应用为 onefile。'),
        p('高级配置指 Python 的功能文件、依赖下载、hooks、setting 等安装能力。原生驱动明确拒绝这些非空配置及不支持的 installer 字段，避免静默忽略。构建工具可用性见菜单提示与环境章节。')),

      section('packaging', '应用、单文件与安装包', '先区分运行形态，再选择构建命令。',
        table(['形态', '分发约定'], [
          ['onefile 应用', 'Python 支持；产物 output\\apps\\<id>.exe，由 PyInstaller 打包。'],
          ['onedir 应用', '支持后端见能力表；产物 output\\apps\\<id>\\，必须完整分发目录和 frontend/运行依赖。'],
          ['setup 安装包', 'output\\installers\\<id>-setup.exe；Python 使用其配置安装器，原生使用 NSIS 3。单个 setup 与应用本身的构建模式无关。'],
          ['wheel', '仅 Python，供 Python 环境安装；不是 Windows setup，也不包含独立用户运行环境。'],
          ['源码包', 'bundle 生成用于源码交付/重建的 ZIP，不是编译后的桌面程序。']
        ]),
        code('powershell', `npm --prefix frontend run app -- --mode onedir
npm --prefix frontend run installer -- --mode onedir
# Python only:
npm --prefix frontend run app -- --mode onefile
npm --prefix frontend run build -- -w
# EXE stage with configuration:
npm --prefix frontend run build -- --mode onedir --installer
npm --prefix frontend run bundle`),
        p('app 使用 ewp.pack.json；installer 强制构建 setup。exe/build 未传 --mode、--config、--installer 时保留 legacy output\\exe 行为；带这些参数时进入配置构建。full-build 按后端执行测试、前端、宿主/EXE、源码包，Python 另构建 wheel；任一步失败停止。'),
        p('Python 的 setup 和内嵌 uninstall.exe 自身用 onefile 构建；onedir 应用安装时平铺到安装目录。原生 onedir 包含 <id>.exe、frontend、许可证及 application.json，Rust/C++ 使用静态 MSVC runtime；Go 仍应检查 DLL 依赖。用户端仍需 WebView2 Runtime，安装器不自动补齐。')),

      section('configuration', 'ewp.pack.json 配置', '严格 schema，示例选择各后端共有的 onedir 模式。',
        p('文件放在项目根。以下示例使用可跨后端的保守应用 id 与基础字段；把 My App、my-app 和版本替换为自己的值。启用 onefile 或高级字段前核对所选后端。显式 --config 路径缺失会报错；Python 默认文件缺失时使用内存默认值，不创建文件。'),
        code('json', basicConfig('zh-CN')),
        table(['字段', '支持的含义'], [
          ['`schemaVersion`', '整数 1。'], ['`application`', 'id、name、version；id 决定文件名、默认安装目录和登记身份，应用版本独立于框架。'],
          ['`build`', 'mode: onefile/onedir（受后端限制）；installer: boolean。'],
          ['`installer.language`', 'zh-CN / en，翻译安装器内置控件，不翻译作者给定名称或错误原文。'],
          ['`postInstall`', 'startup 与 launch 各最多一个；default 为 false。Python 另支持 setting。'],
          ['`features` / `prerequisites` / `hooks`', '基础示例为空；非空仅 Python 高级配置。']
        ]),
        p('未知字段被拒绝。不要给 application、installer 或 postInstall 增加 description；欢迎语用 Python 支持的 installer.welcome。原生 installer 对象只支持 language，不支持 welcome/defaultDirectory/files。基础示例的 startup/launch 是选项，默认不选，构建不等于立即设置开机启动。'),
        p('跨后端 id 建议小写字母数字与连字符，首字符字母数字，最多 80 字符，不用 Windows 设备名。Python 还接受下划线和点，但拒绝末尾点及 uninstall；不要据此假定原生校验也接受它们。source/destination 应是安全相对路径，不用绝对路径、.. 或链接目录。')),

      section('advanced-installer', 'Python 高级安装配置', '仅 Python 配置安装器支持；原生后端不要复制这些扩展。',
        p('在基础 JSON 上合并需要的字段。installer.files 始终安装；features 的全部文件先进入 setup，再由用户选择复制。required 功能锁定，省略 default/required 均为 false；文件源必须存在，所有组合都接受路径冲突检查。'),
        code('json', JSON.stringify({
          installer: { language: 'zh-CN', welcome: '欢迎使用 My App', files: [{ source: 'resources/help', destination: 'help' }] },
          features: [{ id: 'examples', name: '示例文件', description: '可选本地示例', default: false, required: false, files: [{ source: 'resources/examples', destination: 'examples' }] }],
          prerequisites: [], hooks: {},
          postInstall: [{ id: 'compact', name: '紧凑布局', type: 'setting', key: 'compact', value: true, default: false }]
        }, null, 2)),
        h('prerequisites', '依赖下载与命令'),
        p('prerequisites 项支持 id/name、urls/mirrors、mirrorApi、sha256、type、destination、filename、features、commands、check。至少一个静态 URL 或 mirrorApi，必须提供真实文件的 64 位十六进制 SHA-256；不要使用占位哈希构建。mirrorApi 返回 {"urls":["https://..."]}；动态链接优先，失败回退静态镜像，所有镜像必须匹配同一哈希。'),
        table(['字段', '行为'], [
          ['`type`', 'zip 安全解压；file/exe 复制文件，exe 不会自动执行。'],
          ['`destination`', '固定为 runtime/<id>，可省略；filename 必须是安全文件名。'],
          ['`features`', '省略/空始终运行，否则任一关联功能选中时运行。'],
          ['`check`', '安装目录内指定文件存在则跳过下载及 commands；不是系统运行库版本检查。'],
          ['`commands`', 'argv 数组的数组，显式按顺序执行。'],
          ['默认限制', '网络 timeout 20 秒，每 URL 两次，下载 512 MiB，解压 2 GiB，命令 timeout 300 秒；这些不是 JSON/CLI 字段。']
        ]),
        h('hooks', 'Hooks 与安装后选项'),
        p('hooks 支持 beforeInstall、afterInstall、beforeUninstall、afterUninstall，每项为 argv 数组的数组。命令不走 shell、不接受 .bat/.cmd、不展开环境表达式。每个参数独立，支持 {installDir}、{executable}、{runtimeDir}、{download} 字面占位符；hook 的 download 为空。工具文件要通过 installer.files 等自行提供。'),
        p('安装顺序：复制所选文件 → beforeInstall → prerequisites → 写设置 → afterInstall → HKCU 登记 → 提交 → 可选 launch。beforeInstall 执行时文件已经复制。非零退出或超时失败；外部命令副作用不能回滚。卸载 hooks 应幂等，直接引用的 hook 文件会保留到相应阶段完成。'),
        p('startup 写当前用户 HKCU Run；launch 提交后启动，失败仅警告；setting 将唯一 key 与有限 JSON value 写入 ewp-options.json，由应用自行读取。省略选择使用默认项，显式空选择关闭可选默认项。installer.defaultDirectory 可用绝对路径及环境变量展开；原生安装器不接受此字段。')),

      section('install-uninstall', '安装与卸载行为', '分别理解 Python 事务安装器与原生 NSIS 安装器。',
        h('python-installer', 'Python：配置安装器'),
        p('默认当前用户目录 `%LOCALAPPDATA%\\Programs\\<id>`，不自动提权。目录须新建或为空且可写；不支持覆盖/原地升级，相同 application.id 已登记或已有拥有记录时先卸载。目录优先级 --install-dir → EWP_INSTALL_DIR → 配置/默认目录。'),
        p('GUI：目录 → 功能 → 依赖 → 安装后选项 → 确认 → 进度 → 完成，空步骤跳过；下载在确认后开始。运行中不能返回/取消，失败可重试或返回确认。卸载：确认 → 进度 → 完成；GUI 与 silent 共用引擎。'),
        code('powershell', `# Python installer only; native NSIS has a different CLI.
& '.\\output\\installers\\my-app-setup.exe' --silent --install-dir 'D:\\Apps\\My App' --features '' --options ''
& 'D:\\Apps\\My App\\uninstall.exe' --silent`),
        table(['Python 安装器参数', '含义'], [
          ['`--silent`', '不开 GUI；成功 0、异常 1。'], ['`--install-dir PATH`', '安装/卸载目录。'],
          ['`--features ID1,ID2`', '省略用默认值；空字符串关闭可选项，required 仍保留。'],
          ['`--options ID1,ID2`', '省略用默认值；空字符串关闭默认 startup/launch/setting。'],
          ['`--uninstall [DIRECTORY]`', '显式卸载；目录优先于 install-dir，再回退正在运行 EXE 的父目录。'],
          ['`--payload ZIP`', '测试/外部 payload，一般使用内嵌 payload。']
        ]),
        p('Python 安装器不支持 /S 或 --yes。冻结 EXE 名为 uninstall.exe 时自动进入卸载并验证拥有记录。silent 仍执行所选 launch/startup，不想启动时显式关闭选项。Windows PowerShell 5.1 可能丢弃传给原生 EXE 的空参数；无人值守前确认 shell 正确保留，或使用 GUI 取消选择。'),
        p('`.ewp-install-state.json` 记录拥有文件，`.ewp-installer.log` 记录日志。卸载仅删除记录中哈希仍匹配的文件和空目录，保留用户新增/修改文件；不递归清空安装根。失败回滚本事务跟踪的文件与登记，不能撤销外部命令副作用。卸载器退出后校验清单并自删除；不要删除拥有记录绕过升级检查。'),
        h('native-installer', 'Go / Rust / C++：NSIS 3'),
        p('构建机需要 makensis（PATH 或 EWP_MAKENSIS），用户机器无需 NSIS。setup 包含完整 onedir 文件，默认安装到当前用户 LocalAppData\\Programs\\<id>，提供目录、可选组件、进度和完成页。可选 startup 创建当前用户 Startup 快捷方式，launch 在安装时运行；另创建开始菜单快捷方式和 HKCU 卸载登记。'),
        p('卸载按构建时文件清单删除安装文件、快捷方式和登记，只移除空目录，保留额外用户文件。它没有 Python 的哈希保留机制：修改过的同名安装文件仍可能被删除。不要依赖 Python 的事务回滚、拒绝覆盖、hooks、features、依赖下载或 --silent/--features/--options 参数。'),
        note('WebView2 由部署方负责', '两种安装路径都不要假定会自动下载 WebView2 Runtime。先检查目标 Windows 的运行环境；自定义 Python prerequisite 只有显式配置并提供真实哈希、命令后才执行。')),

      section('outputs', '产物路径与项目结构', '以下路径均相对项目根；<id> 来自 application.id。',
        table(['路径', '内容与适用范围'], [
          ['`frontend\\src\\`', '应用界面源码；Node workspace 为 frontend。'], ['`.venv\\`', 'Python 项目的虚拟环境，原生项目不生成。'],
          ['`output\\frontend\\index.html`', 'Vite 生产入口及同目录资源。'],
          ['`output\\apps\\<id>.exe`', 'Python 配置 onefile 应用。'],
          ['`output\\apps\\<id>\\<id>.exe`', '配置 onedir 应用；整个 <id> 目录必须一起分发。'],
          ['`output\\installers\\<id>-setup.exe`', 'setup 安装包。'],
          ['`output\\exe\\easy-windows-pack-demo.exe`', 'Python legacy exe/build 默认名称，不采用 application.id。'],
          ['`output\\exe\\<id>\\<id>.exe`', '原生 legacy exe/build；<id> 为实际配置/项目默认 id。'],
          ['`output\\wheels\\*.whl`', 'Python wheel，文件名由 Python 项目元数据决定。'],
          ['`output\\bundles\\<name>-<version>-source.zip`', '源码 ZIP；name/version 由所选后端的项目元数据决定。'],
          ['`output\\logs\\`', '初始化/构建日志；以命令打印的具体日志为准，独立交互命令可能只输出终端。'],
          ['`build\\spec\\`、`build\\pyinstaller\\`、`build\\exe-src\\`', 'Python 打包暂存，不是源码权威副本。'],
          ['`build\\native\\`', '原生编译、installer\\setup.nsi 和 bundle 暂存。']
        ]),
        p('源码包排除依赖、编译缓存、凭据及维护资料。Python bundle 另外提供展开目录和 easy-windows-pack.manifest.json；原生源码暂存在 build\\native\\bundle\\<id>。不要把两种 bundle 的内部布局当成相同契约。应用配置引用的资源要留在项目根内。')),

      section('validation', '测试、check 与 info', '按变更选择最小验证，再验证真实 Windows 行为。',
        code('powershell', `npm --prefix frontend run info
npm --prefix frontend run check
npm --prefix frontend run test
npm --prefix frontend run frontend:build
# TypeScript templates:
npm --prefix frontend run typecheck`),
        table(['检查', '覆盖范围'], [
          ['info', '项目根、所选后端、解释器/工具等信息，先确认没有调用另一项目或旧环境。'],
          ['check', 'Node runtime 导出和配置检查，不等于完整应用测试。'],
          ['Python test', '项目 Python unittest。'],
          ['原生 test', 'Node runtime 检查；Rust 另跑 cargo test，Go/C++ 编译调试宿主。不是所有后端都执行相同语言测试套件。'],
          ['frontend:build / typecheck', '编译页面 / TypeScript 模板类型检查。'],
          ['真实桌面与打包', '验证桥接、原生标题栏、缩放/贴靠、安装、卸载和用户数据保留。']
        ]),
        p('构建成功和浏览器通过不代表安装、更新或所有 DPI/多显示器行为通过。修改应用宿主时，补充与实际 API 和权限相关的测试；无需为了普通页面修改执行框架维护仓库的全部集成套件。')),

      section('troubleshooting', '故障排查', '先定位后端和失败阶段，再修复并重试相同任务。',
        table(['现象', '处理'], [
          ['找不到项目', 'docs/help/欢迎页可在任意目录运行；项目任务需在含 frontend\\package.json 和 scripts 的项目内。先运行 info。'],
          ['init 缺少工具链', '根据[环境下载链接](#zh-CN-environment)安装，重新打开终端，再运行 init；不会自动安装系统工具。'],
          ['makensis 不存在', '安装 NSIS 3，把其目录加入 PATH，或设置 EWP_MAKENSIS 为 makensis.exe 完整路径，再重试 installer。普通 onedir app 不需要它。'],
          ['原生 onefile / wheel / 高级字段报错', '使用 onedir，去掉 Python 专属字段；确需 wheel/高级配置时选择 Python。'],
          ['WebView2 缺失 / 桌面白屏', '检查目标机器 WebView2 Runtime、output\\frontend\\index.html 及宿主日志；安装器不自动下载运行库。'],
          ['pywebview API is not ready', '浏览器没有原生桥；桌面等待 pywebviewready，核对宿主能力和结果中的 ok/error。'],
          ['端口冲突 / 没有打开页面', '用 --port 0 或其他端口；复制终端中的实际 URL，--no-open 可关闭自动打开。'],
          ['Python 依赖或 editable 映射过期', '核对 info 中 .venv 和项目根，重新 init；不要通过改公开导入名绕过。'],
          ['WinError 32 / Access denied / runw.exe 不可读', '关闭占用的应用，检查系统防护记录及实际文件路径，再重试；不要靠默认提权或关闭防护掩盖原因。'],
          ['安装目录非空 / 已登记', 'Python 安装器先卸载旧应用；不要删除拥有记录绕过检查。先保存需要的用户数据。'],
          ['安装后仍有文件', '用户新增/修改文件可能被保留；原生卸载只保证清除清单内文件，Python 还比较拥有哈希。'],
          ['更新/取消/重启报不支持', '检查真实宿主与适配器；API_TOOLS 无取消下载，TurtleClaw 重启需显式回调。'],
          ['配置未知字段', '按[基础 schema](#zh-CN-configuration)修正；原生只接受 installer.language，别把 Python 扩展直接复制过去。']
        ]),
        code('powershell', `$env:EWP_MAKENSIS = 'C:\\Program Files (x86)\\NSIS\\makensis.exe'
npm --prefix frontend run installer -- --mode onedir
# More readable diagnostic output:
$env:EWP_PROGRESS = 'plain'
npm --prefix frontend run init`),
        p('记录失败命令、后端、日志路径与错误原文，再重跑最小相关任务。动画 timeout 只是装饰退出，不能当成初始化成功；真实更新失败由宿主诊断，不根据前端进度条猜测。')),

      section('preferences', '语言、颜色与可访问性', 'CLI、安装器和手册的设置各自独立。',
        p('CLI 语言优先级：--lang → EWP_LANG → frontend\\package.json 的 ewp.language → zh-CN。参数只影响当前调用，不重写已经生成的 README/AI 指引。创建时语言决定生成文本；安装器内置文字由 installer.language 决定；第三方 npm/pip/Vite 输出和错误原文不保证翻译。'),
        code('powershell', `ewp --lang en help
$env:EWP_LANG = 'en'
npm --prefix frontend run info
$env:NO_COLOR = '1'
$env:EWP_PROGRESS = 'plain'`),
        p('NO_COLOR 优先关闭终端颜色；否则 FORCE_COLOR=0 关闭，其他已设置值开启，无设置时由 TTY/TERM 判断。EWP_PROGRESS=plain 关闭固定进度栏；无 VT、重定向或过小终端也会回退逐行输出。进度百分比代表完成阶段，不是剩余时间预测。'),
        p('本页默认中文，?lang=en 打开英文；切换语言保留对应章节。主题按钮切换跟随系统/浅色/深色，浏览器允许时本地保存；禁用存储也能使用。搜索支持 Ctrl+K / ⌘K 和 /，Esc 关闭；复制按钮失败时仍可选中命令文本。侧栏移动端可展开，键盘焦点可见，并遵循减少动态效果设置。'),
        p('禁用 JavaScript 后两种语言的全文、目录、锚点、代码和表格仍直接可读。可使用浏览器自带查找；所有资源均在本机，file:// 打开不需要服务器。')),

      section('ai-reading', '供 AI 与自动化读取', '静态正文是完整文档，交互只负责辅助浏览。',
        list('[guide.md](guide.md)：完整中文 Markdown。', '[guide.en.md](guide.en.md)：完整英文 Markdown。', '[capabilities.json](capabilities.json)：以 python/golang/rust/cpp 为键的能力对象，与 HTML 表格同源。', 'HTML 使用 article、section、标题、table、pre/code；每个章节均有稳定的语言前缀锚点，例如 #zh-CN-packaging 和 #en-packaging。'),
        code('powershell', `ewp docs --print --lang en
# Inside an existing project, without a global install:
npm --prefix frontend run ewp -- docs --print --lang zh-CN`),
        p('先确定项目 ewp.backend、实际配置、安装版本和能力，再生成命令。不要把框架手册当作应用已经实现了更新、托盘或业务 API 的证明；对宿主可选能力检查真实接口。引用文档时提供章节锚点，离线读取无需抓取 JS 或请求网络。'))
    ]
  };
}

function englishGuide(capabilities) {
  return {
    language: 'en', title: 'Easy Windows Pack Manual',
    tagline: 'From your first window to a Windows release.',
    introduction: 'Build Windows desktop applications with familiar frontend tools. A practical reference for creating projects, developing interfaces, composing windows and desktop modules, and shipping applications. Read it offline or hand the Markdown to your AI assistant.',
    groups: [
      ['Get started', ['quick-start', 'creator', 'environment', 'commands', 'development']],
      ['Runtime & modules', ['window-frame', 'composition', 'bridge', 'desktop-components', 'updates']],
      ['Build & distribute', ['capabilities', 'packaging', 'configuration', 'advanced-installer', 'install-uninstall']],
      ['Reference', ['outputs', 'validation', 'troubleshooting', 'preferences', 'ai-reading']]
    ],
    sections: [
      section('quick-start', 'Quick start', 'Create a project, initialize its environment, and open a desktop window.',
        p('Install Node.js >=22.12 and the Python or native toolchain for your backend. Windows desktop execution also requires WebView2 Runtime; see [environment requirements](#en-environment). Run these commands in PowerShell.'),
        code('powershell', `npm create ewp@latest "My App" -- --template vue-ts --backend python --lang en --no-install --no-start
Set-Location '.\\My App'
npm --prefix frontend install
npm --prefix frontend run init
npm --prefix frontend run dev`),
        p('The interactive creator asks for language, backend, frontend, and optional AI guidance. Use --start to install dependencies, initialize, and launch; keep --no-install --no-start when you want to inspect or edit the project first.'),
        code('powershell', `# Install the CLI globally only if desired.
npm install --global easywindowspack
ewp help
ewp docs
# From an existing project root:
ewp menu`),
        p('Without a global installation, use `npm --prefix frontend run ewp -- <task>` from the project root, or `npm run <task>` inside frontend. Welcome, help, and bundled docs work outside projects. Application frontend sources live in `frontend\\src`; production assets live in `output\\frontend`.'),
        note('Where next', 'Use [development and HMR](#en-development) for UI work, [window frames](#en-window-frame) to compose a window, and [backend capabilities](#en-capabilities) before distribution.')),

      section('creator', 'Creator & six templates', 'Choose your frontend independently from your backend.',
        table(['Template', 'UI layer', 'Language'], [
          ['`vanilla`', 'Native DOM', 'JavaScript'], ['`vanilla-ts`', 'Native DOM', 'TypeScript'],
          ['`vue`', 'Vue 3', 'JavaScript'], ['`vue-ts`', 'Vue 3', 'TypeScript'],
          ['`react`', 'React', 'JavaScript'], ['`react-ts`', 'React', 'TypeScript']
        ]),
        p('Each template can use `python`, `golang`, `rust`, or `cpp`. Python suits Python services and wheels; Go, Rust, and C++ use native hosts. A shared window frame does not imply identical business APIs or installer features. `ewp.backend` in `frontend\\package.json` routes tasks; older projects without it default to Python.'),
        table(['Creator option', 'Behavior'], [
          ['`--template NAME`', 'One of the six templates; non-interactive default: vanilla.'],
          ['`--backend NAME`', 'python (default) / golang / rust / cpp.'],
          ['`--dir PATH`', 'Target directory; quote spaces. It must be empty, including no .git directory.'],
          ['`--ai codex,claude,copilot`', 'Combine supported AI instruction entry points; default: none.'],
          ['`--lang zh-CN|en`', 'Generated language; interactive flow chooses language, then backend and frontend.'],
          ['`--yes` / `-y`', 'Skip prompts; does not install or start by default.'],
          ['`--install` / `--no-install`', 'Dependency installation only; --install alone is not desktop initialization.'],
          ['`--start` / `--no-start`', '--start installs, initializes the selected backend, and launches. Conflicts with --no-install.'],
          ['`--help` / `-h`', 'Show creator help.']
        ]),
        code('powershell', `npm create ewp@latest "Native App" -- --backend rust --template react-ts --ai codex,copilot --lang en --no-start
ewp create "Simple App" --template vanilla --backend python --yes --no-install --no-start
ewp create -h`),
        p('The initial application version is 0.1.0, independent of the framework version. Python templates default to onefile; native templates default to onedir. Installers are disabled by default. Inspect the generated ewp.pack.json.')),

      section('environment', 'Environment & initialization', 'Install developer tools explicitly; check end-user runtime requirements separately.',
        table(['Scope', 'Requirement and official download'], [
          ['All frontends', '[Node.js >=22.12](https://nodejs.org/en/download), including npm.'],
          ['Python', '[Python >=3.10](https://www.python.org/downloads/); desktop host uses pywebview / WebView2.'],
          ['Go', '[Go >=1.22](https://go.dev/dl/), [MinGW-w64 C++ / MSYS2](https://www.msys2.org/), and Windows SDK; webview_go / CGO host.'],
          ['Rust', '[Rust / Cargo](https://rustup.rs/) with a Windows MSVC toolchain, [Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022), and Windows SDK; Wry + tao host.'],
          ['C++', '[CMake >=3.24](https://cmake.org/download/), a C++17 compiler, Visual Studio C++ Build Tools, and [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/); webview/webview host.'],
          ['Windows desktop runtime', '[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) on both development and user machines.'],
          ['Native installer builds', '[NSIS 3](https://nsis.sourceforge.io/Download), providing makensis. Not needed for an onedir application alone.']
        ]),
        h('init-retries', 'Retrying initialization'),
        p('Run `npm run init` inside frontend. Python creates or reuses the root `.venv`, installs frontend dependencies, compiles assets, and performs an editable Python installation. Native init installs/checks frontend dependencies including devDependencies on every attempt, checks the toolchain, and compiles the frontend and debug host. Native projects do not generate a Python runtime, pyproject.toml, or dev.py.'),
        p('Install missing tools using the printed links, reopen the terminal, and rerun the same init command. Toolchains are not downloaded automatically. Retries preserve source files, valid environments, and existing compiler caches. An invalid Python environment produces an error instead of being silently deleted. Initial native builds may download pinned host dependencies.'),
        code('powershell', `# Only set overrides for tools already installed on your machine.
$env:EWP_GO = 'C:\\Tools\\Go\\bin\\go.exe'
$env:EWP_CARGO = 'C:\\Users\\me\\.cargo\\bin\\cargo.exe'
$env:EWP_CMAKE = 'C:\\Tools\\CMake\\bin\\cmake.exe'
$env:EWP_MAKENSIS = 'C:\\Program Files (x86)\\NSIS\\makensis.exe'
$env:EWP_CMAKE_ARGS = '["-G","Visual Studio 17 2022","-A","x64"]'
npm --prefix frontend run init`),
        note('Build tools and runtime', 'Native onedir deployments generally do not require Node/Python on user machines, but still require WebView2. Check Go compiler DLL dependencies before shipping. WebView2 is not automatically downloaded. This manual does not claim native macOS packaging support.')),

      section('commands', 'Menu, help & commands', 'Task availability depends on backend support and local build prerequisites.',
        p('`ewp` shows the welcome screen. `ewp help`, `ewp -h`, and `ewp --help` show help; `ewp --version` (-v / -V) shows the version. `ewp menu` or the root startup.cmd opens the menu; 0 exits. The menu and project-aware help hide unsupported tasks and operations missing mandatory build prerequisites, provide reasons and official download links, and refresh availability after a task. A capability table describes product support, not tools installed on this machine.'),
        table(['Task and aliases', 'Purpose'], [
          ['`init`', 'Initialize selected backend and frontend.'], ['`dev [--web]`', 'Desktop HMR; --web is browser-only.'],
          ['`browser` / `frontend:dev`', 'Browser HMR.'], ['`frontend` / `frontend:build`', 'Compile frontend.'],
          ['`frontend:preview` / `preview`', 'Preview an existing build.'], ['`demo [--debug]`', 'Compile and run the desktop; optional developer tools.'],
          ['`backend:build`', 'Compile the native host; maps to exe for Python.'], ['`app` / `build:app`', 'Build using application configuration.'],
          ['`installer`', 'Build application and always generate setup.'], ['`exe` / `build:exe`', 'Legacy EXE output when no packaging overrides are passed.'],
          ['`wheel` / `build:wheel`', 'Python wheel only.'], ['`bundle`', 'Create source ZIP.'],
          ['`build`', 'EXE by default; --wheel / -w, --exe / -e, and --all are mutually exclusive.'],
          ['`build:all` / `full-build`', 'Backend-specific full build; stops on failure.'],
          ['`test` / `check` / `info`', 'Backend tests / Node checks / project and environment details.'],
          ['`docs`', 'Open bundled local HTML outside projects too; ews docs is an alias.']
        ]),
        h('command-options', 'Common options'),
        table(['Option', 'Scope and constraints'], [
          ['`--mode onefile|onedir`', 'Application phase of app / installer / exe / build / full-build; supported modes depend on backend.'],
          ['`--config PATH`', 'Same tasks; project-relative, defaults to ewp.pack.json. Stay inside the project and quote spaces.'],
          ['`--installer`', 'Same tasks; also create setup. Packaging options conflict with build --wheel / -w.'],
          ['`--port 0..65535`', 'dev / browser / frontend:dev / frontend:preview; 0 selects a dynamic port.'],
          ['`--no-open`', 'Do not open development/preview pages automatically; docs prints a local file URL.'],
          ['`--print`', 'docs prints raw Markdown in the selected language.'],
          ['`--lang zh-CN|en`', 'Language for this invocation, before or after the command.']
        ]),
        code('powershell', `ewp docs --no-open
ewp docs --print --lang en
ews docs
npm --prefix frontend run ewp -- docs --print --lang zh-CN
npm --prefix frontend run build -- -w
npm --prefix frontend run app -- --mode onedir --config 'configs\\My App.json' --installer`),
        p('Use `--` to forward npm options; bare `-w` belongs to npm workspaces. Wheel targets reject application packaging overrides. The lower-level Python `easy-windows-pack build` still runs test → wheel → bundle; it differs from the Node CLI default EXE target.')),

      section('development', 'Development, browser & HMR', 'Use the browser for UI work and a desktop host for native behavior.',
        code('powershell', `# From the project root:
npm --prefix frontend run dev
npm --prefix frontend run dev -- --web
npm --prefix frontend run browser -- --port 5173 --no-open
npm --prefix frontend run frontend:build
npm --prefix frontend run frontend:preview
npm --prefix frontend run demo -- --debug`),
        p('dev waits for Vite, then starts the debug desktop host with the real local Vite URL. Frontend changes use HMR. browser / dev --web runs only the browser interface. The server binds to 127.0.0.1 and uses a dynamic port by default. If a port or automatic opening fails, use the actual URL printed in the terminal. Ctrl+C stops the service and desktop process tree and releases the port.'),
        p('demo compiles the frontend and launches the desktop against production assets, without HMR; --debug enables developer tools. frontend:preview previews an existing build and does not rebuild it. Production applications use output\\frontend and do not depend on a Vite server.'),
        p('Frontend entry points depend on the template: frontend\\src\\main.js, main.ts, main.jsx, or main.tsx. Python host: backend\\src\\demo.py; Go: backend\\main_windows.go; Rust: backend\\src\\main.rs; C++: backend\\src\\main.cpp. Keep business APIs in your selected host.'),
        note('What browser testing proves', 'A browser can test layout and components, but not native window bridges, dragging, resizing, Snap, tray behavior, installation, or restart. Rerun the appropriate desktop task after changing host code.')),

      section('window-frame', 'Runtime: window frames & themes', 'Compose through public exports while retaining ownership of application content.',
        p('Import `easywindowspack/frame.css` explicitly, then use `mountFrame(target, options)`. The target is an existing Element or selector and requires a browser DOM. Mounting again in the same container disposes its previous instance. String content is text; pass a DOM node for rich content, or use the Vue/React wrapper.'),
        code('javascript', frameExample),
        table(['FrameOptions', 'Type and meaning'], [
          ['`title` / `icon`', 'string; icon also accepts null. Use local resource paths.'],
          ['`mode` / `titleBarMode`', 'native / default / minimal; mode takes precedence, titleBarMode is an alias.'],
          ['`windowStyle`', 'windows / macos; appearance only, not native macOS packaging support.'],
          ['`resizable`', 'boolean; controls frame resize handles. Actual window capabilities depend on the host.'],
          ['`content`', 'Node / string / null.'], ['`onError`', 'Receives { ok: false, error: string }.']
        ]),
        p('The handle exposes frame, content, and update(options), which returns the same handle. dispose() releases events and removes frame DOM; remove() is equivalent. Dispose on unmount. native uses system chrome, default a standard custom title bar, and minimal a compact custom title bar. Crossing the native/custom boundary may return restartRequired; actual system chrome changes when the host restarts.'),
        h('frame-theme', 'Theme and appearance'),
        p('`setWindowStyle("windows" | "macos")` updates all mounted frames. `setTitleBarMode(mode)` sends an asynchronous host request. There is no public setTheme() API. Frame CSS follows system light/dark preferences and can be overridden with --ewp-* variables. The theme control in this manual affects only this manual.'),
        code('css', themeExample)),

      section('composition', 'Vue & React composition', 'Keep interactive content in your framework and use its lifecycle.',
        h('vue', 'Vue 3'),
        p('Import WindowFrame from easywindowspack/vue and place content in the default slot. The wrapper mounts a frame, watches props, and disposes on unmount. @error receives window errors; the component instance exposes frame. Install Vue only for a Vue application.'),
        code('vue', vueExample),
        h('react', 'React'),
        p('Import WindowFrame from easywindowspack/react. React owns children; props and onError are forwarded to the frame. The wrapper handles layout-effect cleanup and StrictMode remounting. Install React only for a React application.'),
        code('jsx', reactExample),
        p('Both wrappers accept title, icon, mode, windowStyle, and resizable. Other DOM attributes go to the host container. Do not manually replace children managed by Vue or React. For a custom integration, use mountFrame and dispose it during component teardown.')),

      section('bridge', 'Window bridge API', 'Public types describe the interface; the actual host determines capabilities.',
        table(['Public export', 'Contract'], [
          ['`call(method, ...args)`', 'Promise<Record<string, unknown>>; does not statically type business results.'],
          ['`getWindowApi()`', 'Shared API with bind, unbind, call, etc.; null without a browser DOM. It does not indicate native host readiness.'],
          ['`setTitleBarMode(mode)`', 'Promise<Record<string, unknown>>; check ok / error / restartRequired.'],
          ['`setWindowStyle(style)`', 'Synchronously update frame appearance.'],
          ['`isSupportedResizeDirection(direction)`', 'Checks left/right/top/bottom and top-left/top-right/bottom-left/bottom-right; does not prove a system operation succeeded.']
        ]),
        p('The shared bridge calls window.pywebview.api; native hosts provide a compatible interface. pywebviewready signals readiness. A rendered page does not prove that a host API exists. Missing methods and host exceptions usually become {ok:false,error}; inspect results. Helpers can also throw without a DOM. Public return types are Record, so validate field types before use.'),
        code('javascript', `import { call } from 'easywindowspack';

async function refreshWindowState() {
  const result = await call('get_window_state');
  if (result.ok === false) {
    console.error(result.error);
    return;
  }
  // Validate host-specific fields before using them.
}
if (window.pywebview?.api) void refreshWindowState();
else window.addEventListener('pywebviewready', refreshWindowState, { once: true });`),
        table(['Host method', 'Purpose and limits'], [
          ['`get_window_state()`', 'Window state snapshot.'], ['`window_action(action)`', 'Window controls such as minimize, maximize, and close; host support applies.'],
          ['`native_drag(direction)`', 'move or one of eight resize directions; frame binds real pointer actions and delegates to Windows.'],
          ['`set_titlebar_mode(mode)`', 'Request a title bar mode; respect restartRequired.'],
          ['`set_always_on_top(bool)` / `toggle_always_on_top()` / `get_always_on_top()`', 'Exposed by Python WindowApi; inspect other hosts before using.'],
          ['`set_window_size(width,height)` / `hide_window()` / `show_window()`', 'Python WindowApi methods; do not assume every business host implements them.'],
          ['`get_adapter_capabilities()`', 'Method list from optional Python desktop adapters; not guaranteed without an adapter.']
        ]),
        note('Trusted local UI', 'The bridge is for trusted local frontend content. Native production pages are restricted to application frontend assets, development pages to loopback origins. Do not grant remote documents host capabilities or infer cross-backend parity from a method name.')),

      section('desktop-components', 'Desktop components & startup state', 'Small DOM components with explicit styles and state.',
        p('Import easywindowspack/desktop.css and easywindowspack/desktop-components.js. Components do not require Vue, network fonts, or icon services; browser modules require a real DOM. Start with this markup before initializing components.'),
        code('html', `<div id="curtain">Loading application…</div>
<main id="workspace" data-ewp-entry="pending">
  <h1 data-ewp-enter>My App</h1>
  <div id="progress" data-ewp-enter></div>
</main>`),
        code('javascript', componentExample),
        table(['Component', 'Actual capabilities'], [
          ['`createMatrixProgress(element, options)`', 'value is filled percentage; remaining independently controls threshold colors, not automatically 100-value. size is 2/3/4. Supports unlimited, label/unlimitedLabel, ResizeObserver, and linear fallback in small spaces. update changes state; dispose releases it.'],
          ['`createEntrance(workspace)`', 'prepare sets pending and inert/ARIA; reveal animates data-ewp-enter regions and restores state. dispose restores original attributes and clears timers.'],
          ['`createBootCurtain(element, {onComplete, timeout})`', 'Call setReady() only after real service readiness. The default 12-second watchdog removes decoration and calls reason=timeout; it does not mean startup succeeded. dispose clears timers and events.']
        ]),
        p('Implement showStartupError in your application and retain usable errors/retry controls after a timeout. prefers-reduced-motion or html[data-motion="off"] disables decoration motion. Put the initial pending marker in the original HTML to avoid startup flashes. Animation completion cannot replace readiness, permissions, or error handling.')),

      section('updates', 'Desktop adapters & updates', 'A state client for real host implementations, not a bundled update service.',
        p('`easywindowspack/desktop-updates.js` exports createDesktopUpdateClient({host, bridge?, onState?, onError?}). host is api-tools or turtleclaw; the default bridge reads window.pywebview.api. API_TOOLS and TurtleClaw are optional external hosts. Installing the npm package does not supply their backend applications.'),
        code('javascript', updateExample),
        table(['Client method', 'Behavior'], [
          ['`markFrontendReady({checkOnStartup, includePrereleases})`', 'Call after the real UI and settings have loaded. checkOnStartup defaults to false; TurtleClaw confirms confirm_update_ready here.'],
          ['`refresh()` / `check(includePrereleases=false)`', 'Read state / explicitly check. API_TOOLS receives no prerelease argument.'],
          ['`download()` / `cancel()`', 'Request download / cancellation. API_TOOLS has no cancel_update_download; the call rejects.'],
          ['`install(token)`', 'TurtleClaw: install_update(token); API_TOOLS: restart_update(). Explicit user action required.'],
          ['`restart()`', 'Call host restart_app, only when actually exposed.'], ['`dispose()`', 'Stop polling and release listeners.']
        ]),
        p('After markFrontendReady, polling reads state every 4 seconds when idle and 500ms while checking/downloading/installing. It does not automatically download, install, or restart. Do not call install in onState. API_TOOLS reads get_state().update with percent progress; TurtleClaw reads get_update_state() and retains progress, install_token, can_install, and other host fields. The client does not normalize these into a universal state schema.'),
        h('host-adapters', 'Python host adapters'),
        p('The public Python import is easy_windows_pack. ApiToolsAdapter may expose key management, refresh, thresholds/preferences, asset initialization, and update commands. TurtleClawAdapter exposes update state/check/download/cancel/token installation/readiness. DesktopApi(*adapters) combines non-conflicting methods and rejects duplicates. Their check_for_updates signatures differ, so do not directly combine both update hosts.'),
        p('get_adapter_capabilities() omits missing methods. TurtleClaw exposes restart_app only when explicitly given a restart callback. The host owns tokens, active tasks, download verification, shutdown, replacement, rollback, and restart. Do not replace a normal restart with reset_all_data. This module does not prove a real online update, EXE replacement, or restart has succeeded.')),

      section('capabilities', 'Backend capabilities', 'Rendered directly from the shared capabilities supplied with this build.',
        capabilityTable(capabilities, true),
        p('This table and [capabilities.json](capabilities.json) use the same build input. Standalone previews use release defaults when no shared object is supplied. This does not inspect local PATH. Native backends support onedir only; wheels are Python-only. An NSIS 3 setup wraps a directory and does not make the application itself onefile.'),
        p('Advanced installer support means Python feature files, prerequisite downloads, hooks, and setting options. The native driver rejects non-empty Python-only configuration and unsupported installer fields rather than silently ignoring them. Check the menu and environment section for local build requirements.')),

      section('packaging', 'Applications, onefile & setup', 'Choose the execution layout before choosing a build command.',
        table(['Artifact', 'Distribution contract'], [
          ['onefile application', 'Python supports it; output\\apps\\<id>.exe, built with PyInstaller.'],
          ['onedir application', 'See capability table; output\\apps\\<id>\\. Ship the complete directory, including frontend and runtime dependencies.'],
          ['setup installer', 'output\\installers\\<id>-setup.exe. Python uses its configuration installer; native backends use NSIS 3. A single setup file is separate from application mode.'],
          ['wheel', 'Python only, installed into a Python environment; not Windows setup or a standalone end-user runtime.'],
          ['source bundle', 'Source/rebuild ZIP from bundle, not a compiled desktop application.']
        ]),
        code('powershell', `npm --prefix frontend run app -- --mode onedir
npm --prefix frontend run installer -- --mode onedir
# Python only:
npm --prefix frontend run app -- --mode onefile
npm --prefix frontend run build -- -w
# EXE stage with configuration:
npm --prefix frontend run build -- --mode onedir --installer
npm --prefix frontend run bundle`),
        p('app uses ewp.pack.json; installer forces setup generation. exe/build without --mode, --config, or --installer retains legacy output\\exe behavior. Those options switch the EXE phase to configured packaging. Full builds run backend-specific tests, frontend, host/EXE, and source packaging; Python additionally builds a wheel. A failed phase stops the build.'),
        p('Python setup and embedded uninstall.exe are themselves built as onefile. onedir application contents are installed flat into the chosen directory. Native onedir contains <id>.exe, frontend, licenses, and application.json. Rust/C++ use static MSVC runtimes; inspect Go DLL dependencies. End-user machines still require WebView2 Runtime, which installers do not download automatically.')),

      section('configuration', 'ewp.pack.json configuration', 'A strict schema; this example uses the shared onedir mode.',
        p('Place this file at the project root. The conservative application id and basic fields work across backends. Replace My App, my-app, and the version. Check backend support before enabling onefile or advanced fields. A missing explicit --config is an error. Python uses in-memory defaults when the default file is missing and does not create it.'),
        code('json', basicConfig('en')),
        table(['Field', 'Supported meaning'], [
          ['`schemaVersion`', 'Integer 1.'], ['`application`', 'id, name, version; id controls filenames, installation directory, and registration identity. Application version is independent from framework version.'],
          ['`build`', 'mode: onefile/onedir, subject to backend support; installer: boolean.'],
          ['`installer.language`', 'zh-CN / en; translates built-in installer controls, not author labels or original error messages.'],
          ['`postInstall`', 'At most one startup and one launch option; default is false. Python additionally supports setting.'],
          ['`features` / `prerequisites` / `hooks`', 'Empty in the basic example; non-empty values are Python-only.']
        ]),
        p('Unknown fields are rejected. Do not add description to application, installer, or postInstall; Python welcome text belongs in installer.welcome. Native installer objects support language only, not welcome/defaultDirectory/files. The example startup/launch entries are unselected options, not actions performed during the build.'),
        p('For portable ids, use lowercase ASCII letters, digits, and hyphens; start with a letter or digit, keep within 80 characters, and avoid Windows device names. Python also accepts underscores and dots but rejects trailing dots and uninstall. Do not assume native validation accepts the wider Python syntax. Use safe relative source/destination paths without absolute paths, .., or linked directories.')),

      section('advanced-installer', 'Advanced Python installer', 'Python configuration installers only; do not copy these extensions into a native project.',
        p('Merge selected fields into the basic JSON. installer.files are always installed. All feature files enter setup, then selection controls copying. required features stay selected; default/required both default to false. Sources must exist and every feature combination is checked for path conflicts.'),
        code('json', JSON.stringify({
          installer: { language: 'en', welcome: 'Welcome to My App', files: [{ source: 'resources/help', destination: 'help' }] },
          features: [{ id: 'examples', name: 'Example files', description: 'Optional local examples', default: false, required: false, files: [{ source: 'resources/examples', destination: 'examples' }] }],
          prerequisites: [], hooks: {},
          postInstall: [{ id: 'compact', name: 'Compact layout', type: 'setting', key: 'compact', value: true, default: false }]
        }, null, 2)),
        h('prerequisites', 'Prerequisite downloads and commands'),
        p('Prerequisite entries support id/name, urls/mirrors, mirrorApi, sha256, type, destination, filename, features, commands, and check. Provide at least a static URL or mirrorApi, plus the actual file SHA-256 as 64 hex characters. Never build using a placeholder hash. mirrorApi returns {"urls":["https://..."]}. Dynamic URLs take priority, with static fallback; all mirrors must match the same hash.'),
        table(['Field', 'Behavior'], [
          ['`type`', 'zip safely extracts; file/exe copies the download. exe does not execute automatically.'],
          ['`destination`', 'Must be runtime/<id>; may be omitted. filename must be a safe filename.'],
          ['`features`', 'Omitted/empty runs always; otherwise runs when any associated feature is selected.'],
          ['`check`', 'An existing file inside the installation skips download and commands; not a system runtime version probe.'],
          ['`commands`', 'Arrays of argv arrays, executed explicitly in order.'],
          ['Default limits', '20-second network timeout, two attempts per URL, 512 MiB download, 2 GiB extraction, 300-second command timeout. These are not JSON/CLI fields.']
        ]),
        h('hooks', 'Hooks and post-install options'),
        p('hooks supports beforeInstall, afterInstall, beforeUninstall, and afterUninstall as arrays of argv arrays. Commands do not use a shell, accept .bat/.cmd, or expand environment expressions. Keep each argument separate. Literal placeholders are {installDir}, {executable}, {runtimeDir}, and {download}; hook download is empty. Supply hook executables through installer.files or equivalent files.'),
        p('Order: copy selected files → beforeInstall → prerequisites → write settings → afterInstall → HKCU registration → commit → optional launch. Files already exist during beforeInstall. Nonzero exits and timeouts fail the operation; external command side effects cannot be rolled back. Make uninstall hooks idempotent. Directly referenced hook files are retained until their phase finishes.'),
        p('startup writes the current-user HKCU Run entry. launch runs after commit, with a warning on failure. setting writes a unique key and finite JSON value into ewp-options.json for the application to read. Omitted selection uses defaults; explicit empty selection disables optional defaults. Python installer.defaultDirectory supports an absolute path after environment-variable expansion; native installers reject that field.')),

      section('install-uninstall', 'Installation & uninstallation', 'Python transaction installers and native NSIS installers have different behavior.',
        h('python-installer', 'Python: configuration installer'),
        p('The default current-user directory is `%LOCALAPPDATA%\\Programs\\<id>`; there is no automatic elevation. The destination must be new/empty and writable. Overwrite/in-place upgrades are unsupported; uninstall an existing registered application id or ownership record first. Directory precedence is --install-dir → EWP_INSTALL_DIR → configuration/default.'),
        p('GUI steps: directory → features → prerequisites → post-install options → confirmation → progress → finish, skipping empty steps. Downloads start after confirmation. Running operations cannot go back/cancel; a failure allows retry or return to confirmation. Uninstall uses confirmation → progress → finish. GUI and silent modes share the engine.'),
        code('powershell', `# Python installer only; native NSIS has a different CLI.
& '.\\output\\installers\\my-app-setup.exe' --silent --install-dir 'D:\\Apps\\My App' --features '' --options ''
& 'D:\\Apps\\My App\\uninstall.exe' --silent`),
        table(['Python installer option', 'Meaning'], [
          ['`--silent`', 'No GUI; exit 0 on success, 1 on exception.'], ['`--install-dir PATH`', 'Install/uninstall directory.'],
          ['`--features ID1,ID2`', 'Omitted uses defaults; empty string disables optional features, retaining required ones.'],
          ['`--options ID1,ID2`', 'Omitted uses defaults; empty string disables default startup/launch/setting.'],
          ['`--uninstall [DIRECTORY]`', 'Explicit uninstall; directory wins over install-dir, then running executable parent.'],
          ['`--payload ZIP`', 'Test/external payload; normally the embedded payload is used.']
        ]),
        p('Python installers do not support /S or --yes. A frozen executable named uninstall.exe automatically enters uninstall mode and validates ownership. Silent installation still executes selected launch/startup options. Windows PowerShell 5.1 may discard empty arguments passed to native EXEs; verify empty-argument forwarding before unattended use, or deselect options in the GUI.'),
        p('`.ewp-install-state.json` records ownership; `.ewp-installer.log` records activity. Uninstall deletes only recorded files whose hashes still match, preserves added/modified user files, and removes only empty directories. It never recursively clears the installation root. Failures roll back tracked transaction files/registration, not external command side effects. The uninstaller validates a manifest and removes itself after exit. Do not delete ownership records to bypass upgrade checks.'),
        h('native-installer', 'Go / Rust / C++: NSIS 3'),
        p('The build machine needs makensis through PATH or EWP_MAKENSIS; end users do not need NSIS. setup contains the complete onedir payload and defaults to current-user LocalAppData\\Programs\\<id>. It provides directory, optional component, progress, and finish pages. Optional startup creates a current-user Startup shortcut; launch runs at installation. It also creates a Start menu shortcut and HKCU uninstall registration.'),
        p('Uninstall deletes the build-time file list, shortcuts, and registration, and removes empty directories while preserving extra user files. It does not use Python hash-based retention: modified installed files with the same names may still be deleted. Do not rely on Python transaction rollback, overwrite refusal, hooks, feature payloads, prerequisite downloads, or --silent/--features/--options flags.'),
        note('Deploy WebView2 explicitly', 'Neither path should be assumed to download WebView2 Runtime automatically. Check the target Windows environment. A custom Python prerequisite only runs when explicitly configured with real hashes and commands.')),

      section('outputs', 'Output paths & project layout', 'Paths are relative to the project root; <id> is application.id.',
        table(['Path', 'Contents and scope'], [
          ['`frontend\\src\\`', 'Application interface sources; Node workspace is frontend.'], ['`.venv\\`', 'Python virtual environment; not generated for native projects.'],
          ['`output\\frontend\\index.html`', 'Vite production entry and neighboring assets.'],
          ['`output\\apps\\<id>.exe`', 'Configured Python onefile application.'],
          ['`output\\apps\\<id>\\<id>.exe`', 'Configured onedir application; ship the whole <id> directory.'],
          ['`output\\installers\\<id>-setup.exe`', 'Setup installer.'],
          ['`output\\exe\\easy-windows-pack-demo.exe`', 'Python legacy exe/build name; does not use application.id.'],
          ['`output\\exe\\<id>\\<id>.exe`', 'Native legacy exe/build; actual configuration/project default id applies.'],
          ['`output\\wheels\\*.whl`', 'Python wheel; filename follows Python project metadata.'],
          ['`output\\bundles\\<name>-<version>-source.zip`', 'Source ZIP; name/version come from backend-specific project metadata.'],
          ['`output\\logs\\`', 'Initialization/build logs where emitted; use the exact printed path. Standalone interactive tasks may only log to the terminal.'],
          ['`build\\spec\\`, `build\\pyinstaller\\`, `build\\exe-src\\`', 'Python staging, not authoritative source.'],
          ['`build\\native\\`', 'Native compiler outputs, installer\\setup.nsi, and bundle staging.']
        ]),
        p('Source bundles omit dependencies, caches, credentials, and maintainer material. Python bundles also provide an expanded directory and easy-windows-pack.manifest.json. Native source staging is build\\native\\bundle\\<id>. Do not assume identical archive internals. Keep referenced configuration resources inside the project root.')),

      section('validation', 'Tests, check & info', 'Run focused checks, then verify actual Windows behavior.',
        code('powershell', `npm --prefix frontend run info
npm --prefix frontend run check
npm --prefix frontend run test
npm --prefix frontend run frontend:build
# TypeScript templates:
npm --prefix frontend run typecheck`),
        table(['Check', 'Coverage'], [
          ['info', 'Project root, selected backend, interpreter/tools; confirm the expected project and environment.'],
          ['check', 'Node runtime exports/configuration, not the complete application test suite.'],
          ['Python test', 'Project Python unittest.'],
          ['Native test', 'Node runtime checks; Rust additionally runs cargo test, Go/C++ compile the debug host. Different backends do not run identical language test suites.'],
          ['frontend:build / typecheck', 'Compile pages / TypeScript template checking.'],
          ['Real desktop and packaging', 'Bridge, native chrome, resize/Snap, install, uninstall, and user-file retention.']
        ]),
        p('A successful build or browser check does not certify installation, updates, every DPI, or multi-monitor behavior. Add host/API/permission tests appropriate to your application. Ordinary application UI changes do not require the framework maintainer repository full integration suite.')),

      section('troubleshooting', 'Troubleshooting', 'Identify backend and failing stage, fix the cause, and retry that task.',
        table(['Symptom', 'Action'], [
          ['Project not found', 'Welcome/help/docs work anywhere; project tasks need frontend\\package.json and scripts. Run info from the generated project.'],
          ['Missing init toolchain', 'Use the [official environment links](#en-environment), install tools, reopen the terminal, and rerun init. No automatic system-tool installation.'],
          ['makensis not found', 'Install NSIS 3 and add it to PATH, or set EWP_MAKENSIS to the full makensis.exe path, then retry installer. Plain onedir app builds do not require it.'],
          ['Native onefile / wheel / advanced config rejected', 'Use onedir and remove Python-only fields; choose Python if you need wheel or advanced configuration.'],
          ['Missing WebView2 / blank desktop', 'Check target-machine WebView2 Runtime, output\\frontend\\index.html, and host logs. Installers do not fetch the runtime automatically.'],
          ['pywebview API is not ready', 'Browsers have no native bridge. On desktop, wait for pywebviewready and inspect host methods plus result ok/error.'],
          ['Port conflict / page did not open', 'Use --port 0 or a different port. Copy the printed URL; --no-open disables automatic opening.'],
          ['Stale Python dependency/editable mapping', 'Check .venv and project root in info, then rerun init. Do not rename public imports as a workaround.'],
          ['WinError 32 / Access denied / unreadable runw.exe', 'Close the application holding files and inspect protection history and actual paths, then retry. Do not default to elevation or disabling protection.'],
          ['Destination not empty / already registered', 'Uninstall the existing Python-installed app first; preserve user data. Do not delete ownership records to bypass checks.'],
          ['Files remain after uninstall', 'Added/modified files may be retained. Native uninstall uses its file list; Python also checks ownership hashes.'],
          ['Unsupported update/cancel/restart', 'Check real host adapters. API_TOOLS lacks download cancellation; TurtleClaw restart requires an explicit callback.'],
          ['Unknown configuration field', 'Follow the [basic schema](#en-configuration). Native installer supports language only; do not copy Python extensions.']
        ]),
        code('powershell', `$env:EWP_MAKENSIS = 'C:\\Program Files (x86)\\NSIS\\makensis.exe'
npm --prefix frontend run installer -- --mode onedir
# More readable diagnostic output:
$env:EWP_PROGRESS = 'plain'
npm --prefix frontend run init`),
        p('Record the exact command, backend, log path, and original error, then rerun the smallest relevant task. A curtain timeout is decoration ending, not initialization success. Diagnose update failures in the real host rather than inferring success from a progress bar.')),

      section('preferences', 'Language, color & accessibility', 'CLI, installer, and manual preferences are independent.',
        p('CLI language precedence: --lang → EWP_LANG → ewp.language in frontend\\package.json → zh-CN. A flag affects this invocation and does not rewrite generated README/AI guidance. Creator language controls generated text. installer.language controls built-in installer labels. Third-party npm/pip/Vite output and original errors are not guaranteed to be translated.'),
        code('powershell', `ewp --lang en help
$env:EWP_LANG = 'en'
npm --prefix frontend run info
$env:NO_COLOR = '1'
$env:EWP_PROGRESS = 'plain'`),
        p('NO_COLOR takes precedence and disables terminal color. Otherwise FORCE_COLOR=0 disables it, other set values enable it, and automatic behavior follows TTY/TERM. EWP_PROGRESS=plain disables fixed progress bars. No VT support, redirection, and small terminals also fall back to line output. Percentages indicate completed phases, not predicted time remaining.'),
        p('This manual defaults to Chinese; ?lang=en opens English. Language switching keeps the corresponding section. The theme control cycles system/light/dark and persists locally when storage is available; blocked storage is supported. Search uses Ctrl+K / ⌘K or /, Esc closes it. If copying fails, commands remain selectable. The responsive sidebar supports keyboard focus and reduced motion.'),
        p('With JavaScript disabled, both complete language versions, navigation, anchors, tables, and code remain directly readable. Use browser Find. All runtime resources are local; file:// requires no server.')),

      section('ai-reading', 'Reading with AI & automation', 'Static content contains the complete documentation; scripts only improve navigation.',
        list('[guide.md](guide.md): complete Chinese Markdown.', '[guide.en.md](guide.en.md): complete English Markdown.', '[capabilities.json](capabilities.json): capability object keyed by python/golang/rust/cpp, from the same input as the HTML table.', 'Semantic HTML uses article, section, headings, table, and pre/code. Stable language-prefixed anchors include #zh-CN-packaging and #en-packaging.'),
        code('powershell', `ewp docs --print --lang en
# Inside an existing project, without a global install:
npm --prefix frontend run ewp -- docs --print --lang zh-CN`),
        p('Determine the actual ewp.backend, configuration, installed version, and capabilities before generating commands. Do not treat framework documentation as evidence that an application implemented updates, a tray, or business APIs. Inspect optional host interfaces. Cite section anchors; offline reading needs no JavaScript fetch or network request.'))
    ]
  };
}
