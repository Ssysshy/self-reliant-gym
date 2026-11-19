const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

// 计划详情：一份计划的整周安排一次看完。
// 计划库那页只显示「今天/选中的这一天」，想看全部（以及哪天休息）从这里进；
// 点某一天直接去那天的开练清单。
Page({
  data: {
    name: "",
    days: [],
    trainingDays: 0,
    totalItems: 0,
    failed: false,
  },
  async onLoad(q) {
    this.id = Number(q.id);
  },
  // 放 onShow：从「调整」页改完退回来，这一页要能看到新的安排
  async onShow() {
    try {
      const plans = await request("/plans");
      const p = plans.find((x) => x.ID === this.id);
      if (!p) {
        this.setData({ failed: true });
        return;
      }
      const byWeek = new Map((p.Days || []).map((d) => [d.Weekday, d]));
      const days = WEEK.map((label, i) => {
        const d = byWeek.get(i + 1);
        if (!d) {
          return { Weekday: i + 1, label, rest: true, Focus: "休息", count: 0, items: [] };
        }
        const items = (d.Items || []).map((it, k) => ({
          key: k,
          Name: it.Name,
          Sets: it.Sets,
          Reps: it.Reps,
          Rest: it.Rest,
        }));
        return { Weekday: i + 1, label, rest: false, Focus: d.Focus, count: items.length, items };
      });
      this.setData({
        failed: false,
        name: p.Name,
        days,
        trainingDays: (p.Days || []).length,
        totalItems: (p.Days || []).reduce((n, d) => n + (d.Items || []).length, 0),
      });
    } catch (e) {
      this.setData({ failed: true });
      report(e);
    }
  },
  // 点某一天 → 那天的开练清单；休息日不跳
  open(e) {
    const day = Number(e.currentTarget.dataset.day || 0);
    if (!day) return;
    wx.navigateTo({ url: "/pages/preview/index?id=" + this.id + "&day=" + day });
  },
  modify() {
    wx.navigateTo({ url: "/pages/custom/index?id=" + this.id });
  },
});
