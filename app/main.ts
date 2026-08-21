import {
  Framework,
  State,
  registerThemeViews,
  type FrameworkConfig,
} from "@lark.js/docs";
import {
  routes,
  docsConfig,
  loadContent,
  getSearchIndex,
} from "@lark-docs/generated";
import "./main.css";
import { enablePlugin, initLarkSentry } from "@lark.js/sentry";
import {
  ScreenRecordPlugin,
  PerformancePlugin,
  ExposurePlugin,
} from "@lark.js/sentry/plugins";

const config: FrameworkConfig = {
  rootId: "app",
  routeMode: "history",
  routes,
  defaultPath: "/26autumn/",
  defaultView: "theme/docs-layout",
  unmatchedView: "theme/docs-layout",
};

registerThemeViews();
State.set({ docsConfig, loadContent, getSearchIndex });
Framework.boot(config);

if (Framework.isBooted()) {
  initLarkSentry({
    dsn: "/26autumn",
    debug: true,
    beforePushEventList(eventList) {
      if (!import.meta.env.DEV) {
        console.log("@swifty.js/sentry App:", eventList);
        return false;
      }
      return eventList;
    },
  });
  enablePlugin(
    new ScreenRecordPlugin(),
    new PerformancePlugin(),
    new ExposurePlugin(),
  );
}
