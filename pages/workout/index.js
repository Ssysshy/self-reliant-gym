const { request, report } = require("../../api");
Page({
  data: {
    session: null,
    weight: "",
    completed: 0,
    item: null,
    group: 1,
    reps: 0,
    left: 0,
    rest: 60,
  },
  async onLoad(q) {
    try {
      const s = await request("/sessions", "POST", {
        Plan: Number(q.id),
        Weekday: Number(q.day || 0),
      });
      this.update(s);
      await this.flush();
      this.tick();
    } catch (e) {
      report(e);
    }
  },
  onShow() {
    this.tick();
    if (!this.watchNetwork)
      this.watchNetwork = (state) => {
        if (state.isConnected && !this.busy) this.retry();
      };
    wx.onNetworkStatusChange(this.watchNetwork);
  },
  async retry() {
    if (this.busy || !this.pendingKey) return;
    this.busy = true;
    try {
      await this.flush();
    } catch (err) {
      report(err);
    } finally {
      this.busy = false;
    }
  },
  onHide() {
    if (this.watchNetwork) wx.offNetworkStatusChange(this.watchNetwork);
    clearInterval(this.timer);
  },
  onUnload() {
    if (this.watchNetwork) wx.offNetworkStatusChange(this.watchNetwork);
    clearInterval(this.timer);
  },
  update(s) {
    let n = s.Done.length;
    let item = null;
    for (const x of s.Day.Items) {
      if (n < x.Sets) {
        item = x;
        break;
      }
      n -= x.Sets;
    }
    this.key = "rest:" + s.Owner + ":" + s.ID;
    this.pendingKey = this.key + ":pending";
    this.setData({
      completed: s.Done.filter((n) => n > 0).length,
      session: s,
      item,
      group: n + 1,
      reps: item?.Reps || 0,
      rest: item?.Rest || 60,
    });
  },
  tick() {
    clearInterval(this.timer);
    if (!this.key) return;
    const render = () => {
      const deadline = Number(wx.getStorageSync(this.key) || 0);
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      this.setData({ left });
      if (!left) {
        clearInterval(this.timer);
        this.setData({ game: false });
        if (deadline) {
          wx.removeStorageSync(this.key);
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
  weight(e) {
    this.setData({ weight: e.detail.value });
  },
  async flush() {
    const body = wx.getStorageSync(this.pendingKey);
    if (!body) return;
    let s;
    try {
      s = await request("/sessions/" + this.data.session.ID, "PUT", body);
    } catch (err) {
      this.setData({ pending: true });
      if (err.status !== 409) throw err;
      const choice = await wx.showModal({
        title: "其他设备已更新训练",
        content:
          "本机待同步记录位于第 " +
          (body.Index + 1) +
          " 组。是否采用云端进度？",
        confirmText: "采用云端",
      });
      if (!choice.confirm) return;
      s = await request("/sessions/" + this.data.session.ID);
      wx.removeStorageSync(this.pendingKey);
      this.setData({ pending: false });
      this.update(s);
      if (s.Ended) wx.navigateBack();
      return;
    }
    this.setData({ pending: false });
    wx.removeStorageSync(this.pendingKey);
    this.update(s);
    if (body.Finish) {
      wx.navigateBack();
      return;
    }
    if (this.data.item && !body.Skip) {
      wx.setStorageSync(
        this.key,
        Math.max(Date.now() - 3600000, body.At) + body.Rest * 1000,
      );
      this.tick();
    }
  },
  duration(e) {
    this.setData({ rest: e.currentTarget.dataset.v });
  },
  async record(e) {
    if (this.busy) return;
    this.busy = true;
    try {
      const finish = !!e.currentTarget.dataset.finish;
      if (finish && !(await wx.showModal({ title: "结束本次训练？" })).confirm)
        return;
      const { session, reps, rest, weight } = this.data;
      const skip = !!e.currentTarget.dataset.skip;
      if (
        !finish &&
        !skip &&
        (!Number.isInteger(reps) || reps < 1 || reps > 200)
      )
        throw new Error("次数须为 1 至 200");
      if (
        weight !== "" &&
        (!Number.isFinite(Number(weight)) ||
          Number(weight) < 0 ||
          Number(weight) > 2000)
      )
        throw new Error("重量无效");
      if (!wx.getStorageSync(this.pendingKey))
        wx.setStorageSync(this.pendingKey, {
          Index: session.Done.length,
          Reps: reps,
          Weight: weight === "" ? null : Number(weight),
          Skip: skip,
          Finish: finish,
          At: Date.now(),
          Rest: rest,
        });
      await this.flush();
    } catch (err) {
      report(err);
    } finally {
      this.busy = false;
    }
  },
  skip() {
    wx.removeStorageSync(this.key);
    this.tick();
  },
});
