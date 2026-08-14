# dsh-find-plugin [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

[English](README.md) | 中文

**一个用来找插件的插件**——就像 skills.sh 的 [`/find-skills`](https://skills.sh)，DSH 版。

想要什么能力，直接跟 agent 说（比如"任务完成时给我发微信通知"），它就去
GitHub 上的 DSH 插件生态里帮你搜——按 star 排序，每条带一句话说明和安装
命令。

<img src="https://raw.githubusercontent.com/awesome-dsh-plugin/dsh-find-plugin/main/assets/demo-zh.png" alt="find_dsh_plugin 实际效果" width="640">

## 安装

```sh
# npm 包（预构建，推荐）
dsh plugin --profile web add dsh-find-plugin

# 或从 GitHub 安装
dsh plugin --profile web add github:awesome-dsh-plugin/dsh-find-plugin
```

## 使用

安装后重启 `dsh web`，然后直接跟 agent 对话即可——需要找插件时它会自己调用
`find_dsh_plugin`：

- "有什么终端 TUI 插件？"
- "我想任务完成时收到微信通知，有插件吗？"
- "找个能在 DSH 里做 git diff 审查的东西。"

每条结果都带 star 数、功能描述、仓库链接和可直接执行的 `dsh plugin add`
安装命令——让 agent 帮你装，它可以直接替你执行。

## 工作方式

- 实时搜索打了官方 `dsh-plugin` topic 的 GitHub 仓库，按 star 数降序
  （每查询 5 分钟缓存，匿名 API）。
- 命中 [awesome-dsh-plugin](https://awesome-dsh-plugin.com) 精选列表的仓库，
  会换用列表中人工撰写的双语描述（`lang` 参数选择语言），排序不受影响。
- 每条结果附可直接执行的 `dsh plugin add` 安装命令；插件均为第三方代码，
  请自行审阅源码并锁定 commit。

## 许可

MIT © awesome-dsh-plugin
