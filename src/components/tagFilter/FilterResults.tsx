import React, { useEffect, useState } from 'react';
import { styled } from '../../stitches.config';
import { t } from '../../i18n';
import { QueryResultBlockEntity, QueryResultPageEntity } from '../../logseqQueryResultTypes';
import { TagUsageEntity } from '../../types';
import { entityUuid, isPage, scrollToBlockReliably } from '../../utils';
import { filterEntityKey } from '../../tagModel/tagFilter';

/**
 * 筛选结果区：命中筛选的块 / tags:: 页面平铺列表。
 * 点击块内容 → 滚动定位到块；点击页面徽标 / 页面条目 → 打开对应页面。
 */

const Section = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  borderBottom: '1px solid $slate6',
});

const Header = styled('div', {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 8px',
  fontSize: '12px',
  fontWeight: 600,
  color: '$slate11',
  cursor: 'pointer',
  userSelect: 'none',
  backgroundColor: '$elevation1',
});

const List = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  padding: '2px 6px 6px',
});

const EntryRow = styled('div', {
  display: 'flex',
  alignItems: 'baseline',
  gap: '2px 6px',
  padding: '4px 6px',
  borderRadius: '$1',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1.5,
  color: '$slate12',
  '&:hover': { backgroundColor: '$elevation1' },
});

const PageBadge = styled('span', {
  fontSize: '11px',
  padding: '1px 6px',
  borderRadius: '4px',
  flexShrink: 0,
  backgroundColor: 'hsla(200, 85%, 45%, 0.14)',
  color: 'hsl(200, 85%, 38%)',
  cursor: 'pointer',
  maxWidth: '40%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '&:hover': { filter: 'brightness(0.96)' },
  '.dark-theme &': {
    backgroundColor: '$slate4',
    color: '$slate11',
  },
});

const ContentBox = styled('div', {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  minWidth: 0,
  flex: 1,
});

const TagSpan = styled('span', {
  color: 'hsl(152, 40%, 38%)',
  cursor: 'pointer',
  fontWeight: 500,
  '&:hover': { textDecoration: 'underline' },
  '.dark-theme &': { color: '$slate11' },
});

const LinkSpan = styled('span', {
  color: 'hsl(200, 70%, 40%)',
  cursor: 'pointer',
  '&:hover': { textDecoration: 'underline' },
  '.dark-theme &': { color: '$slate11' },
});

const EmptyHint = styled('div', {
  padding: '$3',
  fontSize: '12px',
  color: '$slate10',
  textAlign: 'center',
});

const CopyButton = styled('span', {
  fontSize: '12px',
  color: 'hsl(200, 70%, 45%)',
  cursor: 'pointer',
  userSelect: 'none',
  padding: '2px 6px',
  marginLeft: 'auto',
  flexShrink: 0,
  '&:hover': { textDecoration: 'underline' },
  '.dark-theme &': { color: '$slate11' },
});

type Props = {
  entities: TagUsageEntity[];
};

export function FilterResults({ entities }: Props) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  // 复制匹配结果为 Markdown 列表：块 → ((uuid)) 块引用；tags:: 页 → [[页面]] 链接。
  // 粘贴回 Logseq 即为可点击的活引用；iframe 下 clipboard API 可能被拒，退回 execCommand。
  const copyResults = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (entities.length === 0) return;
    const lines = entities.map((entity) => {
      if (isPage(entity)) {
        return `- [[${(entity as QueryResultPageEntity).name}]]`;
      }
      const uuid = entityUuid(entity);
      if (uuid) return `- ((${uuid}))`;
      const content = ((entity as QueryResultBlockEntity).content ?? '')
        .replace(/^(TODO|DOING|DONE|LATER|NOW)\s+/i, '')
        .replace(/\s*:LOGBOOK:[\s\S]*?:END:\s*/i, '')
        .replace(/\n+/g, ' ');
      return `- ${content}`;
    });
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Section>
      <Header onClick={() => setOpen((v) => !v)} title={open ? t('collapseResults') : t('expandResults')}>
        <svg
          viewBox="0 0 16 16"
          width="10"
          height="10"
          aria-hidden="true"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {t('matchedResults', { count: entities.length })}
        {entities.length > 0 && (
          <CopyButton
            onClick={(e) => void copyResults(e)}
            title={t('copyResultsTooltip')}
          >
            {copied ? t('copied') : t('copy')}
          </CopyButton>
        )}
      </Header>
      {open && (
        <List>
          {entities.length === 0 ? (
            <EmptyHint>{t('noFilterResults')}</EmptyHint>
          ) : (
            entities.map((entity, idx) => (
              <ResultEntry key={filterEntityKey(entity) || idx} entity={entity} />
            ))
          )}
        </List>
      )}
    </Section>
  );
}

/** 解析块内容中的 [[链接]] 与 #标签（对齐 TagUsage 的渲染方式），其余为纯文本 */
function renderParsed(content: string, onOpen: (name: string, e: React.MouseEvent) => void) {
  const regex = /\[\[([^\]]+)\]\]|#(\S+)/g;
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m.index > lastIndex) {
      out.push(<React.Fragment key={key++}>{content.slice(lastIndex, m.index)}</React.Fragment>);
    }
    if (m[1] !== undefined) {
      out.push(
        <LinkSpan key={key++} onClick={(e) => onOpen(m![1]!, e)}>
          {m[1]}
        </LinkSpan>,
      );
    } else {
      out.push(
        <TagSpan key={key++} onClick={(e) => onOpen(m![2]!, e)}>
          #{m[2]}
        </TagSpan>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    out.push(<React.Fragment key={key++}>{content.slice(lastIndex)}</React.Fragment>);
  }
  return out;
}

function ResultEntry({ entity }: { entity: TagUsageEntity }) {
  const isPageEntity = isPage(entity);
  const block = entity as QueryResultBlockEntity;
  const [pageName, setPageName] = useState<string | null>(null);

  useEffect(() => {
    if (isPageEntity) return;
    let mounted = true;
    logseq.Editor
      .getPage(block.page.id)
      .then((p) => {
        if (mounted) setPageName(p?.name ?? null);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isPageEntity, block.page.id]);

  const openPage = (name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    void logseq.App.pushState('page', { name });
  };

  const locateBlock = async () => {
    const uuid = entityUuid(entity);
    let page = pageName;
    if (!page) {
      const p = await logseq.Editor.getPage(block.page.id).catch(() => null);
      page = p?.name ?? null;
    }
    if (page && uuid) scrollToBlockReliably(page, uuid);
  };

  if (isPageEntity) {
    const page = entity as QueryResultPageEntity;
    return (
      <EntryRow onClick={(e) => openPage(page.name, e)} title={t('openThisPage')}>
        <PageBadge>{t('tagsPageBadge')}</PageBadge>
        {page.name}
      </EntryRow>
    );
  }

  const content = (block.content ?? '')
    .replace(/^(TODO|DOING|DONE|LATER|NOW)\s+/i, '')
    .replace(/\s*:LOGBOOK:[\s\S]*?:END:\s*/i, '');

  return (
    <EntryRow onClick={() => void locateBlock()} title={t('locateBlock')}>
      <PageBadge
        onClick={(e) => {
          if (pageName) openPage(pageName, e);
        }}
        title={pageName ? t('openPage', { name: pageName }) : undefined}
      >
        {pageName ?? '…'}
      </PageBadge>
      <ContentBox>{renderParsed(content, openPage)}</ContentBox>
    </EntryRow>
  );
}
