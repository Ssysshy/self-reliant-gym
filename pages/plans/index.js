const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

// 计划库：本周进度 + 已保存的计划 + 两条新建入口（智能生成 / 自定义周计划）。
// 排周计划本身在 pages/custom，这一页只负责展示和往里跳。
Page({
  data: {
    plans: [],
    templates: [],
    smart: false,
    selectedDays: [],
    selectedGear: [],
    focus: "全身",
    minutes: 30,
    // 展示用：本周进度、训练日选择、器材与部位标签
    completed: [],
    local: null,
    lastSession: null,
    weekView: [],
    dayOpts: WEEK.map((label, i) => ({ d: i + 1, label, on: false })),
    gearOpts: [],
    focusOpts: [],
  },
  async onLoad() {
    try {
      const [templates, exercises] = await Promise.all([
        request("/templates"),
        request("/exercises"),
      ]);
      const focuses = ["全身", ...new Set(exercises.map((x) => x.Muscle))];
      this.setData({
        // 可用器材按分类勾选（器械/杠铃/哑铃…），不按具体机型，否则选项会多到没法选
        gearOpts: [...new Set(exercises.map((x) => x.Category))].map((v) => ({
          v,
          on: false,
        })),
        focusOpts: focuses.map((v) => ({ v, on: v === "全身" })),
        templates,
      });
    } catch (e) {
      report(e);
    }
  },
  // 计划列表也放在 onShow：从自定义周计划页保存或删除后退回来，这一页不会重新 onLoad
  async onShow() {
    try {
      const [rows, user, plans] = await Promise.all([
        request("/sessions"),
        request("/me"),
        request("/plans"),
      ]);
      this.uid = user.ID;
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
        plans,
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
  // 模板只是起稿的底子：套用后进编辑页，改完保存才成为自己的一份
  useTemplate(e) {
    wx.navigateTo({ url: "/pages/custom/index?template=" + e.detail.value });
  },
  modify(e) {
    wx.navigateTo({ url: "/pages/custom/index?id=" + e.currentTarget.dataset.id });
  },
  // 删整份计划（训练日一起删）。历史训练记录是当时的快照，不跟着删。
  // 删的正好是当前计划时，后端把当前位顶到剩下最新的一份，这里只跟着刷新 activeId。
  async del(e) {
    const p = this.data.plans[e.currentTarget.dataset.i];
    if (!p) return;
    const r = await wx.showModal({
      title: "删除「" + p.Name + "」？",
      content: "这份计划和它的 " + (p.Days || []).length + " 个训练日会一起删掉，练过的记录保留。",
      confirmText: "删除",
      confirmColor: "#d92b2b",
    });
    if (!r.confirm) return;
    try {
      const res = await request("/plans/" + p.ID, "DELETE");
      // 这份计划上还有没练完的进度，删掉后一并清掉，否则「继续未结束训练」会指向不存在的计划
      const local = this.data.local;
      const stale = !!local && local.PlanID === p.ID;
      if (stale) wx.removeStorageSync("workout:" + this.uid);
      this.setData({
        plans: this.data.plans.filter((x) => x.ID !== p.ID),
        activeId: res.Active,
        local: stale ? null : local,
      });
      wx.showToast({ title: "已删除", icon: "none" });
    } catch (err) {
      report(err);
    }
  },
  smart() {
    if (!this.member) {
      wx.showModal({
        title: "智能生成需要 PRO 会员",
        confirmText: "查看会员",
        success: (r) => {
          if (r.confirm) wx.navigateTo({ url: "/pages/member/index" });
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
      // 草案动作太多塞不进 URL，暂存到本地交给编辑页，用户看过再决定保存
      wx.setStorageSync("plan:draft", p);
      this.setData({ smart: false });
      wx.navigateTo({ url: "/pages/custom/index?draft=1" });
    } catch (e) {
      report(e);
    }
  },
  // 自定义周计划是独立页，这一页只留入口
  edit() {
    wx.navigateTo({ url: "/pages/custom/index" });
  },
  // 进训练统一先过清单页，看清楚这次练什么再开始
  go(id, day = 0) {
    wx.navigateTo({ url: "/pages/preview/index?id=" + id + "&day=" + day });
  },
  resume() {
    const local = this.data.local;
    if (local) this.go(local.PlanID, local.Weekday);
  },
  start(e) {
    this.go(e.currentTarget.dataset.id, e.currentTarget.dataset.day);
  },
});
