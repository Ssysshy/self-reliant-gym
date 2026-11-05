interface UserProfile {
  ID: number;
  Experience: string;
  Active: number;
  Expires: string;
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function request<T>(path: string, method: 'GET' | 'POST' | 'PUT' = 'GET', data: Record<string, unknown> = {}): Promise<T> {
  const app = getApp<{globalData: {apiBase: string}}>();
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.apiBase + path,
      method,
      data,
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
