/**
 * 文本编码修复工具
 * 场景：Windows/MySQL 默认字符集（latin1/gbk）导致的典型乱码 —— "UTF-8 字节流被按 ISO-8859-1 (Latin-1)
 * 或 Windows-1252 (CP1252) 解码再存库"。
 *   例：管理所有权限 → 乱码显示为 "æ‰€æœ‰æ�ƒé™�" / "æ‰€æœ‰æ\u009dƒé™\u0090" 一类。
 *
 * 修复原理：Latin-1 是字符 0x00-0xFF 与字节 0x00-0xFF 的 1-1 映射；网页/浏览器最常见的解码是 CP1252，
 * 其 0x80-0x9F 区段被替换为可见字符（€ ‰ ™ œ 等）。把"字符 → 字节"（Latin-1 1-1 + CP1252 高半区映射表）
 * 再按 UTF-8 解码就能得到原中文，该过程是**无损**的。
 *
 * 安全性：修复前先做"特征判定"，只在符合 mojibake 特征时才执行转换，不破坏本来就是正确 UTF-8 的字符串；
 * 解码失败（非法 UTF-8）原样返回；最多迭代 3 轮处理双重/三重编码的脏数据。
 *
 * 与 client/src/utils/textRepair.ts 实现完全对称。
 */

/**
 * CP1252 高半区字符 → 字节映射（0x81/0x8D/0x8F/0x90/0x9D 未定义，保持 Latin-1 1-1 映射为控制字符）
 */
const CP1252_CHAR_TO_BYTE: Readonly<Record<number, number>> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // '
  0x2019: 0x92, // '
  0x201c: 0x93, // "
  0x201d: 0x94, // "
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
};

/** 可疑 mojibake 字符：Latin-1 扩展区（含控制符）+ CP1252 高半区字符 */
function isSuspiciousMojibakeChar(cp: number): boolean {
  if (cp >= 0x0080 && cp <= 0x00ff) return true;
  return Object.prototype.hasOwnProperty.call(CP1252_CHAR_TO_BYTE, cp);
}

/** CJK 字符（原文如果是中文，按 CP1252/Latin-1 错解码后 CJK 会消失） */
function isCjkChar(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) || // CJK 基本区
    (cp >= 0x3000 && cp <= 0x303f) || // CJK 标点
    (cp >= 0xff00 && cp <= 0xffef) || // 全角字符
    (cp >= 0x3400 && cp <= 0x4dbf)
  );
}

/**
 * 判定字符串是否很可能是 "UTF-8 bytes 被 CP1252/Latin-1 错解码" 后产生的 mojibake：
 *   - 相当比例（≥1/8）的字符落在可疑区段
 *   - 几乎不含 CJK（如果原文有 CJK，错解码后 CJK 会消失）
 */
function looksLikeLatin1Mojibake(s: string): boolean {
  if (!s) return false;
  let suspicious = 0;
  let cjk = 0;
  const threshold = Math.max(1, Math.floor(s.length / 8));
  for (let i = 0; i < s.length; i += 1) {
    const cp = s.charCodeAt(i);
    if (isSuspiciousMojibakeChar(cp)) suspicious += 1;
    else if (isCjkChar(cp)) cjk += 1;
  }
  return cjk === 0 && suspicious >= threshold;
}

/**
 * 把 mojibake 字符串按 Latin-1 1-1 + CP1252 高半区映射转回字节。
 * 出现无法映射的字符时返回 null（不是该类乱码）。
 */
function mojibakeToBytes(s: string): Uint8Array | null {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i += 1) {
    const cp = s.charCodeAt(i);
    if (cp <= 0xff) {
      bytes[i] = cp;
    } else {
      const mapped = CP1252_CHAR_TO_BYTE[cp];
      if (mapped === undefined) return null;
      bytes[i] = mapped;
    }
  }
  return bytes;
}

/**
 * 尝试把一段"看起来是 UTF-8→CP1252/Latin-1 错解码"的字符串无损还原为 UTF-8 原文。
 * - 判定失败时原样返回（不破坏正常 UTF-8 文本）。
 * - 解码过程失败（非法 UTF-8 序列）也原样返回。
 * - 最多迭代 3 轮，处理双重/三重编码的历史脏数据。
 */
export function repairLatin1Mojibake(s: string | null | undefined): string {
  if (s == null) return "";
  if (typeof s !== "string") return String(s);

  let current = s;
  for (let round = 0; round < 3; round += 1) {
    if (!looksLikeLatin1Mojibake(current)) return current;
    const bytes = mojibakeToBytes(current);
    if (!bytes) return current;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === current) return current; // 无变化，停止
      current = decoded;
    } catch {
      return current; // 非法 UTF-8：不是该类乱码，保持原样
    }
  }
  return current;
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
