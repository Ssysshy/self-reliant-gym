const { request, report } = require("../../api");
const { img } = require("../../utils/image");

Page({
  data: { item: null },
  async onLoad(q) {
    try {
      const item = await request("/exercises/" + q.id);
      wx.setNavigationBarTitle({ title: item.Name });
      // 示范图库里存的是相对路径，渲染前统一拼 CDN 前缀
      this.setData({ item: { ...item, ImageURL: img(item.ImageURL) } });
    } catch (e) {
      report(e);
    }
  },
});
