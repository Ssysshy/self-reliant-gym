// 图片地址统一在这里拼 CDN 前缀。
//
// 库里（动作示范图 ImageURL、计划封面 Meta.Cover）只存相对路径，比如
// /assets/plans/tan-3split.jpg；域名写在 config/env.js 的 CDN_IMG，启动时进
// globalData.cdnImg。换 CDN 只改那一行，数据不用动、页面也不用动。
//
// 页面的用法：在 js 里把后端数据过一遍再 setData，wxml 里仍写 {{ item.ImageURL }}。
//
//   const { img } = require("../../utils/image");
//   this.setData({ rows: rows.map((x) => ({ ...x, ImageURL: img(x.ImageURL) })) });

// 前缀在运行时读，不在模块加载时读：utils 可能比 App() 先被 require
function cdn() {
  try {
    const app = getApp();
    return (app && app.globalData && app.globalData.cdnImg) || "";
  } catch (e) {
    // App 还没注册（极少见）时先按无前缀处理，图片退回相对路径
    return "";
  }
}

// 把相对路径拼成完整图片地址。以下几种原样返回，避免拼出 https://cdn/https://…
//   https://…  老数据里存的完整链接
//   //host/x   协议相对地址
//   data:…     内联图
//   wxfile://… 本地临时文件（选图预览）
function img(path) {
  const v = String(path == null ? "" : path).trim();
  if (!v) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.indexOf("//") === 0) return v;

  const base = cdn().replace(/\/+$/, "");
  const suffix = v.charAt(0) === "/" ? v : "/" + v;
  // 没配 CDN 时保持包内相对路径（本地开发直接用 assets/ 里的图）
  return base ? base + suffix : suffix;
}

module.exports = { img };
