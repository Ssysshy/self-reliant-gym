// 健身搭子：列表、本地缓存、选中与切换。
//
// 存一个 key 里两样东西：
//   { id, list, at }
//   id   用户挑中的搭子（0 = 没挑过，展示列表第一个）
//   list 上一次拉到的完整列表
//
// 首页进来看本地就能立刻画出搭子，不用等接口；接口回来再覆盖一次。
// 挑中的同时也写进个人信息（PUT /me/buddy），换手机登录靠它找回。
const { request } = require("../api");

const KEY = "buddy";

function read() {
  const v = wx.getStorageSync(KEY);
  return v && typeof v === "object" ? v : { id: 0, list: [] };
}

function write(id, list) {
  wx.setStorageSync(KEY, { id: id || 0, list: list || [], at: Date.now() });
}

// 该展示哪一个：挑中的还在列表里就用它，否则退回第一个。
// 后台删掉或停用了某个搭子时本地 id 会悬空，这一句兜住，不会出现空白。
function pick(list, id) {
  const rows = list || [];
  if (!rows.length) return null;
  return rows.find((x) => x.ID === id) || rows[0];
}

// 拉列表 + 选人。fallbackId 传个人信息里的 BuddyID：本机没挑过（或换了手机）时用它。
// 拉不到就当断网，用缓存里的列表，不往上抛错——首页不该因为搭子挂了而弹错误。
async function load(fallbackId) {
  const cached = read();
  let list = cached.list || [];
  const id = cached.id || fallbackId || 0;
  try {
    const rows = await request("/buddies");
    if (Array.isArray(rows)) list = rows;
  } catch (e) {
    // 用缓存
  }
  write(id, list);
  return { list, id, buddy: pick(list, id) };
}

// 选中：先存个人信息，成功了再落本地——两边保持一致，断网时不会只改了一半。
async function choose(buddy) {
  await request("/me/buddy", "PUT", { ID: buddy.ID });
  const cached = read();
  write(buddy.ID, cached.list);
  return buddy;
}

module.exports = { load, choose };
