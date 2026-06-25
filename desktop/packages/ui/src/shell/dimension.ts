export const DIMENSION = {
  workspace: "workspace",
  feature: "feature"
} as const;

export type AppDimension = (typeof DIMENSION)[keyof typeof DIMENSION];
