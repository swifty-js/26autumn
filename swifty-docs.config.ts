import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/26autumn/",
  title: "面试 QA 文档",
  nav: [
    { text: "前端基础", link: "fe/react" },
    { text: "Swifty 前端", link: "fe/swifty" },
    { text: "后端基础", link: "be/go" },
    { text: "Swifty 后端", link: "be/swifty-cli" },
  ],
  sidebar: {
    "/fe/": [
      {
        text: "前端基础",
        items: [
          { text: "React 高级面试题", link: "fe/react" },
          { text: "Next.js 面试题", link: "fe/next" },
          { text: "前端综合面试题", link: "fe/fe" },
          { text: "CSS 面试题", link: "fe/css" },
          { text: "Vite 面试题", link: "fe/vite" },
          { text: "A2UI 面试题", link: "fe/a2ui" },
        ],
      },
      {
        text: "Swifty 前端",
        items: [
          { text: "Swifty 面试题", link: "fe/swifty" },
          { text: "Swifty Agent 面试题", link: "fe/swifty-agent" },
          {
            text: "Swifty Chatbot 面试题",
            link: "fe/swifty-chatbot",
          },
          {
            text: "Swifty Sentry 面试题",
            link: "fe/swifty-sentry",
          },
        ],
      },
    ],
    "/be/": [
      {
        text: "后端基础",
        items: [
          { text: "Go 面试题", link: "be/go" },
          { text: "分布式系统与数据结构面试题", link: "be/demo" },
          { text: "MySQL 面试题", link: "be/mysql" },
          { text: "Redis 面试题", link: "be/redis" },
          { text: "中间件面试题", link: "be/middleware" },
        ],
      },
      {
        text: "Swifty 后端",
        items: [
          { text: "Swifty CLI 面试题", link: "be/swifty-cli" },
          { text: "Swifty HTTP 面试题", link: "be/swifty-http" },
          { text: "Swifty RPC 面试题", link: "be/swifty-rpc" },
          { text: "Swifty Cache 面试题", link: "be/swifty-cache" },
          { text: "Swifty Agent 面试题", link: "be/swifty-agent" },
        ],
      },
    ],
    // "/docs/": [
    //   {
    //     text: "文档",
    //     items: [
    //       { text: "review", link: "docs/review" },
    //       { text: "1.md", link: "docs/1" },
    //       { text: "2.md", link: "docs/2" },
    //       { text: "3.md", link: "docs/3" },
    //     ],
    //   },
    // ],
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
