import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { perfLogger } from "./lib/performanceLogger";

// Track app initialization
perfLogger.start('app-initialization');

createRoot(document.getElementById("root")!).render(<App />);

// Log when React has finished initial render
setTimeout(() => {
  perfLogger.end('app-initialization');
  perfLogger.getSummary();
}, 0);
