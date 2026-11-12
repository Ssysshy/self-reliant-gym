const { request, report } = require("../../api");

Page({
  data: { member: "未开通" },
  async onShow() {
    try {
      const [u, summary] = await Promise.all([request("/me"), request("/training/summary")]);
      this.setData({
        summary,
        member: new Date(u.Expires) > new Date() ? u.Expires.slice(0, 10) + " 到期" : "未开通",
      });
    } catch (e) {
      report(e);
    }
  },
  open(e) {
    const section = e.currentTarget.dataset.v;
    const pages = {
      我的训练记录: "/pages/history/index",
      个人训练计划库: "/pages/plans/index",
      "PRO 会员": "/pages/member/index",
      我的订单: "/pages/orders/index",
      反馈: "/pages/feedback/index",
      服务协议: "/pages/agreement/index",
      隐私说明: "/pages/privacy/index",
    };
    if (pages[section]) wx.navigateTo({ url: pages[section] });
  },
});
