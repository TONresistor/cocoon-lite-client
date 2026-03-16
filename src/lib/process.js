import { spawn } from 'child_process';
import chalk from 'chalk';

const processes = [];
let shuttingDown = false;
let signalHandlersRegistered = false;
let currentCleanup = null;

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

  // Ring buffer for last lines before exit (debugging)
  const lastLines = [];
  const MAX_LAST_LINES = 10;

  const proc = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  const processLine = (line, stream) => {
    if (!line.trim()) return;

    // Strip ANSI codes for pattern matching
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '');

    // Always keep last lines for exit diagnostics
    lastLines.push(clean.trim());
    if (lastLines.length > MAX_LAST_LINES) lastLines.shift();

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

    // In quiet mode, suppress all output — real errors are already caught
    // by the lifecycle patterns above (fatal/error events always print).
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
    const idx = processes.indexOf(proc);
    if (idx !== -1) processes.splice(idx, 1);

    if (!shuttingDown) {
      if (code !== 0 && code !== null) {
        console.error(`${tag} ${chalk.red(`exited with code ${code}`)}`);
      }
      if (onEvent) onEvent('exit', { code, signal, prefix, lastLines: [...lastLines] });
    }
  });

  processes.push(proc);
  return proc;
}

/**
 * Register signal handlers for graceful shutdown
 */
export function setupSignalHandlers(onCleanup) {
  // Always update the cleanup callback so stop→start cycles clean the new temp dir
  currentCleanup = onCleanup;

  // Signal handlers only need to be registered once
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
      if (currentCleanup) currentCleanup();
      process.exit(1);
    }, 5000);

    Promise.all(
      processes
        .filter(p => p.exitCode === null)
        .map(p => new Promise((resolve) => p.on('exit', resolve)))
    ).then(() => {
      clearTimeout(timeout);
      if (currentCleanup) currentCleanup();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
