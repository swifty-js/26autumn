import { defineConfig } from "@lark.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/26autumn/",
  title: "面试 QA 文档",
  nav: [
    { text: "前端基础", link: "fe/react" },
    { text: "Swifty 前端", link: "fe/swifty" },
    { text: "后端基础", link: "be/go" },
    { text: "Swifty 后端", link: "fe/swifty-agent" },
  ],
  sidebar: {
    "/docs/": 'auto',
    "/fe/": "auto",
    "/be/": "auto",
  },
  highlight: {
    theme: "github-light",
    darkTheme: "github-dark",
    languages: [
      "go",
      "typescript",
      "javascript",
      "jsx",
      "tsx",
      "bash",
      "json",
      "yaml",
      "sql",
      "css",
      "html",
      "lua",
      "python",
    ],
  },
  search: true,
});
