import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

/**
 * Production build tuning.
 *
 * `console.debug` / `console.log` / `console.info` are stripped at minify
 * time so packaged binaries don't leak our DEV instrumentation to end
 * users. `console.warn` / `console.error` are kept so support tickets
 * can still be diagnosed via `Open log folder` (Phase 2: pipe through
 * electron-log to a rotating file).
 *
 * `console.debug` calls that are already gated behind `isDev` in main.ts
 * get dead-code-eliminated anyway; the pure_funcs list is a belt-and-
 * suspenders defense for the renderer where some debug calls aren't
 * gated.
 */
const PURE_CONSOLE_FUNCS = [
  "console.log",
  "console.debug",
  "console.info",
];

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            minify: "terser",
            terserOptions: {
              compress: {
                pure_funcs: PURE_CONSOLE_FUNCS,
                drop_debugger: true,
              },
            },
            rollupOptions: {
              // active-win ships its own helper binaries and uses
              // dynamic process spawn paths; bundling it through Rollup
              // breaks resolution. Keep it as a runtime require/import
              // so node_modules ships intact.
              external: ["active-win"],
            },
          },
        },
      },
      preload: {
        input: {
          preload: "electron/preload.ts",
          "launcher-preload": "electron/launcher-preload.ts",
          "tire-tracks-preload": "electron/tire-tracks-preload.ts",
        },
        vite: {
          build: {
            minify: "terser",
            terserOptions: {
              compress: {
                pure_funcs: PURE_CONSOLE_FUNCS,
                drop_debugger: true,
              },
            },
            rollupOptions: {
              output: {
                entryFileNames: "[name].mjs",
                inlineDynamicImports: false,
              },
            },
          },
        },
      },
    }),
  ],
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        pure_funcs: PURE_CONSOLE_FUNCS,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      input: {
        launcher: resolve(__dirname, "launcher.html"),
        companion: resolve(__dirname, "companion.html"),
        "tire-tracks": resolve(__dirname, "tire-tracks.html"),
      },
    },
  },
});
