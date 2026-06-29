import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/modules/credits/creditService.ts",
        "src/routes/urls/index.ts",
        "src/workers/indexingSignalWorker.ts",
        "src/utils/urlNormalizer.ts",
      ],
    },
  },
});
