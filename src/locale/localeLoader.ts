import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { currentConfig } from "../config/config"; // Import config

// Export translations so providers can use it
export let translations: { [locale: string]: { [key: string]: string } } = {};

export async function loadTranslations(): Promise<boolean> {
  console.log("开始加载 locale 文件 (js/json, case-insensitive)...");
  translations = {}; // Reset
  let loadedSuccessfully = false;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage("请先打开一个工作区以使用此插件。");
    return false;
  }
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const localeDir = path.join(workspaceRoot, currentConfig.localeDir); // Use config
  console.log(`目标 locale 目录 (来自配置): ${localeDir}`);

  try {
    if (!fs.existsSync(localeDir)) {
      console.warn(`locale 目录不存在: ${localeDir}`);
      return false;
    }

    const files = fs.readdirSync(localeDir);
    // Match ll or ll-CC format (case-insensitive), .js or .json
    const localeFileRegex = /^(.+)\.(js|json)$/i;

    console.log(`在 ${localeDir} 中找到 ${files.length} 个文件/目录`);

    for (const file of files) {
      const matchResult = file.match(localeFileRegex);
      if (matchResult) {
        const localeCode = matchResult[1];
        const extension = matchResult[2].toLowerCase();
        const translationFilePath = path.join(localeDir, file);
        // console.log(
        //   `尝试加载 locale 文件: ${translationFilePath} (locale: ${localeCode}, type: ${extension})`
        // );

        try {
          const fileContent = fs.readFileSync(translationFilePath, "utf8");
          let localeTranslations: { [key: string]: string } | undefined;

          if (extension === "js") {
            const matchExport = fileContent.match(
              /export\s+default\s*(\{[\s\S]*?\})\s*;?\s*$/
            );
            if (matchExport && matchExport[1]) {
              try {
                localeTranslations = new Function(`return ${matchExport[1]}`)();
              } catch (e: any) {
                console.error(
                  `解析 JS 文件 ${file} 失败:`,
                  e
                ); 
              }
            } else {
              console.error(
                `无法匹配 JS 文件 ${file} 中的 export default 结构`
              );
            }
          } else if (extension === "json") {
            try {
              localeTranslations = JSON.parse(fileContent);
              if (
                typeof localeTranslations !== "object" ||
                localeTranslations === null ||
                Array.isArray(localeTranslations)
              ) {
                console.error(`JSON 文件 ${file} 格式无效: 根级别必须是对象。`);
                localeTranslations = undefined;
              }
            } catch (e: any) {
              console.error(
                `解析 JSON 文件 ${file} 失败:`,
                e
              ); 
            }
          }

          if (localeTranslations) {
            translations[localeCode] = localeTranslations;
            console.log(
              `成功加载 ${
                Object.keys(localeTranslations).length
              } 条翻译 (${localeCode} from ${file})`
            );
            loadedSuccessfully = true;
          }
        } catch (readError: any) {
          console.error(
            `读取文件 ${file} 失败:`,
            readError
          ); 
        }
      }
    }
    if (!loadedSuccessfully) {
      console.warn(`未成功加载任何有效的 locale 文件。`);
    } else {
      console.log(
        `所有有效的 locale 文件加载完毕。共加载 ${
          Object.keys(translations).length
        } 个 locale。`
      );
    }
    return loadedSuccessfully;
  } catch (error: any) {
    console.error("扫描 locale 目录失败:", error);
    return false; 
  }
}
