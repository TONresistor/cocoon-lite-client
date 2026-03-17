/**
 * Event Classifier — transforms raw binary events into structured,
 * human-readable events with proper severity levels.
 *
 * Input: raw events from process.js (type + data)
 * Output: classified events { type, level, message, category, timestamp }
 *
 * Categories:
 * - milestone: key state transitions (staked, ready, etc.)
 * - lifecycle: normal operational events (synced, initialized)
 * - warning: recoverable issues (Error 653, low balance)
 * - debug: binary noise (FwdProxy, policy, raw logs)
 * - error: operation failures
 * - fatal: crash/abort
 */

// Noise patterns — these binary lines are demoted to debug
const NOISE_PATTERNS = [
  /FwdProxy\.cpp.*set policy name/,
  /Using default Intel root key/,
  /router\.cpp:\d+/,
  /unknown magic 0x/,
  /dropping received message/,
];

// Warning patterns — these get special human-readable messages
const WARNING_PATTERNS = [
  {
    pattern: /Error : 653 : cancelled/,
    message: 'Proxy connection pending — stake confirming on-chain',
    dedup: true, // only show once, then suppress repeats
  },
  {
    pattern: /ACTION REQUIRED: BALANCE.*TOO LOW/,
    message: 'Node wallet balance is low — top up to continue operations',
    dedup: false,
  },
];

// Lifecycle events from process.js patterns
const LIFECYCLE_MESSAGES = {
  ton_synced: 'TON blockchain synced',
  initialized: 'Client initialized',
  proxy_connecting: 'Connecting to proxy...',
  proxy_ready: 'Proxy handshake complete',
  connection_ready: 'Connection established',
  listening: null, // handled separately
};

// Track dedup state
const seenWarnings = new Set();

export function classifyEvent(event, data) {
  const timestamp = Date.now();

  // Handle synthesized events from client.js
  if (event === 'exit' || event === 'starting' || event === 'stopping' || event === 'stopped') {
    return { type: event, level: 'info', message: data?.message || event, category: 'lifecycle', timestamp };
  }

  if (event === 'fatal') {
    return { type: 'fatal', level: 'fatal', message: Array.isArray(data) ? data[0] : 'Client crashed', category: 'error', timestamp };
  }

  if (LIFECYCLE_MESSAGES[event] !== undefined) {
    let message = LIFECYCLE_MESSAGES[event];
    if (event === 'listening') {
      const raw = Array.isArray(data) ? data[0] : '';
      const portMatch = raw.match?.(/port:(\d+)/);
      message = portMatch ? `Listening on port ${portMatch[1]}` : 'Listener started';
    }
    return { type: event, level: 'info', message, category: 'lifecycle', timestamp };
  }

  // Error events from process.js pattern #8
  if (event === 'error') {
    const raw = Array.isArray(data) ? data[0] : (data?.message || 'Unknown error');
    return { type: 'error', level: 'error', message: raw, category: 'error', timestamp };
  }

  // Log events (raw binary lines that didn't match lifecycle patterns)
  if (event === 'log') {
    const raw = Array.isArray(data) ? data[0] : (typeof data === 'string' ? data : '');

    // Check warning patterns first
    for (const wp of WARNING_PATTERNS) {
      if (wp.pattern.test(raw)) {
        if (wp.dedup) {
          const key = wp.message;
          if (seenWarnings.has(key)) {
            // Return as debug (suppressed repeat)
            return { type: 'log', level: 'debug', message: raw, category: 'debug', timestamp };
          }
          seenWarnings.add(key);
        }
        return { type: 'warning', level: 'warn', message: wp.message, category: 'warning', timestamp };
      }
    }

    // Check noise patterns
    for (const np of NOISE_PATTERNS) {
      if (np.test(raw)) {
        return { type: 'log', level: 'debug', message: raw, category: 'debug', timestamp };
      }
    }

    // Default: keep as debug
    return { type: 'log', level: 'debug', message: raw, category: 'debug', timestamp };
  }

  // Fallback
  const message = Array.isArray(data) ? data[0] : (data?.message || event);
  return { type: event, level: 'info', message, category: 'lifecycle', timestamp };
}

/**
 * Create a milestone event (for state tracker)
 */
export function createMilestone(message) {
  return { type: 'milestone', level: 'info', message, category: 'milestone', timestamp: Date.now() };
}

/**
 * Reset dedup state (call on client stop/restart)
 */
export function resetClassifier() {
  seenWarnings.clear();
}
