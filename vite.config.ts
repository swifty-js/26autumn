import { resolve, dirname } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { docsGuardPlugin, swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";
import { fileURLToPath } from "node:url";
import { sentryPlugin } from "@swifty.js/sentry/vite";

export default defineConfig({
  base: "/26autumn/",
  root: "app",
  plugins: [
    swiftyDocsPlugin({ config: docsConfig }),
    docsGuardPlugin(),
    sentryPlugin({ dsn: "/26autumn" }),
    tailwindcss(),
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
