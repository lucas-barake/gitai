#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Cause, Chunk, Effect, Layer, Logger } from "effect";
import { AiGenerator } from "./services/AiGenerator/index.js";
import { AiLanguageModel } from "./services/AiLanguageModel/index.js";
import { cliLogger } from "./services/CliLogger.js";
import { GitClient } from "./services/GitClient.js";
import { GitHubClient } from "./services/GitHubClient.js";
import { CommitCommand } from "./commands/CommitCommand.js";
import { GhCommand } from "./commands/GhCommand.js";
import { RulesCommand } from "./commands/RulesCommand.js";
import { LocalConfig } from "./services/LocalConfig.js";

const MainCommand = Command.make("gitai").pipe(
  Command.withSubcommands([GhCommand, CommitCommand, RulesCommand]),
);

const cli = Command.run(MainCommand, {
  name: "AI Git Assistant",
  version: "2.0.0",
  executable: "gitai",
});

const MainLayer = Layer.mergeAll(
  AiGenerator.Default,
  AiLanguageModel.Default,
  GitHubClient.Default,
  GitClient.Default,
  LocalConfig.Default,
  BunContext.layer,
).pipe(Layer.provideMerge(Logger.replace(Logger.defaultLogger, cliLogger)));

cli(process.argv).pipe(
  Effect.tapErrorCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.void;
    }

    const failures = Cause.failures(cause);
    const hasQuitException = Chunk.some(failures, (failure) => failure._tag === "QuitException");
    if (hasQuitException) {
      return Effect.void;
    }

    return Effect.logError(cause);
  }),
  Effect.provide(MainLayer),
  Effect.scoped,
  BunRuntime.runMain({
    disablePrettyLogger: true,
    disableErrorReporting: true,
  }),
);
