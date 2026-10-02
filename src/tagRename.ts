import { escapeRegExp } from './utils';
import { RenamePair } from './utils';

/**
 * 将块内容中所有引用 oldPath 的行内标签更新为 newPath。
 * Logseq 页面名小写，但块内容中标签可能大写（#B），故正则大小写不敏感。
 * 处理三种语法（前缀替换，自动覆盖后代标签）：
 *   #[[oldPath]]     -> #[[newPath]]
 *   [[oldPath]]      -> [[newPath]]   （页面链接，renamePage 可能漏更）
 *   #oldPath         -> #newPath       （仅当后面是 / 或非标签字符时，避免误伤 #Apple）
 */
export function replaceInlineTagRefs(
  content: string,
  oldPath: string,
  newPath: string,
): string {
  if (oldPath === newPath) return content;
  const oldEsc = escapeRegExp(oldPath);

  // 1) 方括号标签形式 #[[oldPath...]]
  let result = content.replace(
    new RegExp(`#\\[\\[${oldEsc}`, 'gi'),
    `#[[${newPath}`,
  );
  // 2) 页面链接形式 [[oldPath...]]
  result = result.replace(
    new RegExp(`\\[\\[${oldEsc}`, 'gi'),
    `[[${newPath}`,
  );
  // 3) 井号标签形式 #oldPath：后接 /（后代）或非标签字符或结尾
  result = result.replace(
    new RegExp(`#${oldEsc}(?=[/]|[^a-zA-Z0-9_\\-/]|$)`, 'gi'),
    `#${newPath}`,
  );
  return result;
}

/**
 * 获取引用了指定标签的所有块（通过 :block/refs）。
 * 用 datascriptQuery 而非 getPageLinkedReferences，因为后者对没有 .md 文件的虚拟标签页返回空。
 * 返回 { uuid -> content }，用于在重命名前快照原始内容。
 */
export async function collectReferencingBlocks(
  pageNames: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (pageNames.length === 0) return map;

  try {
    // :in $ [?tag ...] 接收标签名集合（整个数组作为第二个参数，不要展开）
    const results = (await logseq.DB.datascriptQuery(
      `
      [:find ?content ?uuid
       :in $ [?tag ...]
       :where
       [?b :block/refs ?page-ref]
       [?page-ref :block/name ?tag]
       [?b :block/content ?content]
       [?b :block/uuid ?uuid]]
      `,
      pageNames,
    )) as Array<[string, string]>;

    for (const [content, uuid] of results) {
      if (uuid && typeof content === 'string') {
        map.set(uuid, content);
      }
    }
  } catch (error) {
    console.warn('Failed to collect referencing blocks:', error);
  }
  return map;
}

/**
 * 对一组重命名，批量更新所有受影响块的行内标签引用。
 *
 * 调用方必须在 renamePage 执行前传入 blockContents（重命名后旧页面可能查不到引用）。
 * blockContents 由 collectReferencingBlocks 生成。
 */
export function applyInlineTagRenames(
  renames: RenamePair[],
  blockContents: Map<string, string>,
): Promise<number> {
  return applyRenamesToBlocks(renames, blockContents);
}

/**
 * 对一组重命名，改写块**当前内容**中的行内引用。
 * 与 applyInlineTagRenames 不同：逐块重新 getBlock 后再替换，
 * 不会用旧快照覆盖块（Logseq 原生 renamePage 可能已改写过，此处幂等补漏）。
 * uuids 通常来自 renamePage 之前 collectReferencingBlocks 的快照键。
 */
export async function rewriteInlineTagRefs(
  renames: RenamePair[],
  uuids: string[],
): Promise<number> {
  if (renames.length === 0 || uuids.length === 0) return 0;
  const ordered = [...renames].sort((a, b) => b.oldPath.length - a.oldPath.length);
  let updated = 0;
  for (const uuid of uuids) {
    try {
      const block = await logseq.Editor.getBlock(uuid);
      const content = block?.content;
      if (typeof content !== 'string') continue;
      let next = content;
      for (const { oldPath, newPath } of ordered) {
        next = replaceInlineTagRefs(next, oldPath, newPath);
      }
      if (next !== content) {
        await logseq.Editor.updateBlock(uuid, next);
        updated += 1;
      }
    } catch (error) {
      console.warn(`Failed to rewrite refs in block ${uuid}:`, error);
    }
  }
  return updated;
}

async function applyRenamesToBlocks(
  renames: RenamePair[],
  blockContents: Map<string, string>,
): Promise<number> {
  if (renames.length === 0 || blockContents.size === 0) return 0;

  // 深层路径先替换：否则 #a 的规则会先命中 #a/child（其 lookahead 允许 '/'），
  // 在多目标合并等场景下可能造成错误的前缀拼接。
  const ordered = [...renames].sort((a, b) => b.oldPath.length - a.oldPath.length);

  // 按顺序对每个块应用所有重命名（父先于子，避免前缀误伤）
  let updated = 0;
  for (const [uuid, originalContent] of blockContents) {
    let content = originalContent;
    for (const { oldPath, newPath } of ordered) {
      content = replaceInlineTagRefs(content, oldPath, newPath);
    }
    if (content !== originalContent) {
      try {
        await logseq.Editor.updateBlock(uuid, content);
        updated += 1;
      } catch (error) {
        console.warn(`Failed to update block ${uuid}:`, error);
      }
    }
  }
  return updated;
}

/**
 * 从块内容中剥离指定标签的所有引用（删除标签用）。大小写不敏感。
 * 覆盖：#[[path]]、[[path]]（含 [[path|别名]]）、#path。
 * 调用方需保证深层路径先剥离（本函数不负责排序）。
 */
export function stripTagRefs(content: string, path: string): string {
  const esc = escapeRegExp(path);
  let result = content;
  // 1) #[[path]] / #[[path|别名]]，连同尾部一个空格一起吃掉
  result = result.replace(
    new RegExp(`#\\[\\[${esc}(?:\\|[^\\]]+)?\\]\\][ \\t]?`, 'gi'),
    '',
  );
  // 2) [[path]] / [[path|别名]]
  result = result.replace(
    new RegExp(`\\[\\[${esc}(?:\\|[^\\]]+)?\\]\\][ \\t]?`, 'gi'),
    '',
  );
  // 3) #path（后代标签已先行剥离，此处只命中自身），吃掉尾部一个空格/制表符
  result = result.replace(
    new RegExp(`#${esc}(?=[/]|[^a-zA-Z0-9_\\-/]|$)[ \\t]?`, 'gi'),
    '',
  );
  // 4) 处理 tags:: 属性行：其中标签是裸页面名（不带 #），按逗号分段精确匹配移除；
  //    清空后整行删除，仅剩部分值则重写。
  result = result.replace(/^([ \t]*tags::)([^\n]*)$/gm, (_line, prefix: string, value: string) => {
    const parts = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((tag) => tag.toLowerCase() !== path.toLowerCase());
    return parts.length === 0 ? '' : `${prefix} ${parts.join(', ')}`;
  });
  return result;
}

/**
 * 应用「已剥离标签引用」的块内容（uuid -> 剥离后内容）：
 * - 仍有正文：直接更新；
 * - 变为空块：无子块则删除，有子块则仅清空正文，避免误删整段笔记。
 * 返回更新/删除的块数。
 */
export async function deleteBlankBlocks(
  stripContents: Map<string, string>,
): Promise<{ updated: number; removed: number }> {
  let updated = 0;
  let removed = 0;

  for (const [uuid, content] of stripContents) {
    try {
      if (content.trim() !== '') {
        await logseq.Editor.updateBlock(uuid, content);
        updated += 1;
        continue;
      }

      // 用 SDK 查询块及子块（避免手写 datascript 时字符串 uuid 与 db UUID 类型不匹配）
      const blockInfo = await logseq.Editor.getBlock(uuid, { includeChildren: true });
      const childCount = blockInfo?.children?.length ?? 0;
      if (childCount > 0) {
        // 有子内容：只清空正文，保留子树
        await logseq.Editor.updateBlock(uuid, '');
        updated += 1;
      } else {
        // 无子块：物理删除；失败再降级为清空文本，保证标签引用绝不残留
        try {
          await logseq.Editor.removeBlock(uuid);
          removed += 1;
        } catch (removeError) {
          console.warn(`removeBlock failed for ${uuid}, fallback to clear:`, removeError);
          await logseq.Editor.updateBlock(uuid, '');
          updated += 1;
        }
      }
    } catch (error) {
      // getBlock 都失败时的最终兜底：先尝试删除，再不行就清空
      console.warn(`Failed to handle stripped block ${uuid}, fallback directly:`, error);
      try {
        await logseq.Editor.removeBlock(uuid);
        removed += 1;
      } catch {
        await logseq.Editor.updateBlock(uuid, content);
        updated += 1;
      }
    }
  }
  return { updated, removed };
}

/**
 * 删除一组标签路径：对快照块批量剥离引用，再交给 deleteBlankBlocks 处理空块。
 * paths 顺序无关（内部按深度降序）。返回更新/删除的块数。
 */
export async function applyTagDeletions(
  paths: string[],
  blockContents: Map<string, string>,
): Promise<{ updated: number; removed: number }> {
  if (paths.length === 0 || blockContents.size === 0) {
    return { updated: 0, removed: 0 };
  }
  const ordered = [...paths].sort((a, b) => b.length - a.length);

  const stripContents = new Map<string, string>();
  for (const [uuid, originalContent] of blockContents) {
    let content = originalContent;
    for (const path of ordered) content = stripTagRefs(content, path);
    if (content !== originalContent) stripContents.set(uuid, content);
  }
  return deleteBlankBlocks(stripContents);
}
