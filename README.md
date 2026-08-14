# dsh-find-plugin [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

English | [中文](README.zh.md)

Find DeepSeek Harness plugins without leaving the agent.

Registers a `find_dsh_plugin` tool: a live GitHub search over the public
`dsh-plugin` topic, ranked by stars. Ask the agent for a capability ("notify
me on WeChat when a task finishes"), and it returns matching plugins with
install commands.

## Install

```sh
# from npm (prebuilt, recommended)
dsh plugin --profile web add dsh-find-plugin

# or from GitHub
dsh plugin --profile web add github:awesome-dsh-plugin/dsh-find-plugin
```

## How it works

- Live GitHub repository search scoped to the official `dsh-plugin` topic,
  re-ranked by stars (5-minute per-query cache, anonymous API).
- When a result is also listed on
  [awesome-dsh-plugin](https://awesome-dsh-plugin.com), its hand-written
  bilingual description from `plugins.json` replaces the GitHub one (the
  `lang` parameter picks the language) — ranking is untouched.
- Every result comes with a ready-to-run `dsh plugin add` command. Plugins
  are third-party code — review the source and pin a commit.

## License

MIT © awesome-dsh-plugin
