import { QueryResultBlockEntity, QueryResultPageEntity } from 'logseqQueryResultTypes';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ConceptLocation, entityUuid } from '../utils';
import { parseInlineTags } from '../tagModel/paths';
import { useMountedState } from './useMountedState';

type Entity = QueryResultBlockEntity | QueryResultPageEntity;

/**
 * v3 数据模型（行内文本）：
 * - 概念 = 末段标签页（#c 始终指向页面 c）
 * - 层级 = 行内写法的前缀（a/b/#c 表示该标签位于 a/b 之下），同一块可含多个不同路径
 *
 * 返回按「位置」聚合的用法列表：同一概念在不同路径下是不同的 location，
 * 树构建器负责把它们挂到对应虚拟路径节点下。
 * 路径与概念统一转小写分组（Logseq 页面名不区分大小写）。
 */
export function useTagTreeData(refreshKey = 0): ConceptLocation[] {
  const isMounted = useMountedState();
  const [rawBlockRefs, setRawBlockRefs] = useState<[string, string, QueryResultBlockEntity][]>([]);
  const [rawPageTags, setRawPageTags] = useState<[string, QueryResultPageEntity][]>([]);

  useLayoutEffect(() => {
    (async () => {
      const rawBlockRefs = await logseq.DB.datascriptQuery(`
        [:find ?content ?tag (pull ?b [*])
          :where
          [?b :block/refs ?page-ref]
          [?b :block/content ?content]
          [?page-ref :block/name ?tag]
        ]
      `);

      const rawPageTags = await logseq.DB.datascriptQuery(`
        [:find ?tag (pull ?page [*])
          :where
          [?page :block/tags ?tag-ref]
          [?tag-ref :block/name ?tag]
        ]
      `);

      if (isMounted()) {
        setRawBlockRefs(rawBlockRefs);
        setRawPageTags(rawPageTags);
      }
    })();
  }, [refreshKey, isMounted]);

  return useMemo(() => {
    // key = `${path}\u0000${concept}`，value 内含按 uuid 去重的块
    const locations = new Map<string, { path: string; concept: string; entities: Entity[] }>();
    const seen = new Map<string, Set<string>>();

    const addUsage = (path: string, concept: string, entity: Entity, dedupKey: string) => {
      const key = `${path}\u0000${concept}`;
      let seenSet = seen.get(key);
      if (!seenSet) {
        seenSet = new Set<string>();
        seen.set(key, seenSet);
      }
      if (seenSet.has(dedupKey)) return;
      seenSet.add(dedupKey);

      let location = locations.get(key);
      if (!location) {
        location = { path, concept, entities: [] };
        locations.set(key, location);
      }
      location.entities.push(entity);
    };

    // 1) 块级行内标签：先用 refs 查询建立「块 -> 引用页面名集合」索引，
    //    再解析正文中的层级写法，只有 Logseq 真正建立了页面引用的出现位置才入库
    const refsByBlock = new Map<string, Set<string>>();
    const blocksByKey = new Map<string, QueryResultBlockEntity>();

    for (const [, tagName, block] of rawBlockRefs) {
      const key = entityUuid(block) ?? String(block.id);
      const lower = (block.content ?? '').toLowerCase();
      if (
        (lower.includes('tags::') || lower.includes('#+tags:')) &&
        block['pre-block?'] === true
      ) {
        continue; // tags:: 前置属性块不参与行内解析（页级标签由另一个查询提供）
      }
      let refs = refsByBlock.get(key);
      if (!refs) {
        refs = new Set();
        refsByBlock.set(key, refs);
        blocksByKey.set(key, block);
      }
      refs.add(tagName.toLowerCase());
    }

    for (const [key, block] of blocksByKey) {
      const refs = refsByBlock.get(key);
      if (!refs) continue;
      for (const occ of parseInlineTags(block.content ?? '')) {
        // 旧版写法 #a/b/c 的原生引用页面是 path/concept 整体
        const nativePage = occ.legacy ? `${occ.path}/${occ.concept}` : occ.concept;
        if (!refs.has(nativePage.toLowerCase())) continue;
        addUsage(
          occ.path.toLowerCase(),
          occ.concept.toLowerCase(),
          block,
          `${key}:${occ.path.toLowerCase()}/${occ.concept.toLowerCase()}`,
        );
      }
    }

    // 2) 页级 tags::（无法带层级，统一挂根级）
    for (const [tagName, page] of rawPageTags) {
      addUsage('', tagName.toLowerCase(), page, `p:${entityUuid(page) ?? String(page.id)}`);
    }

    return Array.from(locations.values()).map(({ path, concept, entities }) => ({
      path,
      concept,
      usages: entities,
    }));
  }, [rawBlockRefs, rawPageTags]);
}
