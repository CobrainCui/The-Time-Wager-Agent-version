/** 本地 `vite` 为 dev；生产构建注入 `__APP_BUILD_ID__` */
export const APP_BUILD_ID: string = import.meta.env.DEV
  ? "dev"
  : typeof __APP_BUILD_ID__ !== "undefined"
    ? __APP_BUILD_ID__
    : "dev";
