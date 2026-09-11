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
  （每查询 5 分钟缓存）。
- 命中 [awesome-dsh-plugin](https://awesome-dsh-plugin.com) 精选列表的仓库，
  会换用列表中人工撰写的双语描述（`lang` 参数选择语言），排序不受影响。
- 每条结果附可直接执行的 `dsh plugin add` 安装命令；插件均为第三方代码，
  请自行审阅源码并锁定 commit。

### 限流与离线兜底

GitHub **搜索**接口在未认证时只有 **10 次/分钟/公网 IP** 的额度，且该额度由同一出口 IP
背后的所有主机共享（运营商 CGNAT、公司 NAT…），因此搜索可能因你无法控制的原因返回
`HTTP 403`。插件因此做了三件事：

- 配置了 **DSH 的 `GITHUB_TOKEN` 凭据**时会使用它（30 次/分钟、按账号计数，不受共享
  IP 影响）。这是可选项——不配也能用，只是更接近匿名上限；
- 遇到限流（403/429）或请求失败时先重试一次，仍失败则**降级而非报错**：改用 curated
  列表的关键词匹配，并在结果末尾的 note 里说明；
- 把 curated 列表缓存到磁盘（`$DSH_HOME/cache/dsh-find-plugin/`）并用
  `If-None-Match` / `If-Modified-Since` 重新验证，因此重启和离线时用的是完整的
  ~3400 条列表，而不是随包发布的小快照。

## 开发

```sh
npm run typecheck                     # tsc --noEmit
npm test                              # 离线用例（mock fetch）
FINDP_LIVE=1 npm run test:live        # 可选：真实网络用例
```

## 许可

MIT © awesome-dsh-plugin
