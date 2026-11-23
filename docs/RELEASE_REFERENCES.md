# 发布参考资料及许可

记录日期为 2026-11-23。阶段二使用公开资料中的配置模式和命令用法，配置 GitHub Actions CI、产物上传和 SHA256 校验。表中许可证对应引用的上游项目或文档。ShotWeft 项目许可证待用户确认。

| 参考资料 | 许可证 | 用途 |
| --- | --- | --- |
| [actions/checkout](https://github.com/actions/checkout) | MIT，仓库 README 载明许可 | 参考 CI 检出仓库的步骤。 |
| [actions/setup-node](https://github.com/actions/setup-node) | MIT，仓库 README 载明许可 | 参考准备 Node.js 版本与 npm 缓存的配置。 |
| [actions/upload-artifact v4](https://github.com/actions/upload-artifact/tree/v4) | [MIT](https://github.com/actions/upload-artifact/blob/v4/LICENSE) | 上传各平台的 CI 产物，并在未找到产物时使步骤失败。 |
| [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) | 文档 CC BY 4.0，见 [GitHub Docs 许可](https://github.com/github/docs/blob/main/LICENSE) | 核对分支触发器、并发取消和作业配置。 |
| [GitHub Actions 安全使用](https://docs.github.com/en/actions/reference/security/secure-use)、[工作流权限](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions) | 文档 CC BY 4.0，见 [GitHub Docs 许可](https://github.com/github/docs/blob/main/LICENSE) | 核对 `contents: read`、PR 触发方式和最小令牌权限。 |
| [Playwright CI](https://playwright.dev/docs/ci)、[跨平台浏览器安装](https://playwright.dev/docs/browsers) | [Playwright 仓库 Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE) | 核对 Node 环境下的 Chromium headless shell 安装及不同 shell 的 `PLAYWRIGHT_BROWSERS_PATH` 设置。 |
| [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/)、[package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[npm uninstall](https://docs.npmjs.com/cli/v11/commands/npm-uninstall/) | [npm 文档仓库 CC BY 4.0](https://github.com/npm/documentation/blob/main/LICENSE)，[npm CLI Artistic-2.0](https://github.com/npm/cli/blob/latest/LICENSE) | 核对真实 tarball 的生成、`files` 白名单、`engines`、`private` 及全局卸载语义。 |
| [GitHub Release 管理](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)、[Release assets REST API](https://docs.github.com/en/rest/releases/assets) | 文档 CC BY 4.0，见 [GitHub Docs 许可](https://github.com/github/docs/blob/main/LICENSE) | 核对发布附件的交付方式及 API 返回的 `digest`（`sha256:`）。 |
| [GNU Coreutils SHA-2 校验](https://www.gnu.org/software/coreutils/manual/coreutils.html#sha2-utilities) | 手册 GFDL 1.3 或更高版本，见 [手册版权声明](https://www.gnu.org/software/coreutils/manual/coreutils.html#Copyright) | 核对 `sha256sum --check` 及校验文件格式。 |
| [PowerShell Get-FileHash](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash) | [文档 CC BY 4.0](https://github.com/MicrosoftDocs/PowerShell-Docs/blob/main/LICENSE.md)，[示例代码 MIT](https://github.com/MicrosoftDocs/PowerShell-Docs/blob/main/LICENSE-CODE.md) | 核对 Windows 的 SHA256 校验命令。 |
| [Vite 7 入门指南](https://v7.vite.dev/guide/)、[Vite JavaScript API](https://vite.dev/guide/api-javascript.html#preview) | [Vite MIT](https://github.com/vitejs/vite/blob/main/LICENSE)，[React MIT](https://github.com/react/react/blob/main/LICENSE) | 核对现有 React + TypeScript 项目结构、根目录 `index.html`、生产构建和测试预览服务。 |
