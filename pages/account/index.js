const { request, report } = require("../../api");

Page({
  data: { member: "未开通", section: "" },
  onLoad(q) {
    if (q.section === "PRO") this.setData({ section: "PRO 会员" });
  },
  async onShow() {
    try {
      const [u, summary, products] = await Promise.all([
        request("/me"),
        request("/training/summary"),
        request("/products"),
      ]);
      this.setData({
        products,
        summary,
        member: new Date(u.Expires) > new Date() ? u.Expires.slice(0, 10) + " 到期" : "未开通",
      });
    } catch (e) {
      report(e);
    }
  },
  async buy(e) {
    if (this.paying) return;
    this.paying = true;
    try {
      if (!wx.canIUse("requestVirtualPayment")) throw new Error("当前微信版本不支持购买");
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
  async open(e) {
    const section = e.currentTarget.dataset.v;
    const pages = {
      我的训练记录: "/pages/history/index",
      个人训练计划库: "/pages/plans/index",
      我的订单: "/pages/orders/index",
      反馈: "/pages/feedback/index",
      服务协议: "/pages/agreement/index",
      隐私说明: "/pages/privacy/index",
    };
    if (pages[section]) {
      wx.navigateTo({ url: pages[section] });
      return;
    }
    this.setData({ section });
  },
});
