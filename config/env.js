// 接口环境配置：一个小程序包带三套地址。
//
// 切环境用命令，手动优先于自动判断：
//   pnpm run build:dev    连本地 127.0.0.1:18080（开发者工具 / 真机调试）
//   pnpm run build:test   连体验版地址
//   pnpm run build:prod   连正式地址
//   pnpm run build:auto   清掉手动选择，回到按版本自动判断
//
// 没手动指定时，按微信注入的 envVersion 自动选：
//   develop  开发者工具 / 真机调试
//   trial    体验版（上传后在后台设为体验版）
//   release  正式版（提审通过后线上跑的）
//
// 地址来源按优先级从高到低：
//   1. wx.getExtConfigSync().apiBase —— 第三方平台代管时才存在，普通小程序拿不到
//   2. 本地缓存 apiBase —— 仅非正式版生效，真机调试临时指到开发机用
//   3. 手动选择（ACTIVE_ENV）或 envVersion 对应的 apiBase
//
// 正式版一律用正式地址，忽略手动选择和本地缓存：某次 build:dev 之后忘了切回来，
// 发版就会让线上指向内网——真上线了才发现接口连不上，是最难查的一类事故。
//
// 下面这行由 scripts/set-env.mjs 改写，手改会被下次命令覆盖。
const ACTIVE_ENV = ""; // dev | test | prod | 空 = 按版本自动

const PORT = 18080;

// 手动选择用的短名 → envVersion 的键，命令比常量好敲
const ALIASES = { dev: "develop", test: "trial", prod: "release" };

const PROFILES = {
  develop: {
    label: "本地开发",
    apiBase: "http://127.0.0.1:18080/api/v1",
    // 真机调试时填开发机的局域网 IP（如 "192.168.1.8"，不要带 http:// 和端口）。
    // 留空就用 127.0.0.1 —— 那只有开发者工具模拟器能连通，手机扫码会报网络错误。
    devLanIp: "",
  },
  trial: {
    label: "体验版",
    // 体验版也必须走 https + 微信后台登记的合法域名，否则手机上直接被拦
    apiBase: "https://api.example.com/api/v1",
  },
  release: {
    label: "正式版",
    apiBase: "https://api.example.com/api/v1",
  },
};

function currentEnvVersion() {
  try {
    const info = wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.envVersion) || "develop";
  } catch (e) {
    // 低版本基础库没有 getAccountInfoSync，按开发环境处理
    return "develop";
  }
}

// 末尾斜杠去掉，接口路径统一由调用方以 / 开头拼上来
function normalize(base) {
  return String(base).replace(/\/+$/, "");
}

function resolve() {
  const envVersion = currentEnvVersion();
  // 正式版不认手动选择，其余版本手动优先（用开发者工具连生产接口调试就靠这个）
  const forced = envVersion === "release" ? "" : ACTIVE_ENV;
  const target = ALIASES[forced] || forced || envVersion;
  const profile = PROFILES[target] || PROFILES.develop;
  const official = envVersion === "release";
  let apiBase = profile.apiBase;

  // 真机调试：开发机地址是局域网 IP，模拟器的 127.0.0.1 在手机上指手机自己
  if (profile.devLanIp) {
    apiBase = "http://" + profile.devLanIp + ":" + PORT + "/api/v1";
  }

  const ext = (typeof wx.getExtConfigSync === "function" && wx.getExtConfigSync()) || {};
  if (ext.apiBase) apiBase = ext.apiBase;

  if (!official) {
    const saved = wx.getStorageSync("apiBase");
    if (saved && /^https?:\/\//.test(saved)) apiBase = saved;
  }

  apiBase = normalize(apiBase);

  if (official && !/^https:\/\//.test(apiBase)) {
    console.error("[env] 正式版接口必须是 https，当前是 " + apiBase + "，真机上会被微信拦截");
  } else if (!official && /^http:\/\/(127\.0\.0\.1|localhost)/.test(apiBase)) {
    console.warn("[env] 当前连的是本机 " + apiBase + "，只在开发者工具里有效，手机上会连不上");
  }
  return { envVersion, active: ACTIVE_ENV, target, apiBase, label: profile.label };
}

// 真机调试用：在开发者工具 Console 里执行 setApiBase("http://192.168.1.8:18080/api/v1") 后重启预览
function setApiBase(base) {
  wx.setStorageSync("apiBase", normalize(base));
  return normalize(base);
}

function clearApiBase() {
  wx.removeStorageSync("apiBase");
}

module.exports = { PROFILES, ALIASES, PORT, ACTIVE_ENV, resolve, setApiBase, clearApiBase };
