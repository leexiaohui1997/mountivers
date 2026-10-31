/** 去掉标签首尾的 # 与空白 */
function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, '').replace(/#+$/, '').trim()
}

/** 从 Book.tags（{name, meta}[] 或 string[]）中提取标签名 */
function extractCollectionTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const tags: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      tags.push(item)
      continue
    }
    if (item && typeof item === 'object' && 'name' in item) {
      const name = (item as { name?: unknown }).name
      if (typeof name === 'string') tags.push(name)
    }
  }
  return tags
}

/**
 * 合并成稿标签与合集标签并去重。
 * 成稿标签在前，合集标签在后；返回去掉 # 的纯关键词，发布时再统一加 #。
 */
export function mergePublishTags(articleTags: string[], collectionTags: unknown): string[] {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const tag of [...articleTags, ...extractCollectionTags(collectionTags)]) {
    const normalized = normalizeTag(tag)
    if (!normalized) continue

    const key = normalized.toLocaleLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    merged.push(normalized)
  }

  return merged
}
