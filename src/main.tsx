import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initTelegram } from "./lib/telegram";
import "./styles/theme.css";

initTelegram();
createRoot(document.getElementById("root")!).render(<App />);
