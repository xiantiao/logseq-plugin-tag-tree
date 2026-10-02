import React from 'react';
import { styled } from '../../stitches.config';
import { t } from '../../i18n';
import { selectionId, TagFilterState } from '../../tagModel/tagFilter';

/**
 * 筛选条件栏（对齐 PictureTag 的 filterBar）：
 * 组合方式徽标（且/或，点击切换）+ 包含 chips + 排除 chips（⊘ 前缀）+ 结果数 + 清除。
 * chip 主体点击 = 包含↔排除互转，× 移除。排除组恒为 AND-NOT，不参与且/或组合。
 */

const Bar = styled('div', {
  position: 'sticky',
  top: 0,
  zIndex: 40,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '6px',
  padding: '8px',
  backgroundColor: '$elevation0',
  borderBottom: '1px solid $slate6',
});

const CombinationBadge = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '3px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
  userSelect: 'none',
});

const Chip = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: '999px',
  fontSize: '12px',
  cursor: 'pointer',
  userSelect: 'none',
  maxWidth: '100%',
  overflow: 'hidden',
  '&:hover': { filter: 'brightness(0.95)' },
});

const ChipRemove = styled('span', {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 14,
  borderRadius: '50%',
  fontSize: 12,
  lineHeight: 1,
  flexShrink: 0,
  opacity: 0.85,
  '&:hover': { opacity: 1 },
});

const Hint = styled('span', {
  fontSize: '12px',
  color: '$slate10',
  userSelect: 'none',
});

const ClearButton = styled('span', {
  fontSize: '12px',
  color: 'hsl(0, 60%, 50%)',
  cursor: 'pointer',
  userSelect: 'none',
  padding: '2px 6px',
  flexShrink: 0,
  '&:hover': { textDecoration: 'underline' },
});

type Props = {
  state: TagFilterState;
  /** 当前命中数；null = 尚无有效筛选（不显示计数） */
  resultCount: number | null;
  onToggleCombination: () => void;
  /** chip 主体点击：包含 ↔ 排除互转 */
  onToggleChip: (id: string) => void;
  onRemoveChip: (id: string) => void;
  onClearAll: () => void;
};

export function FilterBar({
  state,
  resultCount,
  onToggleCombination,
  onToggleChip,
  onRemoveChip,
  onClearAll,
}: Props) {
  const active = state.includes.length > 0 || state.excludes.length > 0;
  const isOr = state.combination === 'or';
  const includeBg = isOr ? 'hsl(200, 70%, 50%)' : 'hsl(152, 40%, 45%)';

  return (
    <Bar>
      {state.includes.length > 1 && (
        <CombinationBadge
          onClick={onToggleCombination}
          title={t('combinationTooltip')}
          style={{
            backgroundColor: isOr ? 'hsla(200, 85%, 45%, 0.15)' : 'hsla(152, 40%, 40%, 0.14)',
            color: isOr ? 'hsl(200, 85%, 40%)' : 'hsl(152, 45%, 30%)',
          }}
        >
          {isOr ? t('or') : t('and')}
        </CombinationBadge>
      )}
      {state.includes.map((sel) => (
        <Chip
          key={selectionId(sel)}
          onClick={() => onToggleChip(selectionId(sel))}
          style={{ backgroundColor: includeBg, color: '#FFFFFF' }}
          title={
            sel.kind === 'concept'
              ? t('includeConceptChip', { name: sel.value })
              : t('includePathChip', { label: sel.label })
          }
        >
          {sel.label}
          <ChipRemove
            title={t('remove')}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveChip(selectionId(sel));
            }}
          >
            ×
          </ChipRemove>
        </Chip>
      ))}
      {state.excludes.map((sel) => (
        <Chip
          key={selectionId(sel)}
          onClick={() => onToggleChip(selectionId(sel))}
          style={{ backgroundColor: 'hsl(0, 62%, 50%)', color: '#FFFFFF' }}
          title={t('excludeChip', { label: sel.label })}
        >
          ⊘{sel.label}
          <ChipRemove
            title={t('remove')}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveChip(selectionId(sel));
            }}
          >
            ×
          </ChipRemove>
        </Chip>
      ))}
      {!active && <Hint>{t('filterHint')}</Hint>}
      {active && (
        <>
          {resultCount !== null && (
            <Hint style={{ marginLeft: 'auto' }}>{t('resultCount', { count: resultCount })}</Hint>
          )}
          <ClearButton onClick={onClearAll}>{t('clear')}</ClearButton>
        </>
      )}
    </Bar>
  );
}
