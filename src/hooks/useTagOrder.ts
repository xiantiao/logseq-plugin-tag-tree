import { useCallback, useEffect, useRef, useState } from 'react';
import { ROOT_PARENT, TagOrderMap } from '../utils';

// 排序按 graph 隔离存储
const STORAGE_KEY = 'tag-order:v1';
// 旧版本地存储 key（扁平的根级顺序数组，仅做一次性迁移）
const LEGACY_KEY = 'logseq-plugin-tags-order';

/**
 * 统一存储接口：
 * 优先使用 logseq.Kv（新版本 Logseq 原生 KV），
 * 回退到 Assets.makeSandboxStorage（按 graph 隔离的文件存储），
 * 最后回退 localStorage。
 */
type StorageAdapter = {
  getItem(key: string): Promise<string | undefined>;
  setItem(key: string, value: string): Promise<void>;
};

function detectStorage(): StorageAdapter {
  const kv = (logseq as unknown as { Kv?: { getItem?: Function; setItem?: Function } }).Kv;
  if (kv && typeof kv.getItem === 'function' && typeof kv.setItem === 'function') {
    return {
      getItem: (key) =>
        kv.getItem!(key).then((v: unknown) =>
          v == null ? undefined : typeof v === 'string' ? v : JSON.stringify(v),
        ),
      setItem: (key, value) => kv.setItem!(key, value),
    };
  }
  try {
    const sandbox = logseq.Assets.makeSandboxStorage();
    if (sandbox && typeof sandbox.getItem === 'function') {
      return sandbox as unknown as StorageAdapter;
    }
  } catch (error) {
    console.warn('Sandbox storage unavailable, falling back to localStorage:', error);
  }
  return {
    getItem: (key) => Promise.resolve(localStorage.getItem(key) ?? undefined),
    setItem: (key, value) => {
      localStorage.setItem(key, value);
      return Promise.resolve();
    },
  };
}

function readLegacyOrder(): TagOrderMap | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
      return { [ROOT_PARENT]: arr };
    }
  } catch {
    // ignore broken legacy data
  }
  return null;
}

function parseOrder(raw: string | undefined): TagOrderMap | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return obj as TagOrderMap;
  } catch (error) {
    console.error('Failed to parse tag order:', error);
  }
  return null;
}

export function useTagOrder() {
  const [orderMap, setOrderMap] = useState<TagOrderMap>({});
  const [loaded, setLoaded] = useState(false);
  // 标记用户已通过拖拽修改过顺序，防止初始化加载异步返回时覆盖用户操作
  const userModifiedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = detectStorage();
        const raw = await storage.getItem(STORAGE_KEY);
        if (cancelled) return;
        // 若用户已在加载完成前修改过顺序，则不覆盖
        if (userModifiedRef.current) return;
        setOrderMap(parseOrder(raw) ?? readLegacyOrder() ?? {});
      } catch (error) {
        console.error('Failed to load tag order:', error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveOrder = useCallback((next: TagOrderMap) => {
    userModifiedRef.current = true;
    setOrderMap(next);
    try {
      const storage = detectStorage();
      void storage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((error) => {
        console.error('Failed to save tag order:', error);
      });
    } catch (error) {
      console.error('Failed to save tag order:', error);
    }
  }, []);

  return { orderMap, saveOrder, loaded };
}
