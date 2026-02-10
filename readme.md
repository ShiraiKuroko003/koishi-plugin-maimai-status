# koishi-plugin-maimai-status

[![npm](https://img.shields.io/npm/v/koishi-plugin-maimai-status?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-maimai-status)

一个用于在 Koishi 中查询舞萌 DX 服务器状态的轻量插件。

## 功能
- 查询舞萌 DX 服务器当前状态
- 上报至群聊/私聊，提前知晓服务器状况，避免白跑机厅一趟

## 安装
1. 在 Koishi 插件市场搜索 `koishi-plugin-maimai-status`，点击安装。
2. 或使用 npm 安装：

	 ```bash
	 npm install koishi-plugin-maimai-status
	 ```
## 指令
- `有网吗`：查询一次服务器状态并返回网页截图。

## 更新日志

详见 [CHANGELOG.md](./CHANGELOG.md)

## 计划功能
- [ ] 将截图细分为简略版和详细版，默认截图简略版以快速获取状态和减轻服务器压力
- [ ] 提供文字播报功能，未来将作为默认选项，网页截图功能将保留，作为详细播报选项

## 已知问题
- 某些网络环境下可能超时

## 鸣谢
- uptime-kuma & uptime-kuma-api

欢迎提交 Issue / PR 讨论改进。

