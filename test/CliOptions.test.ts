import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { CliOption, provideCliOption, provideCliOptionEffect } from "../src/services/CliOptions.js";

describe("CliOptions", () => {
  it.effect(
    "should retrieve option value",
    Effect.fnUntraced(
      function* () {
        const testValue = Option.some("test");
        const result = yield* CliOption("context");
        assert.deepStrictEqual(result, testValue);
      },
      provideCliOption("context", Option.some("test")),
    ),
  );

  it.effect(
    "should not override option value",
    Effect.fnUntraced(
      function* () {
        const result = yield* CliOption("contextLines");
        assert.deepStrictEqual(result, Option.some(2));
      },
      provideCliOption("contextLines", Option.some(2)),
      provideCliOption("context", Option.some("test")),
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
