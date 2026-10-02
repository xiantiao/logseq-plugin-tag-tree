import * as Collapsible from '@radix-ui/react-collapsible';
import React, { useMemo, useState } from 'react';
import { styled } from '../../stitches.config';
import { t } from '../../i18n';
import { TagTreeNode } from '../../types';
import { TagEntry } from './TagEntry';
import { FilterCheck } from '../tagFilter';
import { getTagColorTheme, orderedChildNodes } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';
import { TagTreeContext } from './TagTreeContext';

const StyledTag = styled(Collapsible.Root, {
  display: 'flex',
  flexDirection: 'column',
  gap: '$1',
});

// 拖拽行容器：接收 top/bottom 插入线与 nested 高亮
const DropRow = styled('div', {
  position: 'relative',
  borderRadius: '$1',
  userSelect: 'none',
  '&[data-dragging="true"]': {
    opacity: '0.4',
  },
  '&[data-drop="nested"]': {
    backgroundColor: 'hsla(200, 85%, 60%, 0.14)',
    boxShadow: 'inset 0 0 0 2px hsl(200, 85%, 50%)',
  },
  '&[data-merge-selected="true"]': {
    backgroundColor: 'hsla(140, 60%, 45%, 0.12)',
  },
  '&[data-merge-disabled="true"]': {
    opacity: 0.4,
  },
});

const DropLine = styled('div', {
  position: 'absolute',
  right: '4px',
  height: '2px',
  borderRadius: '2px',
  backgroundColor: 'hsl(200, 85%, 48%)',
  pointerEvents: 'none',
  zIndex: 10,
});

const TagButton = styled('button', {
  all: 'unset',
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: '$3',
  padding: '$2',
  paddingLeft: '0',
  borderRadius: '$2',
  cursor: 'pointer',
  color: '$slate12',
  backgroundColor: 'transparent',
  transition: 'all 0.2s',
  '&:hover': {
    backgroundColor: '$elevation1',
  },

  variants: {
    expanded: {
      true: {
        // 彩色主题下的展开背景
        backgroundColor: 'hsla(var(--tag-hue), 34%, 95%, 0.5)',
        '.dark-theme &': {
          backgroundColor: '$slate4',
        },
      },
    },
    theme: {
      simple: {
        // 简单主题下的展开背景
        '&[data-expanded=true]': {
          backgroundColor: '$slate3',
        },
        '.dark-theme &[data-expanded=true]': {
          backgroundColor: '$slate6',
        },
      },
    },
  },
});
const IconWrapper = styled('div', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  marginLeft: '$2',
  transition: 'all 0.2s',
  '[data-state=open] &': {
    backgroundColor: 'hsla(var(--tag-hue), 34%, 35%, 1) !important',
  },
  '.dark-theme &[data-state=open]': {
    backgroundColor: '$slate7 !important',
  },

  variants: {
    theme: {
      simple: {
        backgroundColor: 'transparent !important',
        '[data-state=open] &': {
          backgroundColor: 'transparent !important',
        },
        '.dark-theme &': {
          backgroundColor: 'transparent !important',
        },
        '.dark-theme &[data-state=open]': {
          backgroundColor: 'transparent !important',
        },
      },
    },
  },
});
const Chevron = styled('svg', {
  width: '12px',
  height: '12px',
  transition: 'transform 250ms, color 0.2s',

  variants: {
    theme: {
      simple: {
        '& path': {
          stroke: '$slate12 !important',
        },
        '.dark-theme & path': {
          stroke: '$slate11 !important',
        },
      },
    },
  },
});
const TagName = styled('span', {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '$2',
});
const TagNameText = styled('span', {
  padding: '$1 $3',
  borderRadius: '20px',
  fontSize: '14px',
  fontWeight: '500',
  color: '#FFFFFF',
  cursor: 'pointer',
  transition: 'all 0.2s',
  '[data-state=open] &': {
    backgroundColor: 'hsla(var(--tag-hue), 34%, 45%, 1) !important',
    filter: 'brightness(1.1)',
  },
  '.dark-theme &': {
    backgroundColor: '$slate7 !important',
    color: '$slate12',
  },
  '.dark-theme &[data-state=open]': {
    backgroundColor: '$slate7 !important',
    filter: 'none',
  },

  variants: {
    theme: {
      simple: {
        backgroundColor: 'transparent !important',
        color: '$slate12',
        border: 'none !important',
        borderRadius: '0 !important',
        padding: '0 !important',
        '&:hover': {
          textDecoration: 'underline',
        },
        '[data-state=open] &': {
          backgroundColor: 'transparent !important',
          border: 'none !important',
          filter: 'none',
          fontWeight: '600',
        },
        '.dark-theme &': {
          backgroundColor: 'transparent !important',
          color: '$slate11',
          border: 'none !important',
        },
        '.dark-theme &[data-state=open]': {
          backgroundColor: 'transparent !important',
          border: 'none !important',
          color: '$slate12',
          fontWeight: '600',
        },
      },
    },
    // 纯虚拟路径节点（无概念页面）：斜体弱化，提示不可打开页面
    virtual: {
      true: {
        opacity: 0.72,
        fontStyle: 'italic',
      },
    },
  },
});
const TagCount = styled('span', {
  padding: '2px 6px',
  borderRadius: '10px',
  color: '$slate11',
  fontSize: '11px',
  fontWeight: '500',
  userSelect: 'none',
  backgroundColor: '$slate4',
  border: '1px solid $slate6',
  transition: 'all 0.2s',
  '[data-state=open] &': {
    backgroundColor: 'hsla(var(--tag-hue), 34%, 50%, 0.1)',
    borderColor: 'hsla(var(--tag-hue), 34%, 50%, 0.3)',
    color: 'hsla(var(--tag-hue), 54%, 40%, 1)',
  },
  '.dark-theme &[data-state=open]': {
    backgroundColor: '$slate4',
    borderColor: '$slate6',
    color: '$slate11',
  },

  variants: {
    theme: {
      simple: {
        backgroundColor: 'transparent !important',
        border: 'none !important',
        color: '$slate11',
        padding: '0 !important',
        borderRadius: '0 !important',
        '[data-state=open] &': {
          backgroundColor: 'transparent !important',
          border: 'none !important',
          color: '$slate11',
        },
        '.dark-theme &': {
          backgroundColor: 'transparent !important',
          border: 'none !important',
          color: '$slate10',
        },
        '.dark-theme &[data-state=open]': {
          backgroundColor: 'transparent !important',
          border: 'none !important',
          color: '$slate10',
        },
      },
    },
  },
});

// 行悬停时显示的操作按钮（TagButton 本身是 button，这里用 span 避免嵌套 button）
const EditButton = styled('span', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  marginRight: '$1',
  borderRadius: '$1',
  color: '$slate10',
  cursor: 'pointer',
  opacity: 0,
  flexShrink: 0,
  transition: 'opacity 0.15s, background-color 0.15s, color 0.15s',
  '[data-tag-path]:hover &': { opacity: 0.7 },
  '&:hover': { opacity: 1, backgroundColor: '$slate4', color: '$slate12' },
});

// 合并多选模式下的勾选圆圈
const MergeCheck = styled('span', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  marginLeft: '$2',
  flexShrink: 0,
  color: 'hsl(140, 55%, 42%)',
  '[data-merge-disabled="true"] &': { color: '$slate8' },
});

// 删除按钮（复用 EditButton 的交互，悬停时红色警示）
const DeleteButton = styled(EditButton, {
  '&:hover': { opacity: 1, backgroundColor: 'hsla(0, 70%, 50%, 0.14)', color: 'hsl(0, 70%, 50%)' },
});
const ContentWrapper = styled(Collapsible.Content, {
  paddingLeft: '24px',
});

type Props = {
  node: TagTreeNode;
  depth?: number;
};

function readExpanded(fullPath: string): boolean {
  try {
    const saved = localStorage.getItem('logseq-plugin-tags-expanded');
    const map = saved ? JSON.parse(saved) : {};
    return Boolean(map[fullPath]);
  } catch {
    return false;
  }
}

export function TagTreeEntry({ node, depth = 0 }: Props) {
  const ctx = React.useContext(TagTreeContext);

  const hasChildren = node.children.size > 0;
  const { isSimpleTheme } = useTheme();

  // 所有 hooks 必须无条件调用（修复原先叶子节点提前 return 违反 Rules of Hooks）
  const [usageOpen, setUsageOpen] = useState<boolean>(() => readExpanded(node.fullPath));

  // 概念节点按概念页名着色（同一概念在多个位置出现时颜色一致）；纯虚拟路径节点按路径着色
  const isConcept = node.conceptName !== null;
  const colorKey = node.conceptName ?? node.fullPath;
  const colorTheme = useMemo(() => getTagColorTheme(colorKey), [colorKey]);
  const hue = useMemo(() => {
    const match = colorTheme.light.match(/hsl\((\d+)/);
    return match ? match[1] : '0';
  }, [colorTheme]);

  // 子节点：先按自定义顺序，再按名称兜底；搜索时仅保留可见节点；合并模式下隐藏源标签
  const childNodes = useMemo(() => {
    if (!ctx) return [];
    let list = orderedChildNodes(
      node,
      ctx.orderMap[node.fullPath],
      (a, b) => a.name.localeCompare(b.name),
    );
    if (ctx.visibleSet) list = list.filter((child) => ctx.visibleSet!.has(child.fullPath));
    if (ctx.mergeMode) list = list.filter((child) => !ctx.mergeMode!.isHidden(child.fullPath));
    return list;
  }, [node, ctx]);

  if (!ctx) return null;

  const merge = ctx.mergeMode;
  const filter = ctx.filterMode;
  const filterStateOfNode = filter ? filter.stateOf(node.fullPath, node.conceptName) : null;

  // 合并模式下源标签自身不渲染，但在原位置展平其子树
  if (merge?.isHidden(node.fullPath)) {
    return (
      <>
        {childNodes.map((child) => (
          <TagTreeEntry key={child.fullPath} node={child} depth={depth} />
        ))}
      </>
    );
  }

  const mergeSelected = merge?.selected.has(node.fullPath) ?? false;
  const mergeSelectable = merge ? merge.isSelectable(node.fullPath) : true;

  // 搜索态强制展开祖先链（不写回 localStorage，避免破坏折叠状态）
  const open = ctx.visibleSet ? ctx.visibleSet.has(node.fullPath) : usageOpen;

  const handleOpenChange = (next: boolean) => {
    setUsageOpen(next);
    try {
      const saved = localStorage.getItem('logseq-plugin-tags-expanded');
      const map = saved ? JSON.parse(saved) : {};
      map[node.fullPath] = next;
      localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(map));
    } catch {}
  };

  const handleOpenPage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    // 纯虚拟路径节点没有页面，点击名称只触发展开/折叠（Collapsible.Trigger 默认行为）
    if (!node.conceptName) {
      handleOpenChange(!open);
      return;
    }
    await logseq.App.pushState('page', { name: node.conceptName });
  };

  const dropPosition =
    ctx.dropTarget?.path === node.fullPath ? ctx.dropTarget.position : null;
  const lineInset = depth * 24 + 6;

  // 基于 mousedown 的拖拽：行容器加 data-tag-path 供 elementFromPoint 定位；合并模式禁用
  const mouseHandlers =
    ctx.dragEnabled && !merge
      ? {
          onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
            ctx.onRowMouseDown(e, node.fullPath);
          },
        }
      : {};

  const handleNameClick = (e: React.MouseEvent) => {
    if (merge) {
      e.stopPropagation();
      if (mergeSelectable) merge.onToggle(node.fullPath);
      return;
    }
    void handleOpenPage(e);
  };

  // 行内公共内容（勾选圈 + chevron + 名称），merge 模式与普通模式复用
  const mergeChevron = merge && (
    <IconWrapper
      style={{ backgroundColor: 'transparent' }}
      onClick={(e) => {
        e.stopPropagation();
        handleOpenChange(!open);
      }}
    >
      <Chevron viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
        <path
          d="M6 4l4 4-4 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Chevron>
    </IconWrapper>
  );

  const rowContent = hasChildren ? (
    <StyledTag open={open} onOpenChange={handleOpenChange}>
      {filter ? (
        // 筛选挑选模式：整行即选择器（左键包含 / 右键排除），chevron 独立控制展开
        <TagButton
          as="div"
          style={{ '--tag-hue': hue } as React.CSSProperties}
          expanded={open}
          data-expanded={open}
          onClick={() => filter.onToggle(node.fullPath)}
          title={
            node.conceptName
              ? t('filterConceptRowTip')
              : t('filterPathRowTip')
          }
        >
          <FilterCheck state={filterStateOfNode} />
          <IconWrapper
            style={{ backgroundColor: 'transparent' }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChange(!open);
            }}
          >
            <Chevron viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              <path
                d="M6 4l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Chevron>
          </IconWrapper>
          <TagName>
            <TagNameText
              virtual={!isConcept || undefined}
              style={{
                // 筛选模式：固定深灰胶囊底保证白字可读（行内样式不支持 !important，
                // 深色主题由 .dark-theme 类规则接管为透明底+浅色字，不受影响）
                backgroundColor: 'hsl(215, 15%, 42%)',
              }}
              title={isConcept ? undefined : t('virtualPathTip')}
            >
              {node.name || 'Root'}
            </TagNameText>
          </TagName>
          <TagCount theme={isSimpleTheme ? 'simple' : undefined}>{node.totalCount}</TagCount>
        </TagButton>
      ) : merge ? (
        // 合并模式：不使用 Collapsible.Trigger，避免点击勾选时联动展开/折叠
        <TagButton
          as="div"
          style={{ '--tag-hue': hue, cursor: mergeSelectable ? 'pointer' : 'default' } as React.CSSProperties}
          expanded={open}
          data-expanded={open}
          onClick={handleNameClick}
        >
          <MergeCheck>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              {mergeSelected ? (
                <path
                  d="M8 1a7 7 0 100 14A7 7 0 008 1zm-1.2 9.8L4.3 8.3l.9-.9 1.6 1.6 3.4-3.4.9.9-4.3 4.3z"
                  fill="currentColor"
                />
              ) : (
                <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
              )}
            </svg>
          </MergeCheck>
          {mergeChevron}
          <TagName>
            <TagNameText
              virtual={!isConcept || undefined}
              style={{
                backgroundColor: 'transparent !important',
                border: 'none !important',
                borderRadius: '0 !important',
                padding: '0 !important',
                color: '$slate12',
                cursor: mergeSelectable ? 'pointer' : 'default',
              }}
              title={isConcept ? undefined : t('virtualPathTip')}
            >
              {node.name || 'Root'}
            </TagNameText>
          </TagName>
        </TagButton>
      ) : (
        <Collapsible.Trigger asChild>
          <TagButton
            style={{ '--tag-hue': hue } as React.CSSProperties}
            theme={isSimpleTheme ? 'simple' : undefined}
            expanded={open}
            data-expanded={open}
          >
            <IconWrapper
              style={{ backgroundColor: isSimpleTheme ? 'transparent' : colorTheme.regular }}
              theme={isSimpleTheme ? 'simple' : undefined}
            >
              <Chevron
                viewBox="0 0 16 16"
                aria-hidden="true"
                style={{
                  transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
                }}
                theme={isSimpleTheme ? 'simple' : undefined}
              >
                <path
                  d="M6 4l4 4-4 4"
                  fill="none"
                  stroke={isSimpleTheme ? 'currentColor' : '#FFFFFF'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Chevron>
            </IconWrapper>
            <TagName>
              <TagNameText
                virtual={!isConcept || undefined}
                style={{
                  backgroundColor: isSimpleTheme ? 'transparent !important' : colorTheme.regular,
                  border: isSimpleTheme ? 'none !important' : undefined,
                  borderRadius: isSimpleTheme ? '0 !important' : undefined,
                  padding: isSimpleTheme ? '0 !important' : undefined,
                }}
                theme={isSimpleTheme ? 'simple' : undefined}
                onClick={handleOpenPage}
                title={
                  isConcept
                    ? t('openConceptPage', { name: node.conceptName ?? '' })
                    : t('virtualPathToggleTip')
                }
              >
                {node.name || 'Root'}
              </TagNameText>
            </TagName>
            <TagCount theme={isSimpleTheme ? 'simple' : undefined}>{node.totalCount}</TagCount>
            <EditButton
              title={isConcept ? t('renameConceptTag') : t('renameLevelPath')}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onRequestRename(node.fullPath);
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path
                  d="M11.3 2.3l2.4 2.4-7.6 7.6-2.9.7.7-2.9 7.4-7.8z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </EditButton>
            {isConcept && (
              <EditButton
                title={t('mergeOthersInto')}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onRequestMerge(node.fullPath);
                }}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
                  <path
                    d="M2 3.5l5.2 4.5L2 12.5M8.8 3.5l5.2 4.5-5.2 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </EditButton>
            )}
            <DeleteButton
              title={
                isConcept ? t('removePositionTip') : t('deleteLevelPath')
              }
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                ctx.onRequestDelete(node.fullPath);
              }}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path
                  d="M2.5 4h11M6.2 4V2.8h3.6V4M3.5 4l.7 9.2h7.6L12.5 4M6.5 6.5v4M9.5 6.5v4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </DeleteButton>
          </TagButton>
        </Collapsible.Trigger>
      )}
      <ContentWrapper>
        {childNodes.map((child) => (
          <TagTreeEntry key={child.fullPath} node={child} depth={depth + 1} />
        ))}
      </ContentWrapper>
    </StyledTag>
  ) : (
    // 叶子节点必为概念节点：tag.name 传概念页名（打开页面正确），treePath 传完整虚拟路径
    <TagEntry
      tag={{ name: node.conceptName ?? node.fullPath, usages: node.selfUsages }}
      displayName={node.name}
      treePath={node.fullPath}
    />
  );

  return (
    <DropRow
      {...mouseHandlers}
      {...(filter
        ? {
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              filter.onToggleExclude(node.fullPath);
            },
          }
        : {})}
      data-tag-path={node.fullPath}
      data-dragging={ctx.activeDragPath === node.fullPath || undefined}
      data-drop={dropPosition ?? undefined}
      data-merge-selected={merge && mergeSelected ? true : undefined}
      data-merge-disabled={merge && !mergeSelectable ? true : undefined}
    >
      {dropPosition === 'top' && <DropLine style={{ top: 0, left: lineInset }} />}
      {rowContent}
      {dropPosition === 'bottom' && <DropLine style={{ bottom: 0, left: lineInset }} />}
    </DropRow>
  );
}
