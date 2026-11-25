const { request, login, report } = require("../../api");
const { img } = require("../../utils/image");
const { load: getBuddy } = require("../../utils/buddy");

// 首页入口。器材库暂时下架，恢复时把对应项的 on 改回 true 即可。
// 页面本身不用动：pages/library 是靠 kind 参数区分动作库/器材库的。
const HOME_ENTRIES = [
  { label: "动作库", icon: "◎", desc: "了解动作与目标肌群", on: true },
  { label: "器材库", icon: "◇", desc: "找到器材的使用方法", on: false },
  { label: "训练计划", icon: "▤", desc: "安排每周的训练", on: true },
  { label: "记录与账户", icon: "◍", desc: "回看记录与会员", on: true },
];

// 选模板的卡片上画一周七格，下标 0 是周一（和计划里 Weekday 1-7 对齐）
const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

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

// 引导跳去别的页面（如自己排计划）后不该再往首页上盖弹窗
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
    // 右下角的健身搭子，以及点击后冒出来的那句台词（空 = 不显示气泡）
    buddy: null,
    line: "",
    // 还没有计划的人：弹窗里直接列推荐模板，选中一套再启用
    templates: [],
    picked: -1,
    saving: false,
  },
  async onShow() {
    // 先走引导（还没有计划的人），再弹鼓励语：两层遮罩叠在一起没法操作
    if (wx.getStorageSync("token")) await this.inspect().catch(report);
    // 搭子先画出来（本地有缓存就是同步的），再轮到鼓励弹窗
    await this.showBuddy();
    await this.encourage();
  },
  // 右下角的健身搭子：本地缓存里挑中的那个优先，没挑过就用列表第一个。
  // 这里的失败一律吞掉——搭子只是装饰，不该因为接口挂了在首页弹错误。
  async showBuddy() {
    try {
      const b = await getBuddy(this.user && this.user.BuddyID);
      if (!b.buddy) {
        this.setData({ buddy: null });
        return;
      }
      // 图片拼 CDN 前缀，Quotes 原样留着给点一下随机取用
      this.setData({ buddy: { ...b.buddy, ImageURL: img(b.buddy.ImageURL) } });
    } catch (e) {
      // 忽略
    }
  },
  // 点一下搭子：随机冒一句，几秒后自己收起来
  talk() {
    const quotes = (this.data.buddy && this.data.buddy.Quotes) || [];
    if (!quotes.length) return;
    let next = quotes[Math.floor(Math.random() * quotes.length)];
    // 尽量不连着冒同一句；只有一句的时候也只好重复
    for (let i = 0; i < 5 && quotes.length > 1 && next === this.data.line; i++) {
      next = quotes[Math.floor(Math.random() * quotes.length)];
    }
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.setData({ line: next });
    this.bubbleTimer = setTimeout(() => {
      this.bubbleTimer = null;
      this.setData({ line: "" });
    }, 8200);
  },
  // 离开首页就把气泡收掉，回来时不带着上次那句
  onHide() {
    this.stopBubble();
  },
  onUnload() {
    this.stopBubble();
  },
  stopBubble() {
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    this.bubbleTimer = null;
    if (this.data.line) this.setData({ line: "" });
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
      // 每次都问一次接口：运营可能在当天手动换了「今日推送」，缓存只当断网时的兜底
      let card = sameDay ? mark.card : null;
      try {
        card = (await request("/encouragements/today")) || null;
      } catch (e) {
        // 断网：当天有缓存就继续用，没有就下次进入再试（这一趟不记次数）
        if (!card) return;
      }
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
      // 意外错误同样不记次数，下次进入首页再试
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
    // 已经有计划的人不该被弹窗拦住；一次停留里关掉之后也不再打扰
    if (this.dismissed || (await this.hasPlan())) return;
    await this.pick();
  },
  // 有没有计划不能只看 /me 的 Active：老数据的 Active 是 0 但计划还在（计划页会退回最新一份），
  // 那种人再建一份会撞上「免费 1 份」的上限，所以 Active 为 0 时再问一次 /plans。
  async hasPlan() {
    if (this.user && this.user.Active) return true;
    const plans = await request("/plans");
    return plans.length > 0;
  },
  // 没有计划的人：不再先问「小白还是老炮」，也不按一周几练、练哪儿筛选，
  // 直接把后台发布的模板摆出来让人选（点卡片选中，再点按钮启用）。
  async pick() {
    if (this.picking) return;
    this.picking = true;
    try {
      const list = await request("/templates");
      if (!list.length) {
        // 后台一个模板都没发布，弹个空窗没意义，给句话让人自己排
        wx.showToast({ title: "还没有可用的模板", icon: "none" });
        return;
      }
      this.setData({
        stage: "templates",
        picked: -1,
        templates: list.map((t) => {
          const meta = t.Meta || {};
          const days = t.Days || [];
          const on = new Set(days.map((d) => d.Weekday));
          return {
            ID: t.ID,
            Revision: t.Revision,
            Name: t.Name,
            // 天数单独用左边的方块显示，这行只留时长和难度
            days: days.length,
            meta: [
              meta.Minutes ? "约 " + meta.Minutes + " 分钟" : "",
              meta.Level || "",
            ]
              .filter(Boolean)
              .join(" · "),
            // 一周七格：有安排的那天点亮，比「6 个训练日」更能看出练的是哪几天
            week: WEEK.map((label, i) => ({ label, on: on.has(i + 1) })),
          };
        }),
      });
    } catch (e) {
      report(e);
    } finally {
      this.picking = false;
    }
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
      // 训练计划：没有计划就地弹模板让人选一套，有计划才进计划页
      if (await this.hasPlan()) {
        wx.navigateTo({ url: "/pages/plans/index" });
        return;
      }
      await this.pick();
    } catch (err) {
      report(err);
    } finally {
      this.busy = false;
    }
  },
  // 点卡片只选中：一点就直接建计划太容易误触，多出来的那份还得自己去删
  choose(e) {
    this.setData({ picked: Number(e.currentTarget.dataset.i) });
  },
  close() {
    if (this.data.saving) return;
    this.dismissed = true;
    this.setData({ stage: "" });
    // 引导关掉后补一次鼓励弹窗：刚才是它占着屏才没弹
    this.encourage();
  },
  // 不想用模板的人从这里自己排一周（原来是「训练老炮」那条自动跳转）
  custom() {
    this.dismissed = true;
    this.setData({ stage: "" });
    wx.navigateTo({ url: "/pages/custom/index" });
  },
  async adopt() {
    if (this.data.saving) return;
    const p = this.data.templates[this.data.picked];
    if (!p) {
      // 按钮一直是可点的，没选就点只会给一句提示，不至于莫名其妙没有反应
      wx.showToast({ title: "先点上面的卡片选一套", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    // 同一个 Operation 重试时后端返回已建好的那份，不会重复建计划
    this.operationId =
      this.operationId ||
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    try {
      await request("/plans", "POST", {
        Operation: this.operationId,
        Template: p.ID,
        Revision: p.Revision,
        Active: (this.user && this.user.Active) || 0,
      });
      this.operationId = null;
      this.dismissed = true;
      this.setData({ stage: "", saving: false });
      wx.showToast({ title: "已启用", icon: "none" });
      // 启用后直接进计划页：今天的安排就在那儿，从那儿开练
      wx.navigateTo({ url: "/pages/plans/index" });
    } catch (err) {
      this.setData({ saving: false });
      report(err);
    }
  },
});
