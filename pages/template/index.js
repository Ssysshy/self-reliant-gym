const { request, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];

// 模板详情：封面 + 分段介绍 + 训练安排，底部「启用该模板」。
// 分段文案来自模板的 meta.Blocks（后台/脚本维护），训练安排直接从 Days 生成。
Page({
  data: {
    name: "",
    cover: "",
    level: "",
    minutes: 0,
    blocks: [],
    schedule: [],
    // 模板本身的 ID 与版本号，启用时要一起带上做乐观校验
    tid: 0,
    revision: 0,
    saving: false,
    failed: false,
  },
  async onLoad(q) {
    try {
      const [templates, me, mine] = await Promise.all([
        request("/templates"),
        request("/me"),
        request("/plans"),
      ]);
      const t = templates.find((x) => x.ID === Number(q.id));
      if (!t) return this.setData({ failed: true });
      this.me = me;
      this.mine = mine;
      // 份数上限由后端下发（免费 1 / 会员 6）：启用模板等于新建一份计划
      this.limit = Number(me.PlanLimit) || 1;
      const meta = t.Meta || {};
      const days = t.Days || [];
      this.setData({
        name: t.Name,
        cover: meta.Cover || "",
        level: meta.Level || "",
        minutes: meta.Minutes || 0,
        blocks: meta.Blocks || [],
        tid: t.ID,
        revision: t.Revision,
        schedule: days.map((d) => ({
          Weekday: d.Weekday,
          label: WEEK[d.Weekday - 1],
          Focus: d.Focus,
          count: (d.Items || []).length,
          // 只挑前三个动作做预览，够看出这一天练什么，又不至于挤成三行
          preview: (d.Items || [])
            .slice(0, 3)
            .map((i) => i.Name)
            .join("、"),
        })),
      });
    } catch (e) {
      this.setData({ failed: true });
      report(e);
    }
  },
  async enable() {
    // 连点两次会建出两份一样的计划，先挡住
    if (this.data.saving) return;
    this.setData({ saving: true });
    const { tid, revision, name } = this.data;
    const operation = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    let plan;
    try {
      // 已经存过同名计划就复用那一份（原地更新并置为当前），不然每点一次多一份重复的
      const same = (this.mine || []).find((x) => x.Name === name);
      // 只有真正新建才受份数上限约束：复用同名计划不占新名额，后端也只拦新建
      if (!same && (this.mine || []).length >= (this.limit || 1)) {
        this.setData({ saving: false });
        const member = new Date(this.me.Expires) > new Date();
        const r = await wx.showModal({
          title: "已保存 " + (this.limit || 1) + " 份计划",
          content: member
            ? "这是会员上限，删掉一份不用的再启用。"
            : "免费版最多 1 份计划，开通会员可保存 6 份。",
          confirmText: member ? "知道了" : "查看会员",
          showCancel: !member,
        });
        if (r.confirm && !member) wx.navigateTo({ url: "/pages/member/index" });
        return;
      }
      if (same) {
        plan = await request("/plans", "POST", {
          Operation: operation(),
          ID: same.ID,
          Active: this.me.Active,
          Custom: { Name: same.Name, Days: same.Days },
        });
        wx.showToast({ title: "已切到这份计划", icon: "none" });
      } else {
        plan = await request("/plans", "POST", {
          Operation: operation(),
          Template: tid,
          Revision: revision,
          Active: this.me.Active,
        });
        wx.showToast({ title: "已启用", icon: "none" });
      }
    } catch (e) {
      this.setData({ saving: false });
      report(e);
      return;
    }
    this.setData({ saving: false });
    // 模板详情在栈里的位置是 plans → templates → template，回退两格正好落在计划库，
    // 那一页 onShow 会重拉列表，能看到刚启用的这份成了「当前」。
    wx.navigateBack({ delta: 2, fail: () => wx.reLaunch({ url: "/pages/plans/index" }) });
  },
});
