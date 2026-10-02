import * as Collapsible from '@radix-ui/react-collapsible';
import React, { useMemo, useState } from 'react';
import { styled } from 'stitches.config';
import { t } from '../../i18n';
import { Tag } from 'types';
import { getTagColorTheme } from '../../utils';
import { useTheme } from '../../contexts/ThemeContext';
import { FilterCheck } from '../tagFilter';
import { TagUsage } from './TagUsage';
import { TagTreeContext } from './TagTreeContext';

const StyledTag = styled(Collapsible.Root, {
  display: 'flex',
  flexDirection: 'column',
  gap: '$1',
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
  // 暗黑模式：统一为中性的圆点色
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
  '[data-state=open] &': {
    transform: 'rotate(90deg)',
  },
  
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
  // 暗黑模式：统一使用透明背景和边框
  '.dark-theme &': {
    backgroundColor: 'transparent !important',
    color: '$slate11',
    border: '1px solid $slate7',
  },
  '.dark-theme &[data-state=open]': {
    backgroundColor: 'transparent !important',
    border: '1px solid $slate8',
    color: '$slate12',
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
  // 暗黑模式：统一为中性方案
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

const ContentWrapper = styled(Collapsible.Content, {
  paddingLeft: '24px',
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

type Props = {
  tag: Tag;
  // 可选：覆盖显示名称（不影响打开页面与着色）
  displayName?: string;
  // 该概念在虚拟层级树中的完整路径（展开状态/合并勾选/拖拽操作以此为准）
  treePath: string;
};

export function TagEntry({ tag, displayName, treePath }: Props) {
  const [usageOpen, setUsageOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('logseq-plugin-tags-expanded');
      const map = saved ? JSON.parse(saved) : {};
      return Boolean(map[treePath]);
    } catch {
      return false;
    }
  });

  const { isSimpleTheme } = useTheme();
  const treeCtx = React.useContext(TagTreeContext);
  const merge = treeCtx?.mergeMode ?? null;
  const filter = treeCtx?.filterMode ?? null;
  const mergeSelected = merge?.selected.has(treePath) ?? false;
  const mergeSelectable = merge ? merge.isSelectable(treePath) : true;
  const filterStateOf = filter ? filter.stateOf(treePath, tag.name) : null;
  
  // 获取标签的颜色主题
  const colorTheme = useMemo(() => getTagColorTheme(tag.name), [tag.name]);
  
  // 从颜色中提取色相值
  const hue = useMemo(() => {
    const match = colorTheme.light.match(/hsl\((\d+)/);
    return match ? match[1] : '0';
  }, [colorTheme]);

  const handleOpenPage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await logseq.App.pushState('page', { name: tag.name });
  };

  // 持久化展开状态（以虚拟树完整路径为 key）
  const handleOpenChange = (open: boolean) => {
    setUsageOpen(open);
    try {
      const saved = localStorage.getItem('logseq-plugin-tags-expanded');
      const map = saved ? JSON.parse(saved) : {};
      map[treePath] = open;
      localStorage.setItem('logseq-plugin-tags-expanded', JSON.stringify(map));
    } catch {}
  };

  // 筛选挑选模式：整行即选择器（左键包含 / 右键排除），不展示用法列表，保持树紧凑
  if (filter) {
    return (
      <StyledTag
        open={usageOpen}
        onOpenChange={handleOpenChange}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          filter.onToggleExclude(treePath);
        }}
      >
        <TagButton
          as="div"
          style={{ '--tag-hue': hue } as any}
          expanded={usageOpen}
          data-expanded={usageOpen}
          onClick={() => filter.onToggle(treePath)}
          title={t('filterConceptRowTip')}
        >
          <FilterCheck state={filterStateOf} />
          <IconWrapper
            style={{ backgroundColor: 'transparent' }}
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChange(!usageOpen);
            }}
          >
            <Chevron viewBox="0 0 16 16" aria-hidden="true" style={{ transform: usageOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
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
              style={{
                // 筛选模式：固定深灰胶囊底保证白字可读（React 行内样式不支持 !important，
                // 原来的 transparent !important 等写法会被浏览器忽略，导致浅色主题白字无底色不可见）
                backgroundColor: 'hsl(215, 15%, 42%)',
              }}
            >
              {displayName ?? tag.name}
            </TagNameText>
          </TagName>
          <TagCount theme={isSimpleTheme ? 'simple' : undefined}>{tag.usages.length}</TagCount>
        </TagButton>
      </StyledTag>
    );
  }

  return (
    <StyledTag open={usageOpen} onOpenChange={handleOpenChange}>
      {merge ? (
        // 合并模式：不使用 Collapsible.Trigger，避免点击勾选时联动展开/折叠
        <TagButton
          as="div"
          style={{ '--tag-hue': hue, cursor: mergeSelectable ? 'pointer' : 'default' } as any}
          expanded={usageOpen}
          data-expanded={usageOpen}
          onClick={() => {
            if (mergeSelectable) merge.onToggle(treePath);
          }}
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
          <IconWrapper style={{ backgroundColor: 'transparent' }}>
            <Chevron viewBox="0 0 16 16" aria-hidden="true" style={{ transform: usageOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
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
              style={{
                backgroundColor: 'transparent !important',
                border: 'none !important',
                borderRadius: '0 !important',
                padding: '0 !important',
                cursor: mergeSelectable ? 'pointer' : 'default',
              }}
            >
              {displayName ?? tag.name}
            </TagNameText>
          </TagName>
        </TagButton>
      ) : (
        <Collapsible.Trigger asChild>
          <TagButton
            style={{ '--tag-hue': hue } as any}
            theme={isSimpleTheme ? 'simple' : undefined}
            expanded={usageOpen}
            data-expanded={usageOpen}
          >
            <IconWrapper
              style={{ backgroundColor: isSimpleTheme ? 'transparent' : colorTheme.regular }}
              theme={isSimpleTheme ? 'simple' : undefined}
            >
              <Chevron
                viewBox="0 0 16 16"
                aria-hidden="true"
                style={{ transform: usageOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
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
                style={{
                  backgroundColor: isSimpleTheme ? 'transparent !important' : colorTheme.regular,
                  border: isSimpleTheme ? 'none !important' : undefined,
                  borderRadius: isSimpleTheme ? '0 !important' : undefined,
                  padding: isSimpleTheme ? '0 !important' : undefined,
                }}
                theme={isSimpleTheme ? 'simple' : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenPage(e);
                }}
                title={t('openConceptPage', { name: tag.name })}
              >
                {displayName ?? tag.name}
              </TagNameText>
            </TagName>
            <TagCount theme={isSimpleTheme ? 'simple' : undefined}>
              {tag.usages.length}
            </TagCount>
            {treeCtx && (
              <>
                <EditButton
                  title={t('renameConceptTag')}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    treeCtx.onRequestRename(treePath);
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
                <EditButton
                  title={t('mergeOthersInto')}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    treeCtx.onRequestMerge(treePath);
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
                <DeleteButton
                  title={t('removePositionTip')}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    treeCtx.onRequestDelete(treePath);
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
              </>
            )}
          </TagButton>
        </Collapsible.Trigger>
      )}
      {!merge && (
        <ContentWrapper>
          <TagUsage usages={tag.usages} />
        </ContentWrapper>
      )}
    </StyledTag>
  );
}
