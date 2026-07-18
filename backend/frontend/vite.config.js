import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { quasar, transformAssetUrls } from "@quasar/vite-plugin";
// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "../production_frontend",
  },
  base: "/",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    // @quasar/plugin-vite options list:
    // https://github.com/quasarframework/quasar/blob/dev/vite-plugin/index.d.ts
    quasar({
      sassVariables: fileURLToPath(new URL("./src/quasar-variables.sass", import.meta.url)),
    }),
  ],
  css: {
    preprocessorOptions: {
      sass: {
        loadPaths: [
          fileURLToPath(new URL(".", import.meta.url)),
          fileURLToPath(new URL("./src", import.meta.url)),
        ],
      },
      scss: {
        loadPaths: [
          fileURLToPath(new URL(".", import.meta.url)),
          fileURLToPath(new URL("./src", import.meta.url)),
        ],
      },
    },
  },
  server: {
    port: 5002,
    host:true,
  },
});
