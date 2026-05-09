module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // vision-camera v5 + fast-tflite v3 = Nitro Modules 기반.
    // worklets-core/plugin 더 이상 필요 X (v4 era).
    plugins: [],
  };
};
