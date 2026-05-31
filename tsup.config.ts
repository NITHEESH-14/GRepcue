import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    outDir: "dist",
    clean: true,
    sourcemap: true,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: { mcp: "src/mcp.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    outDir: "dist",
    clean: false,
    sourcemap: true,
  },
]);
