import React from 'react';
import { styled } from '../../stitches.config';

/**
 * 筛选挑选模式下的行首状态圈（对齐合并模式的 MergeCheck 交互）：
 * - included：绿底对勾（已加入包含组）
 * - excluded：红圈斜线（已加入排除组）
 * - null：空圈（未选）
 */
const CheckCircle = styled('span', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '20px',
  height: '20px',
  marginLeft: '$2',
  flexShrink: 0,

  variants: {
    state: {
      included: { color: 'hsl(152, 55%, 42%)' },
      excluded: { color: 'hsl(0, 65%, 50%)' },
      off: { color: '$slate8' },
    },
  },
});

export function FilterCheck({ state }: { state: 'included' | 'excluded' | null }) {
  return (
    <CheckCircle state={state ?? 'off'}>
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        {state === 'included' ? (
          <path
            d="M8 1a7 7 0 100 14A7 7 0 008 1zm-1.2 9.8L4.3 8.3l.9-.9 1.6 1.6 3.4-3.4.9.9-4.3 4.3z"
            fill="currentColor"
          />
        ) : state === 'excluded' ? (
          <>
            <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M3.9 3.9l8.2 8.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </>
        ) : (
          <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.2" />
        )}
      </svg>
    </CheckCircle>
  );
}
