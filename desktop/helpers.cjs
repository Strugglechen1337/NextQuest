const os = require('node:os');
function lanAddress(interfaces = os.networkInterfaces()) {
  for (const entries of Object.values(interfaces)) for (const entry of entries || []) {
    if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) return entry.address;
  }
  return null;
}
function basic(password) { return `Basic ${Buffer.from(`nextquest:${password}`).toString('base64')}`; }
module.exports = { lanAddress, basic };
