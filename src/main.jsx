import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css"; // <-- Certifique-se de que esta linha existe

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);