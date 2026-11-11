const { request, report } = require("../../api");

// 顶部器材筛选的第一项，代表不过滤
const ALL = "全部";

Page({
  data: {
    mode: "exercise",
    cats: [],
    cat: ALL,
    query: "",
    nav: [],
    sel: "",
    rows: [],
    scrollTop: 0,
    bodyHeight: 0,
  },
  onLoad(q) {
    const gear = q.kind === "器材库";
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.windowHeight = info.windowHeight;
    this.setData({
      mode: gear ? "gear" : "exercise",
      // 先按搜索框 + 一行分类的估高占位，onReady 量到真实高度再纠正，避免首帧空白
      bodyHeight: Math.max(0, info.windowHeight - Math.round((158 * info.windowWidth) / 750)),
    });
    if (gear) wx.setNavigationBarTitle({ title: "器材库" });
    this.load();
  },
  onReady() {
    this.measure();
  },
  // 顶部区高度随分类数据到达而变化，量一次就够，但要在渲染之后量
  measure() {
    wx.createSelectorQuery()
      .select(".top")
      .boundingClientRect((r) => {
        if (!r) return;
        const bodyHeight = Math.max(0, this.windowHeight - r.height);
        if (bodyHeight !== this.data.bodyHeight) this.setData({ bodyHeight });
      })
      .exec();
  },
  async load() {
    try {
      const [rows, meta] = await Promise.all([request("/exercises"), request("/categories")]);
      this.all = rows;
      this.meta = meta;
      this.setData({ cats: [ALL, ...meta.Categories] }, () => {
        this.build();
        this.measure();
      });
    } catch (e) {
      report(e);
    }
  },
  // 侧边栏：动作库按「部位 → 细分」两层，器材库按具体器材平铺。
  // 只列出库里真的有的部位和细分，免得点进去是空的；有细分的部位默认收起，点一下才展开。
  build() {
    const nav = [];
    if (this.data.mode === "gear") {
      [...new Set(this.all.map((x) => x.Equipment))].forEach((name) =>
        nav.push({ key: "e:" + name, name, depth: 0 }),
      );
    } else {
      this.meta.Parts.forEach((p) => {
        const rows = this.all.filter((x) => x.Muscle === p.Name);
        if (!rows.length) return;
        const subs = [...new Set(rows.map((x) => x.SubMuscle).filter(Boolean))];
        subs.sort((a, b) => (p.Subs || []).indexOf(a) - (p.Subs || []).indexOf(b));
        const key = "p:" + p.Name;
        nav.push({ key, name: p.Name, depth: 0, group: subs.length > 0, open: false });
        subs.forEach((s) =>
          nav.push({
            key: "s:" + p.Name + ":" + s,
            name: s,
            depth: 1,
            parent: key,
            hidden: true,
          }),
        );
      });
      // 默认只展开第一个部位，其余收起，侧栏长度才是可控的
      const first = nav.find((n) => n.group);
      if (first) {
        first.open = true;
        nav.forEach((n) => {
          if (n.parent === first.key) n.hidden = false;
        });
      }
    }
    const keep = nav.some((n) => n.key === this.data.sel);
    this.setData({ nav, sel: keep ? this.data.sel : nav.length ? nav[0].key : "" });
    this.filter();
  },
  filter() {
    const { mode, sel, cat, query } = this.data;
    const kw = query.trim();
    const rows = (this.all || []).filter((x) => {
      if (mode === "gear") {
        if (sel.slice(2) !== x.Equipment) return false;
      } else if (sel.indexOf("s:") === 0) {
        const [, part, sub] = sel.split(":");
        if (x.Muscle !== part || x.SubMuscle !== sub) return false;
      } else if (x.Muscle !== sel.slice(2)) {
        return false;
      }
      if (cat !== ALL && x.Category !== cat) return false;
      return !kw || [x.Name, x.SubMuscle, x.Category, x.Equipment].join(" ").includes(kw);
    });
    // 换分类要回到顶部，否则上一组滚到一半的位置会留在新列表上。
    // scroll-top 值相同不会触发滚动，所以在 0/1 之间来回切。
    this.setData({ rows, scrollTop: this.data.scrollTop === 0 ? 1 : 0 });
  },
  search(e) {
    this.setData({ query: e.detail.value });
    this.filter();
  },
  pickCategory(e) {
    this.setData({ cat: e.currentTarget.dataset.v });
    this.filter();
  },
  // 点分组＝展开／收起并选中整个部位；点细分只切换筛选，分组保持展开
  pickPart(e) {
    const key = e.currentTarget.dataset.key;
    const item = this.data.nav.find((n) => n.key === key);
    if (item && item.group) {
      const open = !item.open;
      this.setData({
        nav: this.data.nav.map((n) => {
          if (n.key === key) return { ...n, open };
          // 子项跟着分组一起收起／展开
          if (n.parent === key) return { ...n, hidden: !open };
          return n;
        }),
        sel: key,
      });
    } else {
      this.setData({ sel: key });
    }
    this.filter();
  },
  open(e) {
    wx.navigateTo({
      url: "/pages/exercise/index?id=" + e.currentTarget.dataset.id,
    });
  },
});
