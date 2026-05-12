import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd())],
    },
    proxy: {
      "/rpc": {
        target: "http://127.0.0.1:8899",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ""),
        ws: true,
      },
    },
  },
  define: {
    global: "globalThis",
  },
});
