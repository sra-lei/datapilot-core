/**
 * 文本编码修复工具
 * 场景：Windows/MySQL 默认字符集（latin1/gbk）导致的典型乱码 —— "UTF-8 字节流被按 ISO-8859-1 (Latin-1) 解码再存库"。
 *   例：管理所有权限 → 乱码显示为 "æ‰€æœ‰æ�ƒé™�" 一类。
 *
 * 修复原理：Latin-1 是字符 0x00-0xFF 与字节 0x00-0xFF 的 1-1 映射，因此上述乱码是
 *   **无损** 的：把乱码字符串按 Latin-1 重新编码成 bytes，再按 UTF-8 解码就能得到原中文。
 *
 * 安全性：修复前先做"特征判定"，只在符合 mojibake 特征时才执行转换，不破坏本来就是正确 UTF-8 的字符串。
 */

/**
 * 判定字符串是否很可能是 "UTF-8 bytes 被 Latin-1 错解码" 后产生的 mojibake：
 *   - 包含相当比例的 Latin-1 扩展区字符（U+0080..U+00FF）
 *   - 几乎不含真正的 CJK / 常用标点 CJK 区段（如果原文有 CJK，按 Latin-1 解码后 CJK 会消失）
 */
function looksLikeLatin1Mojibake(s: string): boolean {
  if (!s) return false;
  let extLatin = 0;
  let cjk = 0;
  const threshold = Math.max(1, Math.floor(s.length / 8)); // 至少 1/8 为扩展 Latin 才判为 mojibake
  for (let i = 0; i < s.length; i += 1) {
    const cp = s.charCodeAt(i);
    if (cp >= 0x0080 && cp <= 0x00ff) extLatin += 1;
    else if (
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 基本区
      (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
      (cp >= 0xff00 && cp <= 0xffef) || // 全角字符
      (cp >= 0x3400 && cp <= 0x4dbf)
    ) {
      cjk += 1;
    }
  }
  return cjk === 0 && extLatin >= threshold;
}

/**
 * 尝试把一段"看起来是 UTF-8→Latin-1 错解码"的字符串无损还原为 UTF-8 原文。
 * - 判定失败时原样返回（不破坏正常 UTF-8 文本）。
 * - 解码过程失败（Latin-1 encode 后 bytes 非合法 UTF-8）也原样返回。
 */
export function repairLatin1Mojibake(s: string | null | undefined): string {
  if (s == null) return "";
  if (typeof s !== "string") return String(s);
  if (!looksLikeLatin1Mojibake(s)) return s;
  try {
    // 1-1 Latin-1 encode → bytes
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i += 1) {
      const cp = s.charCodeAt(i);
      if (cp > 0xff) return s; // 出现超出 Latin-1 的码点：不是该类乱码，直接放弃
      bytes[i] = cp & 0xff;
    }
    // {fatal:true}：非法 UTF-8 序列直接抛错 → 走 catch 原样返回（不引入替换字符 U+FFFD，保持数据干净）
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return s;
  }
}

// 方便后端/前端批量修复数组对象上的指定字段
export function repairField<
  T extends object,
  K extends keyof T,
>(arr: T[], ...fields: K[]): T[] {
  if (!Array.isArray(arr)) return arr;
  return arr.map((row) => {
    if (!row) return row;
    const out = { ...row } as T;
    for (const f of fields) {
      const v = out[f];
      if (typeof v === "string") {
        out[f] = repairLatin1Mojibake(v) as unknown as T[K];
      }
    }
    return out;
  });
}
