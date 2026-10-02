import { TagUsageEntity } from '../types';
import { ConceptLocation, entityUuid } from '../utils';

/**
 * 标签筛选模型（对齐 PictureTag 的 且/或/除 筛选交互）：
 * - 包含组（includes）：概念选择 = 匹配任意层级路径下的该概念（#c、a/b/#c、D/#c 都算）；
 *   虚拟路径选择 = 匹配该路径子树（a/b 命中 a/b/#x、a/b/c/#y）
 * - 组合方式（combination）：且 / 或，仅作用于包含组
 * - 排除组（excludes）：命中即剔除，恒为 AND-NOT；仅排除组时 = 对全库做「除」
 *
 * 一个块/页的标签集合 = 它全部 (path, concept) 出现位置，
 * 因此同一行内的多个标签（a/b/#c D/#c F/#c）天然支持组合筛选。
 */

export type FilterSelectionKind = 'concept' | 'path';

export type FilterSelection = {
  kind: FilterSelectionKind;
  /** 小写匹配值：concept = 概念页名；path = 虚拟路径 */
  value: string;
  /** 展示用完整路径（保留原大小写） */
  label: string;
};

export type FilterCombination = 'and' | 'or';

export type TagFilterState = {
  includes: FilterSelection[];
  excludes: FilterSelection[];
  combination: FilterCombination;
};

export const EMPTY_FILTER_STATE: TagFilterState = {
  includes: [],
  excludes: [],
  combination: 'and',
};

/** 选择项唯一 id：同一概念在多个位置出现时共享同一个 id（概念级勾选/去重） */
export function selectionId(sel: FilterSelection): string {
  return `${sel.kind}\u0000${sel.value}`;
}

/** 由树节点构造选择：概念节点 → 概念匹配（任意路径）；虚拟节点 → 子树匹配 */
export function selectionFromNode(fullPath: string, conceptName: string | null): FilterSelection {
  if (conceptName !== null) {
    return { kind: 'concept', value: conceptName.toLowerCase(), label: fullPath };
  }
  return { kind: 'path', value: fullPath.toLowerCase(), label: fullPath };
}

/** 单个实体（块或页）携带的标签集合（path/concept 均为小写） */
export type FilterEntityTags = Array<{ path: string; concept: string }>;

export type FilterIndexEntry = {
  entity: TagUsageEntity;
  tags: FilterEntityTags;
};

export function filterEntityKey(entity: TagUsageEntity): string {
  return entityUuid(entity) ?? `id:${String((entity as { id?: unknown }).id ?? '')}`;
}

/**
 * 从「位置」用法数据构建筛选反向索引：
 * key = 实体唯一键，value = 实体 + 该实体携带的全部 (path, concept) 标签。
 * 同一行多个标签（a/b/#c D/#c）会全部收入同一实体的集合。
 */
export function buildFilterIndex(locations: ConceptLocation[]): Map<string, FilterIndexEntry> {
  const index = new Map<string, FilterIndexEntry>();
  for (const { path, concept, usages } of locations) {
    for (const entity of usages) {
      const key = filterEntityKey(entity);
      let entry = index.get(key);
      if (!entry) {
        entry = { entity, tags: [] };
        index.set(key, entry);
      }
      entry.tags.push({ path: path.toLowerCase(), concept: concept.toLowerCase() });
    }
  }
  return index;
}

function selectionHits(sel: FilterSelection, tags: FilterEntityTags): boolean {
  if (sel.kind === 'concept') {
    return tags.some((t) => t.concept === sel.value);
  }
  const prefix = `${sel.value}/`;
  return tags.some((t) => t.path === sel.value || t.path.startsWith(prefix));
}

export function isFilterActive(state: TagFilterState): boolean {
  return state.includes.length > 0 || state.excludes.length > 0;
}

/** 纯函数求值：包含组按且/或组合，排除组恒为 AND-NOT */
export function evaluateFilter(tags: FilterEntityTags, state: TagFilterState): boolean {
  if (!isFilterActive(state)) return false;
  let pass = true;
  if (state.includes.length > 0) {
    pass =
      state.combination === 'and'
        ? state.includes.every((s) => selectionHits(s, tags))
        : state.includes.some((s) => selectionHits(s, tags));
  }
  if (pass && state.excludes.length > 0) {
    pass = !state.excludes.some((s) => selectionHits(s, tags));
  }
  return pass;
}
