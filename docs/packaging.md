# 应用与安装包 / Application and installer packaging

[文档导航 / Documentation](README.md) · [npm / Vite](npm-vite.md) · [开发手册 / Development](development.md) · [验收记录 / Validation](npm-validation.md)

本指南对应 Python `easy-windows-pack` **0.3.0** 与 npm `easywindowspack` / `create-ewp` **0.1.2**。**0.3.0 wheel 已在本地构建并通过独立冻结向导 E2E**（`ygft7h_d`）：onefile/onedir、159–163 字符安装路径、40 个空目录及用户文件保留均通过，报告与 wheel SHA-256 见 [本轮验收](npm-validation.md#2026-10-10-安装向导与安全修复阶段--installer-wizard-and-safety-fixes)。**PyPI 未发布**；npm **0.1.2 待发布**，`npm login` 返回 **HTTP 401**，等待用户认证。npm **0.1.1** 的 registry 验收保留为历史证据。下述新增能力使用对应源码或本地包；registry 的 `@latest` 跟随已发布版本。

This guide describes Python `easy-windows-pack` **0.3.0** and npm `easywindowspack` / `create-ewp` **0.1.2**. **The 0.3.0 wheel is built locally and passed independent frozen wizard E2E validation** (`ygft7h_d`), covering onefile/onedir, 159–163-character install paths, 40 empty directories and user-file preservation. See [current validation](npm-validation.md#2026-10-10-安装向导与安全修复阶段--installer-wizard-and-safety-fixes) for reports and the wheel SHA-256. **It has not been published to PyPI**. npm **0.1.2 remains pending publication**, awaiting user authentication after `npm login` returned **HTTP 401**. npm **0.1.1** registry checks remain historical evidence. Use the corresponding sources or local packages for these capabilities; registry `@latest` follows published versions.

## 构建入口与产物 / Commands and artifacts

先初始化项目。npm 命令在 `frontend/` 执行，从项目根执行时加 `--prefix frontend`。应用与安装包构建面向 Windows，需要 Python >=3.10、项目依赖和 PyInstaller；前端编译需要 Node >=22.12。npm / CLI 构建会先编译前端，生产只装载 `output/frontend/`。

Initialize the project first. Run npm commands in `frontend/`, or add `--prefix frontend` from the project root. Windows packaging needs Python >=3.10, project dependencies and PyInstaller; frontend compilation needs Node >=22.12. npm / CLI packaging builds the frontend first and uses compiled `output/frontend/` in production.

```powershell
npm run app
npm run build -- --mode onedir
npm run installer
```

| 入口 / Entry | 行为与输出 / Behavior and output |
| --- | --- |
| `npm run app` / `ewp app` / `startup.cmd app` | 按配置构建应用；`build.installer: true` 时也生成安装包 / Build the configured app, adding setup when configured |
| `npm run installer` / `ewp installer` / `startup.cmd installer` | 构建应用及安装包，覆盖 `build.installer: false` / Build app and setup regardless of the configured installer toggle |
| `npm run build -- --mode onedir` | 显式模式将默认 build 转入配置构建，输出到 `output/apps/` / Explicit mode routes default build to configured packaging under `output/apps/` |
| `npm run app -- --mode onefile --config ewp.pack.json --installer` | 覆盖模式、选择项目配置并同时构建 setup / Override mode, select config and include setup |
| `npm run build` / `npm run exe`，不带打包参数 / without packaging flags | legacy 单文件 demo：`output/exe/easy-windows-pack-demo.exe` / Legacy single-file demo |

`--config`、`--mode`、`--installer` 也可传给项目工具的 `build` / `exe` / `build:all`；显式打包参数使其中的 EXE 阶段使用配置构建。`build -- -w` / `-- --wheel` 不能与这些参数组合。无参数 legacy build/exe 保留原输出，不读取 `ewp.pack.json` 来改变该流程。

Project-tool `build` / `exe` / `build:all` also accept `--config`, `--mode`, and `--installer`; explicit packaging flags route their EXE stage through configured packaging. These flags cannot be combined with `build -- -w` / `-- --wheel`. Legacy build/exe without them retains its original output and does not use `ewp.pack.json` to change that flow.

| 配置 / Configuration | 产物 / Artifact |
| --- | --- |
| `build.mode: "onefile"` | `output/apps/<application.id>.exe` |
| `build.mode: "onedir"` | `output/apps/<application.id>/`，包含同名 EXE 与依赖，分发整个目录 / Contains the EXE and dependencies; distribute the entire directory |
| installer 任务或 `build.installer: true` / installer task or toggle | `output/installers/<application.id>-setup.exe`，内含应用与独立 `uninstall.exe` / Setup embeds the app and standalone uninstaller |

setup 与 uninstaller 自身始终为 onefile；onedir 应用的内容安装时平铺在所选安装目录，应用 EXE 位于目录根。PyInstaller spec / 暂存在 `build/`，任务日志在 `output/logs/`。

Setup and uninstaller are always onefile executables. An onedir app is flattened into the selected install directory, with its EXE at the root. PyInstaller specs/staging use `build/`; task logs use `output/logs/`.

## 项目配置 / Project configuration

当前生成器在项目根创建默认 `ewp.pack.json`：schema 1、应用初始版本 `0.1.0`、onefile、不自动构建 installer、所选安装器语言、空 features/prerequisites/hooks，以及默认不勾选的 startup/launch 选项。这是应用版本，与框架版本独立。

The current generator creates root `ewp.pack.json`: schema 1, initial app version `0.1.0`, onefile, installer building disabled, the selected installer language, empty features/prerequisites/hooks, and unchecked startup/launch options. App versioning is independent of the framework version.

```json
{
  "schemaVersion": 1,
  "application": { "id": "my-app", "name": "My App", "version": "0.1.0" },
  "build": { "mode": "onefile", "installer": false },
  "installer": { "language": "en" },
  "features": [],
  "prerequisites": [],
  "hooks": {},
  "postInstall": [
    { "id": "startup", "name": "Start with Windows", "type": "startup", "default": false },
    { "id": "launch", "name": "Launch after installation", "type": "launch", "default": false }
  ]
}
```

默认配置文件缺失时，Python loader 使用内置默认值，不创建文件：id 由目录名规范化，name 为目录名，version 为 `0.1.0`，mode 为 onefile，installer 为 false，选项集合为空。显式 `--config` 指向不存在的文件会失败。配置路径相对项目根解析且必须留在根内。

If the default config is absent, the Python loader uses in-memory defaults without creating a file: a normalized directory-name id, directory-name display name, version `0.1.0`, onefile, installer disabled, and empty option collections. An explicit missing `--config` fails. Config paths resolve against the project root and must remain inside it.

| 字段 / Field | 支持内容 / Supported content |
| --- | --- |
| `schemaVersion` | 整数 `1` / Integer `1` |
| `application` | `id`、`name`、`version`；id 决定 EXE、默认目录及当前用户注册表标识 / id controls executable name, default directory and current-user registry identity |
| `build` | `mode: "onefile" \| "onedir"`，`installer: boolean` |
| `installer` | `language: "zh-CN" \| "en"`（默认 zh-CN / default zh-CN），可选 `welcome`、`defaultDirectory`、`files` / Optional welcome, default directory and always-installed files |
| `features`、`prerequisites`、`postInstall` | 下文所述数组 / Arrays described below |
| `hooks` | 四个可选的命令数组 / Four optional command arrays |

schema 严格检查支持字段。id 使用 1–80 个 ASCII 字母/数字/`_`/`.`/`-`，首字符为字母或数字；拒绝 Windows 设备名和末尾点，application.id 也不能是 `uninstall`。路径使用 `/` 分隔的安全相对路径；source 留在项目根内，destination 相对安装目录。拒绝 `..`、绝对路径、链接/junction、大小写冲突和安装器保留路径。

The schema checks supported fields strictly. IDs contain 1–80 ASCII letters/digits/`_`/`.`/`-`, starting with a letter or digit; Windows device names and trailing dots are rejected, as is application id `uninstall`. Use safe relative paths with `/`: sources stay inside the project root and destinations are relative to the install directory. Traversal, absolute paths, links/junctions, case collisions and reserved installer paths are rejected.

## 功能文件与 GUI / Feature files and GUI

feature 支持 `id`、`name`、`description`、`default`、`required`、`files`。每个 files 条目为 `{ "source": "...", "destination": "..." }`；source 可为文件或目录。目录会递归复制到 destination。所有功能都打入 setup，由安装时的选择决定复制哪些；required 功能始终选择，default 决定初始勾选，二者默认 false。

A feature supports `id`, `name`, `description`, `default`, `required`, and `files`. Each files entry is `{ "source": "...", "destination": "..." }`; source may be a file or directory, copied recursively to destination. Setup contains every feature; install-time choices decide which to copy. Required features are always selected; default controls initial selection. Both flags default to false.

```json
{
  "id": "examples",
  "name": "Example documents",
  "description": "Optional documents for first-time users.",
  "default": true,
  "required": false,
  "files": [{ "source": "resources/examples", "destination": "examples" }]
}
```

将此条目加入 `features`，并提供实际 source。`installer.files` 使用相同 source/destination 结构，始终安装，适合应用共用资源或 hooks 工具。构建时检查所有功能组合的路径冲突，也检查它们与应用及 installer.files 的冲突。

Add the entry to `features` and supply its actual source. `installer.files` uses the same structure and installs unconditionally, useful for shared resources or hook tools. Building checks path collisions across all feature combinations and against app and installer files.

source bundle 包含项目根 `ewp.pack.json` 及其 `features[].files` / `installer.files` 引用的安全源码路径；ZIP 保留空目录，包括嵌套空目录，便于解压后重新构建。生成物、依赖目录及不安全 source 仍被拒绝。

Source bundles include root `ewp.pack.json` and the safe source paths referenced by `features[].files` / `installer.files`. ZIPs preserve empty directories, including nested ones, for rebuilding after extraction. Generated/dependency sources and unsafe paths remain rejected.

默认 tkinter/ttk GUI 是分步骤向导，顶部显示应用名称和 welcome（省略时显示版本）。安装流程为 **目录 → 功能（有则）→ 依赖（按功能过滤后有则）→ 安装后选项（有则）→ 确认 → 进度 → 完成**。

The default tkinter/ttk GUI is a step-by-step wizard, with app name and welcome text (version when omitted) at the top. Installation follows **directory → features (when configured) → prerequisites (when any match selected features) → post-install options (when configured) → confirmation → progress → completion**.

| 步骤 / Step | 用户操作 / User action |
| --- | --- |
| 目录 / Directory | 编辑或浏览安装位置，下一步前校验 / Edit or browse the location; validated before continuing |
| 功能 / Features | 选择功能，显示 description；required 项保持勾选并锁定 / Select features with descriptions; required items stay selected and locked |
| 依赖 / Prerequisites | 仅显示始终运行及关联已选功能的依赖，说明来源与处理方式；下载在确认后开始 / Show always-on and selected-feature dependencies, their sources and handling; downloads begin after confirmation |
| 安装后选项 / Post-install options | 选择 startup、launch 或 setting / Select startup, launch or setting actions |
| 确认 / Confirmation | 核对目录、功能、依赖与选项，再开始安装 / Review location, features, prerequisites and options before starting |
| 进度 / Progress | 显示阶段与日志；运行中不能返回或取消 / Show stages and logs; back and cancel are unavailable while running |
| 完成 / Completion | 成功仅有“完成”；失败可重试或返回确认检查选择 / Success offers only Finish; failure allows Retry or a return to confirmation to review choices |

“上一步 / 下一步”保留目录及选择；返回功能页修改选择后，依赖页重新过滤，无内容的可选步骤自动跳过。卸载仅为 **确认 → 进度 → 完成**，失败与成功采用同样的按钮规则。向导调整沿用原 `install()` / `uninstall()` 引擎，silent 逻辑和下述执行顺序不变。

Back / Next preserves the directory and selections. Changing features filters prerequisites again, and empty optional steps are skipped. Uninstall follows only **confirmation → progress → completion**, with the same failure/success controls. The wizard continues to use the existing `install()` / `uninstall()` engine; silent behavior and the execution order below are unchanged.

**application、installer 和 postInstall 的 schema 不支持 description**；欢迎文字用 `installer.welcome`，选项标题用 `name`。

**The application, installer and postInstall schemas do not accept description**. Use `installer.welcome` for welcome text and `name` for option labels.

`installer.language: "zh-CN"` 将内置控件文字、状态栏和详情框的安装/卸载阶段及下载字节单位显示为中文；`"en"` 使用英文。应用名称、welcome、功能/选项名称与描述由配置作者提供。具体错误原因、警告、CLI 和磁盘日志保留原文；中文详情中的错误阶段附带原始原因，这项功能不承诺所有语义错误的完整翻译。

`installer.language: "zh-CN"` displays built-in controls, installation/uninstall stages in the status and details panels, and download byte units in Chinese; `"en"` uses English. App names, welcome text, feature/option names and descriptions come from the configuration author. Specific error reasons, warnings, CLI output and disk logs retain their original text. Chinese error-stage details include the original reason; this does not promise full translation of every semantic error.

## 下载运行库 / Runtime prerequisites

每个 prerequisite 支持 `id`、`name`、`urls`、`mirrors`、`mirrorApi`、`sha256`、`type`、`destination`、`filename`、`features`、`commands`、`check`。必须提供至少静态 URL 或 mirrorApi，并提供 **64 位十六进制 SHA-256**。可使用 HTTP(S) URL，建议 HTTPS；下载不接受 URL 内嵌凭据。

Each prerequisite supports `id`, `name`, `urls`, `mirrors`, `mirrorApi`, `sha256`, `type`, `destination`, `filename`, `features`, `commands`, and `check`. Supply static URLs or mirrorApi and a **64-hex SHA-256 digest**. HTTP(S) URLs are accepted; prefer HTTPS. Embedded URL credentials are rejected.

| 字段 / Field | 运行行为 / Runtime behavior |
| --- | --- |
| `urls` / `mirrors` | URL 字符串数组；顺序尝试并去重 / Ordered URL arrays, deduplicated |
| `mirrorApi` | HTTP(S) JSON 服务，返回 `{ "urls": ["https://..."] }`；先尝试动态 URLs，失败后回退 urls/mirrors / JSON endpoint; discovered URLs precede static fallback, discovery failures allow static fallback |
| `sha256` | 所有镜像均须匹配同一哈希，缺失或不匹配失败 / All mirrors must match the same digest; missing/mismatching hashes fail |
| `type` | `zip` 安全解压到 runtime；`file` / `exe` 复制下载文件，exe 不自动执行 / zip extracts to runtime; file/exe copies the download; exe execution requires commands |
| `destination` | 省略时为 `runtime/<id>`，指定时也只能是这个值 / Defaults to and must equal `runtime/<id>` |
| `filename` | 可选安全文件名；默认 `<id>.zip` / `.bin` / `.exe` / Optional safe filename, otherwise derived from type |
| `features` | 空/省略：始终运行；非空：任一关联功能被选中时运行 / Empty/omitted always runs; otherwise runs when any linked feature is selected |
| `check` | 安装目录下的相对文件路径；文件存在即跳过下载与 commands，不探测系统运行库版本 / Relative file existence check under installDir; skips download and commands without checking system runtime versions |
| `commands` | argv 数组的数组，按顺序执行 / Array of argv arrays, executed in order |

例如，将以下条目加入 prerequisites，替换 URL 和 sha256 为已确认可分发的真实文件；示例哈希占位文本必须替换，不能直接构建。

For example, add this entry to prerequisites, replacing URLs and sha256 with an actual redistributable file. The digest placeholder must be replaced before building.

```json
{
  "id": "runtime-tools",
  "name": "Application runtime tools",
  "urls": ["https://downloads.example.com/runtime-tools.zip"],
  "mirrors": ["https://mirror.example.com/runtime-tools.zip"],
  "mirrorApi": "https://downloads.example.com/runtime-tools/mirrors",
  "sha256": "<replace-with-the-real-64-hex-sha256>",
  "type": "zip",
  "destination": "runtime/runtime-tools",
  "features": ["examples"],
  "check": "runtime/runtime-tools/ready.dat",
  "commands": [["{runtimeDir}/configure.exe", "--target", "{installDir}"]]
}
```

内置默认限额：网络 timeout 20 秒、每 URL 尝试 2 次、单次下载 512 MiB、单个解压归档 2 GiB、每条命令 timeout 300 秒。Python `install()` 的关键字参数可覆盖这些限额；它们不是 pack JSON 或 setup CLI 字段。

Defaults are a 20-second network timeout, two attempts per URL, 512 MiB per download, 2 GiB per expanded archive, and 300 seconds per command. Keyword arguments to Python `install()` can override these limits; they are not pack JSON or setup CLI fields.

## 命令与生命周期 / Commands and lifecycle

hooks 支持 `beforeInstall`、`afterInstall`、`beforeUninstall`、`afterUninstall` 四个数组，每个元素是非空 argv 字符串数组，例如下面的 hooks 对象。工具必须由 installer.files 等实际提供；空数组表示无 hook。

Hooks support four arrays: `beforeInstall`, `afterInstall`, `beforeUninstall`, and `afterUninstall`. Each entry is a nonempty string argv array, as below. Supply actual tools through installer.files or another suitable source; empty arrays mean no hook.

```json
{
  "beforeInstall": [["{installDir}/tools/configure.exe", "prepare", "{installDir}"]],
  "afterInstall": [["{installDir}/tools/configure.exe", "finish", "{executable}"]],
  "beforeUninstall": [],
  "afterUninstall": []
}
```

| 占位符 / Placeholder | 值 / Value |
| --- | --- |
| `{installDir}` | 安装目录 / Installation directory |
| `{executable}` | 已安装应用 EXE 的完整路径 / Full installed app executable path |
| `{runtimeDir}` | prerequisite 的 `runtime/<id>`；hooks 中为安装目录的 `runtime/` / Current prerequisite directory; general runtime directory in hooks |
| `{download}` | prerequisite 临时下载文件；hooks 中为空字符串 / Temporary prerequisite download; empty in hooks |

命令按参数字面替换，不走 shell，不拆分命令字符串，不接受 `.bat` / `.cmd`。每个参数占一个数组元素，路径无需额外嵌套引号；不自动展开 `%VAR%` 或其他 shell 表达式。非零退出码或超时导致相应操作失败。

Commands replace placeholders literally, run without a shell, and do not split command strings. `.bat` / `.cmd` are rejected. Put each argument in its own array element without extra embedded path quotes; environment variables or shell expressions are not automatically expanded. Nonzero exit codes and timeouts fail the operation.

安装顺序：复制已选应用/功能文件 → beforeInstall → prerequisites 下载和 commands → 写入已选设置 → afterInstall → 当前用户注册表登记 → 提交 → 可选启动应用。因此 beforeInstall 执行时应用文件已经复制。卸载运行 beforeUninstall，清理拥有的文件和注册表，再运行 afterUninstall；直接引用的 hook 文件会保留到相应 hook 完成。卸载 hooks 应可重复执行，失败重试只重试未完成阶段。

Installation copies selected app/feature files, runs beforeInstall, downloads/configures prerequisites, writes selected settings, runs afterInstall, registers current-user entries, commits, then optionally launches the app. App files therefore exist when beforeInstall runs. Uninstall runs beforeUninstall, cleans owned files/registry, then runs afterUninstall, retaining directly referenced hook files until their phase completes. Make uninstall hooks idempotent; retries resume unfinished phases.

## 安装后选项 / Post-install options

`postInstall` 支持 `id`、`name`、`type`、`default`，setting 另支持 `key` 和 `value`。`default` 为初始复选框状态，省略为 false。省略选择参数时采用 defaults；显式空选择关闭可选 defaults。

`postInstall` supports `id`, `name`, `type`, and `default`; setting also uses `key` and `value`. `default` controls initial checkbox state and defaults to false. Omitted selection arguments use defaults; explicit empty selections disable optional defaults.

| `type` | 所选行为 / Selected behavior |
| --- | --- |
| `startup` | 在 HKCU Run 写入应用启动项，仅当前用户；最多一项 / Adds current-user HKCU Run entry; at most one |
| `launch` | 提交后启动应用；启动失败作为 warning，已完成安装保留；最多一项 / Launches after commit; failure is a warning and leaves installation intact; at most one |
| `setting` | 将 `key: value` 写到安装目录 `ewp-options.json`；应用自行读取，key 必须唯一，value 为有限 JSON 值 / Writes selected settings to ewp-options.json for the app to read; unique keys and finite JSON values |

schema 中类型名是单数 `setting`，不是 `settings`。例如 `{ "id": "compact", "name": "Compact view", "type": "setting", "default": true, "key": "compactView", "value": true }`。

The accepted type is singular `setting`, not `settings`, as in the compact-view example above.

## 目录、权限与卸载 / Directory, permissions and uninstall

默认安装目录为 `%LOCALAPPDATA%\Programs\<application.id>`。`installer.defaultDirectory` 可设置环境变量/`~` 展开后为绝对路径的默认值；GUI 允许用户改目录。安装 CLI 的目录优先级为 `--install-dir` → `EWP_INSTALL_DIR` → config/default。目标须为新目录或空目录，且当前用户可写。

The default directory is `%LOCALAPPDATA%\Programs\<application.id>`. `installer.defaultDirectory` may supply a path that becomes absolute after environment/`~` expansion; the GUI lets users change it. Install CLI directory precedence is `--install-dir` → `EWP_INSTALL_DIR` → config/default. The destination must be new or empty and writable by the current user.

默认安装、卸载和开机启动登记使用当前用户权限，无需管理员，安装器不自动提权。若自定义 prerequisite 或 hook 要求管理员权限，应用作者应选择合适的安装方式、参数和用户提示；该配置不会自动获得管理员权限。

Default installation, uninstall and startup registration use current-user permissions without administrator access. Setup never elevates automatically. If a custom prerequisite or hook needs administrator privileges, the app author must configure its installation method, arguments and user guidance; configuration itself does not grant those privileges.

当前不支持覆盖安装或原地升级：目录已有安装记录，或同一 application.id 已登记时，须先卸载。卸载保留安装后新增的文件以及 SHA-256 已改变的拥有文件，仅删除记录中仍匹配的文件和空目录；不递归删整个目录。若保留文件使目录非空，下次安装应选新/空目录，或由用户自行处理保留内容。

Overwrite installation and in-place upgrades are not supported. Existing ownership metadata or the same registered application id requires uninstall first. Uninstall preserves newly added files and owned files whose SHA-256 changed, removing only matching recorded files and empty directories, without recursively deleting the destination. If retained files leave it nonempty, use a new/empty directory or let the user manage retained content before reinstalling.

运行中的 `uninstall.exe` 退出后，由临时目录的 PowerShell 脚本延迟自删除。辅助进程使用短 `-File` 调用，安装长路径保存在 JSON 清单中；先校验清单哈希并等待卸载进程及 onefile 启动器退出，再校验文件拥有哈希和路径安全性，只删除匹配的拥有文件与空目录，保留新增或修改过的用户文件。

A temporary PowerShell script handles self-deletion after the running `uninstall.exe` exits. A short `-File` invocation keeps long installation paths in a JSON manifest. The helper verifies its manifest hash, waits for the uninstaller and onefile bootloader to exit, then checks owned-file hashes and path safety, deleting only matching owned files and empty directories while preserving added or modified user files.

安装日志和拥有记录分别为目标目录的 `.ewp-installer.log` / `.ewp-install-state.json`。失败时回滚本事务复制的文件和登记的注册表值；**任意外部命令的副作用无法回滚**，包括外部运行库安装、hook 新建文件、其他目录/注册表修改及启动进程。进程崩溃可能留下锁标记，确认安装器停止后再处理；不要删除拥有记录来绕过升级限制。

The target holds `.ewp-installer.log` and `.ewp-install-state.json`. Failure rolls back files copied and registry writes recorded by the transaction. **Arbitrary external command side effects cannot be rolled back**, including external runtime installations, hook-created files, changes outside tracked paths/registry entries and started processes. A crash can leave a lock marker; confirm setup has stopped before handling it. Do not delete ownership metadata to bypass the upgrade restriction.

## 安装器 CLI / Setup CLI

双击 setup 或运行无 `--silent` 的命令默认打开 GUI；不会读取 stdin。main 支持以下参数，没有额外的 `/S`、`--yes` 或提权选项。

Double-clicking setup, or invoking it without `--silent`, opens the GUI and never reads stdin. Its main parser accepts the following flags, without additional `/S`, `--yes`, or elevation options.

冻结打包的 EXE 文件名为 `uninstall.exe`（忽略大小写）时，无 `--uninstall` 也自动进入卸载模式：双击打开卸载 GUI，仅传 `--silent` 则静默卸载。未显式指定目录时使用该 EXE 的父目录，进入 GUI 或删除文件前必须校验该目录的有效拥有记录；缺失记录或记录属于其他目录时失败。非冻结运行及其他 EXE 名称仍需 `--uninstall`。HKCU 的卸载与静默卸载登记命令继续显式携带 `--uninstall`。

A frozen executable named `uninstall.exe` (case-insensitive) automatically enters uninstall mode without `--uninstall`: double-click opens its uninstall GUI, and `--silent` alone uninstalls silently. Without an explicit directory it uses that EXE's parent, whose valid ownership metadata is checked before opening the GUI or deleting files. Missing metadata or metadata belonging to another directory fails. Non-frozen runs and other executable names still require `--uninstall`. HKCU uninstall and quiet-uninstall commands continue to include explicit `--uninstall`.

| 参数 / Flag | 含义 / Meaning |
| --- | --- |
| `--silent` | 不打开 GUI，成功退出 0，异常退出 1 / No GUI, exit 0 on success and 1 on failure |
| `--install-dir PATH` | 指定安装/卸载目录 / Install or uninstall directory |
| `--features ID1,ID2` | 安装功能选择；省略使用 default，空值关闭可选功能，required 仍保留 / Feature IDs; omission uses defaults, empty disables optional features, required remains selected |
| `--options ID1,ID2` | postInstall id 选择；省略用 default，空值关闭 defaults / Post-install IDs; omission uses defaults, empty disables defaults |
| `--uninstall [DIRECTORY]` | 卸载；目录优先级为此参数值 → install-dir → 正在运行 EXE 的父目录 / Uninstall; directory precedence is this value, install-dir, then running EXE's parent |
| `--payload ZIP` | 测试/外部 payload；setup 通常使用内嵌 payload.zip / Test/external payload; normal setup uses embedded payload.zip |

```powershell
.\my-app-setup.exe --silent --install-dir "D:\Apps\My App" --features examples --options launch
.\my-app-setup.exe --silent --install-dir "D:\Apps\My App" --features= --options=
& "D:\Apps\My App\uninstall.exe" --uninstall --silent --install-dir "D:\Apps\My App"
```

GUI 中这些选择参数设置初始状态，用户仍可修改非必选项。silent 使用相同安装逻辑，也执行已选的 startup/launch/settings 行为；无人值守时若不希望启动应用，显式关闭 launch。Windows 应用列表中的卸载登记位于 HKCU；运行中的 uninstaller 自删除在退出后按拥有哈希延迟清理。

In the GUI these selection flags initialize controls; users can still change optional choices. Silent mode uses the same logic and applies selected startup/launch/settings actions; explicitly disable launch when unattended execution must not start the app. Windows uninstall registration lives in HKCU. A running uninstaller schedules hash-checked self-cleanup after exit.

## Python wheel、CLI 与 API / Python wheel, CLI and API

0.3.0 源码包新增 [packaging.py](../backend/base/ewpcore/packaging.py) 与 [installer.py](../backend/base/ewpcore/installer.py)，wheel 的公开导入名仍为 `easy_windows_pack`，console script 仍为 `easy-windows-pack`。顶层 [公共导出](../backend/base/ewpcore/__init__.py) 增加 `load_pack_config`、`validate_pack_config`、`build_application`、`build_installer`、`build_package`、`validate_pe`。安装后逻辑可从 `easy_windows_pack.installer` 导入 `install` / `uninstall`；它们不是顶层导出。

The 0.3.0 sources add packaging.py and installer.py. Wheels retain import namespace `easy_windows_pack` and console script `easy-windows-pack`. New top-level exports are `load_pack_config`, `validate_pack_config`, `build_application`, `build_installer`, `build_package`, and `validate_pe`. Import runtime `install` / `uninstall` from `easy_windows_pack.installer`; they are not top-level exports.

本地构建并安装包含这些模块的 wheel 后，可从项目外指定应用根目录；配置相对该根目录解析，产物仍写入它的 output 分类目录。Python CLI 自动使用它能识别的项目 frontend 构建入口；没有该入口时需预先提供 `output/frontend/index.html`，并提供 `backend/src/demo.py`。PyInstaller 暂存优先使用具有 `__init__.py` 的项目 `backend/base/ewpcore/`；缺失时复制当前加载的已安装 `easy_windows_pack` 包目录，无需在应用项目中复制框架源码。只复制所选核心包的文件树，排除 Python 字节码和缓存；不会复制其父级 site-packages 或项目中同名的旧包目录。

After building and installing a local wheel containing these modules, use an explicit app root from outside the project. Config paths and categorized output resolve against that root. Python CLI uses a recognized project frontend build entry; otherwise provide precompiled `output/frontend/index.html` and `backend/src/demo.py`. PyInstaller staging prefers project `backend/base/ewpcore/` when it has `__init__.py`; otherwise it copies the currently loaded installed `easy_windows_pack` package directory, so app projects need no local framework source copy. Only the selected core package tree is copied, excluding Python bytecode and caches; its parent site-packages and stale project directories with the public package name are excluded.

```powershell
easy-windows-pack app --project-root "D:\Projects\My App" --mode onedir
easy-windows-pack installer --project-root "D:\Projects\My App" --config ewp.pack.json --mode onefile
```

`app`（别名 `exe`）和 `installer` 均支持 `--project-root`、`--config`、`--mode`、`--installer`、`--lang zh-CN|en`；app 的 `--installer` 强制附带 setup。底层 Python CLI 的 `build` 仍是 test → wheel → source bundle，不是这些 app 构建任务。`--lang` 控制构建输出，安装器语言来自 `installer.language`。

`app` (alias `exe`) and `installer` accept `--project-root`, `--config`, `--mode`, `--installer`, and `--lang zh-CN|en`; app's installer flag forces setup creation. Low-level Python CLI `build` still runs tests → wheel → source bundle, separately from app tasks. Build output uses `--lang`; setup language comes from `installer.language`.

最小公开 API 示例：先编译前端，再构建。API 本身不启动 Vite；`build_package` 返回 Path 值的字典，包含 `application`，需要时包含 `installer`。

Minimal public API example: compile the frontend first. The API does not invoke Vite. `build_package` returns a dictionary of Path values containing `application`, plus `installer` when requested.

```python
from pathlib import Path
from easy_windows_pack import build_package

artifacts = build_package(Path(r"D:\Projects\My App"), mode="onedir", installer=True)
print(artifacts["application"])
print(artifacts["installer"])
```

## WebView 与旧 Windows / WebView and older Windows

Windows 桌面使用 pywebview 的 WebView2 路径。pack 配置可下载并配置应用作者选定、校验过的兼容运行库，但不会把任意“WebView3”或其他引擎变成框架支持的后端，也不会自动适配 Win7。旧运行库的版本、分发方式与加载路径需由应用自行验证；仅下载到 runtime 目录不等于 pywebview 已选用它。

Windows desktop uses pywebview's WebView2 path. Pack configuration can download and configure an author-selected, verified compatible runtime; it does not make arbitrary “WebView3” or other engines supported backends or automatically adapt the app to Windows 7. Verify runtime version, redistribution and loading configuration for your app. Downloading it into runtime alone does not make pywebview select it.

Python >=3.10、pywebview、PyInstaller 和现有 Win32/窗口 API 的系统要求仍适用。配置旧版兼容运行库不改变这些限制，本项目不保证 Win7 或其他旧系统兼容；onefile/onedir 也不改变目标 OS 支持范围。

System requirements of Python >=3.10, pywebview, PyInstaller and existing Win32/window APIs still apply. An older runtime does not remove these constraints. Windows 7 and other old systems are not guaranteed, and onefile/onedir does not change supported target OS requirements.