import * as vscode from "vscode"
import { currentConfig } from "../config/config"
import { findExistingLocaleFileUri } from "./hoverProvider"

let definitionProviderDisposable: vscode.Disposable | undefined;

export function registerDefinitionProvider(context: vscode.ExtensionContext) {
  // 先清理旧的 Provider (如果存在)
  if (definitionProviderDisposable) {
    console.log("正在清理旧的 Definition Provider...");
    const index = context.subscriptions.indexOf(definitionProviderDisposable);
    if (index > -1) {
      context.subscriptions.splice(index, 1);
    }
    definitionProviderDisposable.dispose();
    definitionProviderDisposable = undefined; // 清空引用
  }

  console.log("准备注册新的 Definition Provider...");
  definitionProviderDisposable = vscode.languages.registerDefinitionProvider(
    ["javascript", "typescript", "javascriptreact", "typescriptreact"],
    {
      async provideDefinition(document, position, token) {
        // --- 查找 Key ---
        const lineText = document.lineAt(position.line).text;
        const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
        let match;
        let foundText: string | undefined = undefined;
        let potentialRange: vscode.Range | undefined = undefined;
        while ((match = stringRegex.exec(lineText)) !== null) {
          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;
          if (
            position.character > startIndex &&
            position.character < endIndex
          ) {
            foundText = match[0];
            potentialRange = new vscode.Range(
              new vscode.Position(position.line, startIndex),
              new vscode.Position(position.line, endIndex)
            );
            break;
          }
        }
        console.log("查找 Key:", { foundText, potentialRange });
        if (!foundText || !potentialRange) {
          console.log("DefinitionProvider: 未在光标下找到 Key 字符串。");
          return undefined;
        }

        const key = foundText.slice(1, -1);
        // **使用配置的 defaultJumpLocale**
        const targetLocale = currentConfig.defaultJumpLocale;
        console.log(`目标跳转 locale (来自配置): ${targetLocale}`);

        // --- 确定目标文件 URI (使用配置) ---
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          console.warn("...");
          return undefined;
        }
        const workspaceFolder = workspaceFolders[0];
        // **使用配置的 localeDir 构建路径**
        const targetFileUri = findExistingLocaleFileUri(
          workspaceFolder.uri,
          currentConfig.localeDir,
          targetLocale
        );
        console.log("目标文件 URI:", targetFileUri?.fsPath);

        // 检查目标文件是否存在 (可选但推荐)
        if (!targetFileUri?.fsPath) {
          console.warn(`DefinitionProvider: 目标文件不存在: ${targetLocale}`);
          return undefined;
        }

        // --- 在目标文件中查找 key 的精确位置 ---
        try {
          const targetDocument = await vscode.workspace.openTextDocument(
            targetFileUri
          );
          const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
          const keyRegex = new RegExp(`(['"\`])\\s*${escapedKey}\\s*\\1\\s*:`);

          for (let i = 0; i < targetDocument.lineCount; i++) {
            const line = targetDocument.lineAt(i);
            const matchResult = line.text.match(keyRegex);
            if (matchResult && typeof matchResult.index === "number") {
              const keyStartIndex = matchResult.index;
              const firstQuoteIndex = line.text.indexOf(
                matchResult[1],
                keyStartIndex
              );
              const secondQuoteIndex = line.text.indexOf(
                matchResult[1],
                firstQuoteIndex + 1
              );
              if (firstQuoteIndex !== -1 && secondQuoteIndex !== -1) {
                const targetRange = new vscode.Range(
                  new vscode.Position(i, firstQuoteIndex),
                  new vscode.Position(i, secondQuoteIndex + 1)
                );
                console.log(`返回精确范围:`, targetRange);
                return new vscode.Location(targetFileUri, targetRange);
              } else {
                console.log(`返回整行范围`);
                return new vscode.Location(targetFileUri, line.range);
              }
            }
          }
          console.log(
            `DefinitionProvider: Key '${key}' not found in ${targetFileUri.fsPath}`
          );
          return undefined; // 不再提示用户
        } catch (error: any) {
          console.error(
            `DefinitionProvider: Error opening or reading ${targetFileUri.fsPath}:`,
            error
          );
          vscode.window.showErrorMessage(
            `无法打开或读取文件 ${targetFileUri.fsPath}: ${error.message}`
          );
          return undefined;
        }
      },
    }
  );
  context.subscriptions.push(definitionProviderDisposable);
  console.log("Definition Provider 已注册");
}

export function disposeDefinitionProvider() {
  if (definitionProviderDisposable) {
    definitionProviderDisposable.dispose();
    definitionProviderDisposable = undefined;
  }
}
