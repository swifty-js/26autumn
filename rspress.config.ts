import { join } from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";

export default defineConfig({
  root: "docs",
  base: "/26autumn/",
  lang: "zh",
  title: "技术学习笔记",
  description: "技术知识整理、实习与工作期间的技术笔记、项目源码解析",
  icon: "/favicon.svg",
  logo: "/favicon.svg",
  route: {
    cleanUrls: true,
  },
  markdown: {
    showLineNumbers: true,
    codeHighlighter: {
      shiki: {
        languages: ["promql"],
      },
    },
  },
  themeConfig: {
    lastUpdated: true,
    search: true,
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/hangtiancheng",
      },
    ],
    editLink: {
      docRepoBaseUrl:
        "https://github.com/hangtiancheng/26autumn/edit/main/docs",
    },
  },
  globalStyles: join(process.cwd(), "theme/styles.css"),
  plugins: [
    pluginSitemap({ siteUrl: "https://hangtiancheng.github.io/26autumn" }),
  ],
});
