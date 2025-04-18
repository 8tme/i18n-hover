import * as vscode from "vscode";
import {
  I18N_HOVER_JUMP_COMMAND,
  jumpToTranslationHandler,
} from "./commands/jumpCommand";
import { loadConfiguration } from "./config/config";
import { loadTranslations } from "./locale/localeLoader";
import {
  disposeDefinitionProvider,
  registerDefinitionProvider,
} from "./providers/definitionProvider";
import {
  disposeHoverProvider,
  registerHoverProvider,
} from "./providers/hoverProvider";
import { setupWatchers } from "./watchers/fileWatchers";

export async function activate(context: vscode.ExtensionContext) {
  console.log('插件 "locale-hover-provider" 开始激活...');
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showWarningMessage(
      "请打开一个工作区以使用 i18n-hover 插件。"
    );
    return;
  }
  const workspaceFolder = workspaceFolders[0];

  // Register the command needed for hover links
  context.subscriptions.push(
    vscode.commands.registerCommand(
      I18N_HOVER_JUMP_COMMAND,
      jumpToTranslationHandler
    )
  );

  // Combined reload function passed to watchers
  async function reloadConfigAndTranslations(uri: vscode.Uri | null = null) {
    // The config watcher already reloads config and resets locale watcher
    // So this function mainly needs to reload translations and re-register providers
    if (uri) {
      // Only log if triggered by specific file change
      console.log(
        `>>> Reloading translations and providers due to: ${uri.fsPath}`
      );
    }
    const success = await loadTranslations(); // Use renamed function
    console.log(`重新加载翻译 ${success ? "成功" : "失败"}`);
    if (success) {
      registerHoverProvider(context);
      registerDefinitionProvider(context);
      console.log("Providers 已更新.");
    } else {
      // Clean up providers if loading fails
      disposeHoverProvider();
      disposeDefinitionProvider();
      console.error("翻译加载失败，Provider 已清理");
    }
  }

  // --- Initial Load ---
  loadConfiguration(workspaceFolder); // Load initial config
  setupWatchers(context, workspaceFolder, reloadConfigAndTranslations); // Setup watchers (this also does initial locale watcher setup)
  await reloadConfigAndTranslations(); // Load initial translations and register providers

  console.log('插件 "locale-hover-provider" 激活完毕');
}

export function deactivate() {
  console.log('插件 "locale-hover-provider" 已停用');
  // Disposables in context.subscriptions (commands, providers, watchers) are cleaned automatically.
  // Explicitly dispose any resources not in subscriptions if necessary.
  // disposeWatchers(); // Uncomment if watchers weren't added to subscriptions properly
}
