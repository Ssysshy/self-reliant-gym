const { request, report } = require("../../api");

Page({
  data: { note: "", count: 0, sending: false, sent: false, code: "" },
  async onLoad() {
    // 编号只是让用户知道「客服靠这个认人」，读不到就不显示，不给反馈主流程添堵
    try {
      const u = await request("/me");
      this.setData({ code: u.Code || "" });
    } catch (e) {}
  },
  input(e) {
    const value = e.detail.value || "";
    this.setData({ note: value, count: value.length });
  },
  async submit() {
    const content = (this.data.note || "").trim();
    if (!content) {
      wx.showToast({ title: "写点什么再提交", icon: "none" });
      return;
    }
    if (this.data.sending) return;
    this.setData({ sending: true });
    try {
      await request("/feedback", "POST", { Content: content });
      this.setData({ sending: false, sent: true });
    } catch (e) {
      this.setData({ sending: false });
      report(e);
    }
  },
  back() {
    wx.navigateBack();
  },
});
