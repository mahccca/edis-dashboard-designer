export type ExplorerNode = {
  path: string;
  type: string;
  children?: boolean;
  isArrayItem?: boolean;
  sampleValue?: unknown;
};

export type FieldSelection = {
  apiId: string;
  queryKey: string;
  path: string;
  type: string;
  sampleValue?: unknown;
};

export type SchemaLatest = {
  id: string;
  dataSourceId: string;
  queryKey: string;
  version: number;
  schema: Record<string, unknown>;
  paths: ExplorerNode[];
  sample?: unknown;
  createdAt?: string | null;
};
