import { AppUserConfigs } from '@logseq/libs/dist/LSPlugin';
import { Input } from 'components/Input';
import { useThemeMode } from 'hooks/useThemeMode';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import foldIcon from '../fold-svgrepo-com.svg';
import { t } from './i18n';
import { TagList } from './components/TagList';
import { useAppVisible } from './hooks/useAppVisible';
import { usePluginSettings } from './hooks/usePluginSettings';
import { ThemeProvider } from './contexts/ThemeContext';
import { css, darkTheme } from './stitches.config';

const body = css({
  position: 'relative',
  height: '100%',

  '& ::-webkit-scrollbar': {
    width: '6px',
  },
  '& ::-webkit-scrollbar-corner': {
    background: '0 0',
  },
  '& ::-webkit-scrollbar-thumb': {
    backgroundColor: '$interactiveBorder',
  },
});

const app = css({
  position: 'absolute',
  top: 'calc(48px + $4)',
  bottom: '$2',
  right: '$4',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '$3',
  backgroundColor: '$elevation0',
  borderRadius: '$2',
  padding: '$4',
  maxWidth: '50%',
  overflow: 'auto',
  minWidth: '180px',
  // 固定高度下内部滚动，且禁止原生 resize
  resize: 'none',
  borderLeft: '4px solid transparent',

  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  
  variants: {
    pinned: {
      true: {
        position: 'fixed',
        zIndex: 11,
      },
    },
  },
});

// 去除宽度拖拽手柄

const searchContainer = css({
  display: 'flex',
  gap: '$2',
  alignItems: 'center',
});

const actionButton = css({
  padding: '$2',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '$2',
  cursor: 'pointer',
  border: 'none',
  color: '#FFFFFF',
  fontSize: '14px',
  transition: 'all 0.2s',
  '&:hover': {
    filter: 'brightness(0.95)',
  },
  
  variants: {
    type: {
      sort: {
        backgroundColor: 'hsl(152, 33%, 60%)',
      },
      drag: {
        backgroundColor: 'hsl(200, 50%, 60%)',
      },
      pin: {
        backgroundColor: 'hsl(45, 70%, 60%)',
      },
      menu: {
        backgroundColor: 'transparent',
      },
    },
    active: {
      true: {
        backgroundColor: 'hsl(220, 70%, 50%)',
        transform: 'scale(0.95)',
      },
    },
  },
});

const iconBtn = css({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  padding: '0',
  cursor: 'pointer',
  // 主题感知的图标颜色：深色主题下为接近白色，亮色主题下为深色
  color: '$highContrast',
});

type Props = {
  themeMode: AppUserConfigs['preferredThemeMode'];
  placement?: 'overlay' | 'sidebar';
};

const appSidebar = css({
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: '$3',
  backgroundColor: '$elevation0',
  padding: '$3',
  width: '100%',
  height: '100%',
  overflow: 'auto',
});

export function App({ themeMode: initialThemeMode, placement = 'overlay' }: Props) {
  const innerRef = useRef<HTMLDivElement>(null);
  const isVisible = useAppVisible();
  const [filter, setFilter] = useState('');
  const [expandNext, setExpandNext] = useState(true);
  const [apply, setApply] = useState<{ version: number; expand: boolean }>({ version: 0, expand: true });
  // 手动刷新信号：变化时通知 TagList 重新查询
  const [refreshSignal, setRefreshSignal] = useState(0);
  // 标签筛选模式：开启后标签树变为筛选挑选器（且 / 或 / 除）
  const [tagFilterOn, setTagFilterOn] = useState(false);
  // 拖拽排序默认开启，无需开关
  const themeMode = useThemeMode(initialThemeMode);
  const { settings, updateSetting } = usePluginSettings();

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value);
  };

  const toggleSort = () => {
    updateSetting('sortAscending', !settings.sortAscending);
  };

  // 无拖拽开关

  const togglePin = () => {
    updateSetting('isPinned', !settings.isPinned);
  };

  // 移除宽度拖拽

  // 移除宽度持久化

  // 覆盖层版本：不再切换 pointer-events，统一保持可交互

  if (placement === 'sidebar') {
    return (
      <div className={`${themeMode === 'dark' ? darkTheme.className : ''} ${appSidebar()}`}>
        {/* 左侧栏版本：列表（此处不启用拖拽） */}
        <TagList 
          filter={filter} 
          sortAscending={settings.sortAscending}
          enableDragSort={false}
        />
      </div>
    );
  }

  if (isVisible) {
    return (
      <main
        className={`${body()} ${themeMode === 'dark' ? darkTheme.className : ''}`}
        onClick={e => {
          try {
            if (!innerRef.current?.contains(e.target as any)) {
              window.logseq?.hideMainUI?.();
            }
          } catch (error) {
            console.error('Error handling click:', error);
          }
        }}
        style={{ pointerEvents: 'auto' }}
      >
        <div
          ref={innerRef}
          className={app({ pinned: settings.isPinned })}
          // 当固定时，只允许面板本身交互，其余区域可点击
          style={{ pointerEvents: 'auto' }}
        >
          {/* 搜索 + 菜单按钮 */}
          <div className={searchContainer()}>
            <div className={css({ position: 'relative', flex: 1, display: 'flex', minWidth: 0 })()}>
              <Input
                css={{ flex: 1, padding: '$3', borderRadius: '$2' }}
                size='2'
                placeholder='Search tags'
                value={filter}
                onChange={handleSearchInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setFilter('');
                }}
              />
              {filter.trim() !== '' && (
                <button
                  className={css({
                    position: 'absolute',
                    right: '$3',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    padding: '$1',
                    color: '#8b949e',
                    fontSize: '13px',
                    lineHeight: 1,
                  })()}
                  title={t('exitSearch')}
                  onClick={() => setFilter('')}
                >
                  ✕
                </button>
              )}
            </div>
            <button
              className={iconBtn()}
              title={tagFilterOn ? t('exitTagFilter') : t('tagFilterTooltip')}
              onClick={() => setTagFilterOn(v => !v)}
              style={tagFilterOn ? {
                backgroundColor: 'hsla(200, 85%, 50%, 0.16)',
                borderRadius: '4px',
                color: 'hsl(200, 85%, 45%)',
              } : undefined}
            >
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                aria-hidden="true"
                style={{ opacity: 0.85 }}
              >
                <path
                  d="M2 3h12l-4.6 5.3v4.2L7.6 11V8.3L2 3z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={iconBtn()}
              title='Refresh tags'
              onClick={() => setRefreshSignal(v => v + 1)}
            >
              <span style={{ fontSize: 16, lineHeight: 1, opacity: 0.85 }}>↻</span>
            </button>
            <button
              className={iconBtn()}
              title={expandNext ? t('expandAll') : t('collapseAll')}
              onClick={() => {
                try {
                  // 直接使用当前状态决定操作
                  const willExpand = expandNext;
                  
                  // 应用操作
                  setApply(prev => ({ version: prev.version + 1, expand: willExpand }));
                  
                  // 切换状态为相反操作
                  setExpandNext(!willExpand);
                } catch {
                  setApply(prev => ({ version: prev.version + 1, expand: true }));
                  setExpandNext(false);
                }
              }}
            >
              <img
                src={foldIcon}
                alt='toggle expand'
                style={{
                  width: 18,
                  height: 18,
                  transform: expandNext ? 'rotate(180deg)' : 'none',
                  opacity: 0.9,
                  // 深色模式下将图标反相以变为白色，提升可见性
                  filter: themeMode === 'dark' ? 'invert(1)' : 'none',
                }}
              />
            </button>
          </div>
          <ThemeProvider settings={{ theme: logseq.settings?.theme || 'colorful', shortcut: logseq.settings?.shortcut || 'mod+shift+t' }}>
            <TagList
              filter={filter}
              sortAscending={settings.sortAscending}
              enableDragSort={true}
              refresh={apply.version}
              applyExpand={apply}
              refreshSignal={refreshSignal}
              tagFilter={tagFilterOn}
            />
          </ThemeProvider>
        </div>
      </main>
    );
  }

  return null;
}

export default App;
