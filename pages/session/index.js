const { request, report } = require("../../api");
const { when } = require("../../utils/time");

Page({
  data: {
    ready: false,
    failed: false,
    focus: "",
    time: "",
    done: 0,
    total: 0,
    items: [],
    weights: "",
  },
  async onLoad(q) {
    try {
      const s = await request("/sessions/" + q.id);
      const done = s.Done || [];
      const items = [];
      let at = 0;
      for (const it of s.Day?.Items || []) {
        const reps = done.slice(at, at + it.Sets);
        const hit = reps.filter((n) => n > 0);
        items.push({
          name: it.Name,
          target: it.Sets + " × " + it.Reps,
          actual: hit.length ? hit.join("、") : "未完成",
          missing: hit.length < it.Sets,
        });
        at += it.Sets;
      }
      const ws = (s.Weights || []).filter((w) => w !== null && w !== undefined);
      this.setData({
        ready: true,
        focus: s.Day?.Focus || "训练",
        time: when(s.Started),
        done: done.filter((n) => n > 0).length,
        total: done.length,
        items,
        weights: ws.length ? "最重 " + Math.max(...ws) + " kg" : "",
      });
    } catch (e) {
      this.setData({ failed: true });
      report(e);
    }
  },
});
