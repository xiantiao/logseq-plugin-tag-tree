import { QueryResultBlockEntity, QueryResultPageEntity } from 'logseqQueryResultTypes';
import { TagTreeNode, TagUsageEntity } from './types';
import { t } from './i18n';

// https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
export function escapeRegExp(s: string) {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function isPage(blockOrPage: any): blockOrPage is QueryResultPageEntity {
  return blockOrPage.hasOwnProperty('tags');
}

/**
 * 从查询结果实体中提取 uuid 字符串。
 * datascriptQuery 的 :block/uuid 可能是纯字符串、{$uuid$: string} 或 {uuid: string}，
 * 不同 Logseq 版本形态不一，统一在这里兼容。
 */
export function entityUuid(entity: unknown): string | null {
  if (!entity || typeof entity !== 'object') return null;
  const raw = (entity as { uuid?: unknown }).uuid;
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object') {
    const u = raw as { $uuid$?: unknown; uuid?: unknown };
    if (typeof u.$uuid$ === 'string' && u.$uuid$) return u.$uuid$;
    if (typeof u.uuid === 'string' && u.uuid) return u.uuid;
  }
  return null;
}

export function orderBy<T>(retriever: (v: T) => number, desc?: boolean): (a: T, b: T) => number {
  return desc
    ? (rhs, lhs) => retriever(lhs) - retriever(rhs)
    : (lhs, rhs) => retriever(lhs) - retriever(rhs);
}

// 根据字符串生成固定的色相值
export function generateHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash % 360;
}

// 获取标签的颜色主题
export function getTagColorTheme(tagName: string) {
  const hue = generateHue(tagName);
  const saturation = '34%';
  
  return {
    light: `hsl(${hue}, ${saturation}, 90%)`,    // 最浅色 - 用于展开按钮背景
    medium: `hsl(${hue}, ${saturation}, 80%)`,   // 浅色 - 用于边框
    regular: `hsl(${hue}, ${saturation}, 60%)`,  // 常规色 - 用于数字统计背景
    dark: `hsl(${hue}, ${saturation}, 40%)`,     // 深色 - 用于文字和图标
  };
};

// ---------- 层级标签树构建（v2：虚拟路径 + 末段概念页） ----------

/** 一个「位置」上的概念用法：path 为父层级（'' = 根级），concept 为末段概念页名 */
export type ConceptLocation = {
  path: string;
  concept: string;
  usages: Array<TagUsageEntity>;
};

function emptyNode(name: string, fullPath: string): TagTreeNode {
  return {
    name,
    fullPath,
    conceptName: null,
    selfUsages: [],
    children: new Map<string, TagTreeNode>(),
    totalCount: 0,
  };
}

/**
 * 依据「路径属性 + 概念标签」位置数据构建树。
 * 中间路径段是虚拟节点（无页面）；末段概念节点才是真实标签页。
 * 同一节点可以既是虚拟路径又是概念（同时存在 #b 与 path:: b 下的 #x），
 * 此时 conceptName 非空且带有 children。
 */
export function buildConceptTree(locations: ConceptLocation[]): TagTreeNode {
  const root = emptyNode('', '');

  const normalize = (name: string) =>
    name
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  for (const location of locations) {
    const dirParts = normalize(location.path);
    const concept = location.concept.trim();
    if (!concept) continue;

    let node = root;
    const pathSoFar: string[] = [];

    for (const part of dirParts) {
      pathSoFar.push(part);
      const fullPath = pathSoFar.join('/');
      let child = node.children.get(part);
      if (!child) {
        child = emptyNode(part, fullPath);
        node.children.set(part, child);
      }
      node = child;
    }

    let conceptNode = node.children.get(concept);
    if (!conceptNode) {
      conceptNode = emptyNode(concept, [...pathSoFar, concept].join('/'));
      node.children.set(concept, conceptNode);
    }
    conceptNode.conceptName = concept;
    conceptNode.selfUsages = location.usages;
  }

  // 自底向上统计 totalCount
  const dfs = (node: TagTreeNode): number => {
    let sum = node.selfUsages.length;
    node.children.forEach((child) => {
      sum += dfs(child);
    });
    node.totalCount = sum;
    return sum;
  };
  dfs(root);
  return root;
}

// ---------- 标签树：排序与拖拽移动（对齐 PictureTag 的 top/bottom/nested 模型） ----------

/** 拖放位置：top/bottom = 同级插入，nested = 成为子标签 */
export type DropPosition = 'top' | 'bottom' | 'nested';

/** 根级父路径标识 */
export const ROOT_PARENT = '';

/** 自定义排序结构：key 为父标签完整路径（根级为 ''），value 为按序排列的子段名 */
export type TagOrderMap = Record<string, string[]>;

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function lastSegment(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function joinPath(parent: string, segment: string): string {
  return parent ? `${parent}/${segment}` : segment;
}

/** maybeDescendant 是否为 ancestor 自身或其后代 */
export function isDescendantPath(maybeDescendant: string, ancestor: string): boolean {
  return maybeDescendant === ancestor || maybeDescendant.startsWith(`${ancestor}/`);
}

/** 为树建立 fullPath -> node 的索引（不含合成根节点） */
export function indexTree(root: TagTreeNode): Map<string, TagTreeNode> {
  const map = new Map<string, TagTreeNode>();
  const walk = (node: TagTreeNode) => {
    node.children.forEach((child) => {
      map.set(child.fullPath, child);
      walk(child);
    });
  };
  walk(root);
  return map;
}

/**
 * 按自定义顺序返回子节点：
 * 先取 order 中仍存在的段名，缺失的新标签按 fallback 比较器追加
 */
export function orderedChildNodes(
  node: TagTreeNode,
  order: string[] | undefined,
  fallback: (a: TagTreeNode, b: TagTreeNode) => number,
): TagTreeNode[] {
  if (!order || order.length === 0) {
    return Array.from(node.children.values()).sort(fallback);
  }
  const result: TagTreeNode[] = [];
  const seen = new Set<string>();
  for (const seg of order) {
    const child = node.children.get(seg);
    if (child && !seen.has(seg)) {
      result.push(child);
      seen.add(seg);
    }
  }
  Array.from(node.children.values())
    .filter((child) => !seen.has(child.name))
    .sort(fallback)
    .forEach((child) => result.push(child));
  return result;
}

/** 搜索时收集匹配节点及其祖先链的 fullPath 集合 */
export function collectVisiblePaths(root: TagTreeNode, query: string): Set<string> {
  const q = query.trim().toLowerCase();
  const visible = new Set<string>();
  if (!q) return visible;
  const walk = (node: TagTreeNode): boolean => {
    let childHit = false;
    node.children.forEach((child) => {
      if (walk(child)) childHit = true;
    });
    const hit = node.fullPath.toLowerCase().includes(q);
    if (hit || childHit) visible.add(node.fullPath);
    return hit || childHit;
  };
  root.children.forEach((child) => walk(child));
  return visible;
}

export type RenamePair = { oldPath: string; newPath: string };

export type MovePlan = {
  dragPath: string;
  targetPath: string;
  position: DropPosition;
  /** 拖动后被拖节点的新完整路径 */
  newDragPath: string;
  /** 需要重命名的真实标签页面（虚拟中间节点不在此列） */
  renames: RenamePair[];
};

/**
 * 依据当前标签页面集合计算移动方案（纯函数，不执行写操作）。
 * realTagPaths = 当前真实存在的标签页面名集合（useTags 的 keys）。
 * 拦截：自身/后代回环、目标位置同名冲突（合并功能后续支持）。
 */
export function planTagMove(args: {
  realTagPaths: Set<string>;
  dragPath: string;
  targetPath: string;
  position: DropPosition;
}): { plan?: MovePlan; error?: string; conflicts?: string[]; newDragPath?: string } {
  const { realTagPaths, dragPath, targetPath, position } = args;
  if (!dragPath || !targetPath || dragPath === targetPath) {
    return { error: t('errInvalidDropTarget') };
  }
  if (isDescendantPath(targetPath, dragPath)) {
    return { error: t('errDragIntoDescendant') };
  }

  const newParent = position === 'nested' ? targetPath : parentPath(targetPath);
  const newDragPath = joinPath(newParent, lastSegment(dragPath));

  const renames: RenamePair[] = [];
  const conflicts: string[] = [];
  realTagPaths.forEach((oldPath) => {
    if (oldPath !== dragPath && !oldPath.startsWith(`${dragPath}/`)) return;
    const suffix = oldPath === dragPath ? '' : oldPath.slice(dragPath.length); // 含前导 '/'
    const newPath = newDragPath + suffix;
    if (newPath === oldPath) return;
    if (realTagPaths.has(newPath)) {
      conflicts.push(newPath);
      return;
    }
    renames.push({ oldPath, newPath });
  });

  if (conflicts.length > 0) {
    // 冲突时返回结构化数据，由调用方转入合并确认流程（用户确认后合并，取消保持不变）
    return {
      error: t('errTargetExists', { names: conflicts.slice(0, 3).join(t('listSeparator')) }),
      conflicts,
      newDragPath,
    };
  }
  return { plan: { dragPath, targetPath, position, newDragPath, renames } };
}

/** 取父级的实际子段名列表（根级取合成根） */
function actualChildSegments(
  treeRoot: TagTreeNode,
  index: Map<string, TagTreeNode>,
  parent: string,
): string[] {
  const node = parent === ROOT_PARENT ? treeRoot : index.get(parent);
  return node ? Array.from(node.children.keys()) : [];
}

/**
 * 计算移动后的排序表（纯函数）。
 * 模板：先从源父级取出被拖段，再按 top/bottom/nested 插入目标列表，避免索引漂移。
 */
export function computeOrderAfterMove(
  prev: TagOrderMap,
  treeRoot: TagTreeNode,
  index: Map<string, TagTreeNode>,
  dragPath: string,
  targetPath: string,
  position: DropPosition,
): TagOrderMap {
  const next: TagOrderMap = { ...prev };

  // 合并实际子节点：保留有效自定义顺序，新段名追加，返回可供原地修改的数组
  const ensureList = (parent: string): string[] => {
    const actual = actualChildSegments(treeRoot, index, parent);
    const existing = next[parent] ?? [];
    const valid = existing.filter((seg) => actual.includes(seg));
    const seen = new Set(valid);
    const list = [...valid, ...actual.filter((seg) => !seen.has(seg))];
    next[parent] = list;
    return list;
  };

  const dragParent = parentPath(dragPath);
  const dragSeg = lastSegment(dragPath);
  const targetListParent =
    position === 'nested' ? targetPath : parentPath(targetPath);

  // 1) 先基于旧树物化源/目标两个列表（同父级时二者同一引用）
  const sourceList = ensureList(dragParent);
  const targetList =
    targetListParent === dragParent ? sourceList : ensureList(targetListParent);

  // 2) 从源列表取出被拖段（同父级时目标列表同步变短，索引随后重算）
  const sourceIndex = sourceList.indexOf(dragSeg);
  if (sourceIndex >= 0) sourceList.splice(sourceIndex, 1);

  // 3) 插回目标列表
  if (position === 'nested') {
    // 对齐 PictureTag：成为目标标签的第一个子标签
    if (!targetList.includes(dragSeg)) targetList.unshift(dragSeg);
  } else {
    const targetSeg = lastSegment(targetPath);
    let targetIndex = targetList.indexOf(targetSeg);
    if (targetIndex === -1) {
      targetList.push(dragSeg);
    } else {
      if (position === 'bottom') targetIndex += 1;
      targetList.splice(targetIndex, 0, dragSeg);
    }
  }
  return next;
}

/**
 * 重命名子树后同步迁移排序表的 key（子级顺序列表整体平移，段名不变）。
 */
export function remapOrderKeys(
  prev: TagOrderMap,
  oldPrefix: string,
  newPrefix: string,
): TagOrderMap {
  if (oldPrefix === newPrefix) return prev;
  const next: TagOrderMap = {};
  Object.entries(prev).forEach(([key, list]) => {
    let newKey = key;
    if (key === oldPrefix) newKey = newPrefix;
    else if (key.startsWith(`${oldPrefix}/`)) newKey = newPrefix + key.slice(oldPrefix.length);
    if (next[newKey]) {
      const merged = [...next[newKey]];
      list.forEach((seg) => {
        if (!merged.includes(seg)) merged.push(seg);
      });
      next[newKey] = merged;
    } else {
      next[newKey] = list;
    }
  });
  return next;
}

export type RenamePlan = {
  oldPath: string;
  newPath: string;
  /** 需要重命名的真实标签页面（含整棵子树；虚拟中间节点不在此列） */
  renames: RenamePair[];
};

/**
 * 计算"编辑某层标签名称"的重命名方案（纯函数，不执行写操作）。
 * 保持父路径不变，仅替换末段名；oldPath 及其全部真实后代页面整体改名。
 * existingPaths = 树中所有节点 fullPath（含虚拟中间节点），用于同名冲突拦截。
 * Logseq 的页面身份不区分大小写，路径一律按小写比较。
 */
export function planTagRename(args: {
  existingPaths: Set<string>;
  realTagPaths: Set<string>;
  oldPath: string;
  newSegment: string;
}): { plan?: RenamePlan; error?: string } {
  const { existingPaths, realTagPaths, oldPath, newSegment } = args;
  if (!oldPath) return { error: t('errInvalidTag') };

  const segment = newSegment.trim().toLowerCase();
  if (!segment) return { error: t('errEmptyName') };
  if (segment.includes('/')) return { error: t('errNameContainsSlash') };
  if (/[#[\]{}()]/.test(segment)) return { error: t('errNameSpecialChars') };

  const newPath = joinPath(parentPath(oldPath), segment);
  if (newPath === oldPath.toLowerCase()) return { error: t('errSameName') };
  if (existingPaths.has(newPath)) {
    return { error: t('errSiblingExists', { name: lastSegment(newPath) }) };
  }

  const renames: RenamePair[] = [];
  const conflicts: string[] = [];
  realTagPaths.forEach((oldReal) => {
    if (oldReal !== oldPath && !oldReal.startsWith(`${oldPath}/`)) return;
    const suffix = oldReal === oldPath ? '' : oldReal.slice(oldPath.length); // 含前导 '/'
    const newReal = newPath + suffix;
    if (newReal === oldReal) return;
    if (realTagPaths.has(newReal)) {
      conflicts.push(newReal);
      return;
    }
    renames.push({ oldPath: oldReal, newPath: newReal });
  });

  if (conflicts.length > 0) {
    return {
      error: t('errRenameConflict', { names: conflicts.slice(0, 3).join(t('listSeparator')) }),
    };
  }
  return { plan: { oldPath, newPath, renames } };
}

/**
 * 重命名子树后迁移排序表：
 * 1) key 前缀整体平移（复用 remapOrderKeys）；
 * 2) 父级子段列表中的旧段名替换为新段名。
 */
export function remapOrderForRename(
  prev: TagOrderMap,
  oldPath: string,
  newPath: string,
): TagOrderMap {
  const remapped = remapOrderKeys(prev, oldPath, newPath);
  const parent = parentPath(oldPath);
  const list = remapped[parent];
  if (!list) return remapped;
  const oldSeg = lastSegment(oldPath);
  const newSeg = lastSegment(newPath);
  remapped[parent] = list.map((seg) => (seg === oldSeg ? newSeg : seg));
  return remapped;
}

// ---------- 标签合并（对齐 PictureTag：目标并入源，子树整体迁移，同名 union） ----------

export type MergePlan = {
  sourcePath: string;
  targetPaths: string[];
  /** 全部引用重写对（含"收敛"——新位置已有同名标签时只改引用不改名） */
  rewritePairs: RenamePair[];
  /** 新位置原本不存在、需要 renamePage 的对 */
  renamePairs: RenamePair[];
  /** 收敛对：新位置已有同名标签，旧页面迁移自身内容后需要删除 */
  convergePairs: RenamePair[];
};

/**
 * 计算"把多个目标标签并入源标签"的方案（纯函数，不执行写操作）。
 *
 * 规则（对齐 TagData+Merge.swift）：
 * 1. 目标不能是源自身，也不能是源的祖先（避免循环）；多个目标之间不能有祖属关系（UI 也会禁用）。
 * 2. 目标子树内每个真实标签 P 映射到 source + P 去掉 target 前缀：
 *    - 新位置不存在 → renamePage 迁移；
 *    - 新位置已存在同名标签 → 引用收敛（union），旧页面迁移自身内容后删除。
 * 3. 目标自身映射到源：#target → #source。
 */
export function planTagMerge(args: {
  realTagPaths: Set<string>;
  sourcePath: string;
  targetPaths: string[];
}): { plan?: MergePlan; error?: string } {
  const { realTagPaths, sourcePath, targetPaths } = args;
  if (!sourcePath || targetPaths.length === 0) return { error: t('errNoMergeTargets') };

  // 去重 + 前置校验（原子性：任一不通过则整体不执行）
  const targets = Array.from(new Set(targetPaths));
  for (const target of targets) {
    if (target === sourcePath) return { error: t('errMergeIntoItself') };
    if (isDescendantPath(sourcePath, target)) {
      return {
        error: t('errMergeCycle', { target, source: sourcePath }),
      };
    }
  }
  // 目标之间互不祖属
  const sorted = [...targets].sort((a, b) => a.length - b.length);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (isDescendantPath(sorted[j], sorted[i])) {
        return {
          error: t('errMergeDuplicate', { target: sorted[j], source: sorted[i] }),
        };
      }
    }
  }

  // 已占用的新位置：随合并推进动态增长，使后续目标撞到刚迁移的页面时也走收敛
  const occupied = new Set(realTagPaths);
  const rewritePairs: RenamePair[] = [];
  const renamePairs: RenamePair[] = [];
  const convergePairs: RenamePair[] = [];

  for (const target of targets) {
    const subtree = Array.from(realTagPaths)
      .filter((p) => p === target || p.startsWith(`${target}/`))
      .sort((a, b) => b.length - a.length); // 深层优先
    for (const oldPath of subtree) {
      const newPath = sourcePath + oldPath.slice(target.length);
      if (newPath === oldPath) continue;
      rewritePairs.push({ oldPath, newPath });
      if (occupied.has(newPath)) {
        convergePairs.push({ oldPath, newPath });
      } else {
        renamePairs.push({ oldPath, newPath });
        occupied.add(newPath);
      }
    }
  }

  return { plan: { sourcePath, targetPaths: targets, rewritePairs, renamePairs, convergePairs } };
}

/**
 * 合并后迁移排序表：
 * 1) 从每个目标的原父级列表移除目标段名；
 * 2) 目标子树下所有排序列表的 key 整体平移到源下（同名取并集，源原有顺序在前）；
 * 3) 目标自身的子级列表并入源的子级列表（目标的直接子标签迁移到源下）。
 */
export function computeOrderAfterMerge(
  prev: TagOrderMap,
  sourcePath: string,
  targetPaths: string[],
): TagOrderMap {
  const next: TagOrderMap = { ...prev };
  const accumulated: Record<string, string[]> = {};

  const mergeListInto = (dest: string, list: string[]) => {
    const base = accumulated[dest] ?? next[dest] ?? [];
    const merged = [...base];
    list.forEach((seg) => {
      if (!merged.includes(seg)) merged.push(seg);
    });
    accumulated[dest] = merged;
  };

  for (const target of targetPaths) {
    // 1) 原父级列表移除目标段名
    const parent = parentPath(target);
    if (next[parent]) {
      next[parent] = next[parent].filter((seg) => seg !== lastSegment(target));
    }
    // 2) 收集目标自身及其子树下的所有列表，平移 key
    Object.keys(next).forEach((key) => {
      if (key !== target && !key.startsWith(`${target}/`)) return;
      const dest = sourcePath + key.slice(target.length);
      mergeListInto(dest, next[key]);
      delete next[key];
    });
  }

  Object.entries(accumulated).forEach(([dest, list]) => {
    next[dest] = list;
  });
  return next;
}

/** 合并后迁移展开状态：key 同 computeOrderAfterMerge 平移，同名取"展开"并集 */
export function migrateExpandedAfterMerge(
  prev: Record<string, boolean>,
  sourcePath: string,
  targetPaths: string[],
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...prev };
  const incoming: Record<string, boolean> = {};

  for (const target of targetPaths) {
    Object.keys(next).forEach((key) => {
      if (key !== target && !key.startsWith(`${target}/`)) return;
      const dest = sourcePath + key.slice(target.length);
      if (next[key]) incoming[dest] = true;
      delete next[key];
    });
  }
  Object.entries(incoming).forEach(([dest, open]) => {
    next[dest] = next[dest] || open;
  });
  return next;
}

// ---------- 标签删除（对齐 PictureTag：递归删除整棵子树） ----------

export type DeletePlan = {
  path: string;
  /** 子树内全部真实标签（含自身，深层在前） */
  subtreePaths: string[];
};

/** 计算删除方案：枚举自身及全部真实后代（纯函数） */
export function planTagDelete(args: {
  realTagPaths: Set<string>;
  path: string;
}): { plan?: DeletePlan; error?: string } {
  const { realTagPaths, path } = args;
  if (!path) return { error: t('errInvalidTag') };

  const subtreePaths = Array.from(realTagPaths)
    .filter((p) => p === path || p.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length); // 深层优先，配合引用剥离顺序
  if (subtreePaths.length === 0) {
    // 虚拟中间节点（无任何真实标签）：仅影响本地排序/展开状态
    return { plan: { path, subtreePaths: [] } };
  }
  return { plan: { path, subtreePaths } };
}

/** 删除后迁移排序表：父级列表移除该段名，子树下所有 key 一并清除 */
export function computeOrderAfterDelete(prev: TagOrderMap, path: string): TagOrderMap {
  const next: TagOrderMap = {};
  Object.entries(prev).forEach(([key, list]) => {
    if (key === path || key.startsWith(`${path}/`)) return; // 子树列表丢弃
    if (key === parentPath(path)) {
      next[key] = list.filter((seg) => seg !== lastSegment(path));
    } else {
      next[key] = list;
    }
  });
  return next;
}

/** 删除后迁移展开状态：子树下的 key 一并清除 */
export function migrateExpandedAfterDelete(
  prev: Record<string, boolean>,
  path: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  Object.entries(prev).forEach(([key, value]) => {
    if (key !== path && !key.startsWith(`${path}/`)) next[key] = value;
  });
  return next;
}
