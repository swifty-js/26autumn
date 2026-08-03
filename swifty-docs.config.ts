import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/26autumn/",
  title: "面试 QA 文档",
  description: "前端、后端及 Swifty 项目的面试 QA 文档",
  nav: [
    { text: "前端基础", link: "fe/react-qa" },
    { text: "Swifty 前端", link: "fe/swifty-qa" },
    { text: "后端基础", link: "be/go-qa" },
    { text: "Swifty 后端", link: "be/swifty-cli-qa" },
  ],
  sidebar: {
    "/fe/": [
      {
        text: "前端基础",
        items: [
          { text: "React 高级面试题", link: "fe/react-qa" },
          { text: "Next.js 面试题", link: "fe/next-qa" },
          { text: "前端综合面试题", link: "fe/fe-qa" },
          { text: "CSS 面试题", link: "fe/css-qa" },
          { text: "Vite 面试题", link: "fe/vite-qa" },
          { text: "A2UI 面试题", link: "fe/a2ui-qa" },
        ],
      },
      {
        text: "Swifty 前端",
        items: [
          { text: "Swifty 面试题", link: "fe/swifty-qa" },
          { text: "Swifty Agent 面试题", link: "fe/swifty-agent-qa" },
          { text: "Swifty Code 面试题", link: "fe/swifty-code-qa" },
          {
            text: "Swifty Chatbot 面试题",
            link: "fe/swifty-chatbot-qa",
          },
          {
            text: "Swifty Sentry 面试题",
            link: "fe/swifty-sentry-qa",
          },
        ],
      },
    ],
    "/be/": [
      {
        text: "后端基础",
        items: [
          { text: "Go 面试题", link: "be/go-qa" },
          { text: "Go 基础面试题", link: "be/go" },
          { text: "分布式系统与数据结构面试题", link: "be/demo-qa" },
          { text: "MySQL 面试题", link: "be/mysql-qa" },
          { text: "Redis 面试题", link: "be/redis-qa" },
          { text: "中间件面试题", link: "be/middleware-qa" },
        ],
      },
      {
        text: "Swifty 后端",
        items: [
          { text: "Swifty CLI 面试题", link: "be/swifty-cli-qa" },
          { text: "Swifty HTTP 面试题", link: "be/swifty-http-qa" },
          { text: "Swifty RPC 面试题", link: "be/swifty-rpc-qa" },
          { text: "Swifty Cache 面试题", link: "be/swifty-cache-qa" },
          { text: "Swifty Agent 面试题", link: "be/swifty-agent-qa" },
        ],
      },
    ],
  },
  highlight: {
    theme: "github-dark",
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
  search: { provider: "local" },
});
