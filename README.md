<div align="center">

# 26autumn

**A personal technical knowledge base — frontend, backend, and the Swifty family of projects.**

Built with [Rspress](https://rspress.dev/), deployed to GitHub Pages at
<https://swifty-js.github.io/26autumn/>.

![Rspress](https://img.shields.io/badge/Rspress-2.x-0ea5e9?logo=rspress&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-f5a623.svg)

</div>

---

## What is this?

`26autumn` is a static documentation site that collects technical notes written during
study, internships, and work. It covers three broad areas:

- **Frontend fundamentals** — React, Next.js, CSS, Vite, JavaScript, and related topics.
- **Backend fundamentals** — Go, distributed systems, databases, and middleware.
- **Swifty deep dives** — source-level walkthroughs of the Swifty frontend
  (CLI, Agent, Chatbot, Sentry) and backend (Swiftx, HTTP, RPC, Cache) stacks,
  verified line-by-line against local repositories.

Every document is grounded in project facts: source-code analysis is verified against the
actual repositories on disk, not invented from memory.

## Getting started

Prerequisites: **Node.js 20+** and **pnpm**.

```sh
pnpm install
pnpm dev       # start the dev server with HMR
```

| Command        | Description                             |
| -------------- | --------------------------------------- |
| `pnpm dev`     | Start the local dev server              |
| `pnpm build`   | Build the static site into `doc_build/` |
| `pnpm preview` | Preview the production build            |
| `pnpm format`  | Format the repo with Prettier           |

## Repository layout

```
26autumn/
├── docs/          # Rspress content root (fe / be / docs)
├── packages/      # standalone packages shipped alongside the docs
│   ├── swr-demo/  # SWR usage demo
│   └── tags/      # video segmentation + vision-LLM tagger (Go)
├── theme/         # custom Rspress theme overrides
└── rspress.config.ts
```

> The `packages/` directory is a pnpm workspace. Subprojects are documented independently —
> see [`packages/tags`](./packages/tags) for the Go video-tagging CLI, for example.

## Content conventions

- Frontend/full-stack/agent notes live under `docs/fe`.
- Backend notes live under `docs/be`.
- Source-code analysis documents are always verified against the local workspace.
