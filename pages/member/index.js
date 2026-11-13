const { request, report } = require("../../api");

Page({
  data: { ready: false, active: false, expire: "", products: [], paying: 0 },
  async onShow() {
    await this.load();
  },
  async load() {
    try {
      const [user, products] = await Promise.all([request("/me"), request("/products")]);
      const expire = user.Expires ? user.Expires.slice(0, 10) : "";
      const active = !!expire && new Date(user.Expires) > new Date();
      const list = products.map((p) => ({
        Days: p.Days,
        Enabled: p.Enabled,
        yuan: (p.Price / 100).toFixed(2).replace(/\.?0+$/, ""),
        per: (p.Price / 100 / p.Days).toFixed(2),
        unit: p.Price / 100 / p.Days,
        // 档位与说明都由后台维护，运营改了不用发版；没填说明就回落到通用文案
        note: p.Note || "会员有效期 " + p.Days + " 天",
        // 按钮文案在 JS 里算好，wxml 只叠一层「处理中」避免多层三元
        btn: !p.Enabled ? "暂未开放" : active ? "续费" : "开通",
      }));
      // 「更划算」按每天单价最低的可用套餐标记，套餐由后端下发所以在前端算
      const cheapest = list
        .filter((p) => p.Enabled)
        .sort((a, b) => a.unit - b.unit)
        .shift();
      this.setData({
        ready: true,
        expire,
        active,
        products: list.map((p) => ({ ...p, best: !!cheapest && p.Days === cheapest.Days })),
      });
    } catch (e) {
      this.setData({ ready: true });
      report(e);
    }
  },
  async buy(e) {
    const days = e.currentTarget.dataset.days;
    const product = this.data.products.find((p) => p.Days === days);
    if (!product || !product.Enabled || this.data.paying) return;
    this.setData({ paying: days });
    try {
      if (!wx.canIUse("requestVirtualPayment")) throw new Error("当前微信版本不支持购买");
      const { code } = await wx.login();
      const params = await request("/orders", "POST", { Code: code, Days: days });
      await new Promise((resolve, reject) =>
        wx.requestVirtualPayment({ ...params, success: resolve, fail: reject }),
      );
      await this.load();
      wx.showToast({ title: this.data.active ? "已开通" : "支付结果可在订单中查看", icon: "none" });
    } catch (err) {
      report(err);
    } finally {
      this.setData({ paying: 0 });
    }
  },
  orders() {
    wx.navigateTo({ url: "/pages/orders/index" });
  },
});
