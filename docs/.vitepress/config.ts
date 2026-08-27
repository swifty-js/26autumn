import {
  buildNav,
  buildSidebar,
  installMermaidFence,
  MERMAID_TAG,
} from "@lark.js/docs";
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "技术学习笔记",
  base: "/26autumn/",
  lang: "zh-CN",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  markdown: {
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
    optimizeDeps: {
      exclude: ["@lark.js/docs"],
      include: ["@lark.js/docs > mermaid"],
    },
    ssr: {
      noExternal: ["@lark.js/docs"],
    },
  },
  themeConfig: {
    nav: buildNav("docs"),
    sidebar: buildSidebar("docs"),
    search: {
      provider: "local",
    },
    outline: {
      level: [2, 3],
    },
  },
});
