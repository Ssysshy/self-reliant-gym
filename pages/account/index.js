const { request, report } = require("../../api");
Page({
  data: { history: [], member: "未开通", section: "" },
  onLoad(q) {
    if (q.section === "PRO") this.setData({ section: "PRO 会员" });
  },
  async onShow() {
    try {
      const [u, history, summary, products] = await Promise.all([
        request("/me"),
        request("/sessions"),
        request("/training/summary"),
        request("/products"),
      ]);
      this.setData({
        products,
        summary,
        history: history.map((s) => ({
          ...s,
          completed: s.Done.filter((n) => n > 0).length,
          details: s.Day.Items.map((i, index) => {
            const offset = s.Day.Items.slice(0, index).reduce(
              (n, x) => n + x.Sets,
              0,
            );
            return {
              ...i,
              Actual:
                s.Done.slice(offset, offset + i.Sets)
                  .filter((n) => n > 0)
                  .join("、") || "未完成",
            };
          }),
        })),
        member:
          new Date(u.Expires) > new Date()
            ? u.Expires.slice(0, 10) + " 到期"
            : "未开通",
      });
    } catch (e) {
      report(e);
    }
  },
  detail(e) {
    this.setData({ detail: this.data.history[e.currentTarget.dataset.i] });
  },
  feedback(e) {
    this.note = e.detail.value;
  },
  async submit() {
    try {
      await request("/feedback", "POST", { Content: (this.note || "").trim() });
      this.setData({ section: "" });
      wx.showToast({ title: "已提交" });
    } catch (err) {
      report(err);
    }
  },
  async buy(e) {
    if (this.paying) return;
    this.paying = true;
    try {
      if (!wx.canIUse("requestVirtualPayment"))
        throw new Error("当前微信版本不支持购买");
      const { code } = await wx.login();
      const params = await request("/orders", "POST", {
        Code: code,
        Days: e.currentTarget.dataset.days,
      });
      await new Promise((resolve, reject) =>
        wx.requestVirtualPayment({ ...params, success: resolve, fail: reject }),
      );
      wx.showToast({ title: "支付结果可在订单中查看", icon: "none" });
      await this.onShow();
    } catch (err) {
      report(err);
    } finally {
      this.paying = false;
    }
  },
  async checkOrder(e) {
    try {
      await request(
        "/orders/" + e.currentTarget.dataset.id + "/reconcile",
        "POST",
      );
      this.setData({ orders: await request("/orders") });
      await this.onShow();
    } catch (err) {
      report(err);
    }
  },
  async open(e) {
    const section = e.currentTarget.dataset.v;
    if (section === "个人训练计划库") {
      wx.navigateTo({ url: "/pages/plans/index" });
      return;
    }
    if (section === "我的订单") {
      try {
        this.setData({ orders: await request("/orders") });
      } catch (err) {
        report(err);
      }
    }
    this.setData({ section });
  },
});
