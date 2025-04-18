import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

// --- 新增：配置接口和默认值 ---
interface I18nHoverConfig {
	/** 相对于工作区根目录的 locale 文件夹路径 */
	localeDir: string;
	/** 点击 Key 或语言标题时默认跳转的目标语言代码 (例如 'en', 'zh') */
	defaultJumpLocale: string;
}

const DEFAULT_CONFIG: I18nHoverConfig = {
	localeDir: 'src/locale/translator',       // 默认监控根目录下的 locale 文件夹
	defaultJumpLocale: 'en', // 默认跳转到 en.js
};

let currentConfig: I18nHoverConfig = { ...DEFAULT_CONFIG }; // 初始化为默认配置
// --- 配置接口和默认值结束 ---

// 用于存储所有加载的翻译内容，按 locale 分组
let translations: { [locale: string]: { [key: string]: string } } = {};
// 不再需要 currentLocale
// let currentLocale: string | undefined;
// 用于存储 hover provider 的注册，方便后续更新或取消
let hoverProviderDisposable: vscode.Disposable | undefined;
let definitionProviderDisposable: vscode.Disposable | undefined;

/**
 * 加载所有 xx.js 格式的 locale 文件
 * @param context 插件上下文
 * @returns Promise<boolean> 是否至少加载了一个 locale 文件
 */
async function loadConfigAndTranslations(context: vscode.ExtensionContext): Promise<boolean> {
	console.log('开始加载所有 xx.js locale 文件...');
	translations = {};
	let loadedSuccessfully = false;
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		vscode.window.showWarningMessage('请先打开一个工作区以使用此插件。');
		return false;
	}
	const workspaceRoot = workspaceFolders[0].uri.fsPath;

	// **修改：使用配置的 localeDir**
	const localeDir = path.join(workspaceRoot, currentConfig.localeDir);
	console.log(`目标 locale 目录 (来自配置): ${localeDir}`); // 添加日志

	try {
		if (!fs.existsSync(localeDir)) {
			console.warn(`locale 目录不存在: ${localeDir}`);
			// 注意：这里不再显示错误消息，因为可能是用户故意配置了不存在的目录
			return false;
		}

		const files = fs.readdirSync(localeDir);
		const localeFileRegex = /^[a-z]{2}\.js$/; // 正则：匹配两个小写字母开头的 .js 文件

		console.log(`在 ${localeDir} 中找到 ${files.length} 个文件/目录`);

		for (const file of files) {
			if (localeFileRegex.test(file)) {
				const localeCode = file.substring(0, 2); // 提取 locale 代码，例如 'en'
				const translationFilePath = path.join(localeDir, file);
				console.log(`尝试加载 locale 文件: ${translationFilePath} (locale: ${localeCode})`);

				try {
					const fileContent = fs.readFileSync(translationFilePath, 'utf8');
					const match = fileContent.match(/export\s+default\s*(\{[\s\S]*?\})\s*;?\s*$/);

					if (match && match[1]) {
						try {
							const localeTranslations = new Function(`return ${match[1]}`)();
							translations[localeCode] = localeTranslations;
							console.log(`成功加载 ${Object.keys(localeTranslations).length} 条翻译 (${localeCode})`);
							loadedSuccessfully = true; // 标记至少成功加载了一个
						} catch (e: any) {
							vscode.window.showErrorMessage(`解析 ${file} 文件时出错: ${e.message}`);
							console.error(`解析 ${file} 失败:`, e);
						}
					} else {
						vscode.window.showErrorMessage(`无法从 ${file} 文件中提取翻译对象。`);
						console.error(`无法匹配 ${file} 中的 export default 结构`);
					}
				} catch (readError: any) {
					vscode.window.showErrorMessage(`读取 ${file} 时出错: ${readError.message}`);
					console.error(`读取 ${file} 失败:`, readError);
				}
			}
		}

		if (!loadedSuccessfully) {
			console.warn(`未成功加载任何有效的 xx.js locale 文件。`);
		} else {
			console.log(`所有有效的 locale 文件加载完毕。共加载 ${Object.keys(translations).length} 个 locale。`);
		}
		return loadedSuccessfully; // 或者可以返回 true，只要目录存在

	} catch (error: any) {
		vscode.window.showErrorMessage(`扫描 locale 目录时出错: ${error.message}`);
		console.error("扫描 locale 目录失败:", error);
		return false;
	}
}

// 新增：命令处理函数
async function jumpToTranslationHandler(args: { key: string; targetFileUriString: string }) {
	if (!args || !args.key || !args.targetFileUriString) {
		vscode.window.showErrorMessage('无法跳转：缺少必要的参数。');
		return;
	}

	const { key, targetFileUriString } = args;
	const targetUri = vscode.Uri.parse(targetFileUriString);

	try {
		// 1. 打开目标文件
		const document = await vscode.workspace.openTextDocument(targetUri);
		const editor = await vscode.window.showTextDocument(document);

		// 2. 查找 Key 所在的行
		let targetLine = -1;
		const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'); // 转义正则特殊字符
		// 尝试匹配 'key': "...", "key": "...", `key`: "..." (忽略前后空格)
		const keyRegex = new RegExp(`(['"\`])\\s*${escapedKey}\\s*\\1\\s*:`);

		for (let i = 0; i < document.lineCount; i++) {
			const line = document.lineAt(i);
			if (keyRegex.test(line.text)) {
				targetLine = i;
				break;
			}
		}

		// 3. 如果找到行，滚动到该行并高亮（可选）
		if (targetLine !== -1) {
			const targetPosition = new vscode.Position(targetLine, 0);
			const range = new vscode.Range(targetPosition, targetPosition);
			editor.selection = new vscode.Selection(targetPosition, targetPosition);
			editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
			console.log(`跳转到 ${targetUri.fsPath} 的第 ${targetLine + 1} 行 (key: ${key})`);
		} else {
			vscode.window.showWarningMessage(`在 ${path.basename(targetUri.fsPath)} 中未找到 key '${key}' 的精确定义行，已打开文件。`);
			console.log(`在 ${targetUri.fsPath} 中未找到 key '${key}' 的精确匹配行`);
		}

	} catch (error: any) {
		vscode.window.showErrorMessage(`无法打开或处理文件 ${targetUri.fsPath}: ${error.message}`);
		console.error(`跳转到翻译失败:`, error);
	}
}

/**
 * 注册 Definition Provider，用于 Cmd/Ctrl+Click 跳转
 * @param context 插件上下文
 */
function registerDefinitionProvider(context: vscode.ExtensionContext) {
	// 先清理旧的 Provider (如果存在)
	if (definitionProviderDisposable) {
		console.log('正在清理旧的 Definition Provider...');
		const index = context.subscriptions.indexOf(definitionProviderDisposable);
		if (index > -1) {
			context.subscriptions.splice(index, 1);
		}
		definitionProviderDisposable.dispose();
		definitionProviderDisposable = undefined; // 清空引用
	}

	console.log('准备注册新的 Definition Provider...');
	definitionProviderDisposable = vscode.languages.registerDefinitionProvider(
		['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
		{
			async provideDefinition(document, position, token) {
				console.log('>>> provideDefinition triggered'); // 确认触发

				// --- 查找 Key ---
				const lineText = document.lineAt(position.line).text;
				const stringRegex = /(['"`])(?:(?!\1)[^\\]|\\.)*\1/g;
				let match;
				let foundText: string | undefined = undefined;
				let potentialRange: vscode.Range | undefined = undefined;
				while ((match = stringRegex.exec(lineText)) !== null) {
					const startIndex = match.index;
					const endIndex = startIndex + match[0].length;
					if (position.character > startIndex && position.character < endIndex) {
						foundText = match[0];
						potentialRange = new vscode.Range(new vscode.Position(position.line, startIndex), new vscode.Position(position.line, endIndex));
						break;
					}
				}
				console.log('查找 Key:', { foundText, potentialRange });
				if (!foundText || !potentialRange) {
					console.log('DefinitionProvider: 未在光标下找到 Key 字符串。');
					return undefined;
				}

				const key = foundText.slice(1, -1);
				// **使用配置的 defaultJumpLocale**
				const targetLocale = currentConfig.defaultJumpLocale;
				console.log(`目标跳转 locale (来自配置): ${targetLocale}`);

				// --- 确定目标文件 URI (使用配置) ---
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) { console.warn('...'); return undefined; }
				const workspaceFolder = workspaceFolders[0];
				// **使用配置的 localeDir 构建路径**
				const targetFileUri = vscode.Uri.joinPath(workspaceFolder.uri, currentConfig.localeDir, `${targetLocale}.js`);
				console.log('目标文件 URI:', targetFileUri.fsPath);

				// 检查目标文件是否存在 (可选但推荐)
				if (!fs.existsSync(targetFileUri.fsPath)) {
				 	console.warn(`DefinitionProvider: 目标文件不存在: ${targetFileUri.fsPath}`);
				 	return undefined;
				}

				// --- 在目标文件中查找 key 的精确位置 ---
				try {
					const targetDocument = await vscode.workspace.openTextDocument(targetFileUri);
					const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
					const keyRegex = new RegExp(`(['"\`])\\s*${escapedKey}\\s*\\1\\s*:`);

					for (let i = 0; i < targetDocument.lineCount; i++) {
						const line = targetDocument.lineAt(i);
						const matchResult = line.text.match(keyRegex);
						if (matchResult && typeof matchResult.index === 'number') {
							const keyStartIndex = matchResult.index;
							const firstQuoteIndex = line.text.indexOf(matchResult[1], keyStartIndex);
							const secondQuoteIndex = line.text.indexOf(matchResult[1], firstQuoteIndex + 1);
							if (firstQuoteIndex !== -1 && secondQuoteIndex !== -1) {
								const targetRange = new vscode.Range(new vscode.Position(i, firstQuoteIndex), new vscode.Position(i, secondQuoteIndex + 1));
								console.log(`返回精确范围:`, targetRange);
								return new vscode.Location(targetFileUri, targetRange);
							} else {
								console.log(`返回整行范围`);
								return new vscode.Location(targetFileUri, line.range);
							}
						}
					}
					console.log(`DefinitionProvider: Key '${key}' not found in ${targetFileUri.fsPath}`);
					return undefined; // 不再提示用户
				} catch (error: any) {
					console.error(`DefinitionProvider: Error opening or reading ${targetFileUri.fsPath}:`, error);
					vscode.window.showErrorMessage(`无法打开或读取文件 ${targetFileUri.fsPath}: ${error.message}`);
					return undefined;
				}
			}
		}
	);
	context.subscriptions.push(definitionProviderDisposable); // 添加到清理队列
	console.log('Definition Provider 已注册');
}

/**
 * 注册 Hover Provider
 * @param context 插件上下文
 */
function registerHoverProvider(context: vscode.ExtensionContext) {
	if (hoverProviderDisposable) {
		hoverProviderDisposable.dispose();
	}
	console.log('注册 Hover Provider...');

	hoverProviderDisposable = vscode.languages.registerHoverProvider(
		['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
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
					if (position.character > startIndex && position.character < endIndex) {
						foundRange = new vscode.Range(new vscode.Position(position.line, startIndex), new vscode.Position(position.line, endIndex));
						foundText = match[0];
						break;
					}
				}

				if (foundRange && foundText) {
					const key = foundText.slice(1, -1);
					const foundTranslations: { [lc: string]: string } = {}; let translationFound = false;
					for (const lc in translations) {
						if (Object.prototype.hasOwnProperty.call(translations, lc)) {
							const localeContent = translations[lc];
							if (localeContent && typeof localeContent === 'object' && Object.prototype.hasOwnProperty.call(localeContent, key)) {
								foundTranslations[lc] = localeContent[key];
								translationFound = true;
							}
						}
					}

					if (translationFound) {
						const markdown = new vscode.MarkdownString('', true);
						markdown.isTrusted = true;
						const workspaceFolders = vscode.workspace.workspaceFolders;
						const workspaceFolder = (workspaceFolders && workspaceFolders.length > 0) ? workspaceFolders[0] : undefined;

						// --- 添加 Key (带跳转链接，使用配置) ---
						const keyTargetLocale = currentConfig.defaultJumpLocale;
						let keyCommandUri: vscode.Uri | undefined = undefined;
						if (workspaceFolder && translations[keyTargetLocale]) {
							const targetFileUri = vscode.Uri.joinPath(workspaceFolder.uri, currentConfig.localeDir, `${keyTargetLocale}.js`);
							const args = { key: key, targetFileUriString: targetFileUri.toString() };
							const encodedArgs = encodeURIComponent(JSON.stringify(args));
							keyCommandUri = vscode.Uri.parse(`command:i18n-hover.jumpToTranslation?${encodedArgs}`);
						}
						if (keyCommandUri) {
							markdown.appendMarkdown(`[**Key:** \`${key}\`](${keyCommandUri} "跳转到 ${keyTargetLocale}.js 中的定义")\n\n---\n`);
						} else {
							markdown.appendMarkdown(`**Key:** \`${key}\`\n\n---\n`);
						}

						// --- 添加翻译内容 (排序逻辑 + 跳转链接，使用配置) ---
						const preferredOrder = ['en', 'tw']; // 这个排序可以保持，或者也做成可配置的
						const processedLocales = new Set<string>();
						const addTranslationToMarkdown = (localeCode: string) => {
							if (Object.prototype.hasOwnProperty.call(foundTranslations, localeCode)) {
								let langCommandUri: vscode.Uri | undefined = undefined;
								if (workspaceFolder) {
									const targetFileUri = vscode.Uri.joinPath(workspaceFolder.uri, currentConfig.localeDir, `${localeCode}.js`);
									const args = { key: key, targetFileUriString: targetFileUri.toString() };
									const encodedArgs = encodeURIComponent(JSON.stringify(args));
									langCommandUri = vscode.Uri.parse(`command:i18n-hover.jumpToTranslation?${encodedArgs}`);
								}
								if (langCommandUri) {
									markdown.appendMarkdown(`\n[**${localeCode.toUpperCase()}:**](${langCommandUri} "跳转到 ${localeCode}.js")\n`);
								} else {
									markdown.appendMarkdown(`\n**${localeCode.toUpperCase()}:**\n`); // 如果无法生成链接，只显示标题
								}
								markdown.appendCodeblock(foundTranslations[localeCode] || '', 'plaintext');
								processedLocales.add(localeCode);
							}
						};
						for (const localeCode of preferredOrder) { addTranslationToMarkdown(localeCode); }
						const remainingLocales = Object.keys(foundTranslations).filter(lc => !processedLocales.has(lc)).sort();
						for (const localeCode of remainingLocales) { addTranslationToMarkdown(localeCode); }

						return new vscode.Hover(markdown, foundRange);
					} else {
						console.log(`未在任何 locale 文件中找到 key '${key}' 对应的翻译`);
					}
				} else {
					 // console.log('光标位置不在任何匹配的字符串内部');
				}

				return undefined;
			}
		}
	);
	context.subscriptions.push(hoverProviderDisposable);
	console.log('Hover Provider 已注册');
}

// --- 新增：加载配置函数 ---
function loadConfiguration(workspaceFolder: vscode.WorkspaceFolder): void {
	const configFilePath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'i18n-hover.json');
	console.log(`尝试加载配置文件: ${configFilePath}`);

	// 重置为默认值，以防文件不存在或无效
	currentConfig = { ...DEFAULT_CONFIG };

	if (fs.existsSync(configFilePath)) {
		try {
			const configContent = fs.readFileSync(configFilePath, 'utf8');
			const loadedConfig = JSON.parse(configContent);

			// 合并加载的配置和默认值，确保所有字段都存在
			const mergedConfig = { ...DEFAULT_CONFIG, ...loadedConfig };

			// 简单的验证
			if (typeof mergedConfig.localeDir === 'string' &&
				typeof mergedConfig.defaultJumpLocale === 'string' &&
				/^[a-z]{2}$/.test(mergedConfig.defaultJumpLocale)) // 验证 defaultJumpLocale 是两个小写字母
			{
				currentConfig = mergedConfig;
				console.log('成功加载并应用配置文件:', currentConfig);
			} else {
				console.warn('配置文件 .vscode/i18n-hover.json 格式无效或不完整，使用默认配置。');
				vscode.window.showWarningMessage('i18n-hover 配置文件格式无效或不完整，使用默认配置。');
			}
		} catch (error: any) {
			console.error(`解析配置文件 .vscode/i18n-hover.json 失败: ${error.message}`);
			vscode.window.showErrorMessage(`解析配置文件 .vscode/i18n-hover.json 失败: ${error.message}`);
			// 出错时保持默认配置
		}
	} else {
		console.log('未找到配置文件 .vscode/i18n-hover.json，使用默认配置。');
		// 文件不存在时保持默认配置
	}
}
// --- 加载配置函数结束 ---

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('插件 "locale-hover-provider" 开始激活...');
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		console.warn('未找到工作区文件夹，插件无法激活。');
		vscode.window.showWarningMessage('请打开一个工作区以使用 i18n-hover 插件。');
		return;
	}
	const workspaceFolder = workspaceFolders[0];

	// 注册命令 (用于 Hover 链接)
	const jumpCommandDisposable = vscode.commands.registerCommand('i18n-hover.jumpToTranslation', jumpToTranslationHandler);
	context.subscriptions.push(jumpCommandDisposable);

	// --- 重载函数 ---
	async function reloadTranslationsAndProviders() {
		const success = await loadConfigAndTranslations(context);
		console.log(`重新加载翻译 ${success ? '成功' : '失败'}`);
		if (success) {
			// **确保 Provider 被重新注册**
			registerHoverProvider(context);
			registerDefinitionProvider(context); // <-- 重新注册 Definition Provider
			console.log('Providers 已更新.');
		} else {
			// 清理旧的 Provider
			if (hoverProviderDisposable) {
				hoverProviderDisposable.dispose();
				hoverProviderDisposable = undefined;
			}
			if (definitionProviderDisposable) { // <-- 新增清理
				// 确保从 subscriptions 中移除，避免重复 dispose
				const index = context.subscriptions.indexOf(definitionProviderDisposable);
				if (index > -1) {context.subscriptions.splice(index, 1);}
				definitionProviderDisposable.dispose();
				definitionProviderDisposable = undefined;
			}
			console.error("翻译加载失败，未注册 Provider");
		}
	}

	// --- 监听 locale 目录 (不变) ---
	let localeWatcher: vscode.Disposable | undefined;
	function setupLocaleWatcher() {
		if (localeWatcher) {
			const index = context.subscriptions.indexOf(localeWatcher);
			if(index > -1) {context.subscriptions.splice(index, 1);}
			localeWatcher.dispose();
			console.log('旧的 locale 文件监视器已清理');
			localeWatcher = undefined;
		}
		const relativeLocaleDir = currentConfig.localeDir;
		if (path.isAbsolute(relativeLocaleDir) || relativeLocaleDir.startsWith('..')) {
			console.error(`配置的 localeDir "${relativeLocaleDir}" 无效，必须是相对于工作区的路径。停止设置 locale 文件监视器。`);
			vscode.window.showErrorMessage(`配置的 localeDir "${relativeLocaleDir}" 无效。`);
			return;
		}
		const pattern = new vscode.RelativePattern(workspaceFolder, path.join(relativeLocaleDir, '*.js'));
		console.log('创建 locale 文件监视器，模式:', pattern.pattern, '基础路径:', pattern.baseUri.fsPath);
		const newWatcher = vscode.workspace.createFileSystemWatcher(pattern);
		const reloadLocaleFiles = async (uri: vscode.Uri) => {
			console.log(`>>> locale 文件变化: ${uri.fsPath}`);
			await reloadTranslationsAndProviders();
		};
		newWatcher.onDidChange(reloadLocaleFiles);
		newWatcher.onDidCreate(reloadLocaleFiles);
		newWatcher.onDidDelete(reloadLocaleFiles);
		localeWatcher = newWatcher;
		context.subscriptions.push(localeWatcher); // <-- 确保添加到 subscriptions
		console.log(`locale 文件监视器已设置: ${pattern.baseUri.fsPath}/${pattern.pattern}`);
	}

	// --- 监听配置文件 (不变) ---
	const configFilePath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'i18n-hover.json');
	const configWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);
	const reloadConfigAndAll = async (uri: vscode.Uri | null = null) => {
		if (uri) {console.log(`检测到配置文件变化: ${uri.fsPath}`);}
		loadConfiguration(workspaceFolder);
		setupLocaleWatcher(); // 会清理并重新创建 localeWatcher
		await reloadTranslationsAndProviders(); // 内部会清理并重新创建 Providers
	};
	configWatcher.onDidChange(reloadConfigAndAll); configWatcher.onDidCreate(reloadConfigAndAll); configWatcher.onDidDelete(async () => { // 配置文件被删除
		console.log(`检测到配置文件删除，恢复默认配置并重新加载...`);
		await reloadConfigAndAll(); // 内部 loadConfiguration 会自动用默认值
	});
	context.subscriptions.push(configWatcher);
	console.log(`配置文件监视器已设置: ${configFilePath}`);

	// --- 首次加载 ---
	loadConfiguration(workspaceFolder);
	setupLocaleWatcher();
	const success = await loadConfigAndTranslations(context);
	console.log(`首次加载配置和翻译 ${success ? '成功' : '失败'}`);
	if (success) {
		registerHoverProvider(context);
		registerDefinitionProvider(context); // <-- 确保首次加载也注册
	} else { console.error("配置加载失败，未注册 Provider"); }

	console.log('插件 "locale-hover-provider" 激活完毕');
}

// This method is called when your extension is deactivated
export function deactivate() {
	console.log('插件 "locale-hover-provider" 已停用');
	// Provider 和 Watcher 应该会被 context.subscriptions 自动清理
	// 但为了明确，可以保留手动清理逻辑（确保不重复 dispose）
	if (hoverProviderDisposable) {
		// hoverProviderDisposable.dispose(); // 可能已被 subscriptions 清理
	}
	if (definitionProviderDisposable) {
		// definitionProviderDisposable.dispose(); // 可能已被 subscriptions 清理
	}
	translations = {};
	// 重置配置可能不是必要的，取决于插件停用后是否需要保留状态
	// currentConfig = { ...DEFAULT_CONFIG };
}
