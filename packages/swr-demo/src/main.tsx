import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initPerfMonitor, mark } from "./perf-monitor";

// Hand-rolled perf monitoring: initialize at the earliest point in the app
// entry (mirrors the monitoring bootstrap at the top of boot.ts)
initPerfMonitor();
mark("swr-boot-start");

createRoot(document.getElementById("root")!).render(<App />);
