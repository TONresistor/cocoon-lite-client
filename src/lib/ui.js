import chalk from 'chalk';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'));
const VERSION = pkg.version;

// ── Branding ─────────────────────────────────────────────
export const BRAND  = chalk.hex('#0098EA');  // TON blue
export const GREEN  = chalk.green;
export const CYAN   = chalk.cyan;
export const DIM    = chalk.dim;
const BOLD   = chalk.bold;
export const WHITE  = chalk.white;
export const RED    = chalk.red;
export const YELLOW = chalk.yellow;

// ── ASCII Art ────────────────────────────────────────────
const ASCII_ART = [
  " .o88b.  .d88b.   .o88b.  .d88b.   .d88b.  d8b   db",
  "d8P  Y8 .8P  Y8. d8P  Y8 .8P  Y8. .8P  Y8. 888o  88",
  "8P      88    88 8P      88    88 88    88 88V8o 88",
  "8b      88    88 8b      88    88 88    88 88 V8o88",
  "Y8b  d8 `8b  d8' Y8b  d8 `8b  d8' `8b  d8' 88  V888",
  " `Y88P'  `Y88P'   `Y88P'  `Y88P'   `Y88P'  VP   V8P",
];

// ── ANSI helpers ─────────────────────────────────────────
function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}

function padRight(s, len) {
  return s + ' '.repeat(Math.max(0, len - s.length));
}

function padRightAnsi(s, len) {
  const visible = stripAnsi(s).length;
  return s + ' '.repeat(Math.max(0, len - visible));
}

function centerIn(text, width) {
  const vis = stripAnsi(text).length;
  const pad = width - vis;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, right));
}

// ── Frame constants ──────────────────────────────────────
const ART_WIDTH = Math.max(...ASCII_ART.map(l => l.length));
const FRAME_WIDTH = Math.max(60, ART_WIDTH + 4);

function frameRow(content, border = BRAND) {
  const pad = FRAME_WIDTH - stripAnsi(content).length;
  return `  ${border('║')}${content}${' '.repeat(Math.max(0, pad))}${border('║')}`;
}

function emptyRow(border = BRAND) {
  return `  ${border('║')}${' '.repeat(FRAME_WIDTH)}${border('║')}`;
}

// ── Wizard Frame ─────────────────────────────────────────
/**
 * Render a full wizard frame with banner, steps, and progress bar.
 * @param {number} currentStep - 0-indexed current step
 * @param {Array<{label: string, desc: string, value?: string}>} steps
 */
export function wizardFrame(currentStep, steps) {
  const W = FRAME_WIDTH;
  const out = [];

  // Top border
  out.push(`  ${BRAND('╔' + '═'.repeat(W) + '╗')}`);
  out.push(emptyRow());

  // ASCII Art
  for (const line of ASCII_ART) {
    out.push(frameRow(BRAND.bold(centerIn(line, W))));
  }

  out.push(emptyRow());

  // Subtitle
  const subtitle = 'Decentralized AI inference on TON blockchain';
  out.push(frameRow(DIM(centerIn(subtitle, W))));
  out.push(frameRow(DIM(centerIn(`v${VERSION}`, W))));

  // Divider
  out.push(`  ${BRAND('╠' + '═'.repeat(W) + '╣')}`);
  out.push(emptyRow());

  // Steps
  const labelWidth = Math.max(...steps.map(s => s.label.length)) + 2;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    let line;
    if (i < currentStep) {
      const val = s.value ?? '';
      line = `  ${GREEN('✔')} ${WHITE(padRight(s.label, labelWidth))}${CYAN(val)}`;
    } else if (i === currentStep) {
      line = `  ${BRAND.bold('▸')} ${BRAND.bold(padRight(s.label, labelWidth))}${DIM(s.desc)}`;
    } else {
      line = `  ${DIM('○')} ${DIM(padRight(s.label, labelWidth))}${DIM(s.desc)}`;
    }
    out.push(frameRow(padRightAnsi(line, W)));
  }

  // Progress bar
  out.push(emptyRow());
  const pct = Math.round((currentStep / steps.length) * 100);
  const barLen = Math.max(10, W - 36);
  const filled = Math.round((currentStep / steps.length) * barLen);
  const bar = BRAND('█'.repeat(filled)) + DIM('░'.repeat(barLen - filled));
  const footer = `  ${bar}  ${DIM(`${pct}%  ·  Step ${currentStep + 1} of ${steps.length}`)}`;
  out.push(frameRow(padRightAnsi(footer, W)));

  // Bottom border
  out.push(emptyRow());
  out.push(`  ${BRAND('╚' + '═'.repeat(W) + '╝')}`);

  return out.join('\n');
}

// ── Banner ───────────────────────────────────────────────
export function printBanner() {
  const W = FRAME_WIDTH;
  const out = [];

  out.push(`  ${BRAND('╔' + '═'.repeat(W) + '╗')}`);
  out.push(emptyRow());

  for (const line of ASCII_ART) {
    out.push(frameRow(BRAND.bold(centerIn(line, W))));
  }

  out.push(emptyRow());
  const subtitle = 'Decentralized AI inference on TON blockchain';
  out.push(frameRow(DIM(centerIn(subtitle, W))));
  out.push(frameRow(DIM(centerIn(`v${VERSION}`, W))));
  out.push(emptyRow());
  out.push(`  ${BRAND('╚' + '═'.repeat(W) + '╝')}`);

  console.log('\n' + out.join('\n'));
}

// ── Reusable helpers ─────────────────────────────────────

export function section(title) {
  console.log(`\n  ${BOLD.underline(title)}\n`);
}

export function row(label, value, width = 24) {
  console.log(`  ${DIM(label.padEnd(width))} ${value}`);
}

export function success(msg) {
  console.log(`  ${GREEN('✔')} ${msg}`);
}

export function error(msg) {
  console.error(`  ${RED('✗')} ${msg}`);
}

export function fatal(msg) {
  error(msg);
  process.exit(1);
}

export function handleClientError(err, port) {
  if (err.cause?.code === 'ECONNREFUSED') {
    error(`Cannot connect to client on port ${port}.`);
    console.error(YELLOW(`  Is the client running? Start it with: ${BRAND('npx cocoon start')}`));
    console.error('');
  } else {
    error(err.message);
  }
  process.exit(1);
}

export function separator() {
  console.log(BRAND(`  ${'─'.repeat(FRAME_WIDTH + 2)}`));
}

/**
 * Render a note/info box
 */
export function noteBox(title, lines) {
  const W = FRAME_WIDTH;
  const out = [];
  out.push(`  ${YELLOW('┌' + '─'.repeat(W) + '┐')}`);
  if (title) {
    out.push(`  ${YELLOW('│')} ${YELLOW.bold(padRight(title, W - 1))}${YELLOW('│')}`);
    out.push(`  ${YELLOW('├' + '─'.repeat(W) + '┤')}`);
  }
  for (const line of lines) {
    const content = `  ${line}`;
    const vis = stripAnsi(content).length;
    out.push(`  ${YELLOW('│')}${content}${' '.repeat(Math.max(0, W - vis))}${YELLOW('│')}`);
  }
  out.push(`  ${YELLOW('└' + '─'.repeat(W) + '┘')}`);
  console.log(out.join('\n'));
}

/**
 * Render a success summary box (green border)
 */
/**
 * Rewrite the current terminal line (for polling/progress updates)
 */
export function updateLine(text) {
  process.stdout.write(`\r\x1b[K  ${text}`);
}

/**
 * Finish an updateLine sequence (move to next line)
 */
export function finishLine() {
  process.stdout.write('\n');
}

export function successBox(title, rows) {
  const W = FRAME_WIDTH;
  const out = [];
  out.push(`  ${GREEN('╔' + '═'.repeat(W) + '╗')}`);
  out.push(`  ${GREEN('║')} ${GREEN.bold(padRight(title, W - 1))}${GREEN('║')}`);
  out.push(`  ${GREEN('╠' + '═'.repeat(W) + '╣')}`);
  for (const [label, value] of rows) {
    const content = `  ${DIM(padRight(label, 20))}${value}`;
    const vis = stripAnsi(content).length;
    out.push(`  ${GREEN('║')}${content}${' '.repeat(Math.max(0, W - vis))}${GREEN('║')}`);
  }
  out.push(`  ${GREEN('╚' + '═'.repeat(W) + '╝')}`);
  console.log(out.join('\n'));
}
