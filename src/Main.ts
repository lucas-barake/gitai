#!/usr/bin/env bun
import { Command } from "@effect/cli";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Cause, Effect, Layer, Logger } from "effect";
import { AiGenerator } from "./services/AiGenerator/index.js";
import { AiLanguageModel } from "./services/AiLanguageModel/index.js";
import { cliLogger } from "./services/CliLogger.js";
import { GitClient } from "./services/GitClient.js";
import { GitHubClient } from "./services/GitHubClient.js";
import { CommitCommand } from "./commands/CommitCommand.js";
import { GhCommand } from "./commands/GhCommand.js";

const MainCommand = Command.make("gitai").pipe(Command.withSubcommands([GhCommand, CommitCommand]));

const cli = Command.run(MainCommand, {
  name: "AI Git Assistant",
  version: "2.0.0",
});

const MainLayer = Layer.mergeAll(
  AiGenerator.Default,
  AiLanguageModel.Default,
  GitHubClient.Default,
  GitClient.Default,
).pipe(
  Layer.provideMerge(BunContext.layer),
  Layer.provideMerge(Logger.replace(Logger.defaultLogger, cliLogger)),
);

cli(process.argv).pipe(
  Effect.tapErrorCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.void;
    }
    return Effect.logError(cause);
  }),
  Effect.provide(MainLayer),
  BunRuntime.runMain({
    disablePrettyLogger: true,
    disableErrorReporting: true,
  }),
);
