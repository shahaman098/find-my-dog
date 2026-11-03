/** Cost meter: everything is Meta-API priced, tallied per report and shown on the share page. */
import type { ReportState } from './types'

export const PRICES = {
  sparkIn: 1.25 / 1_000_000, // $ per input token, muse-spark-1.3
  sparkOut: 4.25 / 1_000_000,
  samFrame: 0.2 / 1000, // $ per billed frame (50-frame minimum per request)
  asrSecond: 0.18 / 3600, // $ per second of audio
  image: 0.01,
}

export function emptyCost(): ReportState['cost'] {
  return { sam_frames: 0, spark_in: 0, spark_out: 0, asr_seconds: 0, images: 0, usd: 0 }
}

export function computeUsd(c: ReportState['cost']): number {
  return (
    c.sam_frames * PRICES.samFrame +
    c.spark_in * PRICES.sparkIn +
    c.spark_out * PRICES.sparkOut +
    c.asr_seconds * PRICES.asrSecond +
    c.images * PRICES.image
  )
}

export function addCost(
  s: ReportState,
  delta: Partial<Pick<ReportState['cost'], 'sam_frames' | 'spark_in' | 'spark_out' | 'asr_seconds' | 'images'>>,
): void {
  for (const k of Object.keys(delta) as (keyof typeof delta)[]) {
    if (delta[k]) s.cost[k] += delta[k]!
  }
  s.cost.usd = Math.round(computeUsd(s.cost) * 1000) / 1000
}
