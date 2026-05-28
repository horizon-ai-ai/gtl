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

module.exports = {
  projects: [
    {
      displayName: "node",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
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
  ],
};
