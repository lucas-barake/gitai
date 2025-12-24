import * as AnthropicClient from "@effect/ai-anthropic/AnthropicClient";
import * as AnthropicLanguageModel from "@effect/ai-anthropic/AnthropicLanguageModel";
import * as GoogleClient from "@effect/ai-google/GoogleClient";
import * as GoogleLanguageModel from "@effect/ai-google/GoogleLanguageModel";
import * as OpenAiClient from "@effect/ai-openai/OpenAiClient";
import * as OpenAiLanguageModel from "@effect/ai-openai/OpenAiLanguageModel";
import { FetchHttpClient } from "@effect/platform";
import { Config, Effect, Layer, Schema } from "effect";

export const ModelFamily = Schema.Literal(
  "gemini-3-pro",
  "gemini-3-flash",
  "opus-4.5",
  "sonnet-4.5",
  "haiku-4.5",
  "gpt-5.2",
  "gpt-5.1",
).annotations({
  description: "The AI model family to use for generation",
});
export type ModelFamily = typeof ModelFamily.Type;

const Gemini3ProModel = GoogleLanguageModel.model("gemini-3-pro-preview");
const Gemini3FlashModel = GoogleLanguageModel.model("gemini-3-flash-preview");
const OpusModel = AnthropicLanguageModel.model("claude-opus-4-5", {
  max_tokens: 16_000,
  thinking: { type: "enabled", budget_tokens: 10_000 },
});
const SonnetModel = AnthropicLanguageModel.model("claude-sonnet-4-5", {
  max_tokens: 64_000,
  thinking: { type: "enabled", budget_tokens: 10_000 },
});
const HaikuModel = AnthropicLanguageModel.model("claude-haiku-4-5", {
  max_tokens: 64_000,
  thinking: { type: "enabled", budget_tokens: 10_000 },
});
const Gpt52Model = OpenAiLanguageModel.model("gpt-5.2");
const Gpt51Model = OpenAiLanguageModel.model("gpt-5.1");

const optionalRedacted = (name: string) =>
  Config.redacted(name).pipe(
    Config.option,
    Config.map((opt) => (opt._tag === "Some" ? opt.value : undefined)),
  );

const AnthropicClientLayer = AnthropicClient.layerConfig({
  apiKey: optionalRedacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const OpenAiClientLayer = OpenAiClient.layerConfig({
  apiKey: optionalRedacted("OPENAI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

const GoogleClientLayer = GoogleClient.layerConfig({
  apiKey: optionalRedacted("GOOGLE_AI_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export class WithModel extends Effect.Service<WithModel>()("@gitai/WithModel", {
  dependencies: [AnthropicClientLayer, OpenAiClientLayer, GoogleClientLayer],
  effect: Effect.gen(function* () {
    const gemini3ProModel = yield* Gemini3ProModel;
    const gemini3FlashModel = yield* Gemini3FlashModel;
    const opusModel = yield* OpusModel;
    const sonnetModel = yield* SonnetModel;
    const haikuModel = yield* HaikuModel;
    const gpt52Model = yield* Gpt52Model;
    const gpt51Model = yield* Gpt51Model;

    const withModel =
      (model: ModelFamily) =>
      <A, E, R>(self: Effect.Effect<A, E, R>) => {
        switch (model) {
          case "gemini-3-pro":
            return Effect.provide(self, gemini3ProModel);
          case "gemini-3-flash":
            return Effect.provide(self, gemini3FlashModel);
          case "opus-4.5":
            return Effect.provide(self, opusModel);
          case "sonnet-4.5":
            return Effect.provide(self, sonnetModel);
          case "haiku-4.5":
            return Effect.provide(self, haikuModel);
          case "gpt-5.2":
            return Effect.provide(self, gpt52Model);
          case "gpt-5.1":
            return Effect.provide(self, gpt51Model);
        }
      };

    return { withModel };
  }),
}) {}
