import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import { StudentApp } from "@/app/StudentApp";
import "@/index.css";

// The production student surface has its own student.html entrypoint. The
// combined test build serves both desktop and student routes from one preview
// server, so route student paths to the same surface used by that entrypoint.
const testSession = import.meta.env.MODE === "test"
  ? window.localStorage.getItem("plpass-development-session")
  : null;
const isStudentTestSurface = import.meta.env.MODE === "test" && (
  window.location.pathname !== "/login" && (() => {
    try {
      return JSON.parse(testSession ?? "null")?.role === "student";
    } catch {
      return false;
    }
  })()
);

const RootApp = isStudentTestSurface
  ? StudentApp
  : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);
