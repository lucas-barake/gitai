import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { makeMockCommandExecutor } from "@/test-utils/MockCommandExecutor.js";
import { cliOptionLayer } from "./CliOptions.js";
import { GitClient } from "./GitClient.js";

describe("GitClient", () => {
  describe("getStagedDiff", () => {
    it.effect("returns trimmed diff output", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        const diff = yield* git.getStagedDiff;
        expect(diff).toBe("+ added line\n- removed line");
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("diff") && args.includes("--staged")) {
                return "  + added line\n- removed line  \n";
              }
              return "";
            },
          }),
        ),
        Effect.provide(cliOptionLayer("contextLines", Option.none())),
      ),
    );

    it.effect("respects contextLines option", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        yield* git.getStagedDiff;
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("diff")) {
                expect(args.some((arg) => arg === "-U10")).toBe(true);
              }
              return "";
            },
          }),
        ),
        Effect.provide(cliOptionLayer("contextLines", Option.some(10))),
      ),
    );
  });

  describe("commit", () => {
    it.effect("calls git commit with message", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        yield* git.commit("Test commit message");
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: (args) => {
              if (args.includes("commit")) {
                expect(args).toContain("-m");
                expect(args).toContain("Test commit message");
                return 0;
              }
              return 0;
            },
          }),
        ),
      ),
    );

    it.effect("dies on non-zero exit code", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        const result = yield* git.commit("Test").pipe(Effect.exit);
        expect(result._tag).toBe("Failure");
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            exitCode: () => 1,
          }),
        ),
      ),
    );
  });

  describe("getCommitRange", () => {
    it.effect("parses git log format correctly", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        const commits = yield* git.getCommitRange("abc123", "def456");

        expect(commits).toHaveLength(1);
        expect(commits[0]?.hash).toBe("abc123def456");
        expect(commits[0]?.shortHash).toBe("abc123");
        expect(commits[0]?.subject).toBe("Test commit subject");
        expect(commits[0]?.body).toBe("Commit body text");
        expect(commits[0]?.author).toBe("Test Author");
        expect(commits[0]?.date).toBe("2024-01-15");
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("log")) {
                return `abc123def456
abc123
Test commit subject
Commit body text
Test Author
2024-01-15
---COMMIT-END---
`;
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("returns empty array for empty output", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        const commits = yield* git.getCommitRange("abc123", "def456");
        expect(commits).toEqual([]);
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "",
          }),
        ),
      ),
    );
  });

  describe("getAllCommits", () => {
    it.effect("parses commits with body correctly", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        const commits = yield* git.getAllCommits(10);

        expect(commits).toHaveLength(2);
        expect(commits[0]?.subject).toBe("First commit");
        expect(commits[0]?.body).toBe("Body of first");
        expect(commits[1]?.subject).toBe("Second commit");
        expect(commits[1]?.body).toBe("");
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("log")) {
                return `hash1
short1
First commit
Body of first
Author1
2024-01-01
---COMMIT-END---
hash2
short2
Second commit

Author2
2024-01-02
---COMMIT-END---
`;
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("respects limit parameter", () =>
      Effect.gen(function* () {
        const git = yield* GitClient;
        yield* git.getAllCommits(25);
      }).pipe(
        Effect.provide(GitClient.DefaultWithoutDependencies),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("log")) {
                expect(args.some((arg) => arg === "-n25")).toBe(true);
              }
              return "";
            },
          }),
        ),
      ),
    );
  });
});
