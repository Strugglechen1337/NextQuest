const os = require('node:os');
function lanAddress(interfaces = os.networkInterfaces()) {
  for (const entries of Object.values(interfaces)) for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) return entry.address;
  }
  return null;
}
function basic(password) { return `Basic ${Buffer.from(`nextquest:${password}`).toString('base64')}`; }
function option(args, name) { const value = args.find(arg => arg.startsWith(`--${name}=`)); return value ? value.slice(name.length + 3) : undefined; }
function launchOptions(args, env) { return { dataDir: option(args, 'data-dir') || env.NEXTQUEST_DATA_DIR, password: env.NEXTQUEST_PASSWORD, screenshot: option(args, 'screenshot'), qrScreenshot: option(args, 'qr-screenshot'), quit: args.includes('--quit') }; }
module.exports = { lanAddress, basic, launchOptions };
