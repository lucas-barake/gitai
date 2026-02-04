import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { buildModelChoices, CliOption, provideCliOption, provideCliOptionEffect } from "../src/services/CliOptions.js";
import { UserPreferencesSchema } from "../src/services/UserPreferences.js";

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

describe("buildModelChoices", () => {
  it("puts last used model for command first", () => {
    const prefs = new UserPreferencesSchema({
      lastUsedModelByCommand: { commit: "haiku-4.5" },
    });

    const choices = buildModelChoices(prefs, "commit");

    assert.strictEqual(choices[0]?.value, "haiku-4.5");
  });

  it("uses correct command's last used model", () => {
    const prefs = new UserPreferencesSchema({
      lastUsedModelByCommand: { commit: "haiku-4.5", gh: "opus-4.5" },
    });

    const commitChoices = buildModelChoices(prefs, "commit");
    assert.strictEqual(commitChoices[0]?.value, "haiku-4.5");

    const ghChoices = buildModelChoices(prefs, "gh");
    assert.strictEqual(ghChoices[0]?.value, "opus-4.5");
  });

  it("sorts remaining models by usage count descending", () => {
    const prefs = new UserPreferencesSchema({
      modelUsageCounts: {
        "opus-4.5": 10,
        "sonnet-4.5": 5,
        "haiku-4.5": 2,
      },
    });

    const choices = buildModelChoices(prefs, "commit");

    const opusIndex = choices.findIndex((c) => c.value === "opus-4.5");
    const sonnetIndex = choices.findIndex((c) => c.value === "sonnet-4.5");
    const haikuIndex = choices.findIndex((c) => c.value === "haiku-4.5");

    assert.isTrue(opusIndex < sonnetIndex);
    assert.isTrue(sonnetIndex < haikuIndex);
  });

  it("shows usage counts in titles", () => {
    const prefs = new UserPreferencesSchema({
      modelUsageCounts: { "opus-4.5": 5 },
    });

    const choices = buildModelChoices(prefs, "commit");
    const opusChoice = choices.find((c) => c.value === "opus-4.5");

    assert.strictEqual(opusChoice?.title, "Opus 4.5 (5)");
  });

  it("does not show count when count is 0", () => {
    const prefs = new UserPreferencesSchema({});

    const choices = buildModelChoices(prefs, "commit");
    const opusChoice = choices.find((c) => c.value === "opus-4.5");

    assert.strictEqual(opusChoice?.title, "Opus 4.5");
  });

  it("combines last used for command with usage count sorting", () => {
    const prefs = new UserPreferencesSchema({
      lastUsedModelByCommand: { commit: "haiku-4.5" },
      modelUsageCounts: {
        "opus-4.5": 10,
        "haiku-4.5": 2,
      },
    });

    const choices = buildModelChoices(prefs, "commit");

    assert.strictEqual(choices[0]?.value, "haiku-4.5");
    assert.strictEqual(choices[0]?.title, "Haiku 4.5 (2)");

    assert.strictEqual(choices[1]?.value, "opus-4.5");
    assert.strictEqual(choices[1]?.title, "Opus 4.5 (10)");
  });
});
