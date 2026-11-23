# ShotWeft 项目扩展接口约定

## V1.0 网页项目边界

V1.0 提供项目快照类型。
类型定义位于 `src/project-snapshot.ts`。
`readProject(id)` 在同一事务读取项目和素材。
现有导出功能使用这一入口。
快照包含 `Project` 与关联 `Asset`。
快照中的媒体以 Blob 表示。
应用通过 `editProject` 保存可撤销编辑。
编辑事务统一处理项目、素材和历史。
备份恢复通过 `importProject` 建立新项目。

## V1.5 Agent CLI 边界

- Agent CLI 已支持本地剧本规则拆解、场景和镜头编辑、JSON/ZIP/PDF 导出、ZIP 恢复，以及 ZIP 和可选 PDF 的只读验证。外部集成使用 `project show`、`scene list`、`shot list`、`export json` 或 `agent verify` 等 CLI 读取入口，按非交互 JSON 和退出码契约处理结果。参见 [Agent 分镜指南](AGENT.md)。
- CLI 是 Agent 与外部集成写入项目 ZIP 的稳定边界，统一处理清单和引用校验、目标锁与暂存发布。编辑原 ZIP 使用原子替换，创建和导出拒绝覆盖。网页编辑继续使用本地 IndexedDB 事务及撤销记录。
- LLM 智能分析、多 Agent 和 MCP 为后续可选扩展。智能分析只提交候选，由本地审核与校验后通过 CLI 写入。MCP 可封装现有读写命令，须遵守同样的授权、校验、锁和事务边界。CLI 核心流程无需 MCP。参见 [P3 智能能力技术方案](AGENT_INTELLIGENCE.md)。
