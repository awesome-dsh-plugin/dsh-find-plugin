# dsh-find-plugin [![awesome · DSH plugin](https://awesome-dsh-plugin.com/badge.svg)](https://awesome-dsh-plugin.com)

English | [中文](README.zh.md)

**A plugin that finds plugins** — think [`/find-skills`](https://skills.sh) from skills.sh, for DSH.

Tell your agent what you want ("notify me on WeChat when a task finishes"),
and it searches the DSH plugin ecosystem on GitHub for you — top results by
stars, each with a one-line description and an install command.

<img src="https://raw.githubusercontent.com/awesome-dsh-plugin/dsh-find-plugin/main/assets/demo-en.png" alt="find_dsh_plugin in action" width="640">

## Install

```sh
# from npm (prebuilt, recommended)
dsh plugin --profile web add dsh-find-plugin

# or from GitHub
dsh plugin --profile web add github:awesome-dsh-plugin/dsh-find-plugin
```

## Usage

Restart `dsh web` after installing, then just talk to the agent — it calls
`find_dsh_plugin` on its own whenever plugin discovery helps:

- "What terminal TUI plugins are there?"
- "I want to get a WeChat notification when a task finishes — any plugin for that?"
- "Find me something for reviewing git diffs inside DSH."

Each result comes back with stars, a description, the repo link, and a
ready-to-run `dsh plugin add` command — ask the agent to install one and
it can run the command for you.

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
