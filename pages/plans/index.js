const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

Page({
  data: {
    plans: [],
    templates: [],
    edit: false,
    smart: false,
    selectedDays: [],
    selectedGear: [],
    focus: "全身",
    minutes: 30,
    days: [],
    name: "",
    week: 1,
    exercises: [],
    items: [],
    // 展示用：本周进度、训练日选择、器材与部位标签、编辑态周几
    completed: [],
    local: null,
    lastSession: null,
    weekView: [],
    weekChips: WEEK.map((label, i) => ({ d: i + 1, label: "周" + label })),
    dayOpts: WEEK.map((label, i) => ({ d: i + 1, label, on: false })),
    gearOpts: [],
    focusOpts: [],
  },
  async onLoad(q) {
    try {
      const [u, plans, templates, exercises] = await Promise.all(
        ["/me", "/plans", "/templates", "/exercises"].map((p) => request(p)),
      );
      this.active = u.Active;
      this.member = new Date(u.Expires) > new Date();
      const focuses = ["全身", ...new Set(exercises.map((x) => x.Muscle))];
      this.setData({
        // 可用器材按分类勾选（器械/杠铃/哑铃…），不按具体机型，否则选项会多到没法选
        gearOpts: [...new Set(exercises.map((x) => x.Category))].map((v) => ({
          v,
          on: false,
        })),
        focusOpts: focuses.map((v) => ({ v, on: v === "全身" })),
        plans,
        templates,
        exercises,
        edit: q.edit === "1",
      });
    } catch (e) {
      report(e);
    }
  },
  async onShow() {
    try {
      const [rows, user] = await Promise.all([request("/sessions"), request("/me")]);
      this.member = new Date(user.Expires) > new Date();
      const today = new Date(Date.now() + 8 * 3600000);
      const start =
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate() - ((today.getUTCDay() + 6) % 7),
        ) -
        8 * 3600000;
      const completed = [
        ...new Set(
          rows
            .filter(
              (s) =>
                s.Ended &&
                Date.parse(s.Started) >= start &&
                s.Done.every((n) => n > 0) &&
                s.Done.length === s.Day.Items.reduce((n, i) => n + i.Sets, 0),
            )
            .map((s) => s.Day.Weekday),
        ),
      ];
      const weekday = ((new Date(Date.now() + 8 * 3600000).getUTCDay() + 6) % 7) + 1;
      // 组数以实际完成的为准：跳过记的是 0，不该算进「已完成」
      const groups = (s) => (s.Done || []).filter((n) => n > 0).length;
      const sets = (s) => (s.Day?.Items || []).reduce((n, item) => n + item.Sets, 0);
      const last =
        rows
          .filter((s) => s.Ended)
          .sort((a, b) => Date.parse(b.Started) - Date.parse(a.Started))[0] || null;
      // 进行中的训练进度存在本地，服务端只有已经提交过的完整记录
      const progress = wx.getStorageSync("workout:" + user.ID) || null;
      const done = progress ? groups(progress) : 0;
      this.setData({
        completed,
        activeId: user.Active,
        local:
          progress && done > 0
            ? {
                PlanID: progress.PlanID,
                Weekday: progress.Weekday,
                Focus: progress.Focus,
                done,
                total: (progress.Done || []).length,
              }
            : null,
        lastSession: last ? { focus: last.Day.Focus, done: groups(last), total: sets(last) } : null,
        weekView: WEEK.map((label, i) => ({
          d: i + 1,
          label,
          done: completed.includes(i + 1),
          today: i + 1 === weekday,
        })),
      });
    } catch (err) {
      report(err);
    }
  },
  useTemplate(e) {
    const p = this.data.templates[e.detail.value];
    this.setData({ edit: true, name: p.Name, days: p.Days });
  },
  modify(e) {
    const p = this.data.plans[e.currentTarget.dataset.i];
    this.setData({ edit: true, name: p.Name, days: p.Days, items: [] });
  },
  removeItem(e) {
    this.setData({
      items: this.data.items.filter((_, i) => i !== e.currentTarget.dataset.i),
    });
  },
  smart() {
    if (!this.member) {
      wx.showModal({
        title: "智能生成需要 PRO 会员",
        confirmText: "查看会员",
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: "/pages/account/index?section=PRO" });
        },
      });
      return;
    }
    this.setData({ smart: true });
  },
  cancel() {
    this.setData({ smart: false });
  },
  choices(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  // 智能生成：训练日与器材可多选，部位单选
  toggleDay(e) {
    const d = e.currentTarget.dataset.v;
    const selectedDays = this.data.selectedDays.includes(d)
      ? this.data.selectedDays.filter((x) => x !== d)
      : [...this.data.selectedDays, d].sort((a, b) => a - b);
    this.setData({
      selectedDays,
      dayOpts: this.data.dayOpts.map((o) => ({
        ...o,
        on: selectedDays.includes(o.d),
      })),
    });
  },
  toggleGear(e) {
    const v = e.currentTarget.dataset.v;
    const selectedGear = this.data.selectedGear.includes(v)
      ? this.data.selectedGear.filter((x) => x !== v)
      : [...this.data.selectedGear, v];
    this.setData({
      selectedGear,
      gearOpts: this.data.gearOpts.map((o) => ({
        ...o,
        on: selectedGear.includes(o.v),
      })),
    });
  },
  pickFocus(e) {
    const focus = e.currentTarget.dataset.v;
    this.setData({
      focus,
      focusOpts: this.data.focusOpts.map((o) => ({ ...o, on: o.v === focus })),
    });
  },
  async generate() {
    try {
      const d = this.data;
      const p = await request("/plans/generate", "POST", {
        Weekdays: d.selectedDays.map(Number),
        Equipment: d.selectedGear,
        Focus: d.focus,
        Minutes: Number(d.minutes),
      });
      this.setData({ smart: false, edit: true, days: p.Days, name: p.Name });
    } catch (e) {
      report(e);
    }
  },
  edit() {
    this.setData({ edit: true, days: [], items: [], name: "" });
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
  day() {
    const { week, items, days } = this.data;
    if (!items.length) return;
    const focus = [
      ...new Set(items.map((i) => this.data.exercises.find((x) => x.Name === i.Name).Muscle)),
    ].join("、");
    this.setData({
      days: [
        ...days.filter((d) => d.Weekday !== week),
        { Weekday: week, Focus: focus, Items: items },
      ].sort((a, b) => a.Weekday - b.Weekday),
      items: [],
    });
  },
  async save() {
    try {
      if (this.data.items.length) this.day();
      const { name, days } = this.data;
      const p = await request("/plans", "POST", {
        Operation:
          this.operationId ||
          (this.operationId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)),
        Active: this.active,
        Custom: { Name: name, Days: days },
      });
      this.operationId = null;
      this.active = p.ID;
      this.setData({
        activeId: p.ID,
        plans: [p, ...this.data.plans],
        edit: false,
      });
      const r = await wx.showModal({
        title: "让我们马上开练吧",
        confirmText: "猛攻",
      });
      if (r.confirm) this.go(p.ID);
    } catch (e) {
      report(e);
    }
  },
  go(id, day = 0) {
    wx.navigateTo({ url: "/pages/workout/index?id=" + id + "&day=" + day });
  },
  resume() {
    const local = this.data.local;
    if (local) this.go(local.PlanID, local.Weekday);
  },
  start(e) {
    this.go(e.currentTarget.dataset.id, e.currentTarget.dataset.day);
  },
});
