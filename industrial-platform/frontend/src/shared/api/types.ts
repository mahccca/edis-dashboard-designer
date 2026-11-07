// Hand-written mirror of contracts/openapi/openapi.yaml for VS-1.
// Generation with openapi-typescript is deferred (docs/sprints/09-vs1-status.md).

export type LocalizedText = string | Record<string, string>;
export type Uuid = string;

export type TokenRef = { $token: string };
export type StyleValue = string | number | TokenRef;
export type StyleBlock = Record<string, StyleValue>;

export type ContainerType = "root" | "section" | "container" | "stack" | "grid" | "row" | "column" | "repeater";
export type LeafType = "heading" | "text" | "image" | "spacer" | "divider" | "menu" | "logo" | "slot" | "component";
export type NodeType = ContainerType | LeafType;

export interface BindingRef {
  bindingId: Uuid;
  fallback?: string | number | null;
}

export interface ComponentRef {
  definitionId: Uuid;
  definitionKey?: string;
  version: string;
}

export interface RepeaterConfig {
  sourceBindingId: Uuid;
  itemAlias?: string;
}

export interface DocNode {
  id: string;
  type: NodeType;
  props?: Record<string, unknown>;
  style?: StyleBlock;
  /** Night/dark per-part style overrides (e.g. KPI card title/value/unit). Key `all` = global defaults. */
  partStyles?: Record<string, StyleBlock>;
  /** Day/light per-part style overrides (same shape as partStyles). */
  partStylesDay?: Record<string, StyleBlock>;
  bindings?: Record<string, BindingRef>;
  /** When type=repeater: expand children once per array element from sourceBindingId. */
  repeater?: RepeaterConfig;
  component?: ComponentRef;
  children?: DocNode[];
  responsive?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type DocumentType = "page" | "dashboard" | "template" | "template_part";

export interface DocumentContent {
  schemaVersion: number;
  documentType: DocumentType;
  settings?: Record<string, unknown>;
  root: DocNode;
}

export interface PropertySpec {
  key: string;
  label: LocalizedText;
  type: "string" | "text" | "number" | "integer" | "boolean" | "enum" | "color" | "token" | "unit" | "icon" | "media" | "objectRef";
  required?: boolean;
  enum?: Array<string | number>;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  bindable?: boolean;
  group?: string;
}

export interface PortSpec {
  key: string;
  label?: LocalizedText;
  dataType: string;
  required?: boolean;
}

export interface ComponentSpec {
  id: Uuid;
  key: string;
  version: string;
  name: LocalizedText;
  category: string;
  status: string;
  rendererId: string;
  properties: PropertySpec[];
  defaults: Record<string, unknown>;
  inputs: PortSpec[];
  layoutConstraints?: { allowedParents?: string[]; allowedDocumentTypes?: string[] };
}

export interface ComponentSummary {
  id: Uuid;
  key: string;
  name: LocalizedText;
  category: string;
  scope: "global" | "project";
  latestPublishedVersion: string | null;
  draftVersion: string | null;
}

export type Quality = "good" | "uncertain" | "bad" | "stale" | "no_data";
export type DataOrigin = "live" | "simulated" | "manual" | "model" | "static";

export type BindingPrimitive = number | string | boolean | null;
/** Structured JSON from HTTP data-source queries (resultMode=json). */
export type BindingJson = Record<string, unknown> | unknown[];

export interface BindingValue {
  bindingId: Uuid;
  value: BindingPrimitive | BindingJson;
  unit: string | null;
  quality: Quality;
  sourceTimestamp: string | null;
  origin: "object_variable" | "model_output" | "static" | "data_source_signal";
  dataOrigin: DataOrigin;
  isTestData: boolean;
}

export interface DataBinding {
  id: Uuid;
  projectId?: Uuid;
  name: string;
  source:
    | { kind: "object_variable"; objectId: Uuid; variable: string }
    | { kind: "model_output"; modelId: Uuid; output: string; run: "latest_succeeded" }
    | { kind: "static"; value: number | string | boolean }
    | { kind: "data_source_signal"; dataSourceId: Uuid; signal: string };
  transform?: { toUnit?: string; decimals?: number; expression?: string };
  delivery: { mode: "live" | "poll" | "on_load"; intervalMs?: number; staleAfterMs?: number };
  lockVersion?: number;
}

export interface RenderBundle {
  mode: "runtime" | "preview";
  publishedVersionId: Uuid | null;
  page: { id: Uuid; title: LocalizedText; path: string; kind?: string };
  document: DocumentContent;
  components: ComponentSpec[];
  theme: { tokens: Record<string, unknown> } & Record<string, unknown>;
  bindings: DataBinding[];
  bindingOrigins: Record<Uuid, { dataOrigin: DataOrigin; isTestData: boolean }>;
  containsTestData: boolean;
  liveChannel?: { url: string; topics: string[] };
}

export interface Me {
  user: { id: Uuid; username: string; displayName: string };
  csrfToken: string;
  platformPermissions: string[];
  memberships: Array<{ projectId: Uuid; role: string; permissions: string[] }>;
}

export interface Project {
  id: Uuid;
  slug: string;
  name: string;
  description?: string | null;
}

export interface PageSummary {
  id: Uuid;
  kind: "page" | "dashboard";
  title: LocalizedText;
  slug: string;
  path: string;
  status: string;
  headRevision: number;
  livePublishedVersionNo: number | null;
  hasUnpublishedChanges: boolean;
  updatedAt: string;
}

export interface RevisionSummary {
  revisionNo: number;
  schemaVersion: number;
  contentHash: string;
  message: string | null;
  autosave: boolean;
  restoredFrom: number | null;
  createdAt: string;
}

export interface PublishedVersion {
  id: Uuid;
  documentId: Uuid;
  versionNo: number;
  sourceRevisionNo: number;
  bundleHash: string;
  pins: { components: Array<{ definitionId: Uuid; version: string }> };
  isLive: boolean;
  containsTestData: boolean;
  note: string | null;
  publishedAt: string;
}

export interface VariableSpec {
  key: string;
  name: LocalizedText;
  dataType: string;
  unit?: string;
}

export interface ObjectType {
  id: Uuid;
  key: string;
  version: string;
  name: LocalizedText;
  variables: VariableSpec[];
}

export interface IndustrialObject {
  id: Uuid;
  typeId: Uuid;
  typeVersion: string;
  key: string;
  name: LocalizedText;
  parentId: Uuid | null;
  tags: string[];
}

export interface DataSource {
  id: Uuid;
  name: string;
  description?: string | null;
  enabled?: boolean;
  kind: string;
  isTestData: boolean;
  dataOrigin: DataOrigin;
  status: string;
  config?: Record<string, unknown>;
  hasCredentials?: boolean;
  lockVersion?: number;
  lastCheckedAt?: string | null;
}

export interface ProblemError {
  pointer: string;
  code: string;
  message: string;
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: ProblemError[];
  currentEtag?: string;
  requestId?: string;
}
