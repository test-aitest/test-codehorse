/**
 * Chunking Module
 *
 * 大規模PRを分割して並列処理するためのチャンキングシステム
 */

// Chunk Processor
export {
  // Types
  type ChunkConfig,
  type DiffChunk,
  type ChunkingResult,
  // Constants
  DEFAULT_CHUNK_CONFIG,
  // Functions
  needsChunking,
  createChunks,
  processChunksInParallel,
  buildChunkContext,
  getChunkConfigFromEnv,
  isChunkingEnabled,
  formatChunkingSummary,
} from "./chunk-processor";

// Result Merger
export {
  // Types
  type ChunkReviewResult,
  type MergedReviewResult,
  type DeduplicationConfig,
  // Constants
  DEFAULT_DEDUP_CONFIG,
  // Functions
  deduplicateComments,
  mergeChunkResults,
  formatMergeSummary,
  shouldMergeResults,
} from "./result-merger";
