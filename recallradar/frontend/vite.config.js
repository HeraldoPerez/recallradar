import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths, so the same build works at khalick.github.io/recallradar/ or any other host.
  base: "./",
  plugins: [react()],
});
