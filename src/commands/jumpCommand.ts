import * as path from "path";
import * as vscode from "vscode";

export const I18N_HOVER_JUMP_COMMAND = "i18n-hover.jumpToTranslation";

export async function jumpToTranslationHandler(args: {
  key: string;
  targetFileUriString: string;
}) {
  console.log("跳转命令被触发", args);
  if (!args || !args.key || !args.targetFileUriString) {
    vscode.window.showErrorMessage("无法跳转：缺少必要的参数。");
    return;
  }

  const { key, targetFileUriString } = args;
  const targetUri = vscode.Uri.parse(targetFileUriString);

  try {
    const document = await vscode.workspace.openTextDocument(targetUri);
    const editor = await vscode.window.showTextDocument(document);
    let targetLine = -1;
    const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const keyRegex = new RegExp(`(['"\`])\\s*${escapedKey}\\s*\\1\\s*:`);

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      if (keyRegex.test(line.text)) {
        targetLine = i;
        break;
      }
    }

    if (targetLine !== -1) {
      const targetPosition = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(targetPosition, targetPosition);
      editor.revealRange(
        new vscode.Range(targetPosition, targetPosition),
        vscode.TextEditorRevealType.InCenter
      );
      console.log(
        `跳转到 ${targetUri.fsPath} 的第 ${targetLine + 1} 行 (key: ${key})`
      );
    } else {
      vscode.window.showWarningMessage(
        `在 ${path.basename(
          targetUri.fsPath
        )} 中未找到 key '${key}' 的精确定义行，已打开文件。`
      );
      console.log(`在 ${targetUri.fsPath} 中未找到 key '${key}' 的精确匹配行`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `无法打开或处理文件 ${targetUri.fsPath}: ${error.message}`
    );
    console.error(`跳转到翻译失败:`, error);
  }
}
