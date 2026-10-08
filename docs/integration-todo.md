# Historical integration checklist / 历史集成清单

[Documentation / 文档导航](README.md) · [Historical validation / 历史验收](integration-validation.md)

The checked items below belong to the original integration task recorded in
September 2026. They are retained as task history, not the completion status of
the current layout migration or build-menu work. Current commands and paths live
in [development.md](development.md) and [architecture.md](architecture.md).

以下勾选保留原集成任务历史，不代表本次迁移已测试、构建、提交或推送。

- [x] Read API_TOOLS WebApi, RPC allowlist, settings, updates and matrix source.
- [x] Read TurtleClaw desktop bridge, updater, process launcher and entry UI.
- [x] Add optional allowlisted adapters without changing window dispatch.
- [x] Add framework-free matrix, curtain, entrance and update client.
- [x] Run Python and frontend regression tests and browser checks.
- [x] Build wheel and bundle; inspect packaged assets.
- [x] Update bilingual documentation and examples.
- [x] Commit only task files to the independent repository.
- [ ] Historical push attempt: at the time, GitHub HTTPS connection reset / port 443
	failure blocked normal Git, HTTP/1.1 and Git integration. This unchecked entry is
	retained from that task and does not describe the current remote state.

当时推送受网络错误阻塞属于历史记录；当前分支、远程和 CI 状态需实时核对，不能由本清单推断。