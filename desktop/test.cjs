const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lanAddress, basic } = require('./helpers.cjs');
test('selects a usable LAN IPv4 address', () => { assert.equal(lanAddress({ a: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }], b: [{ family: 'IPv4', internal: false, address: '192.168.1.2' }] }), '192.168.1.2'); assert.equal(lanAddress({}), null); });
test('builds Basic credentials', () => assert.equal(Buffer.from(basic('secret').slice(6), 'base64').toString(), 'nextquest:secret'));

const { launchOptions } = require('./helpers.cjs');
test('automation options and precedence', () => { assert.deepEqual(launchOptions(['--data-dir=D:/cli', '--quit', '--screenshot=D:/a.png'], { NEXTQUEST_DATA_DIR: 'D:/env', NEXTQUEST_PASSWORD: 'secret' }), { dataDir: 'D:/cli', password: 'secret', screenshot: 'D:/a.png', qrScreenshot: undefined, quit: true }); assert.equal(launchOptions([], { NEXTQUEST_DATA_DIR: 'D:/env' }).dataDir, 'D:/env'); });
