import { Options } from "@effect/cli";
import { Context, Effect, Layer, Option } from "effect";
import { LocalConfig } from "./LocalConfig.js";
import { ModelFamily } from "./WithModel.js";

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export const repoOption = Options.text("repo").pipe(
  Options.optional,
  Options.withDescription(
    "Specify a custom repository (e.g., 'owner/repo'). Defaults to local detection.",
  ),
);

export const contextOption = Options.text("context").pipe(
  Options.optional,
  Options.withAlias("c"),
  Options.withDescription("Provide extra context to the AI for generating content."),
);

export const modelOption = Options.text("model").pipe(
  Options.withSchema(ModelFamily),
  Options.optional,
  Options.withAlias("m"),
  Options.withDescription(
    "Select AI model: sonnet-4.5, opus-4.5, gemini-3-pro (default), or gpt-5.1",
  ),
);

export const contextLinesOption = Options.integer("contextLines").pipe(
  Options.optional,
  Options.withAlias("cl"),
  Options.withDescription(
    "Number of context lines for git diff (default: 3, same as git's default)",
  ),
);

// -----------------------------------------------------------------------------
// CliOption
// -----------------------------------------------------------------------------

type FromOptions<A> = A extends Options.Options<infer B> ? B : never;

export interface CliOption<Tag extends string> {
  readonly _: unique symbol;
  readonly tag: Tag;
  readonly value: unknown;
  readonly context: Context.Context<never>;
}

interface OptionValueMap {
  readonly context: FromOptions<typeof contextOption>;
  readonly model: ModelFamily;
  readonly contextLines: FromOptions<typeof contextLinesOption>;
}

export type OptionKey = keyof OptionValueMap;
export type OptionValueType<K extends OptionKey> = OptionValueMap[K];

export const CliOption = <K extends OptionKey>(
  key: K,
): Effect.Effect<OptionValueType<K>, never, CliOption<K>> =>
  Effect.flatMap(Effect.context<CliOption<K>>(), (context) => {
    const handler = context.unsafeMap.get(`CliOption<${key}>`) as
      | {
          value: OptionValueType<K>;
          context: Context.Context<never>;
        }
      | undefined;

    if (!handler) {
      return Effect.die(new Error(`Option "${key}" not provided`));
    }

    return Effect.succeed(handler.value);
  });

export const cliOptionLayer = <K extends OptionKey>(
  key: K,
  value: OptionValueType<K>,
): Layer.Layer<CliOption<K>> => {
  const tag = `CliOption<${key}>`;
  const contextMap = new Map<string, unknown>([[tag, { value, context: Context.empty() }]]);
  return Layer.succeedContext(Context.unsafeMake(contextMap)) as Layer.Layer<CliOption<K>>;
};

export const provideCliOption = <K extends OptionKey>(
  key: K,
  value: OptionValueType<K>,
): (<A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, CliOption<K>>>) => {
  const tag = `CliOption<${key}>`;
  const contextMap = new Map<string, unknown>([[tag, { value, context: Context.empty() }]]);
  const context = Context.unsafeMake(contextMap);
  return Effect.provide(context);
};

export const provideCliOptionEffect =
  <K extends OptionKey, E, R>(
    key: K,
    value: Effect.Effect<OptionValueType<K>, E, R>,
  ): (<A, E2, R2>(
    self: Effect.Effect<A, E2, R2>,
  ) => Effect.Effect<A, E | E2, R | Exclude<R2, CliOption<K>>>) =>
  (self) =>
    Effect.gen(function* () {
      const resolvedValue = yield* value;
      const tag = `CliOption<${key}>`;
      const contextMap = new Map<string, unknown>([
        [tag, { value: resolvedValue, context: Context.empty() }],
      ]);
      const context = Context.unsafeMake(contextMap);
      return yield* Effect.provide(self, context);
    });

// -----------------------------------------------------------------------------
// Providers
// -----------------------------------------------------------------------------

export const provideModel = (modelArg: FromOptions<typeof modelOption>) =>
  provideCliOptionEffect(
    "model",
    Effect.gen(function* () {
      const localConfig = yield* LocalConfig;
      const model: ModelFamily = modelArg.pipe(
        Option.orElse(() => localConfig.config.defaultModel),
        Option.getOrElse((): ModelFamily => "gemini-3-pro"),
      );
      yield* Effect.log(`Using model: ${model}`);
      return model;
    }),
  );
