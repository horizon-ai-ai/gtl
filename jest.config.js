/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  preset: "ts-jest",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          isolatedModules: true,
          jsx: "preserve",
          strict: true,
          skipLibCheck: true,
          paths: { "@/*": ["./src/*"] },
        },
      },
    ],
  },
};
