import Link from "next/link";

// hero + features ported from the rspress home page (docs/index.md)
const actions = [
  { text: "前端基础", href: "/fe/react", primary: true },
  { text: "后端基础", href: "/be/go", primary: false },
];

const features = [
  {
    title: "前端基础",
    details: "React、Next.js、CSS、Vite、JavaScript 等核心前端主题",
    href: "/fe/react",
  },
  {
    title: "Yukino 前端",
    details:
      "Yukino 前端框架相关的深度技术笔记, 包括 CLI、Agent、Chatbot、Sentry 等模块",
    href: "/fe/yukino",
  },
  {
    title: "后端基础",
    details: "Go 语言、分布式系统、数据库及中间件相关知识",
    href: "/be/go",
  },
  {
    title: "Yukino 后端",
    details:
      "Yukino 后端框架相关的深度技术笔记, 包括 YukinoCodegen、HTTP、RPC、Cache 等模块",
    href: "/be/yukino-codegen",
  },
  {
    title: "工作笔记",
    details: "实习与工作期间的技术记录与项目复盘",
    href: "/docs/tiktok",
  },
  {
    title: "源码解析",
    details: "基于本机仓库逐行核实的技术说明文档",
    href: "/docs/codegraph",
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-4xl font-bold">技术学习笔记</h1>
        <p className="text-lg font-medium text-fd-muted-foreground">
          前端、后端与 Yukino 系列
        </p>
        <p className="max-w-prose text-sm text-fd-muted-foreground">
          技术知识整理、实习与工作期间的技术笔记、项目源码解析
        </p>
        <div className="mt-4 flex flex-row gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={
                action.primary
                  ? "rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground"
                  : "rounded-md border px-4 py-2 text-sm font-medium"
              }
            >
              {action.text}
            </Link>
          ))}
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-4 px-4 pb-16 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="rounded-lg border bg-fd-card p-4 text-left transition-colors hover:border-fd-primary"
          >
            <p className="font-medium">{feature.title}</p>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              {feature.details}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
