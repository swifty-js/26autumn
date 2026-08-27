/// <reference types="vitepress/client" />

import type { Theme } from "vitepress";
import larkTheme from "@lark.js/docs/theme";
import { applyAntiCopy } from "@swifty.js/anti-copy/vitepress";

const theme: Theme = {
  extends: larkTheme,
  enhanceApp(ctx) {
    if (import.meta.env.PROD) {
      applyAntiCopy(ctx, {
        mode: "replace",
        replaceText: (selection) =>
          `${selection}\n\n— Copyright © ${new Date().getFullYear()} hangtiancheng. All rights reserved.
Unauthorized reproduction or distribution of this content is prohibited without prior written permission.`,
        devtools: true,
        onViolation: (e) => console.warn("[anti-copy]", e.type, e.key ?? ""),
      });
    }
  },
};

export default theme;
