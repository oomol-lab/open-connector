import pino from "pino";

export type Logger = pino.Logger;

const isProduction = process.env.NODE_ENV === "production";

export const logger: Logger = pino({
  level: process.env.OOMOL_CONNECT_LOG_LEVEL ?? "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "SYS:standard",
        },
      },
  redact: {
    paths: [
      "*.authorization",
      "*.clientSecret",
      "*.cookie",
      "*.password",
      "*.secret",
      "*.token",
      "*.values.*",
      "authorization",
      "clientSecret",
      "cookie",
      "password",
      "secret",
      "token",
      "values.*",
    ],
    censor: "[redacted]",
  },
});
