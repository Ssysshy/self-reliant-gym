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

// 接口地址由 config/env.js 按版本决定，这里只读 globalData，页面里不要再写死域名
export function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data: Record<string, unknown> = {}): Promise<T> {
  const app = getApp<{globalData: {apiBase: string}}>();
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + path,
      method,
      data,
      // 断网或域名不通时不设超时会让 loading 一直转，15 秒兜底
      timeout: 15000,
      header: {Authorization: 'Bearer ' + (wx.getStorageSync('token') || '')},
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        if (res.statusCode === 401) wx.removeStorageSync('token');
        const body = res.data as {error?: string} | null;
        reject(new RequestError(body?.error || '请求失败', res.statusCode));
      },
      fail() {reject(new RequestError('网络连接失败', 0))},
    });
  });
}

export async function login(): Promise<UserProfile> {
  const {code} = await wx.login();
  const result = await request<{token: string; user: UserProfile}>('/auth/wechat','POST',{Code:code});
  wx.setStorageSync('token',result.token);
  return result.user;
}

export function report(err: {message?: string; errMsg?: string}): void {
  wx.showToast({title: err.message || err.errMsg || '操作失败', icon: 'none'});
}
