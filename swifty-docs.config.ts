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

    "/docs/": [
      {
        text: "文档",
        items: [
          { text: "review", link: "docs/review" },
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
          { text: "阿里妈妈万相台 竞品调研报告", link: "docs/13" },
          { text: "抖音电商在 AI 时代的高潜业务判断", link: "docs/14" },
          {
            text: "竞品调研报告: 字节跳动巨量引擎 — 对标阿里妈妈万相台与抖音商城竞争格局",
            link: "docs/15",
          },
          {
            text: "竞品调研报告: 字节跳动巨量引擎 vs 阿里妈妈万相台 (产品功能对标视角)",
            link: "docs/16",
          },
          {
            text: "竞品调研报告: 巨量引擎商家端 vs 阿里妈妈万相台",
            link: "docs/17",
          },
          { text: "拼多多主站 — 竞品对比分析报告", link: "docs/18" },
          {
            text: "淘宝主站 (淘宝 App) 竞品对比分析报告",
            link: "docs/19",
          },
          {
            text: "竞品调研报告: 字节跳动「抖音商城 / 巨量引擎」",
            link: "docs/20",
          },
        ],
      },
    ],
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
