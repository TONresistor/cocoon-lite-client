import { spawn } from 'child_process';
import chalk from 'chalk';

const processes = [];
let shuttingDown = false;
let signalHandlersRegistered = false;

// Patterns to detect lifecycle events from binary output
const LIFECYCLE_PATTERNS = [
  { pattern: /TonLib is synced/, event: 'ton_synced', message: 'TON blockchain synced' },
  { pattern: /initialization completed/, event: 'initialized', message: 'Client initialized' },
  { pattern: /OK, connecting to \[(.+?)\]/, event: 'proxy_connecting', extract: 1, message: 'Connecting to proxy {0}' },
  { pattern: /handshake completed successfully/, event: 'proxy_ready', message: 'Proxy connected' },
  { pattern: /outbound connection ready/, event: 'connection_ready', message: 'Connection established' },
  { pattern: /TcpListener\[port:(\d+)\]\]\s+[\d.]+ (\d+)/, event: 'listening', extract: [1, 2] },
  { pattern: /FATAL|fatal|Aborted/, event: 'fatal', message: null },
  { pattern: /\[ 0\].*[Ee]rror/, event: 'error', message: null },
];

/**
 * Spawn a process with colored, prefixed output.
 * In quiet mode, only lifecycle events and errors are shown.
 */
export function spawnWithPrefix(cmd, args, { prefix, color, env = {}, quiet = false, onEvent }) {
  const colorFn = chalk[color] || chalk.white;
  const tag = colorFn.bold(`[${prefix}]`);

  const proc = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  const processLine = (line, stream) => {
    if (!line.trim()) return;

    // Strip ANSI codes for pattern matching
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');

    // Check lifecycle patterns
    for (const lp of LIFECYCLE_PATTERNS) {
      const match = clean.match(lp.pattern);
      if (match) {
        if (onEvent) onEvent(lp.event, match);

        if (lp.event === 'fatal' || lp.event === 'error') {
          // Always show errors
          process.stderr.write(`${tag} ${chalk.red(clean.trim())}\n`);
          return;
        }

        // In quiet mode, lifecycle events are handled by onEvent callback
        if (quiet) return;
      }
    }

    // In quiet mode, suppress normal output
    if (quiet) return;

    // Verbose mode: show everything
    const out = stream === 'stderr' ? process.stderr : process.stdout;
    out.write(`${tag} ${line}\n`);
  };

  for (const stream of ['stdout', 'stderr']) {
    let buffer = '';
    proc[stream].on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        processLine(line, stream);
      }
    });
    proc[stream].on('end', () => {
      if (buffer.trim()) processLine(buffer, stream);
    });
  }

  proc.on('exit', (code, signal) => {
    if (!shuttingDown) {
      if (code !== 0 && code !== null) {
        console.error(`${tag} ${chalk.red(`exited with code ${code}`)}`);
      }
      if (onEvent) onEvent('exit', { code, signal });
    }
  });

  processes.push(proc);
  return proc;
}

/**
 * Register signal handlers for graceful shutdown
 */
export function setupSignalHandlers(onCleanup) {
  // Avoid registering duplicate handlers on repeated calls
  if (signalHandlersRegistered) return;
  signalHandlersRegistered = true;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${chalk.dim('Shutting down...')}`);

    for (const proc of processes) {
      try { proc.kill('SIGTERM'); } catch {}
    }

    const timeout = setTimeout(() => {
      for (const proc of processes) {
        try { proc.kill('SIGKILL'); } catch {}
      }
      if (onCleanup) onCleanup();
      process.exit(1);
    }, 5000);

    Promise.all(
      processes
        .filter(p => p.exitCode === null)
        .map(p => new Promise((resolve) => p.on('exit', resolve)))
    ).then(() => {
      clearTimeout(timeout);
      if (onCleanup) onCleanup();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
