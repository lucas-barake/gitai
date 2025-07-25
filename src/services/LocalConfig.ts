import { FileSystem, Path } from "@effect/platform";
import { BunContext } from "@effect/platform-bun";
import { Effect, Option, Schema } from "effect";
import { AiModel } from "./AiLanguageModel/AiLanguageModel.js";

export const DefaultAiModel = Schema.Literal("fast", "accurate").pipe(
  Schema.transform(AiModel, {
    decode: (value) => (value === "fast" ? "gemini-2.5-flash" : "gemini-2.5-pro"),
    encode: (value) => (value === "gemini-2.5-flash" ? "fast" : "accurate"),
    strict: true,
  }),
);
export type DefaultAiModel = typeof DefaultAiModel.Type;

export class LocalConfigSchema extends Schema.Class<LocalConfigSchema>("LocalConfigSchema")({
  rules: Schema.optional(
    Schema.Struct({
      targetFile: Schema.optionalWith(Schema.String, { as: "Option" }),
    }),
  ),
  defaultModel: Schema.optionalWith(DefaultAiModel, { as: "Option" }),
}) {}

export class LocalConfig extends Effect.Service<LocalConfig>()("@gitai/LocalConfig", {
  dependencies: [BunContext.layer],
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

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
    } as const;
  }),
}) {}
