import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        action: "action.html",
      }
    }
  },
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },
});