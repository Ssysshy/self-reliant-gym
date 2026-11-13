const { request, report } = require("../../api");

// 推荐计划列表：两列封面卡片，点进详情再决定要不要启用。
// 数据走 /templates（后端只下发 owner=0 且 published 的模板），封面等信息在 meta 里。
Page({
  data: {
    list: [],
    // ready 用来区分「还在拉数据」和「确实没有模板」，否则加载中会先闪一下空状态
    ready: false,
  },
  // 用 onShow 而不是 onLoad：从详情页启用完退回来时列表可能已经变了
  async onShow() {
    try {
      const list = await request("/templates");
      this.setData({ list, ready: true });
    } catch (e) {
      this.setData({ ready: true });
      report(e);
    }
  },
  open(e) {
    const t = this.data.list[e.currentTarget.dataset.i];
    if (t) wx.navigateTo({ url: "/pages/template/index?id=" + t.ID });
  },
});
