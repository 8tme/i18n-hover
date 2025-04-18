import * as fs from "fs"
import * as path from "path"
import * as vscode from "vscode"
import type { I18nHoverConfig } from "../types"; // Import the shared type

export const DEFAULT_CONFIG: I18nHoverConfig = {
  localeDir: "src/locale/translator", // Default changed back for simplicity, adjust if needed
  defaultJumpLocale: "en",
};

// Export the current config so other modules can access it
export let currentConfig: I18nHoverConfig = { ...DEFAULT_CONFIG };

export function loadConfiguration(
  workspaceFolder: vscode.WorkspaceFolder
): void {
  const configFilePath = path.join(
    workspaceFolder.uri.fsPath,
    ".vscode",
    "i18n-hover.json"
  );
  console.log(`尝试加载配置文件: ${configFilePath}`);

  // Reset to default before loading
  currentConfig = { ...DEFAULT_CONFIG };

  if (fs.existsSync(configFilePath)) {
    try {
      const configContent = fs.readFileSync(configFilePath, "utf8");
      const loadedConfig = JSON.parse(configContent);
      const mergedConfig = { ...DEFAULT_CONFIG, ...loadedConfig };

      if (
        typeof mergedConfig.localeDir === "string" &&
        typeof mergedConfig.defaultJumpLocale === "string"
      ) {
        // Allow ll or ll-CC format
        currentConfig = mergedConfig;
        console.log("成功加载并应用配置文件:", currentConfig);
      } else {
        console.warn(
          "配置文件 .vscode/i18n-hover.json 格式无效或不完整，使用默认配置。"
        );
        vscode.window.showWarningMessage(
          "i18n-hover 配置文件格式无效或不完整，使用默认配置。"
        );
      }
    } catch (error: any) {
      console.error(
        `解析配置文件 .vscode/i18n-hover.json 失败: ${error.message}`
      );
      vscode.window.showErrorMessage(
        `解析配置文件 .vscode/i18n-hover.json 失败: ${error.message}`
      );
    }
  } else {
    console.log("未找到配置文件 .vscode/i18n-hover.json，使用默认配置。");
  }
}
