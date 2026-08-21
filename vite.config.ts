import { resolve, dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { larkDocsPlugin } from "@lark.js/docs/vite";
import docsConfig from "./lark-docs.config";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@lark.js/sentry/vite";
import { parse } from "node-html-parser";

type ResourceType =
  "script" | "stylesheet" | "font" | "image" | "preload" | "modulepreload";

interface PriorityHintsOptions {
  priorities?: Partial<Record<ResourceType, "high" | "low" | "auto">>;
  preconnect?: string[];
  dnsPrefetch?: string[];
  firstImageCount?: number;
}

const DEFAULT_OPTIONS: Required<
  Pick<PriorityHintsOptions, "priorities" | "firstImageCount">
> &
  PriorityHintsOptions = {
  priorities: {
    script: "high",
    stylesheet: "high",
    font: "high",
    modulepreload: "low",
  },
  preconnect: [],
  dnsPrefetch: [],
  firstImageCount: 1,
};

function priorityHintsPlugin(options: PriorityHintsOptions = {}): Plugin {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    priorities: { ...DEFAULT_OPTIONS.priorities, ...options.priorities },
  };

  return {
    name: "priority-hints",
    enforce: "post",
    transformIndexHtml(html) {
      const root = parse(html);

      for (const el of root.querySelectorAll("script[type=module]")) {
        const p = opts.priorities.script;
        if (p) el.setAttribute("fetchpriority", p);
      }

      for (const el of root.querySelectorAll('link[rel="stylesheet"]')) {
        const p = opts.priorities.stylesheet;
        if (p) el.setAttribute("fetchpriority", p);
      }

      for (const el of root.querySelectorAll('link[rel="modulepreload"]')) {
        const p = opts.priorities.modulepreload;
        if (p) el.setAttribute("fetchpriority", p);
      }

      for (const el of root.querySelectorAll(
        'link[rel="preload"][as="font"]',
      )) {
        const p = opts.priorities.font;
        if (p) el.setAttribute("fetchpriority", p);
      }

      const imgs = root.querySelectorAll("img");
      imgs.forEach((el, i) => {
        if (i < opts.firstImageCount) {
          el.setAttribute("fetchpriority", "high");
          el.setAttribute("loading", "eager");
        } else {
          el.setAttribute("fetchpriority", "low");
          el.setAttribute("loading", "lazy");
        }
      });

      const head = root.querySelector("head");
      if (head) {
        for (const origin of opts.preconnect ?? []) {
          head.insertAdjacentHTML(
            "afterbegin",
            `<link rel="preconnect" href="${origin}" crossorigin>`,
          );
        }
        for (const origin of opts.dnsPrefetch ?? []) {
          head.insertAdjacentHTML(
            "afterbegin",
            `<link rel="dns-prefetch" href="${origin}">`,
          );
        }
      }

      return root.toString();
    },
  };
}

export default defineConfig({
  base: "/26autumn/",
  root: "app",
  plugins: [
    larkDocsPlugin({ config: docsConfig }),
    sentryPlugin({ dsn: "/26autumn" }),
    tailwindcss(),
    priorityHintsPlugin(),
  ],
  resolve: {
    alias: {
      "@lark-docs/generated": resolve(
        dirname(fileURLToPath(new URL(import.meta.url))),
        ".lark-docs/generated",
      ),
    },
  },
});
