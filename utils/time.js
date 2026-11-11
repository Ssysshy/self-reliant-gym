// 接口返回的是 UTC 时间字符串，页面统一按北京时间显示
function when(iso) {
  const d = new Date(new Date(iso).getTime() + 8 * 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return (
    p(d.getUTCMonth() + 1) +
    "-" +
    p(d.getUTCDate()) +
    " " +
    p(d.getUTCHours()) +
    ":" +
    p(d.getUTCMinutes())
  );
}

module.exports = { when };
