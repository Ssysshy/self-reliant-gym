const { report } = require("../../api");
const { load, choose } = require("../../utils/buddy");
const { img } = require("../../utils/image");

// 挑搭子：后台配好的全列出来，选中的打勾。选完就写进个人信息 + 本地，
// 首页 onShow 会重新读本地缓存，退回去立刻换人。
Page({
  data: {
    ready: false,
    list: [],
    current: 0,
  },
  async onLoad() {
    try {
      const b = await load();
      this.setData({
        ready: true,
        current: b.buddy ? b.buddy.ID : 0,
        // 只留渲染要用的字段，图片统一拼 CDN 前缀
        list: (b.list || []).map((x) => ({
          ID: x.ID,
          Name: x.Name,
          ImageURL: img(x.ImageURL),
        })),
      });
    } catch (e) {
      this.setData({ ready: true });
      report(e);
    }
  },
  async select(e) {
    if (this.saving) return;
    const item = this.data.list[e.currentTarget.dataset.i];
    // 点已经选中的那个不发请求，省一次往返
    if (!item || item.ID === this.data.current) return;
    this.saving = true;
    try {
      await choose(item);
      this.setData({ current: item.ID });
      wx.showToast({ title: "已设为健身搭子", icon: "none" });
    } catch (err) {
      report(err);
    } finally {
      this.saving = false;
    }
  },
});
