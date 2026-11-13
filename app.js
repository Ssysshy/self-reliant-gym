const { resolve } = require("./config/env");

// 启动时定一次接口地址，全站只读 globalData.apiBase，页面里不要再写死域名
const env = resolve();
console.log("[env] " + env.label + " (" + env.envVersion + ") → " + env.apiBase);

App({
  globalData: { apiBase: env.apiBase, envVersion: env.envVersion },
});
