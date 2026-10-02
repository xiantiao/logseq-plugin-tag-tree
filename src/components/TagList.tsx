import React, { useMemo, useRef, useState } from 'react';
import { useTagTreeData } from '../hooks/useTagTreeData';
import { useTagOrder } from '../hooks/useTagOrder';
import { styled } from '../stitches.config';
import { TagTreeEntry } from './tagEntry/TagTreeEntry';
import { TagTreeContext, TagTreeContextValue } from './tagEntry/TagTreeContext';
import {
  buildConceptTree,
  collectVisiblePaths,
  computeOrderAfterDelete,
  computeOrderAfterMerge,
  computeOrderAfterMove,
  DeletePlan,
  DropPosition,
  entityUuid,
  indexTree,
  isDescendantPath,
  isPage,
  lastSegment,
  MergePlan,
  migrateExpandedAfterDelete,
  migrateExpandedAfterMerge,
  MovePlan,
  orderedChildNodes,
  parentPath,
  planTagDelete,
  planTagMerge,
  planTagMove,
  planTagRename,
  remapOrderForRename,
  remapOrderKeys,
  RenamePair,
  ROOT_PARENT,
} from '../utils';
import { QueryResultBlockEntity } from 'logseqQueryResultTypes';
import { TagTreeNode, TagUsageEntity } from '../types';
import { remapInlineTags, stripInlineConceptRefs } from '../tagModel/paths';
import { migrateLegacyTags, deleteEmptyLegacyPages } from '../tagModel/migrate';
import {
  buildFilterIndex,
  EMPTY_FILTER_STATE,
  evaluateFilter,
  isFilterActive,
  selectionFromNode,
  selectionId,
  TagFilterState,
} from '../tagModel/tagFilter';
import { FilterBar, FilterResults } from './tagFilter';
import { FilterMode, MergeMode } from './tagEntry/TagTreeContext';
import { t } from '../i18n';

// 横向拖拽超过该阈值（px）判定为 nested（对齐 PictureTag 的 30pt）
const HORIZONTAL_DRAG_THRESHOLD = 30;

const StyldTagList = styled('div', {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
});
const ContextMenu = styled('div', {
  position: 'absolute',
  backgroundColor: '$elevation0',
  border: '1px solid $slate6',
  borderRadius: '$2',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
  padding: '$2',
  zIndex: 9999,
  minWidth: '160px',
});
const MenuItem = styled('div', {
  padding: '$2 $3',
  cursor: 'pointer',
  borderRadius: '$1',
  '&:hover': { backgroundColor: '$elevation1' },
});

const ConfirmCard = styled('div', {
  position: 'sticky',
  top: 0,
  zIndex: 50,
  margin: '$2',
  padding: '$3',
  backgroundColor: '$elevation0',
  border: '1px solid $slate6',
  borderRadius: '$2',
  boxShadow: '0 10px 15px -3px rgba(0,0,0,0.15)',
  fontSize: '13px',
  // 卡片内文字统一继承此颜色：默认深灰（亮色），任一暗色上下文生效时切浅灰。
  // 不依赖 stitches 主题变量（$token / var(--slateXX) 在 inline style 中不生效）
  color: '#57606a',
  '.dark-theme &, :root.dark &, body.dark &': {
    color: '#adb6c2',
  },
});
const RenameList = styled('div', {
  margin: '$2 0',
  padding: '$2',
  backgroundColor: '$elevation1',
  borderRadius: '$1',
  fontFamily: 'monospace',
  fontSize: '11px',
  maxHeight: '120px',
  overflowY: 'auto',
});
const ConfirmButton = styled('button', {
  padding: '$1 $3',
  borderRadius: '$1',
  border: 'none',
  cursor: 'pointer',
  fontSize: '13px',
  variants: {
    tone: {
      primary: { backgroundColor: 'hsl(200, 85%, 45%)', color: '#fff' },
      ghost: {
        backgroundColor: 'transparent',
        color: '#57606a',
        '.dark-theme &, :root.dark &, body.dark &': {
          color: '#adb6c2',
        },
      },
      danger: { backgroundColor: 'hsl(0, 70%, 48%)', color: '#fff' },
    },
  },
});
const RenameInput = styled('input', {
  flex: 1,
  minWidth: 0,
  padding: '$1 $2',
  fontSize: '13px',
  borderRadius: '$1',
  border: '1px solid $slate6',
  backgroundColor: '$elevation1',
  color: '#24292f',
  outline: 'none',
  fontFamily: 'inherit',
  '&:focus': { borderColor: 'hsl(200, 85%, 50%)' },
  '.dark-theme &, :root.dark &, body.dark &': {
    color: '#e6edf3',
  },
});
const RenameError = styled('div', {
  marginTop: '$2',
  color: 'hsl(0, 75%, 50%)',
  fontSize: '12px',
});
const EmptyHint = styled('div', {
  padding: '$4',
  color: '#57606a',
  '.dark-theme &, :root.dark &, body.dark &': {
    color: '#8b949e',
  },
  fontSize: '13px',
  textAlign: 'center',
});

// 筛选模式下结果区与标签树之间的分隔标签
const TreeSectionLabel = styled('div', {
  padding: '6px 8px 2px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.5px',
  color: '$slate9',
  userSelect: 'none',
});

type Props = {
  filter: string;
  sortAscending: boolean;
  enableDragSort?: boolean;
  refresh?: number;
  applyExpand?: { version: number; expand: boolean };
  // 外部手动刷新信号：数值变化时重新查询（App 工具栏刷新按钮）
  refreshSignal?: number;
  // 标签筛选模式：整棵树切换为挑选器，支持 且/或/除 组合筛选
  tagFilter?: boolean;
};

// 针对单个块的行内改写表：复合键（旧层级\0概念，均小写）-> 新层级（'' 表示回到根级）。
// 键必须含概念：同一行《a/b/#c x/#f》中只改写 c 的出现，不误伤前缀相同的其他标签
type BlockPathEdits = Map<string, Map<string, string>>;

function blockUuid(entity: TagUsageEntity): string | null {
  if (isPage(entity)) return null;
  return entityUuid(entity);
}

function addRemap(
  edits: BlockPathEdits,
  uuid: string,
  oldDir: string,
  concept: string,
  newDir: string,
) {
  if (oldDir.toLowerCase() === newDir.toLowerCase()) return;
  let map = edits.get(uuid);
  if (!map) {
    map = new Map();
    edits.set(uuid, map);
  }
  // 同一块多次映射时以第一次为准（同一次操作内不会冲突）
  const key = `${oldDir.toLowerCase()}\u0000${concept.toLowerCase()}`;
  if (!map.has(key)) map.set(key, newDir);
}

export function TagList({ filter, sortAscending, enableDragSort = true, refresh = 0, applyExpand, refreshSignal = 0, tagFilter = false }: Props) {
  // rename/迁移后通过 refreshKey 重新查询
  const [refreshKey, setRefreshKey] = useState(0);
  const locations = useTagTreeData(refreshKey);
  const { orderMap, saveOrder } = useTagOrder();

  const [version, setVersion] = useState(0);
  const [menu, setMenu] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  // ---------- 拖拽（基于 mousedown/mousemove/mouseup，不依赖 HTML5 DnD） ----------

  // 拖拽起始阈值（px），小于此距离视为点击
  const DRAG_START_THRESHOLD = 5;
  const dragPathRef = useRef<string | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const draggingRef = useRef(false); // 是否已越过起始阈值，进入真正拖拽态
  const [activeDragPath, setActiveDragPath] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ path: string; position: DropPosition } | null>(
    null,
  );
  const [pending, setPending] = useState<MovePlan | null>(null);
  const [busy, setBusy] = useState(false);

  // ---------- 自动刷新 / 手动刷新 ----------
  const busyRef = useRef(false);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // 自动刷新：监听图谱变更（含在 Logseq 内撤销、手动编辑标签等插件外操作），
  // 停止变更 800ms 后重新查询，避免用户撤销重命名后面板停留在旧数据
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = logseq.DB.onChanged?.(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (!busyRef.current) setRefreshKey((k) => k + 1);
      }, 800);
    });
    return () => {
      if (timer) clearTimeout(timer);
      try {
        off?.();
      } catch {}
    };
  }, []);

  // 外部刷新信号（工具栏按钮）：变化时重新查询
  React.useEffect(() => {
    if (refreshSignal > 0) setRefreshKey((k) => k + 1);
  }, [refreshSignal]);

  // ---------- 编辑（重命名某一层） ----------
  const [renamePath, setRenamePath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  // 重命名层级时是否同时重命名同名概念页面（默认勾选，保持既有行为）
  const [renamePageToo, setRenamePageToo] = useState(true);
  // 节点为虚拟（无行内用法）但同名概念页面真实存在时，也提供一并重命名的选项
  const [renamePageExists, setRenamePageExists] = useState(false);

  // ---------- 删除 / 移出层级 ----------
  const [deletePath, setDeletePath] = useState<string | null>(null);

  // ---------- 旧格式迁移 ----------
  const [migration, setMigration] = useState<
    | null
    | { phase: 'confirm' }
    | { phase: 'running' }
    | {
        phase: 'result';
        updated: number;
        oldNames: string[];
        deleted: string[];
        kept: string[];
      }
  >(null);

  const treeRoot = useMemo(() => buildConceptTree(locations), [locations]);
  const treeIndex = useMemo(() => indexTree(treeRoot), [treeRoot]);
  // 真实节点 = 概念节点（对应实际标签页）；中间路径全部是虚拟节点
  const conceptKeys = useMemo(() => {
    const set = new Set<string>();
    treeIndex.forEach((node) => {
      if (node.conceptName) set.add(node.fullPath);
    });
    return set;
  }, [treeIndex]);

  const deletePlan: { plan?: DeletePlan; error?: string } | null = useMemo(() => {
    if (!deletePath) return null;
    return planTagDelete({ realTagPaths: conceptKeys, path: deletePath });
  }, [deletePath, conceptKeys]);
  // 树中所有节点路径（含虚拟中间节点），用于重命名时的同名冲突检测
  const existingPaths = useMemo(() => new Set(treeIndex.keys()), [treeIndex]);

  // 重命名输入的实时校验与影响预览
  const renamePreview = useMemo(() => {
    if (!renamePath) return null;
    return planTagRename({
      existingPaths,
      realTagPaths: conceptKeys,
      oldPath: renamePath,
      newSegment: renameValue,
    });
  }, [renamePath, renameValue, existingPaths, conceptKeys]);

  // 打开重命名卡片时聚焦并全选
  React.useEffect(() => {
    if (renamePath) {
      const input = renameInputRef.current;
      if (input) {
        input.focus();
        input.select();
      }
    }
  }, [renamePath]);

  // 虚拟节点也可能存在同名概念页面（如仅被 [[a]] 引用过），检测后提供一并重命名的选项
  React.useEffect(() => {
    let mounted = true;
    setRenamePageExists(false);
    if (!renamePath || treeIndex.get(renamePath)?.conceptName) return;
    void logseq.Editor.getPage(renamePath)
      .then((page) => {
        if (mounted) setRenamePageExists(Boolean(page));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [renamePath, treeIndex]);

  // 是否提供「同时重命名概念页面」选项：
  // 1) 方案中存在概念末段变化（节点本身是概念节点）；2) 节点虚拟但同名页面存在
  const renamePageOption = useMemo(() => {
    if (!renamePreview?.plan) return false;
    if (renamePageExists) return true;
    return renamePreview.plan.renames.some((r) => {
      const node = treeIndex.get(r.oldPath);
      if (!node?.conceptName) return false;
      return lastSegment(r.oldPath).toLowerCase() !== lastSegment(r.newPath).toLowerCase();
    });
  }, [renamePreview, renamePageExists, treeIndex]);

  // ---------- 合并（多选目标 → 并入源概念；仅概念节点可用） ----------
  const [mergeState, setMergeState] = useState<{
    source: string;
    search: string;
    selected: Set<string>;
    confirming: boolean;
  } | null>(null);

  // 源标签的全部祖先（可见但置灰，禁止把父级并入子级）
  const mergeAncestors = useMemo(() => {
    const set = new Set<string>();
    if (!mergeState) return set;
    let p = parentPath(mergeState.source);
    while (p) {
      set.add(p);
      p = parentPath(p);
    }
    return set;
  }, [mergeState]);

  // 合并选择模式下的搜索可见集合
  const mergeVisibleSet = useMemo(() => {
    if (!mergeState || !mergeState.search.trim()) return null;
    return collectVisiblePaths(treeRoot, mergeState.search);
  }, [mergeState, treeRoot]);

  const mergeMode: MergeMode | null = useMemo(() => {
    if (!mergeState) return null;
    return {
      sourcePath: mergeState.source,
      selected: mergeState.selected,
      isHidden: (path) => path === mergeState.source,
      isSelectable: (path) => {
        if (path === mergeState.source) return false;
        // 只有真实概念节点可以被合并，虚拟路径节点不行
        if (!conceptKeys.has(path)) return false;
        if (mergeAncestors.has(path)) return false;
        // 已选目标的后代无需重复选择（随目标子树一并迁移）
        for (const sel of mergeState.selected) {
          if (path !== sel && isDescendantPath(path, sel)) return false;
        }
        return true;
      },
      onToggle: (path) => {
        setMergeState((prev) => {
          if (!prev) return prev;
          const selected = new Set(prev.selected);
          if (selected.has(path)) selected.delete(path);
          else selected.add(path);
          return { ...prev, selected, confirming: false };
        });
      },
    };
  }, [mergeState, mergeAncestors, conceptKeys]);

  // 确认阶段的合并方案
  const mergePlan: { plan?: MergePlan; error?: string } | null = useMemo(() => {
    if (!mergeState?.confirming) return null;
    return planTagMerge({
      realTagPaths: conceptKeys,
      sourcePath: mergeState.source,
      targetPaths: Array.from(mergeState.selected),
    });
  }, [mergeState, conceptKeys]);

  // ---------- 标签筛选（且 / 或 / 除，对齐 PictureTag 的筛选模型） ----------

  const [filterState, setFilterState] = useState<TagFilterState>(EMPTY_FILTER_STATE);

  // 进入筛选模式时关闭其他弹卡；退出时清空筛选条件
  React.useEffect(() => {
    if (tagFilter) {
      setPending(null);
      setRenamePath(null);
      setDeletePath(null);
      setMergeState(null);
      setMigration(null);
    } else {
      setFilterState(EMPTY_FILTER_STATE);
    }
  }, [tagFilter]);

  /**
   * 切换某树节点的筛选归属：
   * 未选 → 加入目标组；已在目标组 → 移除（回到未选）；在另一组 → 移到目标组。
   * 选择身份 = (kind, value)：同一概念在多个位置出现时共享同一个选择项。
   */
  const toggleFilterSelection = (fullPath: string, target: 'includes' | 'excludes') => {
    const node = treeIndex.get(fullPath);
    if (!node) return;
    const sel = selectionFromNode(fullPath, node.conceptName);
    const id = selectionId(sel);
    setFilterState((prev) => {
      const wasIncluded = prev.includes.some((s) => selectionId(s) === id);
      const wasExcluded = prev.excludes.some((s) => selectionId(s) === id);
      const includes = prev.includes.filter((s) => selectionId(s) !== id);
      const excludes = prev.excludes.filter((s) => selectionId(s) !== id);
      const next = { ...prev, includes, excludes };
      if (target === 'includes' && !wasIncluded) next.includes.push(sel);
      else if (target === 'excludes' && !wasExcluded) next.excludes.push(sel);
      return next;
    });
  };

  // 反向索引：实体 → 其全部 (path, concept) 标签（同一行多个标签全部收入）
  const filterIndex = useMemo(() => buildFilterIndex(locations), [locations]);

  // 求值：纯内存集合运算，随 refreshKey 增量刷新
  const filterResults = useMemo<TagUsageEntity[] | null>(() => {
    if (!tagFilter || !isFilterActive(filterState)) return null;
    const out: TagUsageEntity[] = [];
    for (const entry of filterIndex.values()) {
      if (evaluateFilter(entry.tags, filterState)) out.push(entry.entity);
    }
    return out;
  }, [tagFilter, filterIndex, filterState]);

  const filterMode: FilterMode | null = useMemo(() => {
    if (!tagFilter) return null;
    const incIds = new Set(filterState.includes.map(selectionId));
    const excIds = new Set(filterState.excludes.map(selectionId));
    return {
      stateOf: (fullPath, conceptName) => {
        const id = selectionId(selectionFromNode(fullPath, conceptName));
        if (incIds.has(id)) return 'included' as const;
        if (excIds.has(id)) return 'excluded' as const;
        return null;
      },
      onToggle: (fullPath) => toggleFilterSelection(fullPath, 'includes'),
      onToggleExclude: (fullPath) => toggleFilterSelection(fullPath, 'excludes'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter, filterState, treeIndex]);

  const visibleSet = useMemo(
    () => (filter.trim() ? collectVisiblePaths(treeRoot, filter) : null),
    [treeRoot, filter],
  );

  const rootNodes = useMemo(() => {
    // 根节点默认按使用数量排序（保持原插件行为）
    const byCount = (a: TagTreeNode, b: TagTreeNode) => {
      const diff = b.totalCount - a.totalCount;
      return sortAscending ? -diff : diff;
    };
    let nodes = orderedChildNodes(treeRoot, orderMap[ROOT_PARENT], byCount);
    if (visibleSet) nodes = nodes.filter((node) => visibleSet.has(node.fullPath));
    return nodes;
  }, [treeRoot, orderMap, sortAscending, visibleSet]);

  // ---------- 展开/折叠全部 ----------

  const expandOrCollapseAll = (expand: boolean) => {
    try {
      const map: Record<string, boolean> = {};
      treeIndex.forEach((_, name) => {
        map[name] = expand;
      });
      localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(map));
      setVersion((v) => v + 1); // 强制子项重挂载以重读展开状态
    } catch {}
    setMenu((m) => ({ ...m, visible: false }));
  };

  const appliedRef = useRef(0);
  React.useEffect(() => {
    if (!applyExpand) return;
    if (appliedRef.current === applyExpand.version) return;
    appliedRef.current = applyExpand.version;
    expandOrCollapseAll(applyExpand.expand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyExpand]);

  const persistExpandedAndRemount = (path: string, open: boolean) => {
    try {
      const saved = localStorage.getItem('logseq-plugin-tags-expanded');
      const map = saved ? JSON.parse(saved) : {};
      map[path] = open;
      localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(map));
    } catch {}
    setVersion((v) => v + 1);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // 只在列表空白区域触发（而不是单个条目内部）
    if (e.currentTarget === e.target) {
      e.preventDefault();
      setMenu({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, visible: true });
    }
  };

  // ---------- 基于行内层级写法的块编辑 ----------

  /**
   * 把一组重命名/移动 pair（key 是树节点路径）翻译成块级行内编辑：
   * 概念节点的位置变化 = 其用法块中对应标签前缀的改写（a/b/#c -> x/y/#c）。
   */
  const editsForPairs = (renames: RenamePair[]): BlockPathEdits => {
    const edits: BlockPathEdits = new Map();
    for (const pair of renames) {
      const node = treeIndex.get(pair.oldPath);
      if (!node || !node.conceptName) {
        console.warn('[tags] editsForPairs: node missing or virtual:', pair.oldPath, node?.conceptName ?? null);
        continue;
      }
      const oldDir = parentPath(pair.oldPath);
      const newDir = parentPath(pair.newPath);
      if (oldDir.toLowerCase() === newDir.toLowerCase()) continue;
      for (const entity of node.selfUsages) {
        const uuid = blockUuid(entity);
        if (!uuid) {
          console.warn('[tags] editsForPairs: no block uuid, entity.uuid =', JSON.stringify((entity as { uuid?: unknown }).uuid ?? null));
          continue;
        }
        addRemap(edits, uuid, oldDir, lastSegment(pair.oldPath), newDir);
      }
    }
    console.log('[tags] editsForPairs result:', [...edits].map(([u, m]) => ({ uuid: u, map: [...m] })));
    return edits;
  };

  const flushPathEdits = async (edits: BlockPathEdits): Promise<number> => {
    let updated = 0;
    for (const [uuid, map] of edits) {
      if (map.size === 0) continue;
      try {
        const block = await logseq.Editor.getBlock(uuid);
        const content = block?.content;
        if (typeof content !== 'string') {
          console.warn('[tags] flush: block not found or empty content:', uuid, block);
          continue;
        }
        const result = remapInlineTags(content, (tag) => {
          // 复合键（层级+概念）精确匹配：只改写指定概念的出现位置；
          // 不做前缀模糊匹配，避免误伤同一行内前缀相同的其他标签
          const key = `${tag.path.toLowerCase()}\u0000${tag.concept.toLowerCase()}`;
          return map.get(key) ?? null;
        });
        console.log('[tags] flush block:', uuid, JSON.stringify({ changed: result.changed, before: content, after: result.content }));
        if (result.changed) {
          await logseq.Editor.updateBlock(uuid, result.content);
          updated += 1;
        }
      } catch (error) {
        console.warn(`[tags] inline path edit failed for block ${uuid}:`, error);
      }
    }
    return updated;
  };

  // ---------- 拖拽（mousedown/mousemove/mouseup 实现） ----------

  const isValidDrop = (dragPath: string, targetPath: string): boolean => {
    return dragPath !== targetPath && !isDescendantPath(targetPath, dragPath);
  };

  // 根据鼠标相对目标行的位置判定 top/bottom/nested
  const computePositionFromEvent = (
    clientX: number,
    clientY: number,
    targetEl: Element,
  ): DropPosition => {
    const rect = targetEl.getBoundingClientRect();
    const horizontalOffset = clientX - dragStartXRef.current;
    if (horizontalOffset > HORIZONTAL_DRAG_THRESHOLD) return 'nested';
    const relativeY = clientY - rect.top;
    return relativeY > rect.height / 2 ? 'bottom' : 'top';
  };

  // 统一的落点执行逻辑
  const performDrop = (dragPath: string, targetPath: string, position: DropPosition) => {
    console.log('[tags] performDrop', { dragPath, target: targetPath, position });
    if (!isValidDrop(dragPath, targetPath)) return;

    const { plan, error, conflicts, newDragPath: mergeTarget } = planTagMove({
      realTagPaths: conceptKeys,
      dragPath,
      targetPath,
      position,
    });
    if (error) {
      if (conflicts && conflicts.length > 0 && mergeTarget) {
        // 目标位置已存在同名标签：转入合并确认流程（确认后合并，取消保持不变）
        console.log('[tags] move conflict, enter merge confirm:', mergeTarget, conflicts);
        setPending(null);
        setMergeState({
          source: mergeTarget,
          search: '',
          selected: new Set([dragPath]),
          confirming: true,
        });
        return;
      }
      console.warn('[tags] move rejected:', error);
      void logseq.UI.showMsg(error, 'warning');
      return;
    }
    if (!plan) return;

    if (plan.renames.length === 0) {
      const next = computeOrderAfterMove(orderMap, treeRoot, treeIndex, dragPath, targetPath, position);
      console.log('[tags] same-parent reorder', next);
      saveOrder(next);
      void logseq.UI.showMsg(t('orderAdjusted', { name: lastSegment(dragPath) }), 'success');
    } else {
      console.log('[tags] pending cross-level move', plan);
      setPending(plan);
    }
  };

  // 行内 mousedown：记录起点，挂全局 mousemove/mouseup
  const onRowMouseDown = (e: React.MouseEvent<HTMLDivElement>, path: string) => {
    // 仅左键触发
    if (e.button !== 0) return;
    // 关键：阻止冒泡。父行 DropRow 包裹整棵子树，
    // 不阻断的话在子行上按下会冒泡改写拖拽源为父行。
    e.stopPropagation();

    dragPathRef.current = path;
    dragStartXRef.current = e.clientX;
    dragStartYRef.current = e.clientY;
    draggingRef.current = false;
    console.log('[tags] mousedown', path);

    const handleMouseMove = (ev: MouseEvent) => {
      const dragPath = dragPathRef.current;
      if (!dragPath) return;
      const dx = ev.clientX - dragStartXRef.current;
      const dy = ev.clientY - dragStartYRef.current;

      // 越过阈值才进入拖拽态（避免误触）
      if (!draggingRef.current) {
        if (Math.abs(dx) < DRAG_START_THRESHOLD && Math.abs(dy) < DRAG_START_THRESHOLD) return;
        draggingRef.current = true;
        setActiveDragPath(dragPath);
        setDropTarget(null);
        console.log('[tags] drag started', dragPath);
      }
      // 拖拽中阻止文本选中
      ev.preventDefault();

      // 查找鼠标下方的标签行
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const rowEl = el?.closest('[data-tag-path]') as HTMLElement | null;
      if (!rowEl) {
        setDropTarget(null);
        return;
      }
      const targetPath = rowEl.dataset.tagPath as string;
      if (!isValidDrop(dragPath, targetPath)) {
        setDropTarget(null);
        return;
      }
      const position = computePositionFromEvent(ev.clientX, ev.clientY, rowEl);
      setDropTarget((prev) =>
        prev && prev.path === targetPath && prev.position === position
          ? prev
          : { path: targetPath, position },
      );
    };

    const handleMouseUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      const dragPath = dragPathRef.current;
      const wasDragging = draggingRef.current;
      dragPathRef.current = null;
      draggingRef.current = false;
      setActiveDragPath(null);

      if (!wasDragging || !dragPath) {
        setDropTarget(null);
        return;
      }

      // 拖拽后拦截随之而来的 click（避免误触发展开/打开页面）
      const cancelClick = (ce: MouseEvent) => {
        ce.stopPropagation();
        ce.preventDefault();
        window.removeEventListener('click', cancelClick, true);
      };
      window.addEventListener('click', cancelClick, true);

      // 用鼠标下方的标签行作为落点（若移出列表则取消）
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const rowEl = el?.closest('[data-tag-path]') as HTMLElement | null;
      setDropTarget(null);
      if (!rowEl) {
        console.log('[tags] dropped outside list, cancelled');
        return;
      }
      const targetPath = rowEl.dataset.tagPath as string;
      const position = computePositionFromEvent(ev.clientX, ev.clientY, rowEl);
      performDrop(dragPath, targetPath, position);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  /** 重命名后迁移展开状态（localStorage 以完整路径为 key） */
  const migrateExpandedPaths = (oldPath: string, newPath: string) => {
    try {
      const raw = localStorage.getItem('logseq-plugin-tags-expanded');
      const map = raw ? JSON.parse(raw) : {};
      const next: Record<string, boolean> = {};
      Object.entries(map).forEach(([key, value]) => {
        let newKey = key;
        if (key === oldPath) newKey = newPath;
        else if (key.startsWith(`${oldPath}/`)) newKey = newPath + key.slice(oldPath.length);
        next[newKey] = value as boolean;
      });
      localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(next));
    } catch {}
  };

  const onRequestRename = (path: string) => {
    setRenamePath(path);
    setRenameValue(lastSegment(path));
    setRenamePageToo(true);
    setRenamePageExists(false);
    setDeletePath(null);
    setMergeState(null);
    setMigration(null);
  };

  const onRequestMerge = (path: string) => {
    setPending(null);
    setRenamePath(null);
    setDeletePath(null);
    setMigration(null);
    setMergeState({ source: path, search: '', selected: new Set(), confirming: false });
  };

  const onRequestDelete = (path: string) => {
    setPending(null);
    setRenamePath(null);
    setMergeState(null);
    setMigration(null);
    setDeletePath(path);
  };

  // 写操作完成后等待 DB 事务提交，再刷新面板查询（避免 datascript 读到旧快照）
  const refreshAfterWrite = async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    setRefreshKey((key) => key + 1);
  };

  const executePendingMove = async () => {
    if (!pending) return;
    const plan = pending;
    console.log('[tags] executePendingMove plan:', JSON.stringify(plan, null, 2));
    setBusy(true);
    try {
      // 移动只改写块上的行内层级前缀，概念页面完全不动
      const updatedBlocks = await flushPathEdits(editsForPairs(plan.renames));

      // 更新本地排序表
      const movedOrder = computeOrderAfterMove(
        orderMap,
        treeRoot,
        treeIndex,
        plan.dragPath,
        plan.targetPath,
        plan.position,
      );
      const nextOrder =
        plan.newDragPath === plan.dragPath
          ? movedOrder
          : remapOrderKeys(movedOrder, plan.dragPath, plan.newDragPath);
      saveOrder(nextOrder);
      // 对齐 PictureTag：nested 后自动展开新父级
      if (plan.position === 'nested') {
        persistExpandedAndRemount(plan.targetPath, true);
      } else {
        setVersion((v) => v + 1);
      }
      setPending(null);
      await refreshAfterWrite();
      void logseq.UI.showMsg(
        t('movedWithBlocks', { name: lastSegment(plan.dragPath), count: updatedBlocks }),
        'success',
      );
    } catch (err) {
      console.error('Failed to move tag subtree:', err);
      setPending(null);
      setRefreshKey((key) => key + 1);
      void logseq.UI.showMsg(
        t('moveFailed'),
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const executeRename = async () => {
    if (!renamePath || !renamePreview?.plan) {
      if (renamePreview?.error) void logseq.UI.showMsg(renamePreview.error, 'warning');
      return;
    }
    const plan = renamePreview.plan;
    console.log('[tags] executeRename plan:', JSON.stringify(plan, null, 2));
    setBusy(true);
    try {
      // 1) 路径变化：改写块上的行内层级前缀
      const updatedBlocks = await flushPathEdits(editsForPairs(plan.renames));

      // 2) 概念末段变化：重命名真实页面（全局引用由 Logseq 原生更新）；
      //    同一概念在多个位置出现时只执行一次；取消勾选时仅改写层级前缀、页面保持不变
      const leafRenames: RenamePair[] = [];
      if (renamePageToo) {
        const seenLeaves = new Set<string>();
        for (const pair of plan.renames) {
          const node = treeIndex.get(pair.oldPath);
          if (!node?.conceptName) continue;
          const oldLeaf = lastSegment(pair.oldPath);
          const newLeaf = lastSegment(pair.newPath);
          if (oldLeaf.toLowerCase() === newLeaf.toLowerCase()) continue;
          if (seenLeaves.has(oldLeaf.toLowerCase())) continue;
          seenLeaves.add(oldLeaf.toLowerCase());
          leafRenames.push({ oldPath: oldLeaf, newPath: newLeaf });
        }
        // 节点本身是虚拟路径（无行内用法）但同名概念页面存在：也一并重命名
        const selfNode = treeIndex.get(plan.oldPath);
        if (!selfNode?.conceptName && renamePageExists) {
          const oldLeaf = lastSegment(plan.oldPath);
          const newLeaf = lastSegment(plan.newPath);
          if (
            oldLeaf.toLowerCase() !== newLeaf.toLowerCase() &&
            !seenLeaves.has(oldLeaf.toLowerCase())
          ) {
            leafRenames.push({ oldPath: oldLeaf, newPath: newLeaf });
          }
        }
      }

      const pageRenameFailures: string[] = [];
      for (const leaf of leafRenames) {
        try {
          // renamePage 前快照引用块 uuid（rename 后旧页面的引用查不到），供行内兜底改写
          const { collectReferencingBlocks, rewriteInlineTagRefs } = await import('../tagRename');
          const uuids = [...(await collectReferencingBlocks([leaf.oldPath])).keys()];
          const page = await logseq.Editor.getPage(leaf.oldPath);
          if (page) {
            // 先清理该概念名下遗留的带 / 空页面，规避 Logseq 原生 rename 的内部 join 崩溃
            const { cleanupEmptyLegacyChildren } = await import('../tagModel/migrate');
            await cleanupEmptyLegacyChildren(leaf.oldPath);
            try {
              console.log('[tags] renamePage concept', leaf);
              await logseq.Editor.renamePage(leaf.oldPath, leaf.newPath);
            } catch (renameError) {
              // 原生 rename 失败（如遗留页面触发内部 bug）：页面本体残留，下方兜底改写仍会执行
              console.warn(`[tags] renamePage failed for ${leaf.oldPath}:`, renameError);
              pageRenameFailures.push(leaf.oldPath);
            }
          }
          // Logseq 原生改写在部分图谱上不可靠（页面已改名但块文本未更新，留下孤儿 #old）：
          // 总是执行行内兜底（以块当前内容为准，幂等），把残留引用补写为新名
          const rewritten = await rewriteInlineTagRefs([leaf], uuids);
          if (rewritten > 0) {
            console.info(
              `[tags] inline rewrite after renamePage: ${leaf.oldPath} -> ${leaf.newPath}, ${rewritten} blocks`,
            );
          }
        } catch (error) {
          console.warn(`[tags] rename concept failed for ${leaf.oldPath}:`, error);
          pageRenameFailures.push(leaf.oldPath);
        }
      }

      // 3) 排序表与展开状态：先迁移子树，再迁移该概念在其他位置的同名节点
      let nextOrder = remapOrderForRename(orderMap, plan.oldPath, plan.newPath);
      saveOrder(nextOrder);
      migrateExpandedPaths(plan.oldPath, plan.newPath);
      for (const leaf of leafRenames) {
        treeIndex.forEach((node) => {
          if (!node.conceptName) return;
          if (node.fullPath === plan.oldPath || node.fullPath.startsWith(`${plan.oldPath}/`)) return;
          if (lastSegment(node.fullPath).toLowerCase() !== leaf.oldPath.toLowerCase()) return;
          const parent = parentPath(node.fullPath);
          const newKey = parent ? `${parent}/${leaf.newPath}` : leaf.newPath;
          if (newKey === node.fullPath) return;
          nextOrder = remapOrderForRename(nextOrder, node.fullPath, newKey);
          migrateExpandedPaths(node.fullPath, newKey);
        });
      }
      saveOrder(nextOrder);

      setVersion((v) => v + 1);
      setRenamePath(null);
      await refreshAfterWrite();
      void logseq.UI.showMsg(
        leafRenames.length > 0
          ? t('renameConceptDone', {
              names: leafRenames.map((l) => l.newPath).join(t('listSeparator')),
              count: updatedBlocks,
            })
          : t('renameLevelDone', { count: updatedBlocks }),
        'success',
      );
      if (pageRenameFailures.length > 0) {
        void logseq.UI.showMsg(
          t('renameFailedPartial', { names: pageRenameFailures.join(t('listSeparator')) }),
          'warning',
        );
      }
    } catch (err) {
      console.error('Failed to rename tag subtree:', err);
      setRenamePath(null);
      setRefreshKey((key) => key + 1);
      void logseq.UI.showMsg(t('renameFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const executeMerge = async () => {
    if (!mergeState || !mergePlan?.plan) {
      if (mergePlan?.error) void logseq.UI.showMsg(mergePlan.error, 'warning');
      return;
    }
    const plan = mergePlan.plan;
    console.log('[tags] executeMerge plan:', JSON.stringify(plan, null, 2));
    setBusy(true);
    try {
      // 1) 末段相同的 pair：只是位置收敛，改写行内前缀即可
      const relocateEdits: BlockPathEdits = new Map();
      // 2) 末段不同的 pair：需要统一概念页面，分别按 rename / converge 收集
      const pageRenames = new Map<string, string>();
      const convergeLeaves = new Set<string>();

      for (const pair of plan.rewritePairs) {
        const oldLeaf = lastSegment(pair.oldPath);
        const newLeaf = lastSegment(pair.newPath);
        if (oldLeaf.toLowerCase() === newLeaf.toLowerCase()) {
          const node = treeIndex.get(pair.oldPath);
          if (node?.conceptName) {
            for (const entity of node.selfUsages) {
              const uuid = blockUuid(entity);
              if (uuid) {
                addRemap(
                  relocateEdits,
                  uuid,
                  parentPath(pair.oldPath),
                  lastSegment(pair.oldPath),
                  parentPath(pair.newPath),
                );
              }
            }
          }
        } else if (!pageRenames.has(oldLeaf.toLowerCase())) {
          // 新位置页面是否已存在（位置级收敛对页面同样意味着同名冲突）
          pageRenames.set(oldLeaf.toLowerCase(), newLeaf);
          if (plan.convergePairs.some((p) => p.oldPath === pair.oldPath)) {
            convergeLeaves.add(oldLeaf.toLowerCase());
          }
        }
      }
      await flushPathEdits(relocateEdits);

      // 3) 收敛页面：全局行内改写引用（renamePage 不能改到已存在的页面）
      if (convergeLeaves.size > 0) {
        const { collectReferencingBlocks, applyInlineTagRenames } = await import('../tagRename');
        const convergePairs = [...pageRenames.entries()]
          .filter(([oldLeaf]) => convergeLeaves.has(oldLeaf))
          .map(([oldLeaf, newLeaf]) => ({ oldPath: oldLeaf, newPath: newLeaf }));
        const oldLeaves = convergePairs.map((p) => p.oldPath);
        const snapshot = await collectReferencingBlocks(oldLeaves);
        await applyInlineTagRenames(convergePairs, snapshot);

        // 迁移旧概念页面自身的正文块到目标页面，然后删除旧页面
        for (const pair of convergePairs) {
          try {
            const topBlocks = await logseq.Editor.getPageBlocksTree(pair.oldPath);
            for (const block of topBlocks ?? []) {
              // eslint-disable-next-line no-await-in-loop
              await logseq.Editor.moveBlock(block.uuid, pair.newPath, {
                children: true,
                before: false,
              });
            }
            // eslint-disable-next-line no-await-in-loop
            await logseq.Editor.deletePage(pair.oldPath);
          } catch (error) {
            console.warn(`[tags] converge page failed for ${pair.oldPath}:`, error);
          }
        }
      }

      // 4) 可直接 renamePage 的概念（新页面不存在）
      for (const [oldLeaf, newLeaf] of pageRenames) {
        if (convergeLeaves.has(oldLeaf)) continue;
        try {
          // eslint-disable-next-line no-await-in-loop
          const page = await logseq.Editor.getPage(oldLeaf);
          if (page) {
            // eslint-disable-next-line no-await-in-loop
            await logseq.Editor.renamePage(oldLeaf, newLeaf);
          } else {
            const { collectReferencingBlocks, applyInlineTagRenames } = await import('../tagRename');
            const snapshot = await collectReferencingBlocks([oldLeaf]);
            // eslint-disable-next-line no-await-in-loop
            await applyInlineTagRenames([{ oldPath: oldLeaf, newPath: newLeaf }], snapshot);
          }
        } catch (error) {
          console.warn(`[tags] merge rename failed for ${oldLeaf}:`, error);
        }
      }

      // 5) 排序表与展开状态迁移
      saveOrder(computeOrderAfterMerge(orderMap, plan.sourcePath, plan.targetPaths));
      try {
        const raw = localStorage.getItem('logseq-plugin-tags-expanded');
        const map = raw ? JSON.parse(raw) : {};
        const migrated = migrateExpandedAfterMerge(map, plan.sourcePath, plan.targetPaths);
        localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(migrated));
      } catch {}

      // 确保源标签展开，让迁入的子标签可见
      persistExpandedAndRemount(plan.sourcePath, true);
      setMergeState(null);
      await refreshAfterWrite();
      void logseq.UI.showMsg(
        t('mergedInto', { count: plan.targetPaths.length, name: plan.sourcePath }),
        'success',
      );
    } catch (err) {
      console.error('Failed to merge tags:', err);
      setMergeState(null);
      setRefreshKey((key) => key + 1);
      void logseq.UI.showMsg(t('mergeFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const executeDelete = async () => {
    if (!deletePath || !deletePlan) {
      if (deletePlan?.error) void logseq.UI.showMsg(deletePlan.error, 'warning');
      return;
    }
    const targetPath = deletePath;
    console.log('[tags] executeDelete path:', targetPath);
    setBusy(true);
    try {
      const { deleteBlankBlocks } = await import('../tagRename');
      const edits: BlockPathEdits = new Map();
      // 根级概念位置：需要从块正文剥离根级 #概念 引用
      const stripContents = new Map<string, string>();

      // 子树内所有概念节点
      treeIndex.forEach((node) => {
        if (node.fullPath !== targetPath && !node.fullPath.startsWith(`${targetPath}/`)) return;
        if (!node.conceptName) return;
        const dir = parentPath(node.fullPath);
        for (const entity of node.selfUsages) {
          const uuid = blockUuid(entity);
          if (!uuid) continue;
          if (dir === '') {
            // 根级概念：剥离该块上根级的 #概念 引用（子层级里的同名概念不受影响）
            const block = entity as QueryResultBlockEntity;
            if (typeof block.content === 'string') {
              stripContents.set(
                uuid,
                stripInlineConceptRefs(
                  stripContents.get(uuid) ?? block.content,
                  node.conceptName!,
                ),
              );
            }
          } else {
            // 子层级位置：去掉前缀，块回到根级（#标签与笔记内容保留）
            addRemap(edits, uuid, dir, node.conceptName!, '');
          }
        }
      });

      const pathUpdated = await flushPathEdits(edits);
      const blankResult = await deleteBlankBlocks(stripContents);

      // 排序表与展开状态清除（标签页面本身保留）
      saveOrder(computeOrderAfterDelete(orderMap, targetPath));
      try {
        const raw = localStorage.getItem('logseq-plugin-tags-expanded');
        const map = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          'logseq-plugin-tags-expanded',
          JSON.stringify(migrateExpandedAfterDelete(map, targetPath)),
        );
      } catch {}

      setVersion((v) => v + 1);
      setDeletePath(null);
      await refreshAfterWrite();
      void logseq.UI.showMsg(
        t('removedFromHierarchyDone', {
          path: targetPath,
          updated: pathUpdated + blankResult.updated,
          removed: blankResult.removed,
        }),
        'success',
      );
    } catch (err) {
      console.error('Failed to remove tag from hierarchy:', err);
      setDeletePath(null);
      setRefreshKey((key) => key + 1);
      void logseq.UI.showMsg(t('removeFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---------- 旧格式迁移 ----------

  const runMigration = async () => {
    setMigration({ phase: 'running' });
    try {
      const result = await migrateLegacyTags();
      setMigration({
        phase: 'result',
        updated: result.updatedBlocks,
        oldNames: result.oldNames,
        deleted: [],
        kept: result.oldNames,
      });
      setRefreshKey((key) => key + 1);
    } catch (err) {
      console.error('Migration failed:', err);
      setMigration(null);
      void logseq.UI.showMsg(t('migrationFailed'), 'error');
    }
  };

  const runMigrationCleanup = async () => {
    if (!migration || migration.phase !== 'result') return;
    setBusy(true);
    try {
      const cleanup = await deleteEmptyLegacyPages(migration.oldNames);
      setMigration({ ...migration, deleted: cleanup.deleted, kept: cleanup.kept });
      setRefreshKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  const treeCtx: TagTreeContextValue = {
    dragEnabled: enableDragSort && !mergeState && !filterMode,
    activeDragPath,
    dropTarget,
    onRowMouseDown,
    onRequestRename,
    onRequestMerge,
    onRequestDelete,
    mergeMode,
    filterMode,
    orderMap,
    visibleSet: mergeMode ? mergeVisibleSet : visibleSet,
  };

  const rootLevelText = t('rootLevel');
  const targetParentText =
    pending && pending.position !== 'nested'
      ? pending.targetPath.includes('/')
        ? pending.targetPath.slice(0, pending.targetPath.lastIndexOf('/'))
        : rootLevelText
      : null;

  const deleteNode = deletePath ? treeIndex.get(deletePath) : null;

  return (
    <StyldTagList
      onContextMenu={handleContextMenu}
      onClick={() => menu.visible && setMenu({ ...menu, visible: false })}
    >
      {/* 筛选模式：条件栏（sticky）+ 结果区 + 标签树挑选器 */}
      {tagFilter && (
        <FilterBar
          state={filterState}
          resultCount={filterResults ? filterResults.length : null}
          onToggleCombination={() =>
            setFilterState((prev) => ({
              ...prev,
              combination: prev.combination === 'and' ? 'or' : 'and',
            }))
          }
          onToggleChip={(id) =>
            setFilterState((prev) => {
              const fromInclude = prev.includes.find((s) => selectionId(s) === id);
              const fromExclude = prev.excludes.find((s) => selectionId(s) === id);
              if (fromInclude) {
                return {
                  ...prev,
                  includes: prev.includes.filter((s) => selectionId(s) !== id),
                  excludes: [...prev.excludes, fromInclude],
                };
              }
              if (fromExclude) {
                return {
                  ...prev,
                  excludes: prev.excludes.filter((s) => selectionId(s) !== id),
                  includes: [...prev.includes, fromExclude],
                };
              }
              return prev;
            })
          }
          onRemoveChip={(id) =>
            setFilterState((prev) => ({
              ...prev,
              includes: prev.includes.filter((s) => selectionId(s) !== id),
              excludes: prev.excludes.filter((s) => selectionId(s) !== id),
            }))
          }
          onClearAll={() => setFilterState(EMPTY_FILTER_STATE)}
        />
      )}
      {filterResults && <FilterResults entities={filterResults} />}
      {tagFilter && <TreeSectionLabel>{t('treeSectionLabel')}</TreeSectionLabel>}

      {menu.visible && (
        <ContextMenu style={{ left: menu.x, top: menu.y }}>
          <MenuItem onClick={() => expandOrCollapseAll(true)}>{t('expandAll')}</MenuItem>
          <MenuItem onClick={() => expandOrCollapseAll(false)}>{t('collapseAll')}</MenuItem>
          <MenuItem
            onClick={() => {
              setMenu((m) => ({ ...m, visible: false }));
              setMigration({ phase: 'confirm' });
            }}
          >
            {t('migrateLegacy')}
          </MenuItem>
        </ContextMenu>
      )}

      {migration && (
        <ConfirmCard
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {migration.phase === 'confirm' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('migrationConfirmTitle')}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {t('migrationBody1')}<code>#a/b/c</code>
                {t('migrationBody2')}<code>a/b/#c</code>
                {t('migrationBody3')}<code>path::</code>
                {t('migrationBody4')}
                <code>#a/b/c</code>{t('listSeparator')}<code>#D/c</code>{t('listSeparator')}<code>#c</code>
                {t('migrationBody5')}<code>#c</code>
                {t('migrationBody6')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <ConfirmButton tone="ghost" onClick={() => setMigration(null)} disabled={busy}>
                  {t('cancel')}
                </ConfirmButton>
                <ConfirmButton tone="primary" onClick={runMigration} disabled={busy}>
                  {busy ? t('migrating') : t('startMigration')}
                </ConfirmButton>
              </div>
            </>
          )}
          {migration.phase === 'running' && (
            <div style={{ fontWeight: 600 }}>{t('migrationRunning')}</div>
          )}
          {migration.phase === 'result' && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {t('migrationResultTitle', { updated: migration.updated, count: migration.oldNames.length })}
              </div>
              {migration.oldNames.length > 0 && (
                <RenameList>
                  {migration.oldNames.slice(0, 8).map((name) => (
                    <div key={name}>{name}</div>
                  ))}
                  {migration.oldNames.length > 8 && <div>{t('moreCount', { count: migration.oldNames.length })}</div>}
                </RenameList>
              )}
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {migration.deleted.length > 0 && (
                  <>{t('deletedBlankPages', { count: migration.deleted.length })}</>
                )}
                {migration.kept.length > 0 ? (
                  <>
                    {t('keptPagesHint', { count: migration.kept.length })}
                    <RenameList>
                      {migration.kept.slice(0, 8).map((name) => (
                        <div key={name}>{name}</div>
                      ))}
                    </RenameList>
                  </>
                ) : (
                  t('allPagesBlank')
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <ConfirmButton tone="ghost" onClick={() => setMigration(null)}>
                  {t('close')}
                </ConfirmButton>
                {migration.oldNames.length > 0 && migration.deleted.length === 0 && (
                  <ConfirmButton tone="primary" onClick={runMigrationCleanup} disabled={busy}>
                    {busy ? t('cleaning') : t('deleteEmptyLegacyPages')}
                  </ConfirmButton>
                )}
              </div>
            </>
          )}
        </ConfirmCard>
      )}

      {deletePath && (
        <ConfirmCard
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: 'hsl(0, 70%, 50%)' }}>
            {t('removeFromHierarchyTitle', { path: deletePath })}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            {deleteNode?.conceptName && parentPath(deletePath) === ''
              ? t('deleteRootConceptBody')
              : t('deleteLevelBody')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <ConfirmButton
              tone="ghost"
              onClick={() => setDeletePath(null)}
              disabled={busy}
            >
              {t('cancel')}
            </ConfirmButton>
            <ConfirmButton tone="danger" onClick={executeDelete} disabled={busy}>
              {busy ? t('processing') : t('confirmRemove')}
            </ConfirmButton>
          </div>
        </ConfirmCard>
      )}

      {mergeState && (
        <ConfirmCard
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {!mergeState.confirming ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {t('mergeIntoTitle', { source: mergeState.source })}
              </div>
              <RenameInput
                autoFocus
                value={mergeState.search}
                onChange={(e) =>
                  setMergeState((prev) => (prev ? { ...prev, search: e.target.value } : prev))
                }
                placeholder={t('mergeSearchPlaceholder')}
                disabled={busy}
              />
              <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
                {t('mergeHint')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <ConfirmButton
                  tone="ghost"
                  onClick={() => setMergeState(null)}
                  disabled={busy}
                >
                  {t('cancel')}
                </ConfirmButton>
                <ConfirmButton
                  tone="primary"
                  onClick={() => setMergeState((prev) => (prev ? { ...prev, confirming: true } : prev))}
                  disabled={busy || mergeState.selected.size === 0}
                >
                  {t('nextStepCount', { count: mergeState.selected.size })}
                </ConfirmButton>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {t('mergeConfirmTitle', { source: mergeState.source })}
              </div>
              <div>
                {t('willMergeCount', { count: mergeState.selected.size })}
                {Array.from(mergeState.selected)
                  .map((p) => t('quote', { name: p }))
                  .join(t('listSeparator'))}
              </div>
              {mergePlan?.error ? (
                <RenameError>{mergePlan.error}</RenameError>
              ) : (
                mergePlan?.plan && (
                  <RenameList>
                    {mergePlan.plan.rewritePairs.slice(0, 5).map((pair) => (
                      <div key={pair.oldPath}>
                        {pair.oldPath} → {pair.newPath}
                      </div>
                    ))}
                    {mergePlan.plan.rewritePairs.length > 5 && (
                      <div>{t('moreCount', { count: mergePlan.plan.rewritePairs.length })}</div>
                    )}
                  </RenameList>
                )
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <ConfirmButton
                  tone="ghost"
                  onClick={() =>
                    setMergeState((prev) => (prev ? { ...prev, confirming: false } : prev))
                  }
                  disabled={busy}
                >
                  {t('back')}
                </ConfirmButton>
                <ConfirmButton
                  tone="primary"
                  onClick={executeMerge}
                  disabled={busy || !mergePlan?.plan}
                >
                  {busy ? t('merging') : t('confirmMerge')}
                </ConfirmButton>
              </div>
            </>
          )}
        </ConfirmCard>
      )}

      {pending && (
        <ConfirmCard onClick={(e) => e.stopPropagation()}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t('moveTagTitle', { name: lastSegment(pending.dragPath) })}
          </div>
          <div>
            {pending.position === 'nested'
              ? t('moveNestedBody', { target: pending.targetPath })
              : t('movePositionBody', {
                  parent:
                    targetParentText === rootLevelText
                      ? rootLevelText
                      : t('underParent', { name: targetParentText ?? '' }),
                  position: pending.position === 'top' ? t('beforeTarget') : t('afterTarget'),
                })}
          </div>
          <div style={{ marginTop: 4 }}>
            {t('moveRewriteBody', { count: pending.renames.length })}
          </div>
          <RenameList>
            {pending.renames.slice(0, 5).map((rename) => (
              <div key={rename.oldPath}>
                {rename.oldPath} → {rename.newPath}
              </div>
            ))}
            {pending.renames.length > 5 && <div>{t('moreCount', { count: pending.renames.length })}</div>}
          </RenameList>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <ConfirmButton tone="ghost" onClick={() => setPending(null)} disabled={busy}>
              {t('cancel')}
            </ConfirmButton>
            <ConfirmButton tone="primary" onClick={executePendingMove} disabled={busy}>
              {busy ? t('moving') : t('confirmMove')}
            </ConfirmButton>
          </div>
        </ConfirmCard>
      )}

      {renamePath && (
        <ConfirmCard
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            {treeIndex.get(renamePath)?.conceptName ? t('renameConceptTag') : t('renameLevelTitle')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {parentPath(renamePath) && (
              <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {parentPath(renamePath)}/
              </span>
            )}
            <RenameInput
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renamePreview?.plan && !busy) {
                  e.preventDefault();
                  void executeRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setRenamePath(null);
                }
              }}
              placeholder={t('renamePlaceholder')}
              disabled={busy}
            />
          </div>
          {renamePreview?.error ? (
            <RenameError>{renamePreview.error}</RenameError>
          ) : (
            renamePreview?.plan && (
              <>
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  {t('renameAffectLine', {
                    count: renamePreview.plan.renames.length,
                    mode:
                      renamePageOption && renamePageToo
                        ? t('renameModeWithPage')
                        : t('renameModePrefixOnly'),
                  })}
                </div>
                <RenameList>
                  {renamePreview.plan.renames.slice(0, 5).map((rename) => (
                    <div key={rename.oldPath}>
                      {rename.oldPath} → {rename.newPath}
                    </div>
                  ))}
                  {renamePreview.plan.renames.length > 5 && (
                    <div>{t('moreCount', { count: renamePreview.plan.renames.length })}</div>
                  )}
                </RenameList>
                {renamePageOption && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginTop: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={renamePageToo}
                      disabled={busy}
                      onChange={(e) => setRenamePageToo(e.target.checked)}
                    />
                    {t('renamePageToo', {
                      old: lastSegment(renamePath),
                      new: lastSegment(renamePreview.plan.newPath),
                    })}
                  </label>
                )}
              </>
            )
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <ConfirmButton
              tone="ghost"
              onClick={() => setRenamePath(null)}
              disabled={busy}
            >
              {t('cancel')}
            </ConfirmButton>
            <ConfirmButton
              tone="primary"
              onClick={executeRename}
              disabled={busy || !renamePreview?.plan}
            >
              {busy ? t('renaming') : t('confirmRename')}
            </ConfirmButton>
          </div>
        </ConfirmCard>
      )}

      <TagTreeContext.Provider value={treeCtx}>
        {rootNodes.length === 0 ? (
          <EmptyHint>
            {filter.trim() ? t('noMatchingTags') : t('noTagsHint')}
          </EmptyHint>
        ) : (
          rootNodes.map((node) => (
            <TagTreeEntry key={`${node.fullPath}-${version}-${refresh}`} node={node} depth={0} />
          ))
        )}
      </TagTreeContext.Provider>
    </StyldTagList>
  );
}
