import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Config, Effect, Redacted, Schedule, Schema } from "effect";
import { makeOpenApiSchema } from "./make-open-api-schema.js";

const makeSchemaFromResponse = <A, I>(schema: Schema.Schema<A, I>) =>
  Schema.Struct({
    candidates: Schema.Tuple(
      Schema.Struct({
        content: Schema.Struct({
          parts: Schema.Tuple(
            Schema.Struct({
              parsed: Schema.parseJson(schema).pipe(
                Schema.propertySignature,
                Schema.fromKey("text"),
              ),
            }),
          ),
        }),
      }),
    ),
  });

export const AiModel = Schema.Literal("gemini-2.5-pro", "gemini-2.5-flash").annotations({
  description: "The model to use for AI generation",
});
export type AiModel = typeof AiModel.Type;

export interface GenerateObjectOptions<A, I extends Record<string, unknown>> {
  readonly model: AiModel;
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}

export class AiLanguageModel extends Effect.Service<AiLanguageModel>()("@gitai/AiLanguageModel", {
  dependencies: [FetchHttpClient.layer],
  effect: Effect.gen(function* () {
    const apiKey = yield* Config.redacted("GOOGLE_AI_API_KEY");

    const httpClient = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest((request) =>
        request.pipe(HttpClientRequest.setHeader("x-goog-api-key", Redacted.value(apiKey))),
      ),
      HttpClient.tap((response) => response.text.pipe(Effect.flatMap(Effect.logDebug))),
      HttpClient.retryTransient({
        times: 3,
        schedule: Schedule.exponential("1 second", 2),
      }),
    );

    const generateObject = Effect.fn("AiLanguageModel.generateObject")(
      <A, I extends Record<string, unknown>>(options: GenerateObjectOptions<A, I>) =>
        httpClient
          .post(
            `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:generateContent`,
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
            Effect.flatMap(
              HttpClientResponse.schemaBodyJson(makeSchemaFromResponse(options.schema)),
            ),
            Effect.map((response) => response.candidates[0].content.parts[0].parsed),
          ),
    );

    return {
      generateObject,
    } as const;
  }),
}) {}
