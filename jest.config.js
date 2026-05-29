/** @type {import('jest').Config} */
const sharedTransform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      tsconfig: {
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        isolatedModules: true,
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        paths: { "@/*": ["./src/*"] },
      },
    },
  ],
};

const moduleNameMapper = {
  "^@/(.*)$": "<rootDir>/src/$1",
};

// Ignore git worktrees under .claude/ that ship their own package.json /
// node_modules — otherwise jest-haste-map flags duplicate package names.
const modulePathIgnorePatterns = ["<rootDir>/.claude/worktrees/"];

// @react-pdf/* (and its yoga-layout / fontkit deps) ship pure ESM with
// `import.meta` usage, so it cannot be down-compiled to CJS. The pdf project
// runs under Jest's experimental VM modules so those packages can be loaded
// as native ESM.
const esmTransform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      useESM: true,
      tsconfig: {
        module: "esnext",
        moduleResolution: "node",
        esModuleInterop: true,
        isolatedModules: true,
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        paths: { "@/*": ["./src/*"] },
      },
    },
  ],
};

module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      testPathIgnorePatterns: ["<rootDir>/src/lib/pdf/__tests__/"],
      moduleNameMapper,
      transform: sharedTransform,
      modulePathIgnorePatterns,
    },
    {
      displayName: "dom",
      preset: "ts-jest",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.tsx"],
      moduleNameMapper,
      transform: sharedTransform,
      modulePathIgnorePatterns,
      // Design references this as `setupFilesAfterEach`; the actual Jest
      // option name is `setupFilesAfterEnv` — loaded after the jsdom test
      // environment is initialized, before tests run. Same intent.
      setupFilesAfterEnv: ["<rootDir>/jest.setup.dom.ts"],
    },
    {
      displayName: "pdf",
      preset: "ts-jest/presets/default-esm",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/lib/pdf/__tests__/**/*.test.ts"],
      extensionsToTreatAsEsm: [".ts", ".tsx"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
        // Strip the `.js` extension that NodeNext-style relative imports
        // require, so ts-jest can resolve `./pi-data.js` → `./pi-data.ts`.
        "^(\\.{1,2}/.*)\\.js$": "$1",
      },
      transform: esmTransform,
      modulePathIgnorePatterns,
    },
  ],
};
