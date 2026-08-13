import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initPerfMonitor, mark } from "./perf-monitor";

// 手写性能监控: 在应用入口最早时机初始化( 对应 boot.ts 顶部的监控启动)
initPerfMonitor();
mark("swr-boot-start");

createRoot(document.getElementById("root")!).render(<App />);
