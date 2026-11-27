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

  onLaunch() {
    this.checkUpdate();
  },

  // 版本更新只对正式版有意义，其它版本直接跳过：
  //   develop  代码就在本地，不存在"新版本"
  //   trial    换体验版是后台重新指定 + 重新扫码，不走 UpdateManager
  // 顺带一提，envVersion 要基础库 2.10.0 才有，更低的版本会被 config/env.js 兜底成
  // develop，这层判断也把那种环境挡住了。
  checkUpdate() {
    if (env.envVersion !== "release") return;

    const updateManager = wx.getUpdateManager();

    // 冷启动时微信已经自动查过一次，这里只是收结果，没有主动触发的接口
    updateManager.onCheckForUpdate((res) => {
      if (res.hasUpdate) console.log("[update] 发现新版本，后台下载中");
    });

    // 新包下好后才允许 applyUpdate。不点重启也不会有损失——下次冷启动会自动用新版，
    // 所以给"稍后"是安全的，不用强制打断用户正在做的事。
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: "发现新版本",
        content: "新版本已下载完成，重启后生效",
        confirmText: "立即重启",
        cancelText: "稍后",
        success: (res) => {
          if (res.confirm) updateManager.applyUpdate();
        },
      });
    });

    // 下载失败基本是网络问题，本地包还能继续用，重进一次会重新下
    updateManager.onUpdateFailed(() => {
      wx.showModal({
        title: "更新失败",
        content: "新版本下载失败，请删除小程序后重新打开",
        showCancel: false,
      });
    });
  },
});
