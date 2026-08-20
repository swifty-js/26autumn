import { resolve, dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { larkDocsPlugin } from "@lark.js/docs/vite";
import docsConfig from "./lark-docs.config";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@lark.js/sentry/vite";

export default defineConfig({
  base: "/26autumn/",
  root: "app",
  plugins: [
    larkDocsPlugin({ config: docsConfig }),
    sentryPlugin({ dsn: "/26autumn" }),
    tailwindcss(),
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
