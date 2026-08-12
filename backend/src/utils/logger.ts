import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

/**
 * Fields that must NEVER appear in log output.
 * Pino's `redact` option replaces matching key values with "[Redacted]".
 * The wildcard paths cover nested request bodies (e.g. req.body.password).
 */
const REDACTED_PATHS = [
  'password',
  'pinCode',
  'pinSalt',
  'pinCodeHash',
  'accessToken',
  'refreshToken',
  'token',
  'authorization',
  'cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.pinCode',
  'req.body.refreshToken',
  'res.headers["set-cookie"]',
];

const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACTED_PATHS,
    censor: '[Redacted]',
  },
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: { colorize: true }
      }
    : undefined
});

export const logger = new Proxy(baseLogger, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return (...args: any[]) => {
        const store = requestContext.getStore();
        if (store?.requestId) {
          if (typeof args[0] === 'object') {
            args[0] = { ...args[0], reqId: store.requestId };
          } else {
            args.unshift({ reqId: store.requestId });
          }
        }
        return value.apply(target, args);
      };
    }
    return value;
  }
});

