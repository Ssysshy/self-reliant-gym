const { request, login, report } = require("../../api");
Page({
  data: {
    stage: "",
    experience: "",
    templates: [],
    frequency: 2,
    frequencies: [],
    focus: ["全身"],
    focuses: [],
    matches: [],
    plan: null,
  },
  onShow() {
    if (wx.getStorageSync("token")) this.inspect().catch(report);
  },
  async inspect() {
    const u = await request("/me");
    this.user = u;
    if (!u.Active && !this.dismissed) await this.guide(u);
  },
  async guide(u) {
    if (!u.Experience) {
      this.setData({ stage: "experience" });
      return;
    }
    if (u.Experience === "训练老炮") {
      this.dismissed = true;
      wx.navigateTo({ url: "/pages/plans/index?edit=1" });
      return;
    }
    const [templates, exercises] = await Promise.all([
      request("/templates"),
      request("/exercises"),
    ]);
    this.muscles = new Map(exercises.map((x) => [x.Name, x.Muscle]));
    const frequencies = [
      ...new Set(templates.map((t) => t.Days.length)),
    ].sort();
    const focuses = [
      ...new Set(
        templates.flatMap((t) =>
          t.Days.flatMap((d) => [
            d.Focus,
            ...d.Items.map((i) => this.muscles.get(i.Name)).filter(Boolean),
          ]),
        ),
      ),
    ];
    this.setData({
      stage: "preferences",
      templates,
      frequencies,
      frequency: frequencies[0] || 2,
      focuses,
      focus: [focuses[0] || "全身"],
      marked: { [focuses[0] || "全身"]: true },
    });
  },
  async open(e) {
    if (this.busy) return;
    this.busy = true;
    try {
      const kind = e.currentTarget.dataset.kind;
      if (kind === "动作库" || kind === "器材库") {
        wx.navigateTo({ url: "/pages/library/index?kind=" + kind });
        return;
      }
      const u = wx.getStorageSync("token")
        ? await request("/me")
        : await login();
      this.user = u;
      if (kind === "记录与账户") {
        wx.navigateTo({ url: "/pages/account/index" });
        return;
      }
      if (!u.Active) {
        await this.guide(u);
        return;
      }
      wx.navigateTo({ url: "/pages/plans/index" });
    } catch (err) {
      report(err);
    } finally {
      this.busy = false;
    }
  },
  async experience(e) {
    try {
      const Experience = e.currentTarget.dataset.v;
      await request("/experience", "PUT", { Experience });
      this.setData({ stage: "" });
      await this.guide({ ...this.user, Experience });
    } catch (err) {
      report(err);
    }
  },
  select(e) {
    if (e.currentTarget.dataset.key === "focus") {
      const value = e.currentTarget.dataset.v;
      let focus = this.data.focus.filter((x) => x !== "全身" && x !== value);
      if (value === "全身") focus = ["全身"];
      else if (!this.data.focus.includes(value)) focus.push(value);
      this.setData({
        focus,
        marked: focus.reduce((m, k) => ({ ...m, [k]: true }), {}),
      });
      return;
    }
    this.setData({ [e.currentTarget.dataset.key]: e.currentTarget.dataset.v });
  },
  match() {
    const { templates, frequency, focus } = this.data;
    const matches = templates.filter(
      (t) =>
        t.Days.length === frequency &&
        focus.length &&
        focus.every((f) =>
          t.Days.some(
            (d) =>
              d.Focus === f ||
              d.Items.some((i) => this.muscles.get(i.Name) === f),
          ),
        ),
    );
    this.setData({ matches, stage: "matches" });
  },
  back() {
    this.setData({ stage: "preferences" });
  },
  close() {
    this.dismissed = true;
    this.setData({ stage: "" });
  },
  async adopt(e) {
    if (this.busy) return;
    this.busy = true;
    try {
      const p = this.data.matches[e.currentTarget.dataset.i];
      const plan = await request("/plans", "POST", {
        Operation:
          this.operationId ||
          (this.operationId =
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2)),
        Template: p.ID,
        Revision: p.Revision,
        Active: this.user.Active,
      });
      this.operationId = null;
      this.setData({ stage: "start", plan });
    } catch (err) {
      report(err);
    } finally {
      this.busy = false;
    }
  },
  start() {
    this.close();
    wx.navigateTo({ url: "/pages/workout/index?id=" + this.data.plan.ID });
  },
});
