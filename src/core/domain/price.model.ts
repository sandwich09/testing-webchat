/** Price per token in nano-USD. Equals the price per million tokens in milli-USD. */
export interface ModelPrice {
  input: bigint;
  output: bigint;
  cacheRead: bigint;
  cacheWrite: bigint;
}

export interface PriceTable {
  /** Reference date, for example "2026-11-03". */
  asOf: string;
  models: Readonly<Record<string, ModelPrice>>;
}
