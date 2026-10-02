import React from 'react';
import { DropPosition, TagOrderMap } from '../../utils';

/** 拖拽落点指示 */
export type DropTarget = { path: string; position: DropPosition };

/**
 * 合并选择模式：整棵树切换为多选。
 * - isHidden：源标签自身不渲染（其子树在该位置展平显示）
 * - isSelectable：源的祖先、已选目标的后代不可选（置灰）
 */
export type MergeMode = {
  sourcePath: string;
  selected: Set<string>;
  onToggle: (path: string) => void;
  isHidden: (path: string) => boolean;
  isSelectable: (path: string) => boolean;
};

/**
 * 筛选挑选模式：整棵树切换为筛选选择器（对齐 PictureTag 的 且/或/除 筛选）。
 * - 概念节点：包含 = 匹配任意层级下的该概念（同一概念多处位置共享勾选态）
 * - 虚拟路径节点：包含 = 匹配该路径子树
 * - 左键点击切换包含，右键切换排除
 */
export type FilterMode = {
  /** 节点当前筛选状态：已包含 / 已排除 / 未选 */
  stateOf: (fullPath: string, conceptName: string | null) => 'included' | 'excluded' | null;
  /** 左键点击：切换包含 */
  onToggle: (fullPath: string) => void;
  /** 右键：切换排除 */
  onToggleExclude: (fullPath: string) => void;
};

/**
 * 整棵标签树共享的上下文：
 * 拖拽事件由 TagList 统一下发，递归行组件就地消费；
 * 同时携带自定义排序、搜索可见集合、编辑/合并入口。
 */
export type TagTreeContextValue = {
  dragEnabled: boolean;
  activeDragPath: string | null;
  dropTarget: DropTarget | null;
  /** 行内 mousedown 启动拖拽（不依赖 HTML5 DnD，兼容 Logseq iframe） */
  onRowMouseDown: (e: React.MouseEvent<HTMLDivElement>, path: string) => void;
  /** 请求编辑某层标签名称（弹出重命名卡片） */
  onRequestRename: (path: string) => void;
  /** 请求把其他标签并入此标签（进入多选模式） */
  onRequestMerge: (path: string) => void;
  /** 请求删除此标签（递归删除整棵子树，弹确认卡） */
  onRequestDelete: (path: string) => void;

  /** 非 null 时整棵树进入合并多选模式（禁用拖拽与行内打开页面） */
  mergeMode: MergeMode | null;

  /** 非 null 时整棵树进入筛选挑选模式（点击选择包含/排除，禁用拖拽与行内打开页面） */
  filterMode: FilterMode | null;

  orderMap: TagOrderMap;
  /** 搜索时非 null，仅渲染集合内节点并强制展开祖先链 */
  visibleSet: Set<string> | null;
};

export const TagTreeContext = React.createContext<TagTreeContextValue | null>(null);
