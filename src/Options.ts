import { Options } from "@effect/cli";
import { Context, Effect, Option } from "effect";
import type { AiModel } from "./services/AiLanguageModel/AiLanguageModel.js";
import { DefaultAiModel, LocalConfig } from "./services/LocalConfig.js";

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
  Options.withSchema(DefaultAiModel),
  Options.optional,
  Options.withAlias("m"),
  Options.withDescription(
    "Select AI model: 'fast' (default, gemini-2.5-flash) or 'accurate' (gemini-2.5-pro)",
  ),
);

export const contextLinesOption = Options.integer("contextLines").pipe(
  Options.optional,
  Options.withAlias("cl"),
  Options.withDescription(
    "Number of context lines for git diff (default: 3, same as git's default)",
  ),
);

type FromOptions<A> = A extends Options.Options<infer B> ? B : never;

export class OptionsContext extends Context.Tag("cli/OptionsContext")<
  OptionsContext,
  {
    readonly repo: FromOptions<typeof repoOption>;
    readonly context: FromOptions<typeof contextOption>;
    readonly model: AiModel;
    readonly contextLines: FromOptions<typeof contextLinesOption>;
  }
>() {
  static readonly provide = Effect.fnUntraced(function* <A, E, R>(
    self: Effect.Effect<A, E, R>,
    opts: Partial<{
      readonly repoOption: FromOptions<typeof repoOption>;
      readonly contextLinesOption: FromOptions<typeof contextLinesOption>;
    }> & {
      readonly contextOption: FromOptions<typeof contextOption>;
      readonly modelOption: FromOptions<typeof modelOption>;
    },
  ) {
    const localConfig = yield* LocalConfig;

    // precedence: user option > local config > fallback to fast
    const model: AiModel = opts.modelOption.pipe(
      Option.orElse(() => localConfig.config.defaultModel),
      Option.getOrElse((): AiModel => "gemini-2.5-flash"),
    );

    return yield* self.pipe(
      Effect.provideService(OptionsContext, {
        repo: opts.repoOption ?? Option.none(),
        contextLines: opts.contextLinesOption ?? Option.none<number>(),
        context: opts.contextOption,
        model,
      }),
      (self) => Effect.zipRight(Effect.log(`Using model: ${model}`), self),
    );
  });
}
