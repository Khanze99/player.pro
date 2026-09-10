// Тесты бэкенд-логики клиента (крипто-хранилище сессии, расчёты) не завязаны на
// нативные модули — гоняем в node-окружении через jest-expo/node: там
// process.env.EXPO_OS === 'web' и резолвятся *.web.ts.
module.exports = {
  preset: 'jest-expo/node',
  setupFiles: ['<rootDir>/jest.setup.js'],
};
