// Стандартный пресет Expo. Metro и без этого файла берёт его по умолчанию, но
// babel-jest (jest-expo) требует явный babel-config, иначе не трансформирует TS.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
