const { resolve } = require("./config/env");

// 启动时定一次接口地址和图片 CDN 前缀，全站只读 globalData.apiBase / cdnImg，
// 页面里不要再写死域名（图片一律先过 utils/image.js 的 img()）
const env = resolve();
console.log(
  "[env] " +
    env.label +
    " (" +
    env.envVersion +
    ") → " +
    env.apiBase +
    (env.cdnImg ? " | 图片 " + env.cdnImg : ""),
);

App({
  globalData: {
    apiBase: env.apiBase,
    cdnImg: env.cdnImg,
    envVersion: env.envVersion,
  },
});
