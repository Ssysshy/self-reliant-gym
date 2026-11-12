const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
// 智能生成的草案动辄十几个动作，塞不进 URL，改成本地暂存交接一次
const DRAFT = "plan:draft";

// 自定义周计划：一个训练日一组动作，排完一周保存成自己的一份计划。
// 三种入口共用这一页：空手新建、调整已有计划（?id=）、从模板或智能草案起稿（?template= / ?draft=1）。
Page({
  data: {
    name: "",
    week: 1,
    exercises: [],
    items: [],
    days: [],
    // 正在编辑的计划 ID：0 表示新建，非 0 表示改这一条（保存时原地更新）
    planId: 0,
    // 保存中：防止连点重复提交
    saving: false,
    weekChips: WEEK.map((label, i) => ({ d: i + 1, label: "周" + label })),
  },
  async onLoad(q) {
    try {
      const [me, exercises] = await Promise.all([request("/me"), request("/exercises")]);
      // 保存时要带上当前计划 ID 做乐观校验，后端对不上会判冲突
      this.active = me.Active;
      this.setData({ exercises });
      // 三个入口按优先级取一个起稿来源，取到就返回，后面的不再请求
      if (Number(q.id) > 0) {
        const plans = await request("/plans");
        const p = plans.find((x) => x.ID === Number(q.id));
        if (p) return this.fill({ name: p.Name, days: p.Days, id: p.ID });
      }
      if (q.template !== undefined) {
        const templates = await request("/templates");
        const p = templates[Number(q.template)];
        if (p) return this.fill({ name: p.Name, days: p.Days });
      }
      if (q.draft) {
        const p = wx.getStorageSync(DRAFT);
        // 草案只用一次，读到就清掉，免得下次新建时又冒出来
        wx.removeStorageSync(DRAFT);
        if (p) return this.fill({ name: p.Name, days: p.Days });
      }
    } catch (e) {
      report(e);
    }
  },
  // 起稿统一走这里：除了填名称和训练日，还要把第一个训练日的动作取出来。
  // 只填 days 不填 items 的话动作区是空的，得切一次训练日才出现（items 只有 pickWeek 会重算）。
  fill({ name, days, id = 0 }) {
    const week = days[0]?.Weekday || 1;
    const day = days.find((d) => d.Weekday === week);
    this.setData({ name, days, week, items: day ? day.Items : [], planId: id });
  },
  name(e) {
    this.setData({ name: e.detail.value });
  },
  pickWeek(e) {
    const week = e.currentTarget.dataset.v;
    this.setData({
      week,
      items: this.data.days.find((d) => d.Weekday === week)?.Items || [],
    });
  },
  add(e) {
    const x = this.data.exercises[e.detail.value];
    this.setData({
      items: [...this.data.items, { Name: x.Name, Sets: 3, Reps: 10, Rest: 60 }],
    });
  },
  field(e) {
    const { i, k } = e.currentTarget.dataset;
    this.setData({ ["items[" + i + "]." + k]: Number(e.detail.value) });
  },
  removeItem(e) {
    this.setData({
      items: this.data.items.filter((_, i) => i !== e.currentTarget.dataset.i),
    });
  },
  day() {
    const { week, items, days } = this.data;
    if (!items.length) return;
    // 计划里的动作可能已经不在动作库（下架/改名），取不到部位时跳过而不是让整页崩掉
    const focus =
      [
        ...new Set(
          items
            .map((i) => this.data.exercises.find((x) => x.Name === i.Name)?.Muscle)
            .filter(Boolean),
        ),
      ].join("、") || "训练";
    this.setData({
      days: [
        ...days.filter((d) => d.Weekday !== week),
        { Weekday: week, Focus: focus, Items: items },
      ].sort((a, b) => a.Weekday - b.Weekday),
      items: [],
    });
  },
  async save() {
    // 连点两次会发两次 POST，即便后端按 Operation 幂等，也会白等一次往返
    if (this.data.saving) return;
    this.setData({ saving: true });
    let p;
    try {
      // 当前训练日还没点「保存此训练日」的改动，保存计划时一起带上
      if (this.data.items.length) this.day();
      const { name, days, planId } = this.data;
      p = await request("/plans", "POST", {
        Operation:
          this.operationId ||
          (this.operationId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)),
        ID: planId,
        Active: this.active,
        Custom: { Name: name, Days: days },
      });
      this.operationId = null;
      this.active = p.ID;
    } catch (e) {
      report(e);
      this.setData({ saving: false });
      return;
    }
    // 先把按钮的 loading 收掉再弹窗：保存成功后这一页马上要走，晚了 setData 会打到已卸载的页面
    this.setData({ saving: false });
    const r = await wx.showModal({
      title: "让我们马上开练吧",
      confirmText: "猛攻",
    });
    if (!r.confirm) {
      // 计划库在 onShow 会重拉列表，直接退回就能看到这份计划
      wx.navigateBack();
      return;
    }
    // 用 redirectTo 把本页换成清单页：返回时直接回到计划库，不会退回已经保存过的编辑页
    wx.redirectTo({ url: "/pages/preview/index?id=" + p.ID + "&day=0" });
  },
});
