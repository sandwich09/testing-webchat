/** True when `e` is a Prisma known-request error with this code (P2002 unique, P2025 not found). */
export function hasPrismaCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === code;
}
