/**
 * 轻量 i18n：启动时通过 setLang() 一次性设置语言（zh* → 中文，其余 → 英文），
 * 组件内用 t(key, params) 取文案；{name} 形式占位符由 params 替换。
 */

export type Lang = 'zh' | 'en';

// 默认英文（市场更安全）；检测到 zh* 语言时切换为中文
let currentLang: Lang = 'en';

export function setLang(raw: string | undefined | null): void {
  currentLang =
    typeof raw === 'string' && raw.trim().toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const zh: Record<string, string> = {
  // 通用
  cancel: '取消',
  close: '关闭',
  back: '返回',
  remove: '移除',
  clear: '清除',
  copy: '复制',
  copied: '已复制 ✓',
  expandAll: '展开全部',
  collapseAll: '折叠全部',
  listSeparator: '、',
  quote: '「{name}」',
  moreCount: '… 等 {count} 个',

  // App 工具栏
  exitSearch: '退出搜索',
  tagFilterTooltip: '标签筛选（且 / 或 / 排除）',
  exitTagFilter: '退出标签筛选',

  // 右键菜单 / 旧格式迁移
  migrateLegacy: '迁移旧版层级标签（#a/b/c）',
  migrationConfirmTitle: '迁移旧版层级标签？',
  migrationBody1: '将把全库笔记中的 ',
  migrationBody2: ' 改写为 ',
  migrationBody3: '（层级保留在行内文本中），并清理早期版本遗留的 ',
  migrationBody4: ' 属性。迁移后 ',
  migrationBody5: ' 都指向同一个 ',
  migrationBody6: ' 页面，层级由本插件按行内前缀展示，同一行多个不同层级的标签都能被解析。建议先在测试图谱验证，并提前备份。',
  startMigration: '开始迁移',
  migrating: '迁移中…',
  migrationRunning: '正在迁移，请勿关闭面板…',
  migrationResultTitle: '迁移完成：更新 {updated} 个块，发现 {count} 个旧标签页',
  deletedBlankPages: '已删除 {count} 个空白旧页面；',
  keptPagesHint: '以下 {count} 个页面含有笔记内容，已保留，请人工确认后再处理：',
  allPagesBlank: '所有旧标签页均为空白页面。',
  cleaning: '清理中…',
  deleteEmptyLegacyPages: '删除已清空的旧页面',
  migrationFailed: '迁移失败，请查看控制台日志',

  // 删除（移出层级）确认卡
  removeFromHierarchyTitle: '从层级中移除「{path}」？',
  deleteRootConceptBody:
    '该位置是根级概念：对应块上的 #标签引用会被移除，只含标签的空行会被删除（有子内容的行保留子内容）。概念页面文件不会被删除。',
  deleteLevelBody:
    '仅移除层级归属：该路径下标签的行内前缀会被去掉（a/b/#c 变为 #c），块回到根级，#标签引用与概念页面都保留，不会删除任何笔记内容。此操作会影响该路径下的全部子层级。',
  processing: '处理中…',
  confirmRemove: '确认移除',

  // 合并
  mergeIntoTitle: '并入到「{source}」',
  mergeSearchPlaceholder: '搜索要并入的概念标签',
  mergeHint:
    '勾选要并入的概念：末段相同的位置会通过改写行内前缀直接收敛；末段不同的概念会统一重命名到源概念（同名自动合并）。源标签的祖先与纯路径节点不可选。',
  nextStepCount: '下一步（{count}）',
  mergeConfirmTitle: '确认合并到「{source}」？',
  willMergeCount: '将并入 {count} 个位置：',
  merging: '合并中…',
  confirmMerge: '确认合并',

  // 移动
  moveTagTitle: '移动标签「{name}」？',
  moveNestedBody: '将成为「{target}」的第一个子标签。',
  movePositionBody: '将移动到{parent}，{position}。',
  rootLevel: '根级',
  underParent: '「{name}」下',
  beforeTarget: '排在目标前',
  afterTarget: '排在目标后',
  moveRewriteBody:
    '该操作会改写 {count} 个位置对应块的行内层级写法（如 a/b/#c → x/#c），概念页面不变：',
  moving: '移动中…',
  confirmMove: '确认移动',

  // 重命名
  renameConceptTag: '重命名概念标签',
  renameLevelTitle: '重命名层级',
  renamePlaceholder: '输入新的名称',
  renameAffectLine: '将影响 {count} 个位置{mode}：',
  renameModeWithPage: '（含概念页重命名，全库引用由 Logseq 原生更新）',
  renameModePrefixOnly: '（仅改写块的行内层级前缀）',
  renamePageToo: '同时重命名概念页面 #{old} → #{new}',
  renaming: '重命名中…',
  confirmRename: '确认重命名',

  // 提示消息（toast）
  orderAdjusted: '已调整「{name}」的顺序',
  movedWithBlocks: '已移动「{name}」：{count} 个块的层级路径已更新',
  moveFailed: '移动失败：部分路径可能已更新，请重新打开标签面板检查',
  renameConceptDone: '已重命名概念「{names}」，{count} 个块的层级路径已更新',
  renameLevelDone: '已重命名层级：{count} 个块的路径已更新',
  renameFailedPartial:
    '概念页面「{names}」的重命名被 Logseq 拒绝，引用已改为新名；旧页面将残留，可手动删除',
  renameFailed: '重命名失败：部分引用可能已更新，请重新打开标签面板检查',
  mergedInto: '已将 {count} 个位置并入「{name}」',
  mergeFailed: '合并失败：部分引用可能已更新，请重新打开标签面板检查',
  removedFromHierarchyDone:
    '已从层级中移除「{path}」：更新 {updated} 个块、移除 {removed} 个空块（标签页面保留）',
  removeFailed: '移除失败：部分路径可能已更新，请重新打开标签面板检查',

  // 方案校验错误（utils.ts 的 plan 函数，经确认卡 / toast 展示）
  errInvalidDropTarget: '无效的拖放目标',
  errDragIntoDescendant: '不能将标签拖入它自己或它的子标签中',
  errTargetExists: '目标位置已存在同名标签：{names}',
  errInvalidTag: '无效的标签',
  errEmptyName: '标签名不能为空',
  errNameContainsSlash: '单层标签名不能包含 /',
  errNameSpecialChars: '标签名不能包含 #、[、] 等特殊字符',
  errSameName: '新名称与当前名称相同',
  errSiblingExists: '同级已存在同名标签「{name}」（标签合并将在后续版本支持）',
  errRenameConflict: '目标名称与现有标签冲突：{names}（标签合并将在后续版本支持）',
  errNoMergeTargets: '未选择要合并的标签',
  errMergeIntoItself: '不能将标签合并到它自身',
  errMergeCycle: '不能将父级标签「{target}」并入其子标签「{source}」，否则会形成循环',
  errMergeDuplicate: '标签「{target}」已包含在「{source}」的合并范围内，无需重复选择',

  // 标签树
  treeSectionLabel: '标签树（点击包含 · 右键排除）',
  noMatchingTags: '未找到匹配标签',
  noTagsHint: '还没有标签：直接写 #概念，或用 a/b/#概念 输入后自动生成层级',

  // 条目操作提示
  filterConceptRowTip: '点击：包含此概念（匹配任意层级）\n右键：排除',
  filterPathRowTip: '点击：包含此路径子树\n右键：排除',
  openConceptPage: '打开 #{name} 概念页面',
  renameLevelPath: '重命名层级路径',
  mergeOthersInto: '将其他概念合并到此概念',
  removePositionTip: '从层级中移除此位置（概念页面保留）',
  deleteLevelPath: '删除此层级路径（块回到根级，不删笔记）',
  virtualPathTip: '虚拟层级路径（无页面）',
  virtualPathToggleTip: '虚拟层级路径（无页面），点击展开/折叠',
  searchTextTip: '点击搜索文本',

  // 筛选条件栏
  combinationTooltip: '点击切换组合方式（仅作用于包含组）',
  and: '且',
  or: '或',
  includeConceptChip: '包含概念：匹配任意层级下的 #{name}（点击转为排除）',
  includePathChip: '包含路径：匹配 {label} 子树（点击转为排除）',
  excludeChip: '排除：{label}（点击转回包含）',
  filterHint: '点击标签加入筛选 · 右键排除',
  resultCount: '{count} 条',

  // 筛选结果区
  matchedResults: '匹配结果 {count}',
  collapseResults: '收起结果',
  expandResults: '展开结果',
  copyResultsTooltip: '复制匹配结果为 Markdown 列表（块引用 + 页面链接），可直接粘贴到 Logseq 页面',
  noFilterResults: '没有匹配的块或页面，尝试调整筛选条件',
  openThisPage: '打开此页面',
  tagsPageBadge: 'tags:: 页',
  locateBlock: '定位到该块',
  openPage: '打开页面：{name}',
};

const en: Record<string, string> = {
  // General
  cancel: 'Cancel',
  close: 'Close',
  back: 'Back',
  remove: 'Remove',
  clear: 'Clear',
  copy: 'Copy',
  copied: 'Copied ✓',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  listSeparator: ', ',
  quote: '"{name}"',
  moreCount: '… {count} more',

  // App toolbar
  exitSearch: 'Exit search',
  tagFilterTooltip: 'Tag filter (AND / OR / Exclude)',
  exitTagFilter: 'Exit tag filter',

  // Context menu / legacy migration
  migrateLegacy: 'Migrate legacy hierarchical tags (#a/b/c)',
  migrationConfirmTitle: 'Migrate legacy hierarchical tags?',
  migrationBody1: 'This will rewrite ',
  migrationBody2: ' into ',
  migrationBody3: ' across all notes in your graph (hierarchy kept inline in the text), and clean up legacy ',
  migrationBody4: ' properties. After migration, ',
  migrationBody5: ' all point to the same ',
  migrationBody6: ' page; the hierarchy is rendered by this plugin from inline prefixes, and multiple tags with different hierarchies in the same line are all parsed. Test on a sandbox graph first and back up beforehand.',
  startMigration: 'Start migration',
  migrating: 'Migrating…',
  migrationRunning: 'Migrating — do not close the panel…',
  migrationResultTitle: 'Migration complete: {updated} blocks updated, {count} legacy tag pages found',
  deletedBlankPages: 'Deleted {count} blank legacy pages; ',
  keptPagesHint: 'The {count} page(s) below still contain notes and were kept — review them manually before proceeding:',
  allPagesBlank: 'All legacy tag pages are blank.',
  cleaning: 'Cleaning…',
  deleteEmptyLegacyPages: 'Delete emptied legacy pages',
  migrationFailed: 'Migration failed; check the console log',

  // Delete (remove from hierarchy) confirm card
  removeFromHierarchyTitle: 'Remove "{path}" from the hierarchy?',
  deleteRootConceptBody:
    'This is a root-level concept: the #tag references on its blocks will be removed, and lines containing only tags will be deleted (lines with other content keep their content). The concept page itself will not be deleted.',
  deleteLevelBody:
    'Removes only the hierarchy membership: the inline prefix of tags under this path is stripped (a/b/#c becomes #c), blocks move back to the root, and both #tag references and concept pages are kept — no note content is deleted. This affects every sub-level under this path.',
  processing: 'Processing…',
  confirmRemove: 'Confirm removal',

  // Merge
  mergeIntoTitle: 'Merge into "{source}"',
  mergeSearchPlaceholder: 'Search concept tags to merge in',
  mergeHint:
    'Check the concepts to merge in: positions sharing the same last segment converge by rewriting inline prefixes; concepts with different last segments are renamed to the source concept (pages with the same name merge automatically). Ancestors of the source tag and pure path nodes cannot be selected.',
  nextStepCount: 'Next ({count})',
  mergeConfirmTitle: 'Confirm merging into "{source}"?',
  willMergeCount: '{count} location(s) will be merged in: ',
  merging: 'Merging…',
  confirmMerge: 'Confirm merge',

  // Move
  moveTagTitle: 'Move tag "{name}"?',
  moveNestedBody: 'It will become the first child tag of "{target}".',
  movePositionBody: 'It will move to {parent}, {position}.',
  rootLevel: 'the root level',
  underParent: 'under "{name}"',
  beforeTarget: 'placed before the target',
  afterTarget: 'placed after the target',
  moveRewriteBody:
    'This rewrites the inline hierarchy syntax of the blocks at {count} location(s) (e.g. a/b/#c → x/#c); concept pages are unchanged:',
  moving: 'Moving…',
  confirmMove: 'Confirm move',

  // Rename
  renameConceptTag: 'Rename concept tag',
  renameLevelTitle: 'Rename hierarchy level',
  renamePlaceholder: 'Enter a new name',
  renameAffectLine: 'Will affect {count} location(s){mode}:',
  renameModeWithPage: ' (concept page renamed too; graph-wide references updated natively by Logseq)',
  renameModePrefixOnly: ' (rewrites only the inline hierarchy prefixes of blocks)',
  renamePageToo: 'Also rename the concept page #{old} → #{new}',
  renaming: 'Renaming…',
  confirmRename: 'Confirm rename',

  // Toast messages
  orderAdjusted: 'Reordered "{name}"',
  movedWithBlocks: 'Moved "{name}": hierarchy paths of {count} block(s) updated',
  moveFailed: 'Move failed: some paths may have been updated; reopen the tags panel to check',
  renameConceptDone: 'Renamed concept "{names}"; hierarchy paths of {count} block(s) updated',
  renameLevelDone: 'Renamed hierarchy level: paths of {count} block(s) updated',
  renameFailedPartial:
    'Logseq refused to rename the concept page(s) "{names}"; references were rewritten to the new name. The old page(s) remain and can be deleted manually',
  renameFailed: 'Rename failed: some references may have been updated; reopen the tags panel to check',
  mergedInto: 'Merged {count} location(s) into "{name}"',
  mergeFailed: 'Merge failed: some references may have been updated; reopen the tags panel to check',
  removedFromHierarchyDone:
    'Removed "{path}" from the hierarchy: {updated} block(s) updated, {removed} empty block(s) removed (tag page kept)',
  removeFailed: 'Remove failed: some paths may have been updated; reopen the tags panel to check',

  // Plan validation errors (utils.ts plan functions, shown via confirm card / toast)
  errInvalidDropTarget: 'Invalid drop target',
  errDragIntoDescendant: 'Cannot drop a tag into itself or one of its descendants',
  errTargetExists: 'A tag with the same name already exists at the target: {names}',
  errInvalidTag: 'Invalid tag',
  errEmptyName: 'Tag name cannot be empty',
  errNameContainsSlash: 'A single-level tag name cannot contain /',
  errNameSpecialChars: 'Tag name cannot contain special characters such as #, [, ]',
  errSameName: 'The new name is the same as the current name',
  errSiblingExists: 'A sibling tag "{name}" already exists (tag merging will be supported in a later version)',
  errRenameConflict: 'The target name conflicts with existing tags: {names} (tag merging will be supported in a later version)',
  errNoMergeTargets: 'No tags selected to merge',
  errMergeIntoItself: 'Cannot merge a tag into itself',
  errMergeCycle: 'Cannot merge the parent tag "{target}" into its child "{source}" — that would create a cycle',
  errMergeDuplicate: '"{target}" is already covered by the merge range of "{source}" — no need to select both',

  // Tag tree
  treeSectionLabel: 'Tag tree (click to include · right-click to exclude)',
  noMatchingTags: 'No matching tags found',
  noTagsHint: 'No tags yet: write #concept directly, or type a/b/#concept and a hierarchy is created automatically',

  // Entry action tooltips
  filterConceptRowTip: 'Click: include this concept (matches any level)\nRight-click: exclude',
  filterPathRowTip: 'Click: include this path subtree\nRight-click: exclude',
  openConceptPage: 'Open the #{name} concept page',
  renameLevelPath: 'Rename hierarchy path',
  mergeOthersInto: 'Merge other concepts into this one',
  removePositionTip: 'Remove this position from the hierarchy (concept page kept)',
  deleteLevelPath: 'Delete this hierarchy path (blocks return to the root; no notes deleted)',
  virtualPathTip: 'Virtual hierarchy path (no page)',
  virtualPathToggleTip: 'Virtual hierarchy path (no page); click to expand/collapse',
  searchTextTip: 'Click to search this text',

  // Filter bar
  combinationTooltip: 'Click to toggle the combination (applies to the include group only)',
  and: 'AND',
  or: 'OR',
  includeConceptChip: 'Include concept: matches #{name} at any hierarchy level (click to switch to exclude)',
  includePathChip: 'Include path: matches the {label} subtree (click to switch to exclude)',
  excludeChip: 'Exclude: {label} (click to switch back to include)',
  filterHint: 'Click a tag to add it to the filter · right-click to exclude',
  resultCount: '{count} results',

  // Filter results
  matchedResults: 'Matches {count}',
  collapseResults: 'Collapse results',
  expandResults: 'Expand results',
  copyResultsTooltip: 'Copy the matches as a Markdown list (block references + page links) that can be pasted directly into a Logseq page',
  noFilterResults: 'No matching blocks or pages — try adjusting the filter',
  openThisPage: 'Open this page',
  tagsPageBadge: 'tags:: page',
  locateBlock: 'Locate this block',
  openPage: 'Open page: {name}',
};

const dictionaries: Record<Lang, Record<string, string>> = { zh, en };

export function t(key: string, params?: Record<string, string | number>): string {
  let text = dictionaries[currentLang][key] ?? dictionaries.zh[key] ?? key;
  if (params) {
    text = text.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  }
  return text;
}
