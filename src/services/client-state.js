/**
 * Shared client state — exposes the running status and HTTP port
 * of the COCOON client process so that any module (routes, services)
 * can query it without importing a route module.
 *
 * The route handler in api/routes/client.js owns the actual process
 * lifecycle and calls `setClientState` / `clearClientState` here.
 */

const state = {
  running: false,
  httpPort: null,
  startedAt: null,
};

/** Get the HTTP port the client-runner is listening on. */
export function getClientPort() {
  return state.httpPort;
}

/** Whether the client process is currently running. */
export function isClientRunning() {
  return state.running;
}

/** Get the timestamp when the client was started. */
export function getClientStartedAt() {
  return state.startedAt;
}

/**
 * Mark the client as running.
 * Called by the client route handler after a successful launch.
 */
export function setClientState(httpPort) {
  state.running = true;
  state.httpPort = httpPort;
  state.startedAt = Date.now();
}

/**
 * Mark the client as stopped.
 * Called by the client route handler on teardown.
 */
export function clearClientState() {
  state.running = false;
  state.httpPort = null;
  state.startedAt = null;
}
