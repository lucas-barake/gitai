import { Command, CommandExecutor, Error as PlatformError } from "@effect/platform";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type MockHandlers = {
  readonly string?: (args: ReadonlyArray<string>) => string;
  readonly exitCode?: (args: ReadonlyArray<string>) => number;
};

const extractArgs = (cmd: Command.Command): ReadonlyArray<string> => {
  const flattened = Command.flatten(cmd);
  return flattened.flatMap((c) => [c.command, ...c.args]);
};

const toPlatformError = (error: unknown): PlatformError.PlatformError =>
  new PlatformError.SystemError({
    reason: "Unknown",
    module: "Command",
    method: "string",
    description: error instanceof Error ? error.message : String(error),
  });

export const makeMockCommandExecutor = (handlers: MockHandlers) =>
  Layer.succeed(CommandExecutor.CommandExecutor, {
    [CommandExecutor.TypeId]: CommandExecutor.TypeId,
    string: (cmd) =>
      Effect.try({
        try: () => handlers.string?.(extractArgs(cmd)) ?? "",
        catch: toPlatformError,
      }),
    exitCode: (cmd) =>
      Effect.try({
        try: () => CommandExecutor.ExitCode(handlers.exitCode?.(extractArgs(cmd)) ?? 0),
        catch: toPlatformError,
      }),
    lines: (cmd) =>
      Effect.try({
        try: () => (handlers.string?.(extractArgs(cmd)) ?? "").split("\n"),
        catch: toPlatformError,
      }),
    stream: () => {
      throw new Error("stream not implemented in mock");
    },
    streamLines: () => {
      throw new Error("streamLines not implemented in mock");
    },
    start: () => {
      throw new Error("start not implemented in mock");
    },
  } as CommandExecutor.CommandExecutor);
