const { request, report } = require("../../api");
Page({
  data: { title: "", rows: [], query: "", detail: null },
  async onLoad(q) {
    this.setData({ title: q.kind });
    try {
      this.all = await request("/exercises");
      this.filter("");
    } catch (e) {
      report(e);
    }
  },
  filter(query) {
    const rows = (this.all || []).filter((i) =>
      [i.Name, i.Muscle, i.Equipment].some((s) => s.includes(query)),
    );
    this.setData({
      rows,
      equipment: [...new Set(rows.map((i) => i.Equipment))],
      query,
      detail: null,
    });
  },
  search(e) {
    this.filter(e.detail.value);
  },
  open(e) {
    this.setData({ detail: this.data.rows[e.currentTarget.dataset.i] });
  },
  equipment(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({
      equipmentName: name,
      setup: this.all.find((x) => x.Equipment === name)?.Setup,
    });
    this.filter(name);
    this.setData({ title: "可练动作" });
  },
});
