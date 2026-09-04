import { join } from "node:path";
import { defineConfig } from "rspress/config";

export default defineConfig({
  root: "docs",
  base: "/26autumn/",
  title: "技术学习笔记",
  description: "技术知识整理、实习与工作期间的技术笔记、项目源码解析",
  route: {
    cleanUrls: true,
  },
  markdown: {
    showLineNumbers: true,
    checkDeadLinks: true,
  },
  themeConfig: {
    outline: true,
    lastUpdated: true,
  },
  globalStyles: join(process.cwd(), "theme/styles.css"),
});
