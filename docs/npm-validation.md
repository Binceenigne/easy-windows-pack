# npm / Vite 验收记录 / npm / Vite validation

[文档导航 / Documentation](README.md) · [完整指南 / Guide](npm-vite.md)

2026-10-08，Windows 11、Node 22.22.2、npm 10.9.7、Python 3.12.10、Vite 7.3.7。本记录属于 npm/Vite 迁入，旧目录迁移记录不作为本次运行证据。

## 实际结果 / Executed checks

| 范围 / Scope | 结果 / Result |
| --- | --- |
| Python unittest | 89 passed，包含首次初始化顺序、失败停止、JS dispatcher 异常恢复 / Includes clean initialization and dispatcher recovery |
| npm runtime / creator | 31 passed；测试套件中的可选旧集成入口跳过一次，独立 pack 集成完整执行 / Optional legacy integration skipped; dedicated pack integration executed |
| `npm run test:pack` | 8/8 passed：实际安装两份 tarball，六模板独立安装、Vite 构建、Chrome 交互与生命周期 / Both real tarballs installed; all six templates built and exercised |
| TypeScript | Vanilla TS、Vue TS、React TS 类型检查通过 / All three TS templates passed |
| HMR | Vue JS/TS 文案更新和恢复，无整页刷新，计数状态保留 / Updates and restore without reload or state loss |
| `npm run dev -- --no-open` | Vite 动态 URL 传入 pywebview，ready/loaded 触发；退出后端口关闭 / Dynamic URL and bridge ready confirmed, port closed on exit |
| 首次创建与初始化 / First run | 新 tarball 创建空项目，无 output/frontend；npm install → Vite build → pip editable install 成功 / Fresh app initialized without pre-existing assets |
| wheel | 根框架及独立 Vue 应用构建通过；应用 wheel 的编译资源与 Vite 输出逐字节相同 / Framework/app wheels built; app assets inspected |
| 默认 EXE / Default EXE | 根项目及独立生成项目 `npm run build` 通过；归档只携带 output/frontend 编译资源 / Both builds passed; compiled assets verified |
| 原生窗口 / Native window | 首装生成 Vue EXE 窗口可见、响应正常，964×641；渲染交互由 Chrome 集成单独验证 / Responsive native window; rendered interactions tested separately in Chrome |
| 锁文件 / Lockfile | 干净 npm ci 通过；包含 Windows/Linux 的 esbuild、Rollup optional 包 / Clean npm ci and both platform entries checked |
| Registry | 未执行 npm publish；包名所有权与 registry 安装由发布者确认 / No publication; publisher verifies names and registry installation |

## 可重复命令 / Reproduction

```powershell
npm ci
npm run test:npm
npm run test
npm run pack:npm
npm run test:pack
node tests/npm-first-run.integration.mjs
npm run build -- -w
npm run build
```

pack 验收脚本从 `output/npm` 的 tarball 安装，不借用仓库源码。报告与日志写入忽略目录 `build/npm-pack-validation` 和 `build/npm-first-run`；前者覆盖六模板，后者覆盖无预编译资源的首次 init、wheel、EXE、归档比对和原生启动。运行验收需要本机 Chrome 与 Playwright；脚本支持环境变量选择工具路径，具体见脚本头部。

Pack checks install tarballs rather than importing repository runtime sources. Reports live under ignored build directories. The six-template suite and first-run suite are separate; the latter verifies clean initialization, both artifacts and native startup. Chrome and Playwright are needed for browser validation.

发包顺序与命令见 [npm / Vite 指南](npm-vite.md)。Vite 只编译前端；Python 可执行文件仍由 PyInstaller 生成，Vite 构建速度不代表完整 EXE 编译速度。

See the [guide](npm-vite.md) for publication order. Vite compiles frontend assets; PyInstaller still packages the executable. Frontend build time is not the total EXE build time.