import {
  buildNav,
  buildSidebar,
  installMermaidFence,
  MERMAID_TAG,
} from "@lark.js/docs";
import { defineConfig } from "vitepress";
import { excludePrivatePages, privateDocsPlugin } from "@swifty.js/docs";

export default defineConfig({
  srcDir: "docs",
  title: "技术学习笔记",
  base: "/26autumn/",
  lang: "zh-CN",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  markdown: {
    lineNumbers: true,
    config: installMermaidFence,
  },
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === MERMAID_TAG,
      },
    },
  },
  vite: {
    plugins: [
      // @ts-expect-error
      privateDocsPlugin(),
    ],
    optimizeDeps: {
      exclude: ["@swifty.js/anti-copy", "@lark.js/docs"],
      include: ["@lark.js/docs > mermaid"],
    },
    ssr: {
      noExternal: ["@swifty.js/anti-copy", "@lark.js/docs"],
    },
  },
  themeConfig: {
    nav: buildNav("docs"),
    sidebar: buildSidebar("docs"),
    search: {
      provider: "local",
      // Local search reads markdown straight from disk, so private pages
      // must be excluded explicitly.
      options: { _render: excludePrivatePages },
    },
    outline: {
      level: [2, 3],
    },
  },
});
