import { FileSystem, Path } from "@effect/platform";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as NodePath from "node:path";
import * as os from "node:os";
import { UserPreferences, UserPreferencesSchema } from "../src/services/UserPreferences.js";

const getPreferencesPath = (): string =>
  NodePath.join(os.homedir(), ".config/gitai/preferences.json");

const makeMockFileSystem = (fileContents: Record<string, string>) => {
  const files = new Map(Object.entries(fileContents));

  return Layer.succeed(FileSystem.FileSystem, {
    readFileString: (path: string) =>
      Effect.gen(function* () {
        const content = files.get(path);
        if (content === undefined) {
          return yield* Effect.fail({ _tag: "SystemError", reason: "NotFound", message: "File not found" } as const);
        }
        return content;
      }),
    writeFileString: (path: string, content: string) =>
      Effect.sync(() => {
        files.set(path, content);
      }),
    makeDirectory: () => Effect.void,
  } as unknown as FileSystem.FileSystem);
};

const MockPathLayer = Layer.succeed(Path.Path, NodePath as unknown as Path.Path);

describe("UserPreferencesSchema", () => {
  it.effect("decodes valid preferences", () =>
    Effect.gen(function* () {
      const json = JSON.stringify({
        lastUsedModelByCommand: { commit: "haiku-4.5" },
        modelUsageCounts: { "haiku-4.5": 3 },
      });

      const result = yield* Schema.decode(Schema.parseJson(UserPreferencesSchema))(json);

      assert.strictEqual(result.lastUsedModelByCommand?.commit, "haiku-4.5");
      assert.strictEqual(result.modelUsageCounts?.["haiku-4.5"], 3);
    }),
  );

  it.effect("rejects invalid model names in lastUsedModelByCommand", () =>
    Effect.gen(function* () {
      const json = JSON.stringify({
        lastUsedModelByCommand: { commit: "invalid-model" },
      });

      const result = yield* Schema.decode(Schema.parseJson(UserPreferencesSchema))(json).pipe(
        Effect.flip,
      );

      assert.isTrue(result._tag === "ParseError");
    }),
  );

  it.effect("ignores unknown keys in modelUsageCounts (partial record behavior)", () =>
    Effect.gen(function* () {
      const json = JSON.stringify({
        modelUsageCounts: { "invalid-model": 5, "opus-4.5": 3 },
      });

      const result = yield* Schema.decode(Schema.parseJson(UserPreferencesSchema))(json);

      assert.strictEqual(result.modelUsageCounts?.["opus-4.5"], 3);
      assert.isUndefined((result.modelUsageCounts as Record<string, number>)?.["invalid-model"]);
    }),
  );
});

describe("UserPreferences service", () => {
  it.effect("returns empty preferences when file doesn't exist", () =>
    Effect.gen(function* () {
      const service = yield* UserPreferences;
      const prefs = yield* service.getPreferences;

      assert.isUndefined(prefs.lastUsedModelByCommand);
      assert.isUndefined(prefs.modelUsageCounts);
    }).pipe(
      Effect.provide(UserPreferences.DefaultWithoutDependencies),
      Effect.provide(makeMockFileSystem({})),
      Effect.provide(MockPathLayer),
    ),
  );

  it.effect("reads valid preferences from file", () =>
    Effect.gen(function* () {
      const service = yield* UserPreferences;
      const prefs = yield* service.getPreferences;

      assert.strictEqual(prefs.lastUsedModelByCommand?.commit, "haiku-4.5");
      assert.strictEqual(prefs.modelUsageCounts?.["haiku-4.5"], 3);
    }).pipe(
      Effect.provide(UserPreferences.DefaultWithoutDependencies),
      Effect.provide(
        makeMockFileSystem({
          [getPreferencesPath()]: JSON.stringify({
            lastUsedModelByCommand: { commit: "haiku-4.5" },
            modelUsageCounts: { "haiku-4.5": 3 },
          }),
        }),
      ),
      Effect.provide(MockPathLayer),
    ),
  );

  it.effect("recordModelUsage sets per-command last used", () =>
    Effect.gen(function* () {
      const service = yield* UserPreferences;

      yield* service.recordModelUsage("commit", "haiku-4.5");
      yield* service.recordModelUsage("gh", "opus-4.5");

      const prefs = yield* service.getPreferences;

      assert.strictEqual(prefs.lastUsedModelByCommand?.commit, "haiku-4.5");
      assert.strictEqual(prefs.lastUsedModelByCommand?.gh, "opus-4.5");
    }).pipe(
      Effect.provide(UserPreferences.DefaultWithoutDependencies),
      Effect.provide(makeMockFileSystem({})),
      Effect.provide(MockPathLayer),
    ),
  );

  it.effect("recordModelUsage updates global counts", () =>
    Effect.gen(function* () {
      const service = yield* UserPreferences;

      yield* service.recordModelUsage("commit", "opus-4.5");
      let prefs = yield* service.getPreferences;
      assert.strictEqual(prefs.modelUsageCounts?.["opus-4.5"], 1);

      yield* service.recordModelUsage("gh", "opus-4.5");
      prefs = yield* service.getPreferences;
      assert.strictEqual(prefs.modelUsageCounts?.["opus-4.5"], 2);
    }).pipe(
      Effect.provide(UserPreferences.DefaultWithoutDependencies),
      Effect.provide(makeMockFileSystem({})),
      Effect.provide(MockPathLayer),
    ),
  );
});
