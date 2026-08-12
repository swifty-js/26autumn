import { defineConfig } from "@swifty.js/docs/vite";

export default (dev: boolean) =>
  defineConfig({
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
            { text: "A2UI 面试题", link: "fe/a2ui" },
            { text: "Anti Copy 面试题", link: "fe/anti-copy" },
            { text: "CSS 面试题", link: "fe/css" },
            { text: "前端面试题", link: "fe/fe" },
            { text: "Next.js 面试题", link: "fe/next" },
            { text: "React 面试题", link: "fe/react" },
            { text: "Vite 面试题", link: "fe/vite" },
            { text: "codegraph", link: "fe/codegraph" },
          ],
        },
        {
          text: "Swifty 前端",
          items: [
            { text: "Swifty Agent 面试题", link: "fe/swifty-agent" },
            {
              text: "Swifty Chatbot 面试题",
              link: "fe/swifty-chatbot",
            },
            {
              text: "Swifty Sentry 面试题",
              link: "fe/swifty-sentry",
            },
            { text: "Swifty 面试题", link: "fe/swifty" },
          ],
        },
      ],
      "/be/": [
        {
          text: "后端基础",
          items: [
            { text: "Go 面试题", link: "be/go" },
            { text: "中间件面试题", link: "be/middleware" },
            { text: "MySQL 面试题", link: "be/mysql" },
            { text: "Redis 面试题", link: "be/redis" },
          ],
        },
        {
          text: "Swifty 后端",
          items: [
            { text: "Swifty Agent 面试题", link: "be/swifty-agent" },
            { text: "Swifty Cache 面试题", link: "be/swifty-cache" },
            { text: "Swifty CLI 面试题", link: "be/swifty-cli" },
            { text: "Swifty HTTP 面试题", link: "be/swifty-http" },
            { text: "Swifty RPC 面试题", link: "be/swifty-rpc" },
          ],
        },
      ],
      ...(dev
        ? {
            "/docs/": [
              {
                text: "文档",
                items: [
                  { text: "review", link: "docs/review" },
                  { text: "0.md", link: "docs/0" },
                  { text: "1.md", link: "docs/1" },
                  { text: "2.md", link: "docs/2" },
                  { text: "3.md", link: "docs/3" },
                  { text: "4.md", link: "docs/4" },
                  { text: "5.md", link: "docs/5" },
                  { text: "6.md", link: "docs/6" },
                  { text: "7.md", link: "docs/7" },
                  { text: "8.md", link: "docs/8" },
                  { text: "9.md", link: "docs/9" },
                  { text: "10.md", link: "docs/10" },
                  { text: "11.md", link: "docs/11" },
                  { text: "12.md", link: "docs/12" },
                  { text: "13.md", link: "docs/13" },
                  { text: "14.md", link: "docs/14" },
                  { text: "15.md", link: "docs/15" },
                  { text: "16.md", link: "docs/16" },
                  { text: "17.md", link: "docs/17" },
                  { text: "18.md", link: "docs/18" },
                  { text: "19.md", link: "docs/19" },
                  { text: "20.md", link: "docs/20" },
                ],
              },
            ],
          }
        : {}),
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
