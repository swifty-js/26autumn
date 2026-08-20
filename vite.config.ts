import { resolve, dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { larkDocsPlugin } from "@lark.js/docs/vite";
import docsConfig from "./lark-docs.config";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@lark.js/sentry/vite";

function priorityHintsPlugin(): Plugin {
  return {
    name: "priority-hints",
    enforce: "post",
    transformIndexHtml(html) {
      return html
        .replace(
          /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
          '<script type="module" crossorigin fetchpriority="high" src="$1"></script>',
        )
        .replace(
          /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
          '<link rel="stylesheet" crossorigin fetchpriority="high" href="$1">',
        )
        .replace(
          /<link rel="modulepreload" crossorigin href="([^"]+)">/g,
          '<link rel="modulepreload" crossorigin fetchpriority="low" href="$1">',
        );
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
