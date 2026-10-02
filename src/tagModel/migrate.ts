/**
 * 旧版层级标签迁移（#a/b/c -> a/b/#c 行内写法）。
 *
 * 流程：
 * 1. 查出所有引用了「名字含 / 的标签页」的块，用 migrateLegacyContent 改写正文
 * 2. 清理早期版本（path:: 属性方案）遗留的 path:: 属性行
 * 3. 旧页面是否删除由调用方决定（deleteEmptyLegacyPages 只会删除
 *    经校验没有任何正文/子块的空页面，有笔记内容的页面保留并返回给用户人工处理）
 */
import { migrateLegacyContent, stripPathPropertyLines } from './paths';

type PulledBlock = {
  uuid?: { $uuid$?: string } | string;
  content?: string;
};

export type MigrationResult = {
  scanned: number;
  updatedBlocks: number;
  oldNames: string[];
};

export async function migrateLegacyTags(): Promise<MigrationResult> {
  const rows = (await logseq.DB.datascriptQuery(`
    [:find (pull ?b [:block/uuid :block/content])
     :where
     [?b :block/refs ?page-ref]
     [?page-ref :block/name ?tag]
     [(clojure.string/includes? ?tag "/")]]
  `)) as Array<[PulledBlock]> | null;

  const seen = new Set<string>();
  const blocks: PulledBlock[] = [];
  for (const row of rows ?? []) {
    const b = row?.[0];
    const uuid =
      typeof b?.uuid === 'string' ? b.uuid : b?.uuid && b.uuid.$uuid$;
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    blocks.push(b);
  }

  let updatedBlocks = 0;
  const oldNames = new Set<string>();

  for (const block of blocks) {
    if (typeof block.content !== 'string') continue;
    const result = migrateLegacyContent(block.content);
    if (!result.content || result.content === block.content) continue;

    const uuid =
      typeof block.uuid === 'string' ? block.uuid : block.uuid?.$uuid$;
    if (!uuid) continue;
    try {
      await logseq.Editor.updateBlock(uuid, result.content);
      updatedBlocks += 1;
      result.oldNames.forEach((n) => oldNames.add(n));
    } catch (error) {
      console.warn('[tags] migrate: failed to update block', uuid, error);
    }
  }

  // 清理早期版本（path:: 属性方案）遗留的属性行
  try {
    const propRows = (await logseq.DB.datascriptQuery(`
      [:find (pull ?b [:block/uuid :block/content])
       :where
       [?b :block/path _]]
    `)) as Array<[PulledBlock]> | null;
    const seenProps = new Set<string>();
    for (const row of propRows ?? []) {
      const b = row?.[0];
      const uuid =
        typeof b?.uuid === 'string' ? b.uuid : b?.uuid && b.uuid.$uuid$;
      if (!uuid || seenProps.has(uuid)) continue;
      seenProps.add(uuid);
      if (typeof b.content !== 'string') continue;
      const cleaned = stripPathPropertyLines(b.content);
      if (cleaned === b.content) continue;
      try {
        await logseq.Editor.updateBlock(uuid, cleaned);
        updatedBlocks += 1;
      } catch (error) {
        console.warn('[tags] migrate: failed to strip path:: in block', uuid, error);
      }
    }
  } catch (error) {
    console.warn('[tags] migrate: path:: cleanup query failed', error);
  }

  // 等待 DB 事务提交，旧页面反链刷新
  await new Promise((resolve) => setTimeout(resolve, 300));

  return { scanned: blocks.length, updatedBlocks, oldNames: [...oldNames].sort() };
}

type TreeBlock = {
  content?: string;
  children?: TreeBlock[];
};

function blockHasUserContent(block: TreeBlock): boolean {
  const text = (block.content ?? '')
    .replace(/^[ \t]*[A-Za-z_][\w.-]*::.*$/gm, '') // 去掉属性行
    .replace(/\s+/g, '')
    .trim();
  if (text.length > 0) return true;
  return (block.children ?? []).some(blockHasUserContent);
}

export type CleanupResult = {
  deleted: string[];
  kept: string[];
};

/**
 * 删除某概念页面名下的「带 / 的遗留空页面」（如旧写法 #d/c 残留的 d/c 页面）。
 * Logseq 原生 renamePage 处理带 / 子页面时可能抛内部异常（join with empty dir），
 * 重命名前清理这些空页面可提高成功率；非空页面一律保留，交由用户处理。
 */
export async function cleanupEmptyLegacyChildren(parentName: string): Promise<string[]> {
  if (!parentName || parentName.includes('"')) return [];
  try {
    const rows = (await logseq.DB.datascriptQuery(
      `
      [:find ?name
       :where [?p :block/name ?name]
              [(clojure.string/starts-with? ?name "${parentName}/")]]
      `,
    )) as Array<[string]> | null;
    const names = [
      ...new Set((rows ?? []).map((r) => r?.[0]).filter((n): n is string => Boolean(n))),
    ];
    if (names.length === 0) return [];
    const { deleted } = await deleteEmptyLegacyPages(names);
    if (deleted.length > 0) {
      console.info('[tags] cleanup legacy child pages before rename', parentName, deleted);
    }
    return deleted;
  } catch (error) {
    console.warn('[tags] cleanup legacy children failed for', parentName, error);
    return [];
  }
}

/**
 * 删除迁移后已经没有任何正文/子块的旧标签页面。
 * 页面里只要存在非属性文本或子块，就保留并放入 kept，由用户人工确认。
 */
export async function deleteEmptyLegacyPages(names: string[]): Promise<CleanupResult> {
  const deleted: string[] = [];
  const kept: string[] = [];

  for (const name of names) {
    try {
      const tree = (await logseq.Editor.getPageBlocksTree(name)) as TreeBlock[] | null;
      const empty = !tree || tree.length === 0 || !tree.some(blockHasUserContent);
      if (!empty) {
        kept.push(name);
        continue;
      }
      await logseq.Editor.deletePage(name);
      deleted.push(name);
    } catch (error) {
      console.warn(`[tags] migrate: cleanup failed for ${name}`, error);
      kept.push(name);
    }
  }

  return { deleted, kept };
}
