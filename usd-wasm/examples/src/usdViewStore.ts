import { writable } from "svelte/store";

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
  RegisterObjectsChanged(callback: (notice: USDObjectsChangedNotice) => void): number;
  RevokeObjectsChanged(listenerId: number): boolean;
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

export type UsdViewState = {
  stage: USDStageLike | null;
  selectedPath: string;
  revision: number;
  notice: USDObjectsChangedNotice | null;
};

const initialState: UsdViewState = {
  stage: null,
  selectedPath: "/",
  revision: 0,
  notice: null,
};

let activeStage: USDStageLike | null = null;
let activeListenerId: number | null = null;

export const usdViewState = writable<UsdViewState>(initialState);

export function setUsdViewStage(stage: USDStageLike | null) {
  revokeObjectsChanged();
  activeStage = stage;

  if (stage) {
    activeListenerId = stage.RegisterObjectsChanged((notice) => {
      usdViewState.update((state) => ({
        ...state,
        notice,
        revision: state.revision + 1,
      }));
    });
  }

  usdViewState.set({
    stage,
    selectedPath: "/",
    revision: 0,
    notice: null,
  });
}

export function selectUsdViewPath(path: string) {
  usdViewState.update((state) => ({
    ...state,
    selectedPath: path,
  }));
}

export function refreshUsdView() {
  usdViewState.update((state) => ({
    ...state,
    revision: state.revision + 1,
  }));
}

export function disposeUsdViewStage() {
  revokeObjectsChanged();
  activeStage = null;
  usdViewState.set(initialState);
}

function revokeObjectsChanged() {
  if (activeStage && activeListenerId !== null) {
    activeStage.RevokeObjectsChanged(activeListenerId);
  }
  activeListenerId = null;
}
