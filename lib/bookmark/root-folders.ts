// 标准化的根文件夹类型
export enum RootFolderType {
    Toolbar = 'ToolbarFolder',
    Other = 'OtherFolder',
    Mobile = 'MobileFolder',
    Menu = 'MenuFolder',
}

// 浏览器类型
export type BrowserKind = 'chrome' | 'firefox'

// 检测当前浏览器类型
// 通过根节点 ID 判断：Firefox 是 "root________"，Chrome 是 "0"
export function detectBrowserFromTree(
    tree: chrome.bookmarks.BookmarkTreeNode[]
): BrowserKind {
    if (tree[0]?.id === 'root________') return 'firefox'
    return 'chrome'
}

// 检测当前浏览器类型（独立调用，内部获取 tree）
export async function detectBrowser(): Promise<BrowserKind> {
    const tree = await browser.bookmarks.getTree()
    return detectBrowserFromTree(tree)
}

// Chrome 根文件夹 ID → 标准类型
const CHROME_ID_MAP: Record<string, RootFolderType> = {
    '1': RootFolderType.Toolbar,
    '2': RootFolderType.Other,
    '3': RootFolderType.Mobile,
}

// Firefox 根文件夹 ID → 标准类型
const FIREFOX_ID_MAP: Record<string, RootFolderType> = {
    toolbar_____: RootFolderType.Toolbar,
    unfiled_____: RootFolderType.Other,
    mobile______: RootFolderType.Mobile,
    menu________: RootFolderType.Menu,
}

// 标准类型 → Chrome ID
const STANDARD_TO_CHROME: Record<string, string> = {
    [RootFolderType.Toolbar]: '1',
    [RootFolderType.Other]: '2',
    [RootFolderType.Mobile]: '3',
    [RootFolderType.Menu]: '2', // Chrome 没有 Menu，映射到 Other
}

// 标准类型 → Firefox ID
const STANDARD_TO_FIREFOX: Record<string, string> = {
    [RootFolderType.Toolbar]: 'toolbar_____',
    [RootFolderType.Other]: 'unfiled_____',
    [RootFolderType.Mobile]: 'mobile______',
    [RootFolderType.Menu]: 'menu________',
}

// 将浏览器特定的根文件夹 ID 映射为标准化名称（上传时使用）
export function standardizeRootTitle(
    id: string,
    browserKind: BrowserKind
): string | null {
    const map = browserKind === 'firefox' ? FIREFOX_ID_MAP : CHROME_ID_MAP
    return map[id] ?? null
}

// 获取标准化名称对应的本地根文件夹 ID（下载时使用）
export function getLocalRootId(
    standardType: string,
    browserKind: BrowserKind
): string | null {
    const map =
        browserKind === 'firefox' ? STANDARD_TO_FIREFOX : STANDARD_TO_CHROME
    return map[standardType] ?? null
}

// 所有标准化根文件夹名称的集合（用于快速判断）
export const STANDARD_ROOT_NAMES = new Set<string>(
    Object.values(RootFolderType)
)
