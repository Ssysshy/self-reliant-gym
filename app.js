const config = wx.getExtConfigSync() || {};
App({
  globalData: { apiBase: config.apiBase || "http://127.0.0.1:18080/api/v1" },
});
