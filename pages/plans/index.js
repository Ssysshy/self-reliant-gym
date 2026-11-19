const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

// 计划库：本周进度 + 当前计划的一天。
// 存下来的计划可以有多份（免费 1 / 会员 6），但练的永远只有一份，所以这里只展示当前计划：
// 上面的星期选择器切换要看哪天，下面的卡片就是那天的安排；点计划名去详情页看整周。
// 换一份计划走「切换计划」，排周计划本身在 pages/custom。
Page({
  data: {
    plans: [],
    active: null,
    // 星期选择器与选中那天的内容（rest 为 true 表示这天没安排训练）
    weekView: [],
    day: null,
    // 智能生成：先收条件，再出草案
    smart: false,
    selectedDays: [],
    selectedGear: [],
    focus: "全身",
    minutes: 30,
    // 展示用：本周进度、进行中的训练、最近一次记录
    completed: [],
    local: null,
    lastSession: null,
    dayOpts: WEEK.map((label, i) => ({ d: i + 1, label, on: false })),
    gearOpts: [],
    focusOpts: [],
  },
  async onLoad() {
    try {
      const exercises = await request("/exercises");
      // 计划里只存动作名，点动作行要跳教学页，所以先建一张 名字 → ID 的表
      this.ids = new Map(exercises.map((x) => [x.Name, x.ID]));
      const focuses = ["全身", ...new Set(exercises.map((x) => x.Muscle))];
      this.setData({
        // 可用器材按分类勾选（器械/杠铃/哑铃…），不按具体机型，否则选项会多到没法选
        gearOpts: [...new Set(exercises.map((x) => x.Category))].map((v) => ({
          v,
          on: false,
        })),
        focusOpts: focuses.map((v) => ({ v, on: v === "全身" })),
      });
    } catch (e) {
      report(e);
    }
  },
  // 计划列表也放在 onShow：从自定义页保存、或从详情页调整后退回来，这一页不会重新 onLoad
  async onShow() {
    try {
      const [rows, user, plans] = await Promise.all([
        request("/sessions"),
        request("/me"),
        request("/plans"),
      ]);
      this.uid = user.ID;
      this.member = new Date(user.Expires) > new Date();
      // 份数上限由后端 /me 下发（免费 1 份、会员 6 份），前端不写死，跟着会员配置走
      this.limit = Number(user.PlanLimit) || (this.member ? 6 : 1);
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

      // 当前计划：用户 Active 指向的那份；老数据 Active 为 0 时退回最新的一份
      const active = plans.find((p) => p.ID === user.Active) || plans[0] || null;
      // 只在同一份计划上保留用户手动点的星期，换了计划就重新落到今天/最近的一个训练日
      const keep = active && this.selPlan === active.ID && this.selDay;
      const sel = active
        ? keep
          ? this.selDay
          : this.firstDay(active, weekday)
        : weekday;
      this.selPlan = active ? active.ID : 0;
      this.selDay = sel;

      this.setData({
        plans,
        active,
        completed,
        sel,
        day: active ? this.dayOf(active, sel) : null,
        weekView: this.weekOf(active, sel, weekday, completed),
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
      });
    } catch (err) {
      report(err);
    }
  },
  // 首次进入或换了计划时落在哪天：今天有安排就是今天，否则顺延到本周下一个训练日
  firstDay(p, today) {
    const days = (p.Days || []).map((d) => d.Weekday);
    if (!days.length) return today;
    if (days.includes(today)) return today;
    for (let i = 1; i <= 7; i++) {
      const d = ((today - 1 + i) % 7) + 1;
      if (days.includes(d)) return d;
    }
    return today;
  },
  // 星期选择器的一格：has 有安排、done 本周练过、today 今天、sel 当前选中
  weekOf(p, sel, today, completed) {
    const has = new Set(((p && p.Days) || []).map((d) => d.Weekday));
    return WEEK.map((label, i) => ({
      d: i + 1,
      label,
      has: has.has(i + 1),
      done: completed.includes(i + 1),
      today: i + 1 === today,
      sel: i + 1 === sel,
    }));
  },
  // 把计划里某一天整理成页面直接能渲染的结构；没有安排的那天按休息日处理
  dayOf(p, weekday) {
    const found = (p.Days || []).find((d) => d.Weekday === weekday);
    const label = WEEK[weekday - 1];
    if (!found) {
      return { weekday, label, rest: true, focus: "休息", items: [], sets: 0, minutes: 0 };
    }
    const items = (found.Items || []).map((it, i) => ({
      key: weekday + "-" + i,
      Name: it.Name,
      Sets: it.Sets,
      Reps: it.Reps,
      Rest: it.Rest,
      id: (this.ids && this.ids.get(it.Name)) || 0,
    }));
    // 和预览页同一个估时口径：每组 30 秒动作 + 组间休息，取整到 5 分钟
    const seconds = items.reduce((n, it) => n + it.Sets * (30 + it.Rest), 0);
    return {
      weekday,
      label,
      rest: false,
      focus: found.Focus,
      items,
      sets: items.reduce((n, it) => n + it.Sets, 0),
      minutes: Math.max(5, Math.round(seconds / 60 / 5) * 5),
    };
  },
  // 点星期只换内容，不动数据
  pickDay(e) {
    const sel = Number(e.currentTarget.dataset.d);
    const active = this.data.active;
    if (!active || sel === this.data.sel) return;
    this.selDay = sel;
    const today = ((new Date(Date.now() + 8 * 3600000).getUTCDay() + 6) % 7) + 1;
    this.setData({
      sel,
      day: this.dayOf(active, sel),
      weekView: this.weekOf(active, sel, today, this.data.completed),
    });
  },
  // 计划名 → 整周详情（所有训练日一次看完）
  openPlan() {
    if (!this.data.active) return;
    wx.navigateTo({ url: "/pages/plandetail/index?id=" + this.data.active.ID });
  },
  openExercise(e) {
    const id = e.currentTarget.dataset.id;
    if (id) wx.navigateTo({ url: "/pages/exercise/index?id=" + id });
  },
  // 模板从「原生 picker 弹窗」改成独立页：封面卡片列表 + 详情，比一列文字好挑
  browse() {
    wx.navigateTo({ url: "/pages/templates/index" });
  },
  modify(e) {
    wx.navigateTo({ url: "/pages/custom/index?id=" + e.currentTarget.dataset.id });
  },
  // 只有当前计划在页面上，删的就是它。删完重新拉一遍，当前位由后端顶到剩下最新的一份。
  async del() {
    const p = this.data.active;
    if (!p) return;
    const r = await wx.showModal({
      title: "删除「" + p.Name + "」？",
      content: "这份计划和它的 " + (p.Days || []).length + " 个训练日会一起删掉，练过的记录保留。",
      confirmText: "删除",
      confirmColor: "#d92b2b",
    });
    if (!r.confirm) return;
    try {
      await request("/plans/" + p.ID, "DELETE");
      // 这份计划上还有没练完的进度，删掉后一并清掉，否则「继续未结束训练」会指向不存在的计划
      if (this.data.local && this.data.local.PlanID === p.ID) {
        wx.removeStorageSync("workout:" + this.uid);
      }
      wx.showToast({ title: "已删除", icon: "none" });
      await this.onShow();
    } catch (err) {
      report(err);
    }
  },
  // 多份计划时的切换入口：动作面板列名字（会员上限 6 份，正好在面板条数以内）
  async switchPlan() {
    const others = this.data.plans.filter((p) => p.ID !== (this.data.active || {}).ID);
    if (!others.length) return;
    let tapIndex = 0;
    try {
      const r = await wx.showActionSheet({ itemList: others.map((p) => p.Name) });
      tapIndex = r.tapIndex;
    } catch (e) {
      return; // 取消
    }
    try {
      await request("/plans/" + others[tapIndex].ID + "/active", "PUT");
      this.selDay = 0; // 换了计划，星期重新落到今天
      await this.onShow();
      wx.showToast({ title: "已切换", icon: "none" });
    } catch (err) {
      report(err);
    }
  },
  // 份数到顶就在入口挡住：别让人排完一周、点保存时才被拒。
  // 只约束「新建」，点「调整」改已有计划照常放行；返回 true 表示已经弹过提示。
  blocked() {
    const limit = this.limit || 1;
    if (this.data.plans.length < limit) return false;
    wx.showModal({
      title: "已保存 " + limit + " 份计划",
      content: this.member
        ? "这是会员上限，删掉一份不用的再新建。"
        : "免费版最多 1 份计划，开通会员可保存 6 份。",
      confirmText: this.member ? "知道了" : "查看会员",
      showCancel: !this.member,
      success: (r) => {
        if (r.confirm && !this.member) wx.navigateTo({ url: "/pages/member/index" });
      },
    });
    return true;
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
    if (this.blocked()) return;
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
    if (this.blocked()) return;
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
  // 开练的就是当前计划的当前这一天
  startDay() {
    const { active, day, sel } = this.data;
    if (active && day && !day.rest) this.go(active.ID, sel);
  },
});
