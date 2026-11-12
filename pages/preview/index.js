const { request, report } = require("../../api");

// 开练前的清单页：只读 /sessions/preview，不写本地进度。
// 本地进度仍然由 pages/workout 创建，这里只读来判断「继续」还是「开始」。
Page({
  data: {
    ready: false,
    failed: false,
    focus: "",
    week: 0,
    items: [],
    total: 0,
    minutes: 0,
    resumable: false,
    done: 0,
  },

  async onLoad(q) {
    this.planId = Number(q.id);
    this.weekday = Number(q.day || 0);
    await this.load();
  },

  async load() {
    try {
      const [plan, exercises, me] = await Promise.all([
        request("/sessions/preview?plan=" + this.planId + "&weekday=" + (this.weekday || 0)),
        request("/exercises"),
        request("/me"),
      ]);
      // day 传 0 时由后端决定今天该练哪天，拿到结果后把真实星期记下来给执行页
      this.weekday = plan.Day.Weekday;
      const meta = new Map(exercises.map((x) => [x.Name, x]));
      const items = plan.Day.Items || [];
      const total = items.reduce((n, it) => n + it.Sets, 0);

      // 同一计划的同一训练日才有「继续」；别的天有进度交给执行页原来的弹窗处理
      this.storeKey = "workout:" + me.ID;
      this.restKey = "rest:" + me.ID + ":" + this.planId + ":" + this.weekday;
      const local = wx.getStorageSync(this.storeKey);
      const same = local && local.PlanID === this.planId && local.Weekday === this.weekday;
      const done = same ? (local.Done || []).filter((n) => n > 0).length : 0;
      const cursor = same ? local.Cursor || 0 : -1;

      // 已完成组按 items 顺序切片，和 workout 里 Cursor 的分块方式一致
      let at = 0;
      const cards = items.map((it) => {
        const ex = meta.get(it.Name);
        const hit = same ? local.Done.slice(at, at + it.Sets).filter((n) => n > 0).length : 0;
        // 游标落在这一段里，说明上次停在这个动作
        const current = same && cursor >= at && cursor < at + it.Sets;
        at += it.Sets;
        return {
          id: ex ? ex.ID : 0,
          name: it.Name,
          Sets: it.Sets,
          Reps: it.Reps,
          Rest: it.Rest,
          img: ex ? ex.ImageURL : "",
          muscle: ex ? ex.Muscle : "",
          meta: [ex && ex.SubMuscle, ex && ex.Category].filter(Boolean).join(" · "),
          doneSets: hit,
          current,
        };
      });

      // 预计时长按每组 30 秒动作 + 组间休息粗算，取整到 5 分钟
      const seconds = items.reduce((n, it) => n + it.Sets * (30 + it.Rest), 0);

      this.setData({
        ready: true,
        focus: plan.Day.Focus || "训练",
        week: this.weekday,
        items: cards,
        total,
        minutes: Math.max(5, Math.round(seconds / 60 / 5) * 5),
        resumable: done > 0,
        done,
      });
    } catch (e) {
      this.setData({ failed: true });
      report(e);
    }
  },

  // 用 redirectTo 替换掉清单页：练完从执行页返回，回到的是计划页而不是这里
  start() {
    wx.redirectTo({
      url: "/pages/workout/index?id=" + this.planId + "&day=" + this.weekday,
    });
  },

  // 从第 i 个动作开始：执行页把 Cursor 挪到该动作第一组，前面没练的组留 0（记为跳过）
  async begin(e) {
    const i = Number(e.currentTarget.dataset.i);
    const go = () =>
      wx.redirectTo({
        url: "/pages/workout/index?id=" + this.planId + "&day=" + this.weekday + "&from=" + i,
      });
    if (!this.data.done || i === 0) return go();
    const r = await wx.showModal({
      title: "从「" + this.data.items[i].name + "」开始？",
      content: "已记录的 " + this.data.done + " 组会保留，起点之前没练的组记为跳过。",
      confirmText: "从这里开始",
    });
    if (r.confirm) go();
  },

  // 有进度时给个出口，否则同一天一旦开始就只能一路接着练
  async restart() {
    const r = await wx.showModal({
      title: "重新开始这一场？",
      content: "已记录的 " + this.data.done + " 组会清空。",
      confirmText: "重新开始",
    });
    if (!r.confirm) return;
    wx.removeStorageSync(this.storeKey);
    wx.removeStorageSync(this.restKey);
    this.start();
  },

  open(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/exercise/index?id=" + id });
  },

  back() {
    wx.navigateBack();
  },
});
