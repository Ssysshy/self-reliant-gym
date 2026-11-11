const { request, report } = require("../../api");
const { when } = require("../../utils/time");

Page({
  data: { orders: [], ready: false, busy: "" },
  async onShow() {
    await this.load();
  },
  async load() {
    try {
      const rows = await request("/orders");
      this.setData({
        ready: true,
        orders: rows.map((o) => ({
          ...o,
          time: when(o.CreatedAt),
          yuan: (o.Price / 100).toFixed(2).replace(/\.00$/, ""),
        })),
      });
    } catch (e) {
      this.setData({ ready: true });
      report(e);
    }
  },
  async check(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.busy) return;
    this.setData({ busy: id });
    try {
      await request("/orders/" + id + "/reconcile", "POST");
      await this.load();
      wx.showToast({ title: "已刷新", icon: "none" });
    } catch (err) {
      report(err);
    } finally {
      this.setData({ busy: "" });
    }
  },
});
