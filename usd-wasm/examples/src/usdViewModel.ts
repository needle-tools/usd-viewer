export type USDObjectsChangedNotice = {
  resyncedPaths: string[];
  changedInfoOnlyPaths: string[];
  resolvedAssetPathsResyncedPaths: string[];
  changedFields: Record<string, string[]>;
};

export type USDStageLike = {
  GetPseudoRoot(): USDPrimLike;
  GetPrimAtPath(path: string): USDPrimLike;
  GetRootLayer(): USDLayerLike;
  GetLayerStack(includeSessionLayers: boolean): USDLayerInfo[];
  GetUsedLayers(includeClipLayers: boolean): USDLayerInfo[];
  GetCompositionErrors(): string[];
  GetStartTimeCode?(): number;
  GetEndTimeCode?(): number;
  GetTimeCodesPerSecond?(): number;
  GetUpAxis?(): number;
  RegisterObjectsChanged?(callback: (notice: USDObjectsChangedNotice) => void): number;
  RevokeObjectsChanged?(listenerId: number): boolean;
};

export type USDPrimLike = {
  IsValid(): boolean;
  GetName(): string;
  GetPath(): string;
  GetTypeName(): string;
  GetDisplayName(): string;
  GetAllMetadata(): Record<string, string>;
  GetSpecifier(): string;
  IsActive(): boolean;
  IsDefined(): boolean;
  IsAbstract(): boolean;
  IsInstance(): boolean;
  IsInPrototype(): boolean;
  IsPrototype(): boolean;
  IsLoaded(): boolean;
  HasAuthoredPayloads(): boolean;
  HasAuthoredReferences(): boolean;
  HasAuthoredInherits(): boolean;
  HasAuthoredSpecializes(): boolean;
  HasAuthoredInstanceable(): boolean;
  GetChildren(): USDVectorLike<USDPrimLike>;
  GetAttributes(): USDVectorLike<USDAttributeLike>;
  GetRelationships(): USDVectorLike<USDRelationshipLike>;
  GetPrimStackWithLayerOffsets(): USDSpecStackEntry[];
  GetPrimIndex(): USDPrimIndex;
  GetCompositionArcs(): USDCompositionArc[];
  GetVariantSetNames(): USDVectorLike<string>;
  GetVariantNames(variantSetName: string): USDVectorLike<string>;
  GetVariantSelection(variantSetName: string): string;
};

export type USDAttributeLike = {
  IsValid(): boolean;
  GetName(): string;
  GetPath(): string;
  GetTypeName(): string;
  GetAllMetadata(): Record<string, string>;
  GetValueString(): string;
  GetValueStringAtTime(timeCode: number): string;
  GetConnections(): USDVectorLike<string>;
  GetResolveInfo(timeCode: number): USDResolveInfo;
  GetTimeSamples(): USDVectorLike<number>;
  GetPropertyStackWithLayerOffsets(timeCode: number): USDSpecStackEntry[];
};

export type USDRelationshipLike = {
  IsValid(): boolean;
  GetName(): string;
  GetPath(): string;
  GetAllMetadata(): Record<string, string>;
  GetTargets(): USDVectorLike<string>;
  GetPropertyStackWithLayerOffsets(timeCode: number): USDSpecStackEntry[];
};

export type USDLayerLike = {
  GetIdentifier(): string;
  GetDisplayName(): string;
  GetRealPath(): string;
};

export type USDVectorLike<T> = {
  size(): number;
  get(index: number): T;
  delete(): void;
};

export type USDLayerInfo = {
  identifier: string;
  displayName: string;
  realPath: string;
};

export type USDSpecStackEntry = {
  path: string;
  layer: USDLayerInfo;
  layerOffset?: { offset: number; scale: number; isIdentity: boolean };
  metadata: Record<string, string>;
  specifier?: string;
  typeName?: string;
  name?: string;
};

export type USDResolveInfo = {
  source: string;
  hasAuthoredValueOpinion: boolean;
  hasAuthoredValue: boolean;
  valueIsBlocked: boolean;
  valueSourceMightBeTimeVarying: boolean;
  hasNextWeakerInfo: boolean;
};

export type USDPcpNode = {
  arcType?: string;
  path?: string;
  pathAtIntroduction?: string;
  layerStackIdentifier?: string;
  children?: USDPcpNode[];
};

export type USDPrimIndex = {
  isValid: boolean;
  rootNode?: USDPcpNode;
};

export type USDCompositionArc = {
  arcType: string;
  targetLayer: USDLayerInfo;
  targetPrimPath: string;
  introducingLayer: USDLayerInfo;
  introducingPrimPath: string;
  isImplicit: boolean;
  isAncestral: boolean;
  hasSpecs: boolean;
  isIntroducedInRootLayerStack: boolean;
  isIntroducedInRootLayerPrimSpec: boolean;
};

export type USDStageMetadata = {
  upAxis?: string;
  startTimeCode: number;
  endTimeCode: number;
  timeCodesPerSecond: number;
};

export type TreeNode = {
  name: string;
  path: string;
  typeName: string;
  children: TreeNode[];
};

export type AttributeRow = {
  kind: "attribute";
  name: string;
  path: string;
  typeName: string;
  value: string;
  resolveSource: string;
  resolveInfo: USDResolveInfo | null;
  timeSamples: number[];
  connections: string[];
  metadata: Record<string, string>;
  stack: USDSpecStackEntry[];
};

export type RelationshipRow = {
  kind: "relationship";
  name: string;
  path: string;
  targets: string[];
  metadata: Record<string, string>;
  stack: USDSpecStackEntry[];
};

export type VariantRow = {
  setName: string;
  selection: string;
  names: string[];
};

export type PrimDetails = {
  path: string;
  name: string;
  displayName: string;
  typeName: string;
  specifier: string;
  isActive: boolean;
  isDefined: boolean;
  isAbstract: boolean;
  isInstance: boolean;
  isInPrototype: boolean;
  isPrototype: boolean;
  isLoaded: boolean;
  hasPayloads: boolean;
  hasReferences: boolean;
  hasInherits: boolean;
  hasSpecializes: boolean;
  hasInstanceable: boolean;
  metadata: Record<string, string>;
};

export type LayerRow = {
  identifier: string;
  displayName: string;
  realPath: string;
};

export type LayerTableRow = LayerRow & {
  source: "Layer Stack" | "Used Layers" | "Prim Stack" | "Property Stack";
  path?: string;
  value?: string;
  metadata?: Record<string, string>;
  offset?: string;
};

export type StageTimeInfo = {
  upAxis: string;
  startTimeCode: number;
  endTimeCode: number;
  timeCodesPerSecond: number;
  currentTime: number;
  hasRange: boolean;
  step: number;
};

export type InspectorModel = {
  tree: TreeNode | null;
  selectedPrim: PrimDetails | null;
  attributes: AttributeRow[];
  relationships: RelationshipRow[];
  variants: VariantRow[];
  primStack: USDSpecStackEntry[];
  selectedProperty: AttributeRow | RelationshipRow | null;
  selectedPropertyStack: USDSpecStackEntry[];
  primIndex: USDPcpNode | null;
  compositionArcs: USDCompositionArc[];
  layerStack: LayerRow[];
  usedLayers: LayerRow[];
  layerRows: LayerTableRow[];
  selectedLayer: LayerTableRow | null;
  stageTime: StageTimeInfo;
  compositionErrors: string[];
};

export type BuildUsdViewModelOptions = {
  stage: USDStageLike | null;
  selectedPath?: string;
  revision?: number;
  currentTime?: number;
  selectedPropertyPath?: string;
  selectedLayerIdentifier?: string;
  selectedLayerSource?: string;
  stageMetadata?: USDStageMetadata | null;
};

export const emptyModel: InspectorModel = {
  tree: null,
  selectedPrim: null,
  attributes: [],
  relationships: [],
  variants: [],
  primStack: [],
  selectedProperty: null,
  selectedPropertyStack: [],
  primIndex: null,
  compositionArcs: [],
  layerStack: [],
  usedLayers: [],
  layerRows: [],
  selectedLayer: null,
  stageTime: {
    upAxis: "",
    startTimeCode: 0,
    endTimeCode: 0,
    timeCodesPerSecond: 24,
    currentTime: 0,
    hasRange: false,
    step: 1,
  },
  compositionErrors: [],
};

export function buildUsdViewModel(options: BuildUsdViewModelOptions): InspectorModel {
  const {
    stage,
    selectedPath = "/",
    revision,
    currentTime = 0,
    selectedPropertyPath = "",
    selectedLayerIdentifier = "",
    selectedLayerSource = "",
    stageMetadata = null,
  } = options;
  void revision;

  if (!stage) {
    return { ...emptyModel, stageTime: readStageTime(currentTime, stageMetadata) };
  }

  const pseudoRoot = stage.GetPseudoRoot();
  const selectedPrim = selectedPath === "/" ? pseudoRoot : stage.GetPrimAtPath(selectedPath);
  const attributes = readAttributes(selectedPrim, currentTime);
  const relationships = readRelationships(selectedPrim, currentTime);
  const selectedProperty = [...attributes, ...relationships].find((property) => property.path === selectedPropertyPath) ?? null;
  const selectedPropertyStack = selectedProperty?.stack ?? [];
  const primStack = vectorToArray(safeUsdQuery(() => selectedPrim.GetPrimStackWithLayerOffsets?.(), []));
  const layerStack = readLayers(safeUsdQuery(() => stage.GetLayerStack?.(true) ?? [], []));
  const usedLayers = readLayers(safeUsdQuery(() => stage.GetUsedLayers?.(false) ?? [], []));
  const stageTime = readStageTime(currentTime, readStageMetadata(stage, stageMetadata));
  const layerRows = [
    ...layerStack.map((layer): LayerTableRow => ({ ...layer, source: "Layer Stack" })),
    ...usedLayers.map((layer): LayerTableRow => ({ ...layer, source: "Used Layers" })),
    ...primStack.map(specToLayerRow("Prim Stack")),
    ...selectedPropertyStack.map(specToLayerRow("Property Stack")),
  ];
  const selectedLayer = layerRows.find((row) =>
    row.identifier === selectedLayerIdentifier && row.source === selectedLayerSource) ?? null;

  return {
    tree: safeUsdQuery(() => buildUsdPrimTree(pseudoRoot), null),
    selectedPrim: readPrimDetails(selectedPrim),
    attributes,
    relationships,
    variants: readVariants(selectedPrim),
    primStack,
    selectedProperty,
    selectedPropertyStack,
    primIndex: safeUsdQuery(() => selectedPrim.GetPrimIndex().rootNode ?? null, null),
    compositionArcs: vectorToArray(safeUsdQuery(() => selectedPrim.GetCompositionArcs?.(), [])),
    layerStack,
    usedLayers,
    layerRows,
    selectedLayer,
    stageTime,
    compositionErrors: vectorToArray(safeUsdQuery(() => stage.GetCompositionErrors?.() ?? [], [])),
  };
}

export function buildUsdPrimTree(prim: USDPrimLike): TreeNode {
  if (!prim?.GetPath || !prim?.GetChildren) {
    return {
      name: "Unavailable",
      path: "",
      typeName: "",
      children: [],
    };
  }
  return {
    name: prim.GetPath() === "/" ? "PseudoRoot" : prim.GetName(),
    path: prim.GetPath(),
    typeName: prim.GetTypeName(),
    children: vectorToArray(prim.GetChildren()).map(buildUsdPrimTree),
  };
}

export function readPrimDetails(prim: USDPrimLike): PrimDetails | null {
  if (!prim?.IsValid?.()) return null;
  return {
    path: prim.GetPath(),
    name: prim.GetName(),
    displayName: prim.GetDisplayName(),
    typeName: prim.GetTypeName(),
    specifier: prim.GetSpecifier(),
    isActive: prim.IsActive(),
    isDefined: prim.IsDefined(),
    isAbstract: prim.IsAbstract(),
    isInstance: prim.IsInstance(),
    isInPrototype: prim.IsInPrototype(),
    isPrototype: prim.IsPrototype(),
    isLoaded: prim.IsLoaded(),
    hasPayloads: prim.HasAuthoredPayloads(),
    hasReferences: prim.HasAuthoredReferences(),
    hasInherits: prim.HasAuthoredInherits(),
    hasSpecializes: prim.HasAuthoredSpecializes(),
    hasInstanceable: prim.HasAuthoredInstanceable(),
    metadata: prim.GetAllMetadata(),
  };
}

export function readAttributes(prim: USDPrimLike, currentTime: number): AttributeRow[] {
  if (!prim?.IsValid?.()) return [];
  return vectorToArray(prim.GetAttributes()).map((attribute: USDAttributeLike) => {
    const resolveInfo = safeUsdQuery(() => attribute.GetResolveInfo(currentTime), null);
    return {
      kind: "attribute",
      name: attribute.GetName(),
      path: attribute.GetPath(),
      typeName: attribute.GetTypeName(),
      value: safeUsdQuery(() => attribute.GetValueStringAtTime?.(currentTime) ?? attribute.GetValueString(), ""),
      resolveSource: resolveInfo?.source ?? "",
      resolveInfo,
      timeSamples: vectorToArray(attribute.GetTimeSamples()),
      connections: vectorToArray(attribute.GetConnections()),
      metadata: attribute.GetAllMetadata(),
      stack: vectorToArray(safeUsdQuery(() => attribute.GetPropertyStackWithLayerOffsets?.(currentTime), [])),
    };
  });
}

export function readRelationships(prim: USDPrimLike, currentTime: number): RelationshipRow[] {
  if (!prim?.IsValid?.()) return [];
  return vectorToArray(prim.GetRelationships()).map((relationship: USDRelationshipLike) => ({
    kind: "relationship",
    name: relationship.GetName(),
    path: relationship.GetPath(),
    targets: vectorToArray(relationship.GetTargets()),
    metadata: relationship.GetAllMetadata(),
    stack: vectorToArray(safeUsdQuery(() => relationship.GetPropertyStackWithLayerOffsets?.(currentTime), [])),
  }));
}

export function readVariants(prim: USDPrimLike): VariantRow[] {
  if (!prim?.IsValid?.()) return [];
  return vectorToArray(prim.GetVariantSetNames()).map((setName: string) => ({
    setName,
    selection: prim.GetVariantSelection(setName),
    names: vectorToArray(prim.GetVariantNames(setName)),
  }));
}

export function readLayers(layers: USDLayerInfo[] | USDVectorLike<USDLayerInfo>): LayerRow[] {
  return vectorToArray(layers).map((layer) => ({
    identifier: layer.identifier,
    displayName: layer.displayName,
    realPath: layer.realPath,
  }));
}

export function readStageTime(currentTime: number, metadata: USDStageMetadata | null | undefined): StageTimeInfo {
  const startTimeCode = metadata?.startTimeCode ?? 0;
  const endTimeCode = metadata?.endTimeCode ?? startTimeCode;
  const timeCodesPerSecond = metadata?.timeCodesPerSecond ?? 24;
  const hasRange = endTimeCode > startTimeCode;
  return {
    upAxis: metadata?.upAxis ?? "",
    startTimeCode,
    endTimeCode,
    timeCodesPerSecond,
    currentTime: Number.isFinite(currentTime) ? currentTime : startTimeCode,
    hasRange,
    step: 1,
  };
}

export function readStageMetadata(stage: USDStageLike, fallback: USDStageMetadata | null | undefined): USDStageMetadata {
  return {
    upAxis: safeUsdQuery(() => normalizeUpAxis(stage.GetUpAxis?.()), fallback?.upAxis ?? ""),
    startTimeCode: safeUsdQuery(() => stage.GetStartTimeCode?.() ?? fallback?.startTimeCode ?? 0, fallback?.startTimeCode ?? 0),
    endTimeCode: safeUsdQuery(() => stage.GetEndTimeCode?.() ?? fallback?.endTimeCode ?? fallback?.startTimeCode ?? 0, fallback?.endTimeCode ?? fallback?.startTimeCode ?? 0),
    timeCodesPerSecond: safeUsdQuery(() => stage.GetTimeCodesPerSecond?.() ?? fallback?.timeCodesPerSecond ?? 24, fallback?.timeCodesPerSecond ?? 24),
  };
}

function normalizeUpAxis(value: number | string | undefined) {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "";
  return String.fromCharCode(Number(value));
}

export function vectorToArray<T>(vector: USDVectorLike<T> | T[] | null | undefined): T[] {
  if (!vector) return [];
  if (Array.isArray(vector)) return vector;
  if (typeof vector.size !== "function" || typeof vector.get !== "function") return [];
  const values: T[] = [];
  try {
    for (let i = 0; i < vector.size(); i++) {
      values.push(vector.get(i));
    }
  } finally {
    vector.delete?.();
  }
  return values;
}

export function safeUsdQuery<T>(callback: () => T, fallback: T): T {
  try {
    return callback();
  } catch (error) {
    console.warn("USD inspector query failed", error);
    return fallback;
  }
}

export function formatLayerOffset(offset: USDSpecStackEntry["layerOffset"]) {
  if (!offset || offset.isIdentity) return "";
  return `${offset.offset}, scale ${offset.scale}`;
}

function specToLayerRow(source: LayerTableRow["source"]) {
  return (spec: USDSpecStackEntry): LayerTableRow => ({
    identifier: spec.layer.identifier,
    displayName: spec.layer.displayName,
    realPath: spec.layer.realPath,
    source,
    path: spec.path,
    value: spec.typeName || spec.specifier || "",
    metadata: spec.metadata,
    offset: formatLayerOffset(spec.layerOffset),
  });
}
