import type { Metadata, Viewport } from "next";
import { Provider } from "@/components/provider";
import { siteUrl } from "@/lib/shared";
import "./global.css";

export const metadata: Metadata = {
  // resolves relative og:image URLs under the /26autumn basePath
  metadataBase: new URL(siteUrl),
  title: {
    default: "技术学习笔记",
    template: "%s | 技术学习笔记",
  },
  description: "技术知识整理、实习与工作期间的技术笔记、项目源码解析",
  icons: {
    // icon URLs bypass metadataBase resolution, prefix /26autumn manually
    icon: "/26autumn/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#283198",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
