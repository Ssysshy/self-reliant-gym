const { request, login, report } = require("../../api");

// 首页入口。器材库暂时下架，恢复时把对应项的 on 改回 true 即可。
// 页面本身不用动：pages/library 是靠 kind 参数区分动作库/器材库的。
const HOME_ENTRIES = [
  { label: "动作库", icon: "◎", desc: "了解动作与目标肌群", on: true },
  { label: "器材库", icon: "◇", desc: "找到器材的使用方法", on: false },
  { label: "训练计划", icon: "▤", desc: "安排每周的训练", on: true },
  { label: "记录与账户", icon: "◍", desc: "回看记录与会员", on: true },
];

// 首页鼓励弹窗：后台每天定一条「今日推送」，这里只取这一条，每天最多弹两次。
// 本地只记「今天弹了几次、今天这条是什么」，换一天自动从头算；两次用完当天不再打扰。
const ENCOURAGE_KEY = "encouragement";
const ENCOURAGE_TIMES = 2;

// 「今天」按北京时间算，和 utils/time.js 的展示口径一致：
// 手机时区乱改也不该让同一个自然日里多弹两次。
function today() {
  const d = new Date(Date.now() + 8 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
}

// 引导跳去别的页面（如「训练老炮」直通自定义计划）后不该再往首页上盖弹窗
function onHome() {
  const pages = getCurrentPages();
  const top = pages[pages.length - 1];
  return !top || top.route === "pages/home/index";
}

Page({
  data: {
    entries: HOME_ENTRIES.filter((e) => e.on),
    stage: "",
    encourage: null,
    experience: "",
    templates: [],
    frequency: 2,
    frequencies: [],
    focus: ["全身"],
    focuses: [],
    matches: [],
    plan: null,
  },
  async onShow() {
    // 先走引导（没设经验/没计划的人），再弹鼓励语：两层遮罩叠在一起没法操作
    if (wx.getStorageSync("token")) await this.inspect().catch(report);
    await this.encourage();
  },
  // 鼓励弹窗：取后台今天的这一条，次数与日期落在本地。
  // 同一次停留只尝试一次 —— 从二级页返回首页也会触发 onShow，不该把两次额度连着用掉。
  async encourage() {
    if (this.encouraging || this.encouraged) return;
    // 新手引导正占着屏、或已经跳去别的页面，先不弹；关掉引导后由 close() 补一次
    if (this.data.stage || !onHome()) return;
    this.encouraging = true;
    try {
      const date = today();
      const mark = wx.getStorageSync(ENCOURAGE_KEY) || {};
      const sameDay = mark.date === date;
      const used = sameDay ? Number(mark.count) || 0 : 0;
      if (used >= ENCOURAGE_TIMES) {
        this.encouraged = true;
        return;
      }
      // 今天只有一条，第一次拿到就存下来：第二次弹窗直接用，不必再请求
      let card = sameDay ? mark.card : null;
      if (!card) card = await request("/encouragements/today");
      if (!card || !card.Text) {
        // 后台一条都没配（或全停用），今天不用再问了
        this.encouraged = true;
        return;
      }
      // 先记次数再展示：展示后被强杀，下次进入也不会把这次额度省掉
      wx.setStorageSync(ENCOURAGE_KEY, { date, count: used + 1, card });
      this.encouraged = true;
      this.setData({ encourage: card });
    } catch (e) {
      // 网络失败不记次数，下次进入首页再试：一次超时不该吃掉今天的额度
    } finally {
      this.encouraging = false;
    }
  },
  closeEncourage() {
    this.setData({ encourage: null });
  },
  // 卡片自己吞掉点击，避免点文案时穿透到遮罩把弹窗关掉
  noop() {},
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
      wx.navigateTo({ url: "/pages/custom/index" });
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
    // 引导关掉后补一次鼓励弹窗：刚才是它占着屏才没弹
    this.encourage();
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
    // 这里直接收引导、不走 close()：马上要跳去开练页，不该再叠一个鼓励弹窗
    this.dismissed = true;
    this.setData({ stage: "" });
    wx.navigateTo({ url: "/pages/preview/index?id=" + this.data.plan.ID });
  },
});
