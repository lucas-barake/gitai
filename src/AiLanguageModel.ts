import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "@effect/platform";
import { Config, Effect, Redacted, Schedule, Schema } from "effect";
import { makeOpenApiSchema } from "./internal/make-open-api-schema.js";

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

export interface GenerateObjectOptions<A, I extends Record<string, unknown>> {
  readonly prompt: string;
  readonly schema: Schema.Schema<A, I>;
}

export class AiLanguageModel extends Effect.Service<AiLanguageModel>()("AiLanguageModel", {
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
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent",
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
