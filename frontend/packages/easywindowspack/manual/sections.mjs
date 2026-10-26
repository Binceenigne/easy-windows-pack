const headings = {
  'quick-start': [[0, 'requirements', '开始之前', 'Before you start'], [1, 'create', '创建与首次运行', 'Create and run'], [3, 'cli', '全局与项目内命令', 'Global and project commands']],
  creator: [[0, 'templates', '前端模板与后端', 'Templates and backends'], [2, 'options', '创建参数', 'Creator options'], [3, 'examples', '命令示例', 'Examples']],
  environment: [[0, 'requirements', '所需环境', 'Requirements'], [4, 'overrides', '自定义工具路径', 'Custom tool paths']],
  commands: [[0, 'entry', '命令入口', 'Command entry points'], [1, 'reference', '任务速查', 'Task reference'], [4, 'docs', '离线文档与 npm', 'Offline documentation and npm']],
  development: [[0, 'commands', '启动开发会话', 'Start a development session'], [1, 'hmr', '热更新与进程生命周期', 'HMR and process lifecycle'], [2, 'production', '生产预览与桌面演示', 'Production preview and desktop demo'], [3, 'entries', '应用入口与验证边界', 'Application entries and validation limits']],
  'window-frame': [[0, 'mount', '挂载窗口外壳', 'Mount a window frame'], [2, 'options', '窗口参数', 'Window options'], [3, 'cleanup', '更新与释放', 'Update and dispose']],
  bridge: [[0, 'exports', '公开导出', 'Public exports'], [2, 'calls', '调用示例', 'Calling the host'], [3, 'host', '宿主契约与信任边界', 'Host contract and trust boundaries']],
  'desktop-components': [[0, 'setup', '导入与页面结构', 'Imports and page structure'], [2, 'lifecycle', '创建与生命周期', 'Creation and lifecycle'], [3, 'reference', '组件能力', 'Component reference']],
  updates: [[0, 'client', '创建更新客户端', 'Create an update client'], [2, 'methods', '方法与状态轮询', 'Methods and state polling']],
  capabilities: [[0, 'matrix', '后端支持矩阵', 'Backend support matrix'], [2, 'limits', '当前能力边界', 'Current limitations']],
  packaging: [[0, 'formats', '三种交付形态', 'Three distribution formats'], [1, 'commands', '构建命令', 'Build commands'], [2, 'outputs', '命令与输出路径', 'Commands and output paths'], [3, 'runtime', '安装后的运行方式', 'Runtime after installation']],
  configuration: [[0, 'example', '基础配置示例', 'Basic configuration'], [2, 'fields', '字段说明', 'Field reference'], [3, 'validation', '校验与路径约束', 'Validation and path constraints']],
  'advanced-installer': [[0, 'files', '功能与安装文件', 'Features and installation files']],
  outputs: [[0, 'layout', '项目目录与产物', 'Project layout and artifacts'], [1, 'bundle', '源码包边界', 'Source bundle boundaries']],
  validation: [[0, 'commands', '运行检查', 'Run checks'], [1, 'coverage', '检查覆盖范围', 'Validation coverage'], [2, 'limits', '桌面验收边界', 'Desktop acceptance limits']],
  troubleshooting: [[0, 'solutions', '常见问题', 'Common problems'], [1, 'nsis', 'NSIS 与日志示例', 'NSIS and logging examples'], [2, 'diagnostics', '收集诊断信息', 'Collect diagnostics']],
  preferences: [[0, 'language', '语言优先级', 'Language precedence'], [2, 'terminal', '终端颜色与进度', 'Terminal colors and progress'], [3, 'manual', '文档交互与主题', 'Manual navigation and themes'], [4, 'offline', '离线与无脚本阅读', 'Offline and script-free reading']],
  'ai-reading': [[0, 'formats', '可读取的原始格式', 'Machine-readable formats'], [1, 'print', '终端输出', 'Terminal output'], [2, 'workflow', '使用文档前确认项目能力', 'Check project capabilities first']]
};

export function structureGuide(guide) {
  return { ...guide, sections: guide.sections.map(section => {
    const additions = headings[section.id] ?? [];
    return { ...section, blocks: section.blocks.flatMap((block, index) => {
      const heading = additions.find(item => item[0] === index);
      return heading && block.type !== 'heading'
        ? [{ type: 'heading', id: `topic-${heading[1]}`, text: heading[guide.language === 'en' ? 3 : 2] }, block]
        : [block];
    }) };
  }) };
}
