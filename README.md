# dsh-find-plugin [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

Find DeepSeek Harness plugins without leaving the agent. / 在会话里直接搜索、发现 DSH 插件。

Registers a `find_dsh_plugin` tool backed by the curated
[awesome-dsh-plugin](https://awesome-dsh-plugin.com) registry — every entry is
human-verified. Ask the agent for a capability ("notify me on WeChat when a
task finishes", "找个终端 TUI"), and it returns matching plugins with install
commands.

## Install / 安装

```sh
# from npm (prebuilt / 预构建，推荐)
dsh plugin --profile web add dsh-find-plugin

# or from GitHub
dsh plugin --profile web add github:awesome-dsh-plugin/dsh-find-plugin
```

## How it works / 工作方式

- Data comes from the public registry `https://awesome-dsh-plugin.com/plugins.json`
  (1-hour in-memory cache, bundled snapshot as offline fallback).
- Search is a simple token scorer over names, owners, categories, and bilingual
  descriptions — the agent does the actual recommending.
- Categories: `ui` · `session` · `tools` · `workflow` · `notify` · `dev` · `fun`.

## License

MIT © awesome-dsh-plugin
