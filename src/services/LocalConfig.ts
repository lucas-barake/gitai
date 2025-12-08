import { Command, CommandExecutor, FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Option, Schema } from "effect";
import { ModelFamily } from "./WithModel.js";

export class LocalConfigSchema extends Schema.Class<LocalConfigSchema>("LocalConfigSchema")({
  rules: Schema.optional(
    Schema.Struct({
      targetFile: Schema.optionalWith(Schema.String, { as: "Option" }),
    }),
  ),
  defaultModel: Schema.optionalWith(ModelFamily, { as: "Option" }),
}) {}

export class LocalConfig extends Effect.Service<LocalConfig>()("@gitai/LocalConfig", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const executor = yield* CommandExecutor.CommandExecutor;

    const getGitUsername = Effect.gen(function* () {
      const usernameCommand = Command.make("git", "config", "user.name");
      return yield* executor.string(usernameCommand).pipe(
        Effect.map((name) => name.trim()),
        Effect.tapError((error) =>
          Effect.logWarning(`[LocalConfig]: Failed to get git username: ${error}`),
        ),
        Effect.orElseSucceed(() => "unknown-user"),
      );
    });

    const getConfig: Effect.Effect<LocalConfigSchema> = fs
      .readFileString(path.join(".gitai", "config.json"))
      .pipe(
        Effect.flatMap(
          Schema.decode(Schema.parseJson(LocalConfigSchema), {
            errors: "all",
            onExcessProperty: "error",
          }),
        ),
        Effect.tapError((error) =>
          Effect.logWarning(`[LocalConfig]: Failed to read config: ${error.message}`),
        ),
        Effect.orElseSucceed(
          (): LocalConfigSchema => ({
            defaultModel: Option.none(),
          }),
        ),
      );

    return {
      config: yield* getConfig,
      username: yield* getGitUsername,
    } as const;
  }),
}) {}
