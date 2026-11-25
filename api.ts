interface UserProfile {
  ID: number;
  Experience: string;
  Active: number;
  Expires: string;
  // 能保存的计划份数（免费 1 / 会员 6），后端按会员状态现算下发
  PlanLimit?: number;
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// 登录接口本身不参与「401 自动重登」，否则会自己套自己
const LOGIN = '/auth/wechat';

// 接口地址由 config/env.js 按版本决定，这里只读 globalData，页面里不要再写死域名
function base(): string {
  return getApp<{globalData: {apiBase: string}}>().globalData.apiBase;
}

// 单次请求，不做重试；401 统一交给 request() 处理
function send<T>(path: string, method: Method, data: Record<string, unknown>, token: string): Promise<T> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: base() + path,
      method,
      data,
      // 断网或域名不通时不设超时会让 loading 一直转，15 秒兜底
      timeout: 15000,
      header: {Authorization: 'Bearer ' + token},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        const body = res.data as {error?: string} | null;
        reject(new RequestError(body?.error || '请求失败', res.statusCode));
      },
      fail() {reject(new RequestError('网络连接失败', 0))},
    });
  });
}

// 静默重登：并发请求同时撞 401 时共用这一次登录。
// wx.login 的 code 是一次性的，不能每个请求各换一个。
let pending: Promise<unknown> | null = null;

function relogin(): Promise<unknown> {
  if (pending) return pending;
  wx.showLoading({title: '重新登录中', mask: true});
  pending = login()
    .catch((e: {message?: string; errMsg?: string}) => {
      // 换不到新 token 就把旧的清掉，免得之后每个请求都先白撞一次 401
      wx.removeStorageSync('token');
      // wx.login 失败抛的是 {errMsg}，统一成一句人话再往上抛
      throw e instanceof RequestError ? e : new RequestError((e && (e.message || e.errMsg)) || '重新登录失败', 401);
    })
    .finally(() => {
      pending = null;
      wx.hideLoading();
    });
  return pending;
}

// 所有接口入口。token 过期（12 小时）时在这里静默换新 token 并把原请求重放一次，
// 页面拿到的仍是正常结果，用户只在换 token 的那一小会儿看到「重新登录中」。
export async function request<T>(path: string, method: Method = 'GET', data: Record<string, unknown> = {}): Promise<T> {
  const token = (wx.getStorageSync('token') as string) || '';
  try {
    return await send<T>(path, method, data, token);
  } catch (e) {
    if (!(e instanceof RequestError) || e.status !== 401 || path === LOGIN) throw e;
    // 并发场景：另一个请求已经把 token 换掉了（或清空了），直接用它重试，不必再登录一次
    const current = (wx.getStorageSync('token') as string) || '';
    if (!current || current === token) await relogin();
    const fresh = (wx.getStorageSync('token') as string) || '';
    try {
      return await send<T>(path, method, data, fresh);
    } catch (retry) {
      // 换过 token 仍然 401：确实登不上，清掉本地凭据，下次点受保护入口会重新走登录
      if (retry instanceof RequestError && retry.status === 401) {
        wx.removeStorageSync('token');
        throw new RequestError('登录已失效，请重试', 401);
      }
      throw retry;
    }
  }
}

export async function login(): Promise<UserProfile> {
  const {code} = await wx.login();
  const result = await request<{token: string; user: UserProfile}>(LOGIN,'POST',{Code:code});
  wx.setStorageSync('token',result.token);
  return result.user;
}

// 动作库列表的精简字段：列表页只用到名称、部位、器材和缩略图，
// 教学文案走 /exercises/:id 详情接口，列表接口不下发。
export interface Exercise {
  ID: number;
  Name: string;
  Muscle: string;
  SubMuscle: string;
  Category: string;
  Equipment: string;
  ImageURL: string;
}

interface ExercisePage {
  Items: Exercise[];
  Total: number;
  PageNo: number;
  PageSize: number;
}

// 后端每页默认 20、上限 200。这里要一次拿全（五个页面都在本地筛选），
// 所以显式传 200：878 条 5 次请求拉齐，用默认的 20 要 44 次，光往返就够呛。
const EXERCISE_PAGE = 200;

// 动作库全量：首页、动作库、计划、自定义、预览五个页面都要这份数据。
// 后端按页下发（单次响应有界，不会再出现一次拉几百 KB），这里翻页拉齐后缓存在
// globalData，一个会话只拉一次——原来是五个页面各拉一遍全量。
let pendingExercises: Promise<Exercise[]> | null = null;

export function exercises(): Promise<Exercise[]> {
  const app = getApp<{globalData: {exercises?: Exercise[]}}>();
  if (app.globalData.exercises) return Promise.resolve(app.globalData.exercises);
  // 两个页面同时要数据时共用同一批请求，不要各翻一遍页
  if (pendingExercises) return pendingExercises;
  pendingExercises = loadExercises()
    .then((all) => {
      app.globalData.exercises = all;
      return all;
    })
    .finally(() => {
      pendingExercises = null;
    });
  return pendingExercises;
}

async function loadExercises(): Promise<Exercise[]> {
  const all: Exercise[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const page = await request<ExercisePage>('/exercises?pageNo=' + pageNo + '&pageSize=' + EXERCISE_PAGE);
    all.push(...page.Items);
    // 空页兜底：万一 Total 算少了也不会转成死循环
    if (!page.Items.length || all.length >= page.Total) return all;
  }
}

export function report(err: {message?: string; errMsg?: string}): void {
  wx.showToast({title: err.message || err.errMsg || '操作失败', icon: 'none'});
}
