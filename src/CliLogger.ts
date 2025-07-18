import { Array, Cause, HashMap, Inspectable, Logger, type LogLevel } from "effect";

const withColor = (text: string, ...colors: ReadonlyArray<string>) => {
  let out = "";
  for (let i = 0; i < colors.length; i++) {
    out += `\x1b[${colors[i]}m`;
  }
  return out + text + "\x1b[0m";
};
const withColorNoop = (text: string) => text;

const colors = {
  bold: "1",
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  cyan: "36",
  white: "37",
  gray: "90",
  black: "30",
  bgBrightRed: "101",
} as const;

const logLevelColors: Record<LogLevel.LogLevel["_tag"], ReadonlyArray<string>> = {
  None: [],
  All: [],
  Trace: [colors.gray],
  Debug: [colors.blue],
  Info: [colors.green],
  Warning: [colors.yellow],
  Error: [colors.red],
  Fatal: [colors.bgBrightRed, colors.black],
};

const cliLoggerTty = (options: { readonly colors: boolean }) => {
  const color = options.colors ? withColor : withColorNoop;
  return Logger.make<unknown, void>(({ annotations, cause, logLevel, message: message_ }) => {
    const log = console.log;

    const message = Array.ensure(message_);

    const logLevelLabel = color(logLevel.label.padEnd(5), ...logLevelColors[logLevel._tag]);
    let firstLine = `${logLevelLabel}:`;
    let messageIndex = 0;
    if (message.length > 0) {
      const firstMaybeString = Inspectable.toStringUnknown(message[0]);
      if (typeof firstMaybeString === "string") {
        firstLine += ` ${color(firstMaybeString, colors.bold, colors.cyan)}`;
        messageIndex++;
      }
    }

    log(firstLine);
    console.group();

    if (!Cause.isEmpty(cause)) {
      log(Cause.pretty(cause, { renderErrorCause: true }));
    }

    if (messageIndex < message.length) {
      for (; messageIndex < message.length; messageIndex++) {
        log(Inspectable.redact(message[messageIndex]));
      }
    }

    if (HashMap.size(annotations) > 0) {
      for (const [key, value] of annotations) {
        log(color(`${key}:`, colors.bold, colors.white), Inspectable.redact(value));
      }
    }
    console.groupEnd();
  });
};

export const cliLogger = cliLoggerTty({ colors: true });
