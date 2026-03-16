import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// NOTE: renderTemplate() in src/lib/client.js is NOT exported.
// It is a private function, so it cannot be tested directly without refactoring.
// The tests below reimplement the same logic to document the known bug
// (partial variable match: $PORT matching inside $PORT_RPC) and verify
// that the replaceAll-based approach used in client.js handles it correctly
// when variables are sorted properly.

/**
 * Reimplementation of renderTemplate's variable substitution logic
 * (mirrors src/lib/client.js lines 15-19) for testing purposes.
 */
function renderTemplateVars(content, vars) {
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`"$${key}"`, JSON.stringify(value));
    content = content.replaceAll(`$${key}`, String(value));
  }
  return content;
}

describe('renderTemplate variable substitution (reimplemented)', () => {
  it('replaces a single variable', () => {
    const result = renderTemplateVars('port=$PORT', { PORT: '8080' });
    assert.equal(result, 'port=8080');
  });

  it('replaces JSON-quoted variables', () => {
    const result = renderTemplateVars('{"port": "$PORT"}', { PORT: '8080' });
    assert.equal(result, '{"port": "8080"}');
  });

  it('replaces multiple different variables', () => {
    const template = '{"http": "$CLIENT_HTTP_PORT", "rpc": "$CLIENT_RPC_PORT"}';
    const vars = { CLIENT_HTTP_PORT: '10000', CLIENT_RPC_PORT: '10001' };
    const result = renderTemplateVars(template, vars);
    assert.equal(result, '{"http": "10000", "rpc": "10001"}');
  });

  // Known bug: When iterating Object.entries(), if $PORT is processed before
  // $PORT_RPC, then $PORT inside $PORT_RPC gets replaced first, corrupting
  // the longer variable name.
  describe('partial variable match bug ($PORT vs $PORT_RPC)', () => {
    it('corrupts $PORT_RPC when $PORT is processed first', () => {
      const template = 'http=$PORT rpc=$PORT_RPC';
      // Object.entries iteration order follows insertion order in JS.
      // If PORT comes before PORT_RPC, PORT replaces the $PORT inside $PORT_RPC.
      const vars = { PORT: '8080', PORT_RPC: '8081' };
      const result = renderTemplateVars(template, vars);

      // The bug: $PORT in $PORT_RPC gets replaced first, producing "8080_RPC",
      // then $PORT_RPC no longer matches anything.
      assert.equal(result, 'http=8080 rpc=8080_RPC',
        'demonstrates the partial match corruption');
    });

    it('works correctly when longer variable is processed first', () => {
      const template = 'http=$PORT rpc=$PORT_RPC';
      // If PORT_RPC comes first, it gets replaced before PORT can corrupt it.
      const vars = { PORT_RPC: '8081', PORT: '8080' };
      const result = renderTemplateVars(template, vars);

      assert.equal(result, 'http=8080 rpc=8081',
        'longer-first ordering avoids the bug');
    });
  });

  // The actual client.js uses getRuntimeVars() which produces keys like
  // CLIENT_HTTP_PORT and CLIENT_RPC_PORT — these share a common prefix.
  // Verify that the real variable names from getRuntimeVars work correctly.
  describe('with real getRuntimeVars keys', () => {
    it('substitutes CLIENT_HTTP_PORT and CLIENT_RPC_PORT independently', () => {
      const template = '{"http": "$CLIENT_HTTP_PORT", "rpc": "$CLIENT_RPC_PORT"}';
      const vars = {
        CLIENT_HTTP_PORT: '10000',
        CLIENT_RPC_PORT: '10001',
        OWNER_ADDRESS: 'EQtest',
        ROOT_CONTRACT_ADDRESS: 'EQroot',
        NODE_WALLET_KEY: 'abc123',
        IS_DEBUG: '0',
        TON_CONFIG_FILE: '/tmp/global.config.json',
      };
      const result = renderTemplateVars(template, vars);
      assert.equal(result, '{"http": "10000", "rpc": "10001"}');
    });

    it('does not corrupt CLIENT_RPC_PORT when CLIENT_ prefix variables exist', () => {
      // CLIENT_HTTP_PORT contains "CLIENT_" which is a prefix of CLIENT_RPC_PORT
      // but since neither is a prefix of the other's $-prefixed form, this is safe.
      const template = '$CLIENT_HTTP_PORT $CLIENT_RPC_PORT';
      const vars = { CLIENT_HTTP_PORT: '10000', CLIENT_RPC_PORT: '10001' };
      const result = renderTemplateVars(template, vars);
      assert.equal(result, '10000 10001');
    });
  });
});
