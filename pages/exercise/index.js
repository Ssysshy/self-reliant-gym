const { request, report } = require("../../api");

Page({
  data: { item: null },
  async onLoad(q) {
    try {
      const item = await request("/exercises/" + q.id);
      wx.setNavigationBarTitle({ title: item.Name });
      this.setData({ item });
    } catch (e) {
      report(e);
    }
  },
});
