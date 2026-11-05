const { request, report } = require("../../api");
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
  },
  async onLoad(q) {
    try {
      const [u, plans, templates, exercises] = await Promise.all(
        ["/me", "/plans", "/templates", "/exercises"].map((p) => request(p)),
      );
      this.active = u.Active;
      this.member = new Date(u.Expires) > new Date();
      this.setData({
        gear: [...new Set(exercises.map((x) => x.Equipment))],
        focuses: ["全身", ...new Set(exercises.map((x) => x.Muscle))],
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
      const [rows, user] = await Promise.all([
        request("/sessions"),
        request("/me"),
      ]);
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
      this.setData({
        completed,
        activeId: user.Active,
        currentSession: rows.find((s) => !s.Ended),
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
          if (r.confirm)
            wx.navigateTo({ url: "/pages/account/index?section=PRO" });
        },
      });
      return;
    }
    this.setData({ smart: true });
  },
  choices(e) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  focus(e) {
    this.setData({ focus: this.data.focuses[e.detail.value] });
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
  week(e) {
    const week = Number(e.detail.value) + 1;
    this.setData({
      week,
      items: this.data.days.find((d) => d.Weekday === week)?.Items || [],
    });
  },
  add(e) {
    const x = this.data.exercises[e.detail.value];
    this.setData({
      items: [
        ...this.data.items,
        { Name: x.Name, Sets: 3, Reps: 10, Rest: 60 },
      ],
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
      ...new Set(
        items.map(
          (i) => this.data.exercises.find((x) => x.Name === i.Name).Muscle,
        ),
      ),
    ].join("、");
    this.setData({
      days: [
        ...days.filter((d) => d.Weekday !== week),
        { Weekday: week, Focus: focus, Items: items },
      ],
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
          (this.operationId =
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2)),
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
  start(e) {
    this.go(e.currentTarget.dataset.id, e.currentTarget.dataset.day);
  },
});
