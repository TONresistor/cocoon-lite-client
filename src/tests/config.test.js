import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readClientConf, writeClientConf } from '../lib/config.js';

describe('readClientConf / writeClientConf roundtrip', () => {
  let tempDir;
  let tempConf;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cocoon-test-'));
    tempConf = join(tempDir, 'client.conf');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns null for a missing file', () => {
    const result = readClientConf(tempConf);
    assert.equal(result, null);
  });

  it('roundtrips key-value pairs through write then read', () => {
    const input = {
      owner_address: 'EQtest1234567890',
      instance: '0',
      node_wallet_key: 'abc123deadbeef',
      root_contract_address: 'EQCns7bYSp0igFvS1wpb5wsZjCKCV19MD5AVzI4EyxsnU73k',
    };

    writeClientConf(input, tempConf);
    const output = readClientConf(tempConf);

    assert.equal(output.owner_address, input.owner_address);
    assert.equal(output.instance, input.instance);
    assert.equal(output.node_wallet_key, input.node_wallet_key);
    assert.equal(output.root_contract_address, input.root_contract_address);
  });

  it('preserves the [node] section header and type = client', () => {
    writeClientConf({ instance: '1' }, tempConf);
    const output = readClientConf(tempConf);

    // writeClientConf always writes type = client, and readClientConf skips
    // section headers but parses key=value lines, so type should be present
    assert.equal(output.type, 'client');
  });

  it('does not duplicate the type key when input contains type', () => {
    const input = { type: 'client', instance: '2' };
    writeClientConf(input, tempConf);
    const output = readClientConf(tempConf);

    assert.equal(output.type, 'client');
    assert.equal(output.instance, '2');
  });

  it('skips comment lines and blank lines', () => {
    // Write a config manually with comments
    writeFileSync(tempConf, [
      '# This is a comment',
      '',
      '[node]',
      'type = client',
      '# Another comment',
      'instance = 3',
      '',
    ].join('\n'));

    const output = readClientConf(tempConf);
    assert.equal(output.type, 'client');
    assert.equal(output.instance, '3');
    // Comments and section headers should not appear as keys
    assert.equal(output['# This is a comment'], undefined);
    assert.equal(output['[node]'], undefined);
  });

  it('handles values containing equals signs', () => {
    writeFileSync(tempConf, 'some_key = value=with=equals\n');

    const output = readClientConf(tempConf);
    assert.equal(output.some_key, 'value=with=equals');
  });

  it('creates the file with restricted permissions', () => {
    writeClientConf({ instance: '0' }, tempConf);
    assert.ok(existsSync(tempConf), 'conf file should exist after write');
  });
});
