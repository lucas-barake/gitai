import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as os from "node:os";
import { ModelFamily } from "./WithModel.js";

export const CommandName = Schema.Literal("commit", "gh", "changelog");
export type CommandName = typeof CommandName.Type;

const PartialCommandModelRecord = Schema.partialWith(
  Schema.Record({ key: CommandName, value: ModelFamily }),
  { exact: true },
);

const PartialModelCountRecord = Schema.partialWith(
  Schema.Record({ key: ModelFamily, value: Schema.Number }),
  { exact: true },
);

export class UserPreferencesSchema extends Schema.Class<UserPreferencesSchema>("UserPreferencesSchema")({
  lastUsedModelByCommand: Schema.optional(PartialCommandModelRecord),
  modelUsageCounts: Schema.optional(PartialModelCountRecord),
}) {}

const PREFERENCES_PATH = ".config/gitai/preferences.json";

export class UserPreferences extends Effect.Service<UserPreferences>()("@gitai/UserPreferences", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const getPreferencesPath = Effect.sync(() => path.join(os.homedir(), PREFERENCES_PATH));

    const getPreferences = Effect.gen(function* () {
      const prefsPath = yield* getPreferencesPath;
      return yield* fs.readFileString(prefsPath).pipe(
        Effect.flatMap(
          Schema.decode(Schema.parseJson(UserPreferencesSchema), {
            errors: "all",
            onExcessProperty: "error",
          }),
        ),
        Effect.orElseSucceed((): UserPreferencesSchema => new UserPreferencesSchema({})),
      );
    });

    const savePreferences = (prefs: UserPreferencesSchema) =>
      Effect.gen(function* () {
        const prefsPath = yield* getPreferencesPath;
        const prefsDir = path.dirname(prefsPath);
        yield* fs.makeDirectory(prefsDir, { recursive: true });
        const json = yield* Schema.encode(Schema.parseJson(UserPreferencesSchema))(prefs);
        yield* fs.writeFileString(prefsPath, json);
      });

    const recordModelUsage = (command: CommandName, model: ModelFamily) =>
      Effect.gen(function* () {
        const prefs = yield* getPreferences;

        const lastUsedModelByCommand = {
          ...prefs.lastUsedModelByCommand,
          [command]: model,
        };

        const currentCount = prefs.modelUsageCounts?.[model] ?? 0;
        const modelUsageCounts = {
          ...prefs.modelUsageCounts,
          [model]: currentCount + 1,
        };

        yield* savePreferences(
          new UserPreferencesSchema({
            lastUsedModelByCommand,
            modelUsageCounts,
          }),
        );
      });

    return {
      getPreferences,
      recordModelUsage,
    } as const;
  }),
}) {}
