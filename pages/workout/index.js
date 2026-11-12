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
    // 环形进度用：本次休息的总秒数（用户 ±10s 后会跟着变）与已走过的角度
    restTotal: 0,
    deg: 0,
    // 休息弹窗里「下一组练什么」：游标已前进，指向的就是下一组
    next: null,
    // 收起成底部一条，方便休息时回看计划
    folded: false,
    game: false,
    points: 0,
    saving: false,
    saved: false,
    error: "",
  },

  async onLoad(q) {
    this.planId = Number(q.id);
    this.weekday = Number(q.day || 0);
    // 清单页「从这开始」传进来的动作序号，-1 表示按原进度从头算
    this.from = q.from === undefined || q.from === "" ? -1 : Number(q.from);
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
    // 指定起点：游标挪到该动作的第一组，前面的组留 0 记为跳过，已记录的组不覆盖。
    // 只在进入页面时生效一次；进度属于别的训练日时不跳（序号对不上），交给用户选接着练还是重来。
    if (
      this.from >= 0 &&
      this.from < this.blocks.length &&
      progress.Weekday === this.weekday
    ) {
      progress.Cursor = this.blocks[this.from].start;
    }
    this.from = -1;
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
      next: this.upcoming(),
    });
  },

  // 下一组的信息：动作名、第几组、做几次。换动作时要单独提示「下一个动作」，
  // 因为用户这时候通常要把器械挪到另一台机器上。
  upcoming() {
    const p = this.progress;
    if (!p || p.Cursor >= p.Done.length) return null;
    const b = this.blocks.find((x) => p.Cursor >= x.start && p.Cursor < x.start + x.sets);
    if (!b) return null;
    return {
      Name: b.item.Name,
      Group: p.Cursor - b.start + 1,
      Sets: b.item.Sets,
      Reps: b.item.Reps,
      Fresh: p.Cursor === b.start,
      Last: p.Cursor === p.Done.length - 1,
    };
  },

  // 休息倒计时存时间戳，退出重进也能接着走
  tick() {
    clearInterval(this.timer);
    if (!this.restKey) return;
    const render = () => {
      const deadline = Number(wx.getStorageSync(this.restKey) || 0);
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      // 重进页面时不知道这一轮原来的总时长，就把当前剩余当作满格
      if (left > (this.restTotal || 0)) this.restTotal = left;
      // 环走的是「还剩多少」：满圈起、清空止，和一般倒计时表盘的读法一致
      const restTotal = this.restTotal || 0;
      this.setData({
        left,
        restTotal,
        deg: restTotal ? Math.max(0, Math.min(360, Math.round((360 * left) / restTotal))) : 0,
      });
      if (!left) {
        clearInterval(this.timer);
        if (deadline) {
          wx.removeStorageSync(this.restKey);
          wx.vibrateShort({ type: "light" });
        }
        // 休息结束时如果还收起着，恢复成展开态，下一轮才不会一上来就是一条
        if (this.data.folded) this.setData({ folded: false });
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
        // 记完这组就开始倒计时，弹窗按 rest 秒铺满一圈
        if (p.Cursor < p.Done.length) {
          wx.setStorageSync(this.restKey, Date.now() + rest * 1000);
          this.restTotal = rest;
          this.setData({ folded: false, game: false, points: 0 });
        }
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
      this.setData({ saving: false, saved: true, left: 0, deg: 0 });
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
    this.restTotal = 0;
    this.tick();
  },

  // 弹窗上的 ±10s：直接改存的时间戳，倒计时和环形进度一起跟着走
  shift(e) {
    const d = Number(e.currentTarget.dataset.d);
    const deadline = Number(wx.getStorageSync(this.restKey) || 0);
    if (!deadline) return;
    wx.setStorageSync(this.restKey, Math.max(Date.now() + 1000, deadline + d * 1000));
    this.restTotal = Math.max(1, (this.restTotal || 0) + d);
    this.tick();
  },

  // 收起成底部一条，休息时也能回看计划；点那条再展开
  fold() {
    this.setData({ folded: true });
  },
  expand() {
    this.setData({ folded: false });
  },
  // 休息时手闲不住的小圆点，纯本地状态，不影响计时
  game() {
    this.setData({ game: !this.data.game, points: 0 });
  },
  tapGame() {
    this.setData({ points: this.data.points + 1 });
  },
  // 弹窗打开时挡住底层滚动
  noop() {},

  back() {
    wx.navigateBack();
  },

  onUnload() {
    clearInterval(this.timer);
  },
});
