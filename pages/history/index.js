const { request, report } = require("../../api");
const { when } = require("../../utils/time");

Page({
  data: { rows: [], summary: {}, ready: false },
  async onShow() {
    try {
      const [rows, summary] = await Promise.all([
        request("/sessions"),
        request("/training/summary"),
      ]);
      this.setData({
        ready: true,
        summary,
        rows: rows.map((s) => {
          const done = (s.Done || []).filter((n) => n > 0).length;
          const total = (s.Done || []).length;
          return {
            ID: s.ID,
            focus: s.Day?.Focus || "训练",
            time: when(s.Started),
            done,
            total,
            // 早期版本留下的空会话没有组数，别显示成 0 / 0
            count: total ? done + " / " + total + " 组" : "未记录",
          };
        }),
      });
    } catch (e) {
      this.setData({ ready: true });
      report(e);
    }
  },
  open(e) {
    wx.navigateTo({
      url: "/pages/session/index?id=" + e.currentTarget.dataset.id,
    });
  },
});
