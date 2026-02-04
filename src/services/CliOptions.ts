import { Options, Prompt } from "@effect/cli";
import { Context, Effect, Layer } from "effect";
import { type CommandName, UserPreferences, type UserPreferencesSchema } from "./UserPreferences.js";
import { type ModelFamily } from "./WithModel.js";

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

const MODEL_DISPLAY_NAMES: Record<ModelFamily, string> = {
  "gemini-3-pro": "Gemini 3 Pro",
  "gemini-3-flash": "Gemini 3 Flash",
  "opus-4.5": "Opus 4.5",
  "sonnet-4.5": "Sonnet 4.5",
  "haiku-4.5": "Haiku 4.5",
  "gpt-5.2": "GPT 5.2",
  "gpt-5.1": "GPT 5.1",
};

const ALL_MODELS: ReadonlyArray<ModelFamily> = [
  "gemini-3-pro",
  "gemini-3-flash",
  "opus-4.5",
  "sonnet-4.5",
  "haiku-4.5",
  "gpt-5.2",
  "gpt-5.1",
];

export const buildModelChoices = (
  prefs: UserPreferencesSchema,
  command: CommandName,
): ReadonlyArray<{ readonly title: string; readonly value: ModelFamily }> => {
  const lastUsedForCommand = prefs.lastUsedModelByCommand?.[command];
  const usageCounts = prefs.modelUsageCounts ?? {};

  const formatTitle = (model: ModelFamily): string => {
    const displayName = MODEL_DISPLAY_NAMES[model];
    const count = usageCounts[model];
    return count !== undefined && count > 0 ? `${displayName} (${count})` : displayName;
  };

  const otherModels = ALL_MODELS.filter((m): m is ModelFamily => m !== lastUsedForCommand);
  const sortedOthers = [...otherModels].sort((a, b) => {
    const countA = usageCounts[a] ?? 0;
    const countB = usageCounts[b] ?? 0;
    return countB - countA;
  });

  const orderedModels: ReadonlyArray<ModelFamily> = lastUsedForCommand !== undefined
    ? [lastUsedForCommand, ...sortedOthers]
    : sortedOthers;

  return orderedModels.map((model) => ({
    title: formatTitle(model),
    value: model,
  }));
};

export const provideModel = (command: CommandName) =>
  provideCliOptionEffect(
    "model",
    Effect.gen(function* () {
      const userPrefs = yield* UserPreferences;
      const prefs = yield* userPrefs.getPreferences;
      const choices = buildModelChoices(prefs, command);

      const selectedModel = yield* Prompt.select({
        message: "Select AI model",
        choices: [...choices],
      });

      yield* userPrefs.recordModelUsage(command, selectedModel);

      return selectedModel;
    }),
  );
