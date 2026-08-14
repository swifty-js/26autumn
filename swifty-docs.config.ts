import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/26autumn/",
  title: "面试 QA 文档",
  nav: [
    { text: "前端基础", link: "fe/react" },
    { text: "Swifty 前端", link: "fe/swifty" },
    { text: "后端基础", link: "be/go" },
    { text: "Swifty 后端", link: "be/swifty-agent" },
  ],
  sidebar: {
    "/docs/": [
      {
        text: "文档",
        items: [
          { text: "review", link: "docs/review" },
          { text: "handle", link: "docs/handle" },
          {
            text: "视频切片与 LLM 聚类标签: 真实实现记录",
            link: "docs/0",
          },
          {
            text: "ToD 设备性能数据采集: perfetto 与两种采集方法",
            link: "docs/1",
          },
          {
            text: "ToD 数据链路: Kafka、Hive、ClickHouse、MySQL、Redis 的职责",
            link: "docs/2",
          },
          { text: "rpc 是什么, rpc 的优势是什么", link: "docs/3" },
          { text: "为什么要引入 BFF 层", link: "docs/4" },
          {
            text: "虚拟滚动: 为什么用, 为什么手写, 不定高怎么实现",
            link: "docs/5",
          },
          { text: "IEG 工作 1: 迁移类组件到函数组件", link: "docs/6" },
          {
            text: "IEG 工作 2: 内存泄漏排查、进程池与 ffi 内存模型",
            link: "docs/7",
          },
          {
            text: "IEG 工作 3: TCP 连接池与连接异常处理",
            link: "docs/8",
          },
          {
            text: "IEG 工作 4: 排查闭包引用导致的内存泄漏",
            link: "docs/9",
          },
          {
            text: "Data 工作: JSError 自动修复与故障现场还原",
            link: "docs/10",
          },
          {
            text: "Ali 工作: Next.js 交互稿还原 (截图识图重建图表)",
            link: "docs/11",
          },
          {
            text: "手写 SWR: 预加载 + 请求去重 + Stale-While-Revalidate",
            link: "docs/12",
          },
          { text: "竞品调研报告", link: "docs/14" },
          { text: "竞品调研报告", link: "docs/15" },
          { text: "竞品调研报告", link: "docs/16" },
          { text: "竞品调研报告", link: "docs/17" },
          { text: "竞品调研报告", link: "docs/20" },
          {
            text: "Formily 新手入门教程与原理解析",
            link: "docs/formily",
          },
          {
            text: "@swifty.js/sentry 技术说明文档",
            link: "docs/tech-report",
          },
        ],
      },
    ],
    "/fe/": "auto",
    "/be/": "auto",
    "/lark-mvc/": "auto",
    "/lark-docs/": "auto",
    "/lit/": "auto",
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
