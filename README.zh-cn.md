# i18n-hover 

国际化悬停提示插件

## 功能

- 当你鼠标悬停在一个字符串上时，它会显示该字符串的翻译。
- 支持多语言。
- 支持点击跳转到翻译文件。
- 支持显示缺失的翻译。

## 用法

- 默认无配置使用
- 如有需要可以进行配置，配置方式为在 `.vscode/i18n-hover.json` 中添加以下配置：

```json
{
  "localeDir": "src/locales",
  "defaultJumpLocale": "en"
}
```

## 相关接口

```ts
/** 配置项 */
interface I18nHoverConfig {
  /** 相对于工作区根目录的 locale 文件夹路径 */
  localeDir: string;
  /** 点击 Key 或语言标题时默认跳转的目标语言代码 (例如 'en', 'zh') */
  defaultJumpLocale: string;
}
```

## 注意

- 语言名应和文件名保持一致, 例如：en.js 或者 en.json
- 支持 json 和 js 文件
- 支持任意语言称呼 (en可以，english也可以)
