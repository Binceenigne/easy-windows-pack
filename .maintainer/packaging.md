# 应用与安装包 / Application and installer packaging

[维护导航](README.md) · [开发命令](development.md) · [完整双语原文](history.md)

## 构建与产物

在 frontend 运行 npm run init 后，`npm run app` 按根 ewp.pack.json 构建；`npm run installer` 强制附带 setup；`npm run build -- --mode onedir` 也进入配置构建。`--mode onefile|onedir`、`--config`、`--installer` 可传给 build/exe/完整构建的 EXE 阶段，不能与 wheel 目标组合。无这些参数的 legacy build/exe 保持 output/exe，不由默认配置改变行为。

onefile 输出 output/apps/<id>.exe；onedir 输出 output/apps/<id>/，必须分发整个目录；setup 为 output/installers/<id>-setup.exe。setup 和内嵌 uninstall.exe 自身始终 onefile，onedir 安装时平铺到安装目录。前端先编译，生产只用 output/frontend；spec/暂存进入 build，日志进入 output/logs。

## 配置契约

生成器默认 schemaVersion=1，应用版本 0.1.0（与框架版本独立），onefile、installer=false，所选 installer.language，空 features/prerequisites/hooks，默认不选的 startup/launch。Python 默认配置缺失时用内存默认值，不创建文件；显式 --config 缺失报错，路径相对项目根且不可越界。

| 字段 | 约定 |
| --- | --- |
| schemaVersion | 整数 1 |
| application | id、name、version；id 决定 EXE、默认目录及注册表身份 |
| build | mode 为 onefile/onedir，installer 为 boolean |
| installer | language 为 zh-CN/en，另可有 welcome、defaultDirectory、files |
| features | id、name、description、default、required、files；后两布尔默认 false |
| prerequisites | 经哈希验证的下载及显式 commands，见下文 |
| hooks | beforeInstall、afterInstall、beforeUninstall、afterUninstall 四个 argv 数组集合 |
| postInstall | id、name、type、default；setting 另有 key/value |

schema 严格拒绝未知字段。application/installer/postInstall 不支持 description，欢迎语用 installer.welcome。id 长 1–80，只允许 ASCII 字母数字、下划线、点和连字符，首字符字母数字；拒绝设备名、末尾点及 application.id=uninstall。source/destination 使用安全相对路径，拒绝绝对路径、..、links/junction、大小写冲突和保留路径。

files 条目为 `{ "source": "resources/examples", "destination": "examples" }`，source 可为文件或目录并留在项目根，destination 相对安装目录。installer.files 始终安装；features 的文件全部进入 setup，安装时按选择复制，required 始终选中。构建检查所有功能组合与应用/共有文件间的冲突。source bundle 保留安全配置引用和嵌套空目录，以便解压重建，仍排除生成物及依赖目录。

## 功能文件与 GUI / Feature files and GUI

tkinter/ttk 安装步骤：目录 → 功能（有则）→ 按已选功能过滤的依赖（有则）→ 安装后选项（有则）→ 确认 → 进度 → 完成。返回保留输入与选择，required 锁定，空步骤跳过；下载确认后开始。运行时不允许返回/取消；成功仅完成，失败允许重试或返回确认。卸载为确认 → 进度 → 完成。GUI 和 silent 共用引擎。

language 只翻译内置控件、阶段和下载单位，作者提供应用名、welcome、功能及选项名称；具体错误原因、warning、CLI/磁盘日志保留原文。

## 运行库、hooks 与选项

prerequisite 支持 id/name、urls/mirrors、mirrorApi、sha256、type、destination、filename、features、commands、check。至少提供静态 URL 或 mirrorApi，并提供 64 位十六进制 SHA-256；HTTP(S) 不允许嵌入凭据。mirrorApi 返回 `{ "urls": ["https://..."] }`，动态 URL 优先，失败回退静态列表，去重后按顺序尝试；所有镜像匹配同一哈希。

| 字段 | 行为 |
| --- | --- |
| type | zip 安全解压；file/exe 复制下载文件，exe 不自动执行 |
| destination | 只能为 runtime/<id>，省略也取此值 |
| filename | 安全文件名；默认随类型使用 .zip/.bin/.exe |
| features | 空/省略始终运行，非空则任一关联功能选中时运行 |
| check | 安装目录内文件存在就跳过下载和 commands，不检查系统运行库版本 |
| commands | argv 数组的数组，按顺序执行 |

默认网络 timeout 20 秒、每 URL 2 次、单次下载 512 MiB、解压上限 2 GiB、命令 timeout 300 秒；可由 Python install() 关键字参数覆盖，不是 JSON/CLI 字段。

hooks 与 commands 均按 argv 字面替换，不走 shell、不接受 .bat/.cmd，不展开环境表达式。每参数一个数组元素，无需嵌套引号；非零退出/超时失败。占位符：{installDir} 安装根，{executable} 应用 EXE，{runtimeDir} 当前依赖目录（hooks 为根 runtime），{download} 临时下载文件（hooks 为空）。hook 工具需通过 installer.files 等提供。

安装顺序：复制已选文件 → beforeInstall → prerequisites → 写设置 → afterInstall → HKCU 登记 → 提交 → 可选 launch。beforeInstall 时文件已复制。卸载 beforeUninstall → 清理拥有文件/注册表 → afterUninstall；直接引用的 hook 文件保留到该阶段完成。卸载 hooks 应幂等，失败重试只继续未完成阶段。

postInstall 的 startup 写当前用户 HKCU Run，launch 在提交后启动（失败仅 warning），二者最多各一项；单数 `setting` 将唯一 key 与有限 JSON value 写入 ewp-options.json，应用自行读取。default 省略为 false；省略选择用默认值，显式空选择关闭可选默认项。

## 目录、权限与卸载

默认 `%LOCALAPPDATA%\Programs\<id>`；installer.defaultDirectory 展开环境变量/~ 后须为绝对路径。CLI 目录优先级 --install-dir → EWP_INSTALL_DIR → config/default。目标须新建/空且当前用户可写，不自动提权。自定义外部运行库命令的权限由应用作者负责。

不支持覆盖或原地升级；已存在拥有记录或相同 application.id 登记时先卸载。卸载只删除记录中哈希仍匹配的文件与空目录，保留新增/修改文件，不递归删除安装根。拥有记录 .ewp-install-state.json，日志 .ewp-installer.log；失败回滚本事务跟踪的文件与注册表，**外部命令副作用不可回滚**。崩溃锁需确认进程停止后处理，不能删拥有记录绕过升级规则。

uninstall.exe 退出后通过短 PowerShell -File 调用及 JSON 清单自删除：先校验清单哈希，等待卸载进程和 onefile 启动器退出，再检查路径/拥有哈希，保留用户文件。完整长路径约定及历史验证见 [验收](npm-validation.md)。

## 安装器 CLI

无 --silent 默认 GUI，不读 stdin，不支持额外 /S、--yes 或提权开关。冻结 EXE 名称为 uninstall.exe（不区分大小写）会自动进入卸载，默认用 EXE 父目录并在打开 GUI/删除前验证拥有记录；非冻结或其他名字仍需 --uninstall。HKCU 登记继续显式使用 --uninstall。

| 参数 | 含义 |
| --- | --- |
| --silent | 不开 GUI，成功 0、异常 1 |
| --install-dir PATH | 安装/卸载目录 |
| --features ID1,ID2 | 省略用 defaults，空值关闭可选项，required 保留 |
| --options ID1,ID2 | 省略用 defaults，空值关闭默认选项 |
| --uninstall [DIRECTORY] | 参数目录 → install-dir → 正在运行 EXE 父目录 |
| --payload ZIP | 测试/外部 payload；通常使用内嵌 payload.zip |

GUI 将选择参数用作初始值；silent 仍执行所选 startup/launch/setting，无人值守不想启动时显式关闭 launch。

## Python wheel、CLI 与 API / Python wheel, CLI and API

公开顶层 API：load_pack_config、validate_pack_config、build_application、build_installer、build_package、validate_pe；install/uninstall 从 easy_windows_pack.installer 导入。API 本身不调用 Vite，先提供编译前端。`build_package(Path(project), mode="onedir", installer=True)` 返回 Path 字典，包含 application，必要时含 installer。

`easy-windows-pack app --project-root "D:\Projects\My App" --mode onedir`；installer 使用同样的 --project-root、--config、--mode、--installer、--lang。构建输出语言来自 --lang，setup 来自 installer.language。底层 build 仍是 test → wheel → bundle。

CLI 使用项目可识别的前端编译入口；没有则先提供 output/frontend/index.html 与 backend/src/demo.py。PyInstaller 暂存优先项目核心包，缺失时仅复制已加载 easy_windows_pack 包目录，不复制整个 site-packages 或同名旧目录。

Windows 使用 pywebview WebView2；下载旧运行库不等于它已被选中，也不增加其他引擎、Win7 或 macOS 原生打包支持。Python/pywebview/PyInstaller 的系统要求仍适用。权威实现见 [packaging.py](../backend/base/ewpcore/packaging.py)、[installer.py](../backend/base/ewpcore/installer.py)；本指南是原文压缩，不宣称重新验证这些行为。