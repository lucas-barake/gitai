import { FileSystem, Path } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as NodePath from "node:path";
import { makeMockCommandExecutor } from "@/test-utils/MockCommandExecutor.js";
import { LocalConfig } from "./LocalConfig.js";

const MockPathLayer = Layer.succeed(Path.Path, NodePath as unknown as Path.Path);

const makeMockFileSystem = (fileContents: Record<string, string>) => {
  const files = new Map(Object.entries(fileContents));

  return Layer.succeed(FileSystem.FileSystem, {
    readFileString: (path: string) =>
      Effect.gen(function* () {
        const content = files.get(path);
        if (content === undefined) {
          return yield* Effect.fail({
            _tag: "SystemError",
            reason: "NotFound",
            message: "File not found",
          } as const);
        }
        return content;
      }),
  } as unknown as FileSystem.FileSystem);
};

describe("LocalConfig", () => {
  describe("config", () => {
    it.effect("returns parsed config from file", () =>
      Effect.gen(function* () {
        const localConfig = yield* LocalConfig;
        expect(localConfig.config.rules?.targetFile._tag).toBe("Some");
      }).pipe(
        Effect.provide(LocalConfig.DefaultWithoutDependencies),
        Effect.provide(
          makeMockFileSystem({
            ".gitai/config.json": JSON.stringify({
              rules: { targetFile: "CHANGELOG.md" },
            }),
          }),
        ),
        Effect.provide(MockPathLayer),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "testuser\n",
          }),
        ),
      ),
    );

    it.effect("returns empty config when file doesn't exist", () =>
      Effect.gen(function* () {
        const localConfig = yield* LocalConfig;
        expect(localConfig.config.rules).toBeUndefined();
      }).pipe(
        Effect.provide(LocalConfig.DefaultWithoutDependencies),
        Effect.provide(makeMockFileSystem({})),
        Effect.provide(MockPathLayer),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "testuser\n",
          }),
        ),
      ),
    );

    it.effect("returns empty config on parse error", () =>
      Effect.gen(function* () {
        const localConfig = yield* LocalConfig;
        expect(localConfig.config.rules).toBeUndefined();
      }).pipe(
        Effect.provide(LocalConfig.DefaultWithoutDependencies),
        Effect.provide(
          makeMockFileSystem({
            ".gitai/config.json": "invalid json {{{",
          }),
        ),
        Effect.provide(MockPathLayer),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => "testuser\n",
          }),
        ),
      ),
    );
  });

  describe("username", () => {
    it.effect("returns git config user.name", () =>
      Effect.gen(function* () {
        const localConfig = yield* LocalConfig;
        expect(localConfig.username).toBe("testuser");
      }).pipe(
        Effect.provide(LocalConfig.DefaultWithoutDependencies),
        Effect.provide(makeMockFileSystem({})),
        Effect.provide(MockPathLayer),
        Effect.provide(
          makeMockCommandExecutor({
            string: (args) => {
              if (args.includes("config") && args.includes("user.name")) {
                return "  testuser  \n";
              }
              return "";
            },
          }),
        ),
      ),
    );

    it.effect("returns unknown-user on failure", () =>
      Effect.gen(function* () {
        const localConfig = yield* LocalConfig;
        expect(localConfig.username).toBe("unknown-user");
      }).pipe(
        Effect.provide(LocalConfig.DefaultWithoutDependencies),
        Effect.provide(makeMockFileSystem({})),
        Effect.provide(MockPathLayer),
        Effect.provide(
          makeMockCommandExecutor({
            string: () => {
              throw new Error("git not found");
            },
          }),
        ),
      ),
    );
  });
});
