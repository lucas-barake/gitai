import { Effect, Option } from "effect";
import { describe, it, assert } from "@effect/vitest";
import { CliOption, provideCliOption, provideCliOptionEffect } from "../src/services/CliOptions.js";

describe("CliOptions", () => {
  it.effect(
    "should retrieve repo option value",
    Effect.fnUntraced(
      function* () {
        const testValue = Option.some("owner/repo");
        const result = yield* CliOption("repo");
        assert.deepStrictEqual(result, testValue);
      },
      provideCliOption("repo", Option.some("owner/repo")),
    ),
  );

  it.effect(
    "should not override option value",
    Effect.fnUntraced(
      function* () {
        const testValue = Option.some("owner/repo");
        const result = yield* CliOption("repo");
        assert.deepStrictEqual(result, testValue);
      },
      provideCliOption("repo", Option.some("owner/repo")),
      provideCliOption("context", Option.some("context")),
    ),
  );

  it.effect(
    "should provide option value from effect",
    Effect.fnUntraced(
      function* () {
        const testValue = Option.some("context-value");
        const result = yield* CliOption("context");
        assert.deepStrictEqual(result, testValue);
      },
      provideCliOptionEffect("context", Effect.succeed(Option.some("context-value"))),
    ),
  );
});
