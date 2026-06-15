// Backwards-compat re-export shim. The implementation moved to
// ./dispatch/image-generation.ts when text + image dispatchers were unified
// onto the same marker/lineage/cancel substrate.
export { dispatchImageGeneration, imageCreditCost } from "./dispatch/image-generation";
export type { DispatchImageGenerationParams } from "./dispatch/image-generation";
