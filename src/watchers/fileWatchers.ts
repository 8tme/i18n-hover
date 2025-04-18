import * as path from 'path';
import * as vscode from 'vscode';
import { currentConfig, loadConfiguration } from '../config/config';

let localeWatcher: vscode.FileSystemWatcher | undefined;
let configWatcher: vscode.FileSystemWatcher | undefined;

// Type for the reload function passed from extension.ts
type ReloadCallback = (uri?: vscode.Uri | null) => Promise<void>;

export function setupWatchers(
	context: vscode.ExtensionContext,
	workspaceFolder: vscode.WorkspaceFolder,
	reloadConfigAndTranslations: ReloadCallback // Combined reload function
): void {
	// --- Locale Watcher Setup ---
	function setupLocaleWatcherInternal() {
		if (localeWatcher) {
			const index = context.subscriptions.indexOf(localeWatcher);
			if(index > -1) {context.subscriptions.splice(index, 1);} // Remove old one
			localeWatcher.dispose();
			console.log('旧的 locale 文件监视器已清理');
		}
		const relativeLocaleDir = currentConfig.localeDir;
		if (path.isAbsolute(relativeLocaleDir) || relativeLocaleDir.startsWith('..')) {
			console.error(`配置的 localeDir "${relativeLocaleDir}" 无效...`);
			vscode.window.showErrorMessage(`配置的 localeDir "${relativeLocaleDir}" 无效。`);
			localeWatcher = undefined; // Ensure it's undefined
			return;
		}
		// Watch both .js and .json
		const pattern = new vscode.RelativePattern(workspaceFolder, path.join(relativeLocaleDir, '*.{js,json}'));
		console.log('创建 locale 文件监视器，模式:', pattern.pattern);
		localeWatcher = vscode.workspace.createFileSystemWatcher(pattern);
		localeWatcher.onDidChange(reloadConfigAndTranslations); // Use the combined reload
		localeWatcher.onDidCreate(reloadConfigAndTranslations);
		localeWatcher.onDidDelete(reloadConfigAndTranslations);
		context.subscriptions.push(localeWatcher); // Add new one
		console.log(`locale 文件监视器已设置`);
	}

	// --- Config Watcher Setup ---
	if (configWatcher) { // Clean up existing config watcher if any (shouldn't happen often)
		const index = context.subscriptions.indexOf(configWatcher);
		if(index > -1) {context.subscriptions.splice(index, 1);}
		configWatcher.dispose();
	}
	const configFilePath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'i18n-hover.json');
	console.log(`设置配置文件监视器: ${configFilePath}`);
	configWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);

	// This handler reloads everything: config, then locale watcher, then translations/providers
	const handleConfigChange = async (uri: vscode.Uri | null = null) => {
		if (uri) {console.log(`检测到配置文件变化: ${uri.fsPath}`);}
		else {console.log(`配置文件删除，恢复默认配置...`);} // Handle deletion case

		loadConfiguration(workspaceFolder); // Reload config first
		setupLocaleWatcherInternal();      // Re-setup locale watcher based on new config
		await reloadConfigAndTranslations(null); // Reload translations/providers
	};

	configWatcher.onDidChange(handleConfigChange);
	configWatcher.onDidCreate(handleConfigChange);
	configWatcher.onDidDelete(() => handleConfigChange(null)); // Pass null for deletion
	context.subscriptions.push(configWatcher);

	// Initial setup for locale watcher based on initial config
	setupLocaleWatcherInternal();
}

// Optional: Function to dispose all watchers if needed
export function disposeWatchers() {
    if (localeWatcher) {
        localeWatcher.dispose();
        localeWatcher = undefined;
    }
     if (configWatcher) {
        configWatcher.dispose();
        configWatcher = undefined;
    }
} 