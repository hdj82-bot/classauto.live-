const ACCESS_KEY = "ifl_access_token";
const REFRESH_KEY = "ifl_refresh_token";

export const tokens = {
  getAccess: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(ACCESS_KEY) : null,

  getRefresh: (): string | null =>
    typeof window !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null,

  set: (access: string, refresh: string): void => {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },

  clear: (): void => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
