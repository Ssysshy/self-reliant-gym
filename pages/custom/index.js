const { request, exercises, report } = require("../../api");

const WEEK = ["一", "二", "三", "四", "五", "六", "日"];
// 候选行高（rpx），和 wxss 里 .suggest-row 的 height 保持一致；
// 列表固定按 5.5 行算高度，露出半行提示还能继续滑。
const ROW_H = 88;
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
    // 动作搜索框：输入即过滤动作库；没命中就按输入文字存成自建动作
    kw: "",
    matches: [],
    canCreate: false,
    // 候选列表高度：固定 5 行，超过的在列表内滚动（10 条也放得下）
    suggestHeight: 0,
    // 正在编辑的计划 ID：0 表示新建，非 0 表示改这一条（保存时原地更新）
    planId: 0,
    // 保存中：防止连点重复提交
    saving: false,
    weekChips: WEEK.map((label, i) => ({ d: i + 1, label: "周" + label })),
  },
  async onLoad(q) {
    try {
      const [me, list] = await Promise.all([request("/me"), exercises()]);
      // 保存时要带上当前计划 ID 做乐观校验，后端对不上会判冲突
      this.active = me.Active;
      this.setData({ exercises: list });
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
  // 输入即搜索：前缀命中排前面，其次名字短的；最多取 10 条，列表固定 5.5 行高，其余滑动查看。
  search(e) {
    const kw = e.detail.value;
    const q = kw.trim();
    const lower = q.toLowerCase();
    let matches = [];
    let exact = false;
    if (q) {
      for (const x of this.data.exercises) {
        const name = String(x.Name || "").toLowerCase();
        if (name === lower) exact = true;
        if (name.includes(lower)) {
          matches.push({
            ID: x.ID,
            Name: x.Name,
            meta: [x.Muscle, x.SubMuscle].filter(Boolean).join(" · "),
            at: name.indexOf(lower),
          });
        }
      }
      matches.sort((a, b) => a.at - b.at || a.Name.length - b.Name.length);
      matches = matches.slice(0, 10);
    }
    this.setData({
      kw,
      matches,
      canCreate: !!q && !exact,
      // 不足 5 行按实际条数；到第 6 条起固定 5.5 行，半行露出来提示可滑
      suggestHeight: Math.min(matches.length, 5.5) * ROW_H,
    });
  },
  // 点中候选：按动作库里的那条加，带 ExerciseID
  pick(e) {
    const x = this.data.exercises.find(
      (v) => v.ID === Number(e.currentTarget.dataset.id),
    );
    if (!x) return;
    this.append(x.ID, x.Name);
  },
  // 回车或点「添加」：完全同名就挂到动作库，没有同名就按输入文字存成自建动作（ExerciseID=0）
  addTyped() {
    const name = this.data.kw.trim();
    if (!name) return;
    // 英文动作名大小写不敏感，和上面的搜索口径保持一致
    const lower = name.toLowerCase();
    const hit = this.data.exercises.find(
      (x) => String(x.Name || "").toLowerCase() === lower,
    );
    this.append(hit ? hit.ID : 0, hit ? hit.Name : name);
  },
  append(id, name) {
    this.setData({
      items: [
        ...this.data.items,
        { ExerciseID: id, Name: name, Sets: 3, Reps: 10, Rest: 60 },
      ],
      kw: "",
      matches: [],
      canCreate: false,
      suggestHeight: 0,
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
