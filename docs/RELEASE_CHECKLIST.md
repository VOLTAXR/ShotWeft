# ShotWeft V1.5 发布检查清单

## 发布前验证

- [ ] GitHub Actions 的 Linux 与 Windows job 在待发布提交上均通过。Linux 跑完整回归，两个平台均以 `SHOTWEFT_REQUIRE_PDF=1` 验证安装后的真实 PDF 导出、页数及每页 JPEG。
- [ ] 原生 Windows 和 Linux 安装验收通过，打开各自生成的真实 PDF，抽查中文文字可读。Windows 完整 CLI 回归需要文件符号链接权限，CI 使用安装包验收覆盖 Windows 的 CLI 和 PDF 工作流。
- [ ] 检查 tarball 白名单。应有 CLI 构建产物、README、`package.json`、Agent 指南、V1.5 发布准备说明、素材来源、示例 JPEG 和第三方声明。安装包验收须确认 `private: true`，扫描开发机路径并拒绝源码、截图、依赖目录、临时目录及 `.bak`。
- [ ] 下载对应 job 的产物，对照 `release-manifest.json` 核对文件名、字节数和 SHA256，并用 `SHA256SUMS.txt` 独立校验实际 tarball。核对安装说明、包版本和 Node.js 最低版本。见 [V1.5 发布准备说明](RELEASE_NOTES_V1.5.md)。

## 待用户确认

- [ ] 确认现有 `main` 与 `v1.5.0` 标签的发布策略，以及是否需要新的目标分支。
- [ ] 确认 ShotWeft 适用的项目许可证及第三方依赖和演示素材的分发条件。来源见 [发布参考资料及许可](RELEASE_REFERENCES.md) 和 [演示素材来源](MEDIA_SOURCES.md)。
- [ ] 明确授权正式 GitHub Release 的目标提交、标签是否及如何使用，以及附件。当前任务范围为 CI 与本地发布准备，npm 误发布仍由 `private: true` 阻止。
