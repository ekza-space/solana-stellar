import { Buffer } from "buffer";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";
import { App } from "./App";
import { ClusterProvider } from "./lib/cluster";

globalThis.Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClusterProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClusterProvider>
  </React.StrictMode>,
);
