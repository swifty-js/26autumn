import {
  bootstrap,
  SwiftyDocsAntiCopyProps,
  type LoadContentFn,
} from "@lark.js/docs";
import {
  ScreenRecordPlugin,
  PerformancePlugin,
  ExposurePlugin,
} from "@lark.js/docs/plugins";
import {
  docsConfig,
  loadContent,
  getSearchIndex,
  onContentUpdate,
} from "@swifty-docs/generated";
import "./main.css";

bootstrap({
  docsConfig,
  loadContent: loadContent as LoadContentFn,
  getSearchIndex,
  onContentUpdate,
  antiCopy: import.meta.env.PROD
    ? ({
        devtools: true,
      } satisfies SwiftyDocsAntiCopyProps)
    : false,
  sentry: {
    options: {
      dsn: "/26autumn",
      debug: true,
      beforePushEventList(eventList) {
        if (!import.meta.env.DEV) {
          console.log("@swifty.js/sentry App:", eventList);
          return false;
        }
        return eventList;
      },
    },
    plugins: [
      new ScreenRecordPlugin(),
      new PerformancePlugin(),
      new ExposurePlugin(),
    ],
  },
});
