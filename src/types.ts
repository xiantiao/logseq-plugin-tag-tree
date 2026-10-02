import { QueryResultBlockEntity, QueryResultPageEntity } from 'logseqQueryResultTypes';

export type TagUsageEntity = QueryResultBlockEntity | QueryResultPageEntity;

export type Tag = {
  name: string;
  usages: Array<TagUsageEntity>;
};

export type TagUsageType = 'block' | 'page';

// 层级树节点类型（v2：路径为虚拟层级，末段才是真实概念页面）
export type TagTreeNode = {
  // 当前段名，例如 "公司"、"宣传部人员"、"小明"
  name: string;
  // 完整路径，例如 "公司/宣传部人员/小明"
  fullPath: string;
  // 当该节点本身对应一个真实概念标签页时，为概念页名（等于末段）；纯虚拟路径节点为 null
  conceptName: string | null;
  // 该位置上的概念用法（path:: 属性指向父路径的块）
  selfUsages: Array<TagUsageEntity>;
  // 子节点
  children: Map<string, TagTreeNode>;
  // 含全部子孙在内的聚合计数
  totalCount: number;
};
