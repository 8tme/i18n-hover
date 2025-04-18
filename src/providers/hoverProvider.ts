import * as fs from "fs"; // Import fs for existsSync
import * as path from "path"; // Import path for basename
import * as vscode from "vscode"
import { I18N_HOVER_JUMP_COMMAND } from "../commands/jumpCommand"; // Import command ID
import { currentConfig } from "../config/config"
import { translations } from "../locale/localeLoader"

let hoverProviderDisposable: vscode.Disposable | undefined;

// Helper function to find the existing locale file URI (.js or .json)
export function findExistingLocaleFileUri(
  workspaceFolderUri: vscode.Uri,
  localeDir: string,
  localeCode: string
): vscode.Uri | undefined {
  const jsUri = vscode.Uri.joinPath(
    workspaceFolderUri,
    localeDir,
    `${localeCode}.js`
  );
  const jsonUri = vscode.Uri.joinPath(
    workspaceFolderUri,
    localeDir,
    `${localeCode}.json`
  );

  if (fs.existsSync(jsUri.fsPath)) {
    return jsUri;
  } else if (fs.existsSync(jsonUri.fsPath)) {
    return jsonUri;
  }
  return undefined; // Neither file found
}

export function registerHoverProvider(context: vscode.ExtensionContext) {
  if (hoverProviderDisposable) {
    hoverProviderDisposable.dispose();
  }
  console.log("注册 Hover Provider...");

  hoverProviderDisposable = vscode.languages.registerHoverProvider(
    ["javascript", "typescript", "javascriptreact", "typescriptreact"],
    {
      provideHover(document, position, token) {
        const lineText = document.lineAt(position.line).text;
        const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
        let match;
        let foundRange: vscode.Range | undefined = undefined;
        let foundText: string | undefined = undefined;
        while ((match = stringRegex.exec(lineText)) !== null) {
          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;
          if (
            position.character > startIndex &&
            position.character < endIndex
          ) {
            foundRange = new vscode.Range(
              new vscode.Position(position.line, startIndex),
              new vscode.Position(position.line, endIndex)
            );
            foundText = match[0];
            break;
          }
        }

        if (foundRange && foundText) {
          const key = foundText.slice(1, -1);
          const foundTranslations: { [lc: string]: string | null } = {}; // Allow null for missing
          let translationFound = false; // Indicates if the key exists in *any* locale

          for (const lc in translations) {
            if (Object.prototype.hasOwnProperty.call(translations, lc)) {
              const localeContent = translations[lc];
              if (localeContent && typeof localeContent === "object") {
                // **修改：如果 key 存在，存储其值；否则存储 null**
                if (Object.prototype.hasOwnProperty.call(localeContent, key)) {
                  foundTranslations[lc] = localeContent[key]; // Store actual value (could be empty string)
                } else {
                  foundTranslations[lc] = null; // Mark as missing
                }
                translationFound = true; // Mark true as the locale file itself exists
              }
            }
          }

          if (translationFound) { // Check if any locale was processed, even if key was missing in some
            const markdown = new vscode.MarkdownString("", true);
            markdown.isTrusted = true;
            markdown.supportHtml = true;
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const workspaceFolder = workspaceFolders?.[0];

            // --- 添加 Key (带跳转链接，使用配置) ---
            const keyTargetLocale = currentConfig.defaultJumpLocale;
            let keyCommandUri: vscode.Uri | undefined = undefined;
            let keyTargetFilename: string = `${keyTargetLocale}.js`; // Default filename
            if (workspaceFolder) {
              const targetFileUri = findExistingLocaleFileUri(
                workspaceFolder.uri,
                currentConfig.localeDir,
                keyTargetLocale
              );
              if (targetFileUri) {
                keyTargetFilename = path.basename(targetFileUri.fsPath); // <-- 获取正确的文件名
                const args = {
                  key: key,
                  targetFileUriString: targetFileUri.toString(),
                };
                const encodedArgs = encodeURIComponent(JSON.stringify(args));
                keyCommandUri = vscode.Uri.parse(
                  `command:${I18N_HOVER_JUMP_COMMAND}?${encodedArgs}`
                );
              }
            }

            if (keyCommandUri) {
              // **修改：使用获取到的文件名**
              markdown.appendMarkdown(
                `[**Key:** \`${key}\`](${keyCommandUri} "跳转到 ${keyTargetFilename} 中的定义")\n\n---\n`
              );
            } else {
              markdown.appendMarkdown(`**Key:** \`${key}\`\n\n---\n`);
            }

            // --- 添加翻译内容 (排序逻辑 + 跳转链接，使用配置) ---
            const preferredOrder = ["en", "tw"];
            const processedLocales = new Set<string>();
            const addTranslationToMarkdown = (localeCode: string) => {
              // Check if we have an entry for this locale (even if it's null)
              if (Object.prototype.hasOwnProperty.call(foundTranslations, localeCode)) {
                let langCommandUri: vscode.Uri | undefined = undefined;
                let langTargetFilename: string = `${localeCode}.js`; // Default filename
                if (workspaceFolder) {
                  const targetFileUri = findExistingLocaleFileUri(
                    workspaceFolder.uri,
                    currentConfig.localeDir,
                    localeCode
                  );
                  if (targetFileUri) {
                    langTargetFilename = path.basename(targetFileUri.fsPath); // <-- 获取正确的文件名
                    const args = {
                      key: key,
                      targetFileUriString: targetFileUri.toString(),
                    };
                    const encodedArgs = encodeURIComponent(
                      JSON.stringify(args)
                    );
                    langCommandUri = vscode.Uri.parse(
                      `command:${I18N_HOVER_JUMP_COMMAND}?${encodedArgs}`
                    );
                  }
                }
                if (langCommandUri) {
                  // **修改：使用获取到的文件名**
                  markdown.appendMarkdown(
                    `\n[**${localeCode.toUpperCase()}:**](${langCommandUri} "跳转到 ${langTargetFilename}")\n`
                  );
                } else {
                  markdown.appendMarkdown(
                    `\n**${localeCode.toUpperCase()}:**\n`
                  );
                }

                // **修改：根据值是否为 null 来决定显示内容**
                const translationValue = foundTranslations[localeCode];
                if (!!translationValue && translationValue !== '__EMPTY__') {
                  // If translation exists (even if empty string), show in code block
                  markdown.appendCodeblock(translationValue || '', "plaintext");
                } else {
                  // If translation is missing (marked as null), show error icon and text
                  markdown.appendMarkdown(`<b>$(error) *Missing* </b>\n`);
                }

                processedLocales.add(localeCode);
              }
            };
            for (const localeCode of preferredOrder) {
              addTranslationToMarkdown(localeCode);
            }
            const remainingLocales = Object.keys(foundTranslations)
              .filter((lc) => !processedLocales.has(lc))
              .sort();
            for (const localeCode of remainingLocales) {
              addTranslationToMarkdown(localeCode);
            }

            return new vscode.Hover(markdown, foundRange);
          } else {
            console.log(`未加载任何 locale 文件或 key '${key}' 不存在于任何已处理的 locale 中`);
          }
        } else {
          // console.log('光标位置不在任何匹配的字符串内部');
        }

        return undefined;
      },
    }
  );
  context.subscriptions.push(hoverProviderDisposable);
  console.log("Hover Provider 已注册");
}

// Optional: Function to explicitly dispose if needed outside context.subscriptions
export function disposeHoverProvider() {
  if (hoverProviderDisposable) {
    hoverProviderDisposable.dispose();
    hoverProviderDisposable = undefined;
  }
}
