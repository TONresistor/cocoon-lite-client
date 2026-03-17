import pino from 'pino';

const isWebUI = process.env.COCOON_MODE === 'webui';

// Base logger config
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isWebUI ? {} : {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export default logger;

// Pre-configured child loggers for each module
export const clientLogger = logger.child({ module: 'client' });
export const walletLogger = logger.child({ module: 'wallet' });
export const apiLogger = logger.child({ module: 'api' });
export const proxyLogger = logger.child({ module: 'proxy' });
export const toncenterLogger = logger.child({ module: 'toncenter' });
export const processLogger = logger.child({ module: 'process' });
