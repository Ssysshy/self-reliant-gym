const { request, report } = require("../../api");

// 训练进度放在本地：每组只写 storage，练完或中途结束才一次性提交给接口。
const storeKey = (uid) => "workout:" + uid;

Page({
  data: {
    ready: false,
    focus: "",
    total: 0,
    completed: 0,
    percent: 0,
    item: null,
    group: 1,
    reps: 0,
    weight: "",
    rest: 60,
    left: 0,
    saving: false,
    saved: false,
    error: "",
  },

  async onLoad(q) {
    this.planId = Number(q.id);
    this.weekday = Number(q.day || 0);
    try {
      const me = await request("/me");
      this.storeKey = storeKey(me.ID);
      this.restKey = "rest:" + me.ID + ":" + this.planId + ":" + this.weekday;
      const local = wx.getStorageSync(this.storeKey);
      const samePlan = local && local.PlanID === this.planId;
      const sameDay = samePlan && (!this.weekday || local.Weekday === this.weekday);
      if (sameDay) return this.apply(local);

      const done = local ? local.Done.filter((n) => n > 0).length : 0;
      if (samePlan && done > 0) {
        const r = await wx.showModal({
          title: "还有没练完的一场",
          content: local.Focus + " 已经练了 " + done + " 组，接着练吗？",
          confirmText: "接着练",
          cancelText: "重新开始",
        });
        if (r.confirm) return this.apply(local);
      }
      await this.fresh();
    } catch (e) {
      report(e);
    }
  },

  // 没有可续的本地进度时，按计划取这次要练的那一天
  async fresh() {
    const p = await request(
      "/sessions/preview?plan=" + this.planId + "&weekday=" + (this.weekday || 0),
    );
    const items = p.Day.Items || [];
    const done = items.reduce((a, i) => a.concat(Array(i.Sets).fill(0)), []);
    this.apply({
      Version: 1,
      PlanID: p.PlanID,
      Weekday: p.Day.Weekday,
      Focus: p.Day.Focus,
      Items: items,
      Done: done,
      Weights: done.map(() => null),
      Cursor: 0,
      Started: Date.now(),
      Operation: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2),
    });
  },

  apply(progress) {
    this.progress = progress;
    this.blocks = [];
    let at = 0;
    for (const item of progress.Items) {
      this.blocks.push({ start: at, sets: item.Sets, item });
      at += item.Sets;
    }
    wx.setStorageSync(this.storeKey, progress);
    this.render();
    this.tick();
  },

  render() {
    const p = this.progress;
    if (!p) return;
    const total = p.Done.length;
    const completed = p.Done.filter((n) => n > 0).length;
    const block =
      this.blocks.find((b) => p.Cursor >= b.start && p.Cursor < b.start + b.sets) || null;
    this.setData({
      ready: true,
      focus: p.Focus,
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0,
      item: block ? block.item : null,
      group: block ? p.Cursor - block.start + 1 : 1,
      reps: block ? block.item.Reps : 0,
      rest: block ? block.item.Rest : 60,
    });
  },

  // 休息倒计时存时间戳，退出重进也能接着走
  tick() {
    clearInterval(this.timer);
    if (!this.restKey) return;
    const render = () => {
      const deadline = Number(wx.getStorageSync(this.restKey) || 0);
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.setData({ left });
      if (!left) {
        clearInterval(this.timer);
        if (deadline) {
          wx.removeStorageSync(this.restKey);
          wx.vibrateShort({ type: "light" });
        }
      }
    };
    this.timer = setInterval(render, 500);
    render();
  },

  input(e) {
    this.setData({ reps: Number(e.detail.value) });
  },
  bump(e) {
    const step = Number(e.currentTarget.dataset.d);
    const reps = Math.min(200, Math.max(1, (Number(this.data.reps) || 0) + step));
    this.setData({ reps });
  },
  weight(e) {
    this.setData({ weight: e.detail.value });
  },
  duration(e) {
    this.setData({ rest: e.currentTarget.dataset.v });
  },

  async record(e) {
    if (this.data.saving || this.data.saved) return;
    const skip = !!e.currentTarget.dataset.skip;
    const p = this.progress;
    const block = this.blocks.find((b) => p.Cursor >= b.start && p.Cursor < b.start + b.sets);
    if (!block) return;
    try {
      if (skip) {
        p.Cursor = block.start + block.sets;
      } else {
        const { reps, rest, weight } = this.data;
        if (!Number.isInteger(reps) || reps < 1 || reps > 200) throw new Error("次数须为 1 至 200");
        if (
          weight !== "" &&
          (!Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 2000)
        )
          throw new Error("重量无效");
        p.Done[p.Cursor] = reps;
        p.Weights[p.Cursor] = weight === "" ? null : Number(weight);
        p.Cursor += 1;
        if (p.Cursor < p.Done.length) wx.setStorageSync(this.restKey, Date.now() + rest * 1000);
      }
      wx.setStorageSync(this.storeKey, p);
      this.render();
      if (p.Cursor >= p.Done.length) return this.submit();
      this.tick();
    } catch (err) {
      report(err);
    }
  },

  // 整场一次提交：Operation 保证重试不会写两条，成功后清掉本地进度
  async submit() {
    if (this.data.saving || !this.progress) return;
    this.setData({ saving: true, error: "" });
    const p = this.progress;
    try {
      await request("/sessions", "POST", {
        Plan: p.PlanID,
        Weekday: p.Weekday,
        Started: new Date(p.Started).toISOString(),
        Done: p.Done,
        Weights: p.Weights,
        Operation: p.Operation,
      });
      wx.removeStorageSync(this.storeKey);
      wx.removeStorageSync(this.restKey);
      clearInterval(this.timer);
      this.progress = null;
      this.setData({ saving: false, saved: true, left: 0 });
    } catch (e) {
      this.setData({
        saving: false,
        error: "没保存成功，记录还在本地，点这里重试",
      });
    }
  },

  retry() {
    this.submit();
  },

  async confirmEnd() {
    const done = this.data.completed;
    const r = await wx.showModal({
      title: "结束本次训练？",
      content: done ? "已完成的 " + done + " 组会记进训练记录。" : "这次还没有记录任何一组。",
      confirmText: "结束",
    });
    if (r.confirm) this.submit();
  },

  skipRest() {
    wx.removeStorageSync(this.restKey);
    this.tick();
  },

  back() {
    wx.navigateBack();
  },

  onUnload() {
    clearInterval(this.timer);
  },
});
