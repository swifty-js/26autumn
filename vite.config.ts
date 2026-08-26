import { resolve, dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import {
  swiftyDocsPlugin,
  docsGuardPlugin,
  sentryPlugin,
} from "@lark.js/docs/vite";
import docsConfig from "./docs.config.js";
import { fileURLToPath } from "node:url";
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

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

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
      // { comment: true } keeps HTML comments; node-html-parser drops them by default
      const root = parse(html, { comment: true });

      const applyPriority = (selector: string, priority?: string) => {
        if (!priority) return;
        for (const el of root.querySelectorAll(selector)) {
          el.setAttribute("fetchpriority", priority);
        }
      };

      applyPriority("script[type=module]", opts.priorities.script);
      applyPriority('link[rel="stylesheet"]', opts.priorities.stylesheet);
      applyPriority('link[rel="modulepreload"]', opts.priorities.modulepreload);
      applyPriority('link[rel="preload"][as="font"]', opts.priorities.font);
      applyPriority(
        'link[rel="preload"]:not([as="font"])',
        opts.priorities.preload,
      );

      root.querySelectorAll("img").forEach((el, i) => {
        const aboveFold = i < opts.firstImageCount;
        // only fill in missing attributes so hand-written hints are preserved
        if (!el.hasAttribute("fetchpriority")) {
          el.setAttribute(
            "fetchpriority",
            aboveFold ? (opts.priorities.image ?? "high") : "low",
          );
        }
        if (!el.hasAttribute("loading")) {
          el.setAttribute("loading", aboveFold ? "eager" : "lazy");
        }
      });

      const head = root.querySelector("head");
      if (head) {
        const preconnectHrefs = new Set(
          head
            .querySelectorAll('link[rel="preconnect"]')
            .map((el) => el.getAttribute("href"))
            .filter((href): href is string => href !== undefined),
        );
        const dnsPrefetchHrefs = new Set(
          head
            .querySelectorAll('link[rel="dns-prefetch"]')
            .map((el) => el.getAttribute("href"))
            .filter((href): href is string => href !== undefined),
        );
        const hints: string[] = [];
        for (const origin of opts.preconnect ?? []) {
          if (preconnectHrefs.has(origin)) continue;
          preconnectHrefs.add(origin);
          // preconnect subsumes dns-prefetch for the same origin
          dnsPrefetchHrefs.add(origin);
          hints.push(
            `<link rel="preconnect" href="${escapeAttr(origin)}" crossorigin>`,
          );
        }
        for (const origin of opts.dnsPrefetch ?? []) {
          if (dnsPrefetchHrefs.has(origin)) continue;
          dnsPrefetchHrefs.add(origin);
          hints.push(`<link rel="dns-prefetch" href="${escapeAttr(origin)}">`);
        }
        if (hints.length > 0) {
          // insert after <meta charset> so the charset declaration stays first
          const charset = head.querySelector("meta[charset]");
          if (charset) {
            charset.insertAdjacentHTML("afterend", hints.join(""));
          } else {
            head.insertAdjacentHTML("afterbegin", hints.join(""));
          }
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
    ...swiftyDocsPlugin({ config: docsConfig }),
    docsGuardPlugin(),
    sentryPlugin({ dsn: "/26autumn" }),
    tailwindcss(),
    priorityHintsPlugin(),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": resolve(
        dirname(fileURLToPath(new URL(import.meta.url))),
        ".swifty-docs/generated",
      ),
    },
  },
});
