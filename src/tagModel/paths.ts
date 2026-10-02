/**
 * 行内标签模型（v3）：
 *
 * 层级写法直接保存在正文里，不写任何块属性：
 *   a/b/#c   -> 层级路径 a/b，概念 c
 *   D/#c     -> 层级路径 D，概念 c
 *   #c       -> 根级概念 c
 *   #a/b/c   -> 旧版写法（Logseq 指向页面 a/b/c），由迁移命令改写为 a/b/#c
 *
 * 同一块内可含任意多个不同路径的标签（a/b/#c D/#c F/#c），
 * 概念 = 末段 = 唯一真实页面（Logseq 原生把 #c 链接到页面 c），
 * 中间路径节点是纯虚拟节点。所有操作只改写行内前缀文本。
 *
 * 本模块只放纯函数，便于测试与在 watcher / 迁移 / 树构建之间复用。
 */

/** 单个层级段允许的字符：Unicode 字母 / 数字 / 下划线 / 连字符（与 Logseq 标签字符集对齐） */
const SEG = String.raw`[\p{L}\p{N}_][\p{L}\p{N}_\-]*`;
const SEG_RE = new RegExp(`^${SEG}$`, 'u');
/** 一个或多个层级段 + 结尾斜杠，例如 a/b/ */
const PREFIX = String.raw`(?:${SEG}/)+`;

/**
 * 快捷写法 a/b/#c（逐行使用，不要带 m 标志）：
 * group 1 = 前缀边界字符（行首或非标签字符，替换时保留；排除 / . : 以免匹配 URL 域名片段）
 * group 2 = 路径前缀（含结尾 /）
 * group 3 = #[[多词标签]] 形式的概念名
 * group 4 = #单词标签 形式的概念名
 */
const SHORTHAND_RE = new RegExp(
  `(^|[^\\p{L}\\p{N}_\\-/.:])(${PREFIX})#(?:\\[\\[([^\\]]+)\\]\\]|(${SEG}))`,
  'gu',
);

/**
 * 普通标签 / 旧版层级标签（逐行使用）：
 * group 1 = #[[...]] 形式的标签名
 * group 2 = #单词 形式的标签名（可含 /，此时是旧版层级写法 #a/b/c）
 */
const PLAIN_RE = /#(?:\[\[([^\]]+)\]\]|([^\s#[\]]+))/g;

/** 判断一行是否为任意属性行（key:: value） */
function isPropertyLine(line: string): boolean {
  return /^[ \t]*[A-Za-z_][\w.-]*::/.test(line);
}

/** 拆分 / 校验层级段，返回 null 表示非法路径 */
export function normalizePath(raw: string): string | null {
  const parts = raw
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.some((p) => !SEG_RE.test(p))) return null;
  return parts.join('/');
}

/** 概念标签的引用文本：合法单段用 #c，含空格等字符用 #[[c]] */
function conceptRef(concept: string): string {
  return SEG_RE.test(concept) ? `#${concept}` : `#[[${concept}]]`;
}

export type InlineOccurrence = {
  /** 层级路径（'' = 根级），保留原文大小写 */
  path: string;
  /** 概念页面名（末段），保留原文大小写 */
  concept: string;
  /** 是否旧版写法 #a/b/c（Logseq 实际引用 path/concept 整体页面） */
  legacy: boolean;
  /** 完整匹配文本，例如 a/b/#c 或 #a/b/c */
  fullMatch: string;
  /** 非旧版写法时原始的标签引用部分（#c 或 #[[c]]），用于改写时保留原样式 */
  ref: string;
  /** 在整块内容中的起止下标 */
  start: number;
  end: number;
};

/** remap 回调可见的精简信息 */
export type InlineTag = {
  path: string;
  concept: string;
  legacy: boolean;
};

/**
 * 解析块内容中的全部层级标签出现位置。
 * 跳过 ``` / ~~~ 代码围栏与 key:: 属性行；
 * 快捷写法（a/b/#c）优先，其内部的 #c 不会重复报告为根级标签。
 */
export function parseInlineTags(content: string): InlineOccurrence[] {
  const out: InlineOccurrence[] = [];
  let inFence = false;
  let offset = 0;

  for (const line of content.split('\n')) {
    const lineStart = offset;
    offset += line.length + 1;

    if (/^[ \t]*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || isPropertyLine(line)) continue;

    const ranges: Array<[number, number]> = [];

    SHORTHAND_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SHORTHAND_RE.exec(line)) !== null) {
      const prefix = m[2].slice(0, -1); // 去掉结尾 /
      if (prefix.includes('://')) continue; // 排除 URL
      const path = normalizePath(prefix);
      const rawTag = (m[3] ?? m[4] ?? '').trim();
      if (!path || !rawTag) continue;
      // 概念必须是单一页面：括号形式允许空格但不能有 /，普通形式必须是合法单段
      if (rawTag.includes('/')) continue;
      // fullMatch 不含前导边界字符（保留原文空格等）
      const start = lineStart + m.index + m[1].length;
      const end = lineStart + m.index + m[0].length;
      ranges.push([start, end]);
      out.push({
        path,
        concept: rawTag,
        legacy: false,
        fullMatch: m[0].slice(m[1].length),
        ref: m[0].slice(m[1].length + m[2].length),
        start,
        end,
      });
    }

    PLAIN_RE.lastIndex = 0;
    while ((m = PLAIN_RE.exec(line)) !== null) {
      const start = lineStart + m.index;
      const end = start + m[0].length;
      // 已被快捷写法覆盖的位置不重复解析
      if (ranges.some(([s, e]) => start >= s && start < e)) continue;
      const tag = (m[1] ?? m[2] ?? '').trim();
      if (!tag) continue;
      if (tag.includes('/')) {
        // 旧版写法：#a/b/c -> 路径 a/b + 概念 c（Logseq 引用页面 a/b/c）
        const parts = tag.split('/');
        const concept = parts.pop()!.trim();
        const path = normalizePath(parts.join('/'));
        if (!concept || !path) continue;
        out.push({ path, concept, legacy: true, fullMatch: m[0], ref: m[0], start, end });
      } else {
        out.push({ path: '', concept: tag, legacy: false, fullMatch: m[0], ref: m[0], start, end });
      }
    }
  }
  return out;
}

/**
 * 对块内所有层级标签出现位置做映射改写；fn 返回 null 表示保持不动。
 * 返回的新路径 '' 表示移除前缀、回到根级（#c）。
 * 旧版写法一旦被映射会同时规范化为 a/b/#c 形式；非旧版写法保留原引用样式。
 */
export function remapInlineTags(
  content: string,
  fn: (tag: InlineTag) => string | null,
): { content: string; changed: boolean } {
  const occ = parseInlineTags(content);
  if (occ.length === 0) return { content, changed: false };

  let result = content;
  let changed = false;
  // 倒序替换，避免下标失效
  for (let i = occ.length - 1; i >= 0; i--) {
    const o = occ[i];
    const newPath = fn({ path: o.path, concept: o.concept, legacy: o.legacy });
    if (newPath === null) continue;
    const normalized = newPath === '' ? '' : normalizePath(newPath);
    if (normalized === null) continue;
    const ref = o.legacy ? conceptRef(o.concept) : o.ref;
    const text = normalized === '' ? ref : `${normalized}/${ref}`;
    if (text === o.fullMatch) continue;
    result = result.slice(0, o.start) + text + result.slice(o.end);
    changed = true;
  }
  return { content: result, changed };
}

/**
 * 剥离块内「根级」的指定概念标签（#c / #[[c]]，以及旧版 #x/c 的根级形式不存在）。
 * 只剥离根级出现位置：子层级里的 a/b/#c 属于其他位置节点，不受影响。
 */
export function stripInlineConceptRefs(content: string, concept: string): string {
  const lower = concept.toLowerCase();
  const hits = parseInlineTags(content).filter(
    (o) => o.path === '' && o.concept.toLowerCase() === lower,
  );
  let result = content;
  for (let i = hits.length - 1; i >= 0; i--) {
    const o = hits[i];
    result = result.slice(0, o.start) + result.slice(o.end);
  }
  return result;
}

/** 移除块内容中的 path:: 属性行（早期版本遗留数据的清理） */
export function stripPathPropertyLines(content: string): string {
  return content
    .split('\n')
    .filter((line) => !/^[ \t]*path::/.test(line))
    .join('\n');
}

export type LegacyMigration = {
  /** 改写后的内容（无变化则为 null） */
  content: string | null;
  /** 被迁移的旧页面全名，例如 a/b/c */
  oldNames: string[];
};

/**
 * 把块内容中的旧版层级标签迁移为行内快捷写法：
 *   #a/b/c    -> a/b/#c
 *   #[[a/b/c]] -> a/b/#c
 * 普通 #c、不含 / 的标签与普通文本不动；path:: 属性行一并清除。
 */
export function migrateLegacyContent(content: string): LegacyMigration {
  const legacyHits = parseInlineTags(content).filter((o) => o.legacy);
  const cleaned = stripPathPropertyLines(content);
  if (legacyHits.length === 0) {
    return { content: cleaned !== content ? cleaned : null, oldNames: [] };
  }
  const oldNames = [...new Set(legacyHits.map((o) => `${o.path}/${o.concept}`))];
  const result = remapInlineTags(cleaned, (tag) => (tag.legacy ? tag.path : null));
  return { content: result.changed ? result.content : null, oldNames };
}
