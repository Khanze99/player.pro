// Полифиллы того, чего нет в jest-овском node-sandbox, но что есть в браузере
// (jest-expo/node мёржит свой setup-web поверх этого).

const { webcrypto } = require('node:crypto');

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
if (typeof globalThis.btoa !== 'function') {
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
}
if (typeof globalThis.atob !== 'function') {
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
}
