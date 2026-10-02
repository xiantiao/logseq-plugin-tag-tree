/**
 * 监听图谱变更：把旧版层级标签自动规范化为行内快捷写法：
 *   #a/b/c     -> a/b/#c
 *   #[[a/b/c]] -> a/b/#c
 *
 * 设计要点：
 * - 原文即存储（v3 行内模型），不做任何块属性改写；一行内多个不同路径的标签各自独立转换
 * - 只处理正则预检命中的块，其余变更零成本返回
 * - updateBlock 会再次触发 onChanged，但规范化后的内容不再含旧版写法，天然无环；
 *   recentUuids 作为短时间窗防抖兜底，避免事件乱序下重复改写
 */
import { remapInlineTags } from './paths';

const RECENT_WINDOW_MS = 3000;
const recentUuids = new Map<string, number>();

function isRecent(uuid: string): boolean {
  const now = Date.now();
  for (const [key, ts] of recentUuids) {
    if (now - ts > RECENT_WINDOW_MS) recentUuids.delete(key);
  }
  return recentUuids.has(uuid);
}

function markRecent(uuid: string) {
  recentUuids.set(uuid, Date.now());
}

type ChangedBlock = {
  uuid?: string | { $uuid$?: string };
  content?: string;
};

function uuidOf(block: ChangedBlock): string | null {
  if (typeof block.uuid === 'string') return block.uuid;
  if (block.uuid && typeof block.uuid.$uuid$ === 'string') return block.uuid.$uuid$;
  return null;
}

let installed = false;

export function installShorthandWatcher(): void {
  if (installed) return;
  installed = true;

  logseq.DB.onChanged?.(async (e: unknown) => {
    try {
      const settings = logseq.settings as Record<string, unknown> | null;
      if (settings?.autoCanonicalize === false) return;

      const blocks = (e as { blocks?: ChangedBlock[] } | null)?.blocks;
      if (!Array.isArray(blocks) || blocks.length === 0) return;

      for (const block of blocks) {
        try {
          const uuid = uuidOf(block);
          if (!uuid || isRecent(uuid)) continue;
          // 快速预检：只有 # 后跟了路径分隔符的内容才可能有旧版写法
          if (typeof block.content !== 'string' || !/#[^\s#]*\//.test(block.content)) continue;

          // 重新拉取最新内容，避免事件里的快照过期
          const fresh = await logseq.Editor.getBlock(uuid);
          const content = fresh?.content ?? block.content;
          if (typeof content !== 'string') continue;

          const result = remapInlineTags(content, (tag) => (tag.legacy ? tag.path : null));
          if (!result.changed) continue;

          markRecent(uuid);
          console.info('[tags] normalize legacy tag to inline shorthand', { uuid });
          await logseq.Editor.updateBlock(uuid, result.content);
        } catch (error) {
          console.warn('[tags] shorthand watcher failed for one block:', error);
        }
      }
    } catch (error) {
      console.warn('[tags] shorthand watcher error:', error);
    }
  });

  console.info('[tags] shorthand watcher installed (#a/b/c -> a/b/#c)');
}
