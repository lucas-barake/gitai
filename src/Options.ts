import { Options } from "@effect/cli";
import { Context, Effect, Option, Schema } from "effect";
import type { AiModel } from "./services/AiLanguageModel/AiLanguageModel.js";

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
  Options.withSchema(Schema.Literal("fast", "accurate")),
  Options.optional,
  Options.withAlias("m"),
  Options.withDescription(
    "Select AI model: 'fast' (default, gemini-2.5-flash) or 'accurate' (gemini-2.5-pro)",
  ),
  Options.map((value) =>
    value.pipe(
      Option.map((value): AiModel => (value === "fast" ? "gemini-2.5-flash" : "gemini-2.5-pro")),
      Option.getOrElse(() => "gemini-2.5-flash" as const satisfies AiModel),
    ),
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
    readonly model: FromOptions<typeof modelOption>;
    readonly contextLines: FromOptions<typeof contextLinesOption>;
  }
>() {
  static readonly provide = <A, E, R>(
    self: Effect.Effect<A, E, R>,
    opts: Partial<{
      readonly repoOption: FromOptions<typeof repoOption>;
      readonly contextLinesOption: FromOptions<typeof contextLinesOption>;
    }> & {
      readonly contextOption: FromOptions<typeof contextOption>;
      readonly modelOption: FromOptions<typeof modelOption>;
    },
  ) =>
    self.pipe(
      Effect.provideService(this, {
        repo: opts.repoOption ?? Option.none(),
        contextLines: opts.contextLinesOption ?? Option.none<number>(),
        context: opts.contextOption,
        model: opts.modelOption,
      }),
      (self) => Effect.zipRight(Effect.log(`Using model: ${opts.modelOption}`), self),
    );
}
