import { Options } from "@effect/cli";
import { Context, Effect, Option } from "effect";
import { AiModel } from "./services/AiLanguageModel/AiLanguageModel.js";

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
  Options.withSchema(AiModel),
  Options.optional,
  Options.withAlias("m"),
  Options.withDescription(
    "Select AI model: 'fast' (default, gemini-2.5-flash) or 'accurate' (gemini-2.5-pro)",
  ),
  Options.map((value) =>
    Option.getOrElse(value, () => "gemini-2.5-flash" as const satisfies AiModel),
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
      readonly contextOption: FromOptions<typeof contextOption>;
      readonly modelOption: FromOptions<typeof modelOption>;
      readonly contextLinesOption: FromOptions<typeof contextLinesOption>;
    }>,
  ) =>
    self.pipe(
      Effect.provideService(this, {
        repo: opts.repoOption ?? Option.none(),
        context: opts.contextOption ?? Option.none(),
        model: opts.modelOption ?? "gemini-2.5-flash",
        contextLines: opts.contextLinesOption ?? Option.none<number>(),
      }),
      Effect.annotateLogs({
        model: opts.modelOption ?? "gemini-2.5-flash",
      }),
    );
}
