const { request, report } = require("../../api");

Page({
  data: { note: "", count: 0, sending: false, sent: false },
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
