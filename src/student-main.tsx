import React from "react";
import ReactDOM from "react-dom/client";
import { StudentApp } from "@/app/StudentApp";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StudentApp />
  </React.StrictMode>
);
