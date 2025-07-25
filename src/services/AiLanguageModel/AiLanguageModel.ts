import { FetchHttpClient, HttpBody, HttpClient, HttpClientRequest } from "@effect/platform";
import { Config, Effect, Redacted, Schedule, Schema, Stream } from "effect";
import { makeOpenApiSchema } from "./make-open-api-schema.js";

class StreamChunk extends Schema.Class<StreamChunk>("StreamChunk")({
  candidates: Schema.optional(
    Schema.Tuple(
      Schema.Struct({
        content: Schema.Struct({
          parts: Schema.Tuple(Schema.Struct({ text: Schema.String })),
        }),
      }),
    ),
  ),
  usageMetadata: Schema.Struct({
    promptTokenCount: Schema.optional(Schema.Number),
    candidatesTokenCount: Schema.optional(Schema.Number),
    totalTokenCount: Schema.optional(Schema.Number),
  }),
}) {}

export const AiModel = Schema.Literal("gemini-2.5-pro", "gemini-2.5-flash").annotations({
  description: "The model to use for AI generation",
});
export type AiModel = typeof AiModel.Type;

export interface GenerateObjectOptions<A, I extends Record<string, unknown>> {
  readonly model: AiModel;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
  readonly label: string;
}

export class AiLanguageModel extends Effect.Service<AiLanguageModel>()("@gitai/AiLanguageModel", {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const apiKey = yield* Config.redacted("GOOGLE_AI_API_KEY");

    const httpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.setHeader("x-goog-api-key", Redacted.value(apiKey))),
      ),
      HttpClient.retryTransient({
        times: 3,
        schedule: Schedule.exponential("1 second", 2),
      }),
    );

    const generateObject = Effect.fn("AiLanguageModel.generateObject")(
      <A, I extends Record<string, unknown>>(options: GenerateObjectOptions<A, I>) =>
        httpClient
          .post(
            `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse`,
            {
              body: HttpBody.unsafeJson({
                contents: [{ parts: [{ text: options.prompt }] }],
                generationConfig: {
                  response_mime_type: "application/json",
                  response_schema: makeOpenApiSchema(options.schema),
                },
              }),
            },
          )
          .pipe(
            (self) =>
              Effect.zipRight(
                Effect.sync(() => {
                  process.stdout.write(`→ Pondering ${options.label}...`);
                }),
                self,
              ),
            Effect.flatMap((response) =>
              response.stream.pipe(
                Stream.decodeText("utf-8"),
                Stream.splitLines,
                Stream.filter((line) => line.startsWith("data:") && line !== "data: [DONE]"),
                Stream.map((line) => line.slice(5)),
                Stream.mapEffect(Schema.decode(Schema.parseJson(StreamChunk))),
                Stream.orDieWith((error) => `Failed to decode stream chunk: ${error.message}`),
                Stream.runFold(
                  { totalText: "", lastTokenCount: 0, firstChunk: true },
                  (acc, chunk) => {
                    const newText = chunk.candidates?.[0]?.content.parts[0].text ?? "";
                    const updatedText = acc.totalText + newText;
                    const tokenCount = chunk.usageMetadata.totalTokenCount ?? acc.lastTokenCount;

                    if (acc.firstChunk) {
                      process.stdout.write("\r" + " ".repeat(60) + "\r");
                    }
                    process.stdout.write(
                      `\r→ Generating ${options.label}... ${tokenCount} total tokens`,
                    );

                    return {
                      totalText: updatedText,
                      lastTokenCount: tokenCount,
                      firstChunk: false,
                    };
                  },
                ),
                Effect.tap(({ lastTokenCount }) =>
                  Effect.sync(() => {
                    process.stdout.write("\r" + " ".repeat(60) + "\r");
                    console.log(`✓ Generated ${options.label} (${lastTokenCount} total tokens)\n`);
                  }),
                ),
                Effect.map(({ totalText }) => totalText),
                Effect.flatMap(Schema.decode(Schema.parseJson(options.schema))),
                Effect.orDieWith((error) => `\nFailed to decode final result: ${error.message}`),
              ),
            ),
          ),
    );

    return {
      generateObject,
    } as const;
  }),
}) {}
