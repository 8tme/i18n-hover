export interface I18nHoverConfig {
  /** 相对于工作区根目录的 locale 文件夹路径 */
  localeDir: string;
  /** 点击 Key 或语言标题时默认跳转的目标语言代码 (例如 'en', 'zh') */
  defaultJumpLocale: string;
}
