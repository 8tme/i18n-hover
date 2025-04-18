# i18n-hover desc

when you hover on a string, it will show the translation of the string.

## features

- hover on a string, it will show the translation of the string.
- support multiple languages.
- support click to visit the translation file.

## usage

默认无配置使用

如有需要可以进行配置，配置方式为在 `.vscode/i18n-hover.json` 中添加以下配置：

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

## attention

- 语言名应和文件名保持一致, 例如：en.js 或者 en.json
- 支持 json 和 js 文件
- 支持任意语言称呼 (en可以，english也可以)
