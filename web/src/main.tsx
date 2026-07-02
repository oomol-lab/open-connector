import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./ui";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
