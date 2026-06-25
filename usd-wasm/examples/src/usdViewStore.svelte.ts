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

export type USDHydraHandleLike = {
  setTime(timeCode: number): Promise<void>;
  getTime(): number;
  setPlaying(playing: boolean): void;
  isPlaying(): boolean;
  stageMetadata(): {
    upAxis: string;
    startTimeCode: number;
    endTimeCode: number;
    timeCodesPerSecond: number;
  };
};

export type UsdViewSnapshot = {
  stage: USDStageLike | null;
  handle: USDHydraHandleLike | null;
  selectedPath: string;
  selectedPropertyPath: string;
  selectedLayerIdentifier: string;
  selectedLayerSource: string;
  currentTime: number;
  isPlaying: boolean;
  revision: number;
  notice: USDObjectsChangedNotice | null;
};

class UsdViewState {
  stage = $state<USDStageLike | null>(null);
  handle = $state<USDHydraHandleLike | null>(null);
  selectedPath = $state("/");
  selectedPropertyPath = $state("");
  selectedLayerIdentifier = $state("");
  selectedLayerSource = $state("");
  currentTime = $state(0);
  isPlaying = $state(true);
  revision = $state(0);
  notice = $state<USDObjectsChangedNotice | null>(null);

  #activeStage: USDStageLike | null = null;
  #activeListenerId: number | null = null;

  setStage(stage: USDStageLike | null, handle: USDHydraHandleLike | null = null) {
    this.#revokeObjectsChanged();
    this.#activeStage = stage;

    if (stage?.RegisterObjectsChanged) {
      this.#activeListenerId = stage.RegisterObjectsChanged((notice) => {
        this.notice = notice;
        this.revision += 1;
      });
    }

    this.stage = stage;
    this.handle = handle;
    this.selectedPath = "/";
    this.selectedPropertyPath = "";
    this.selectedLayerIdentifier = "";
    this.selectedLayerSource = "";
    this.currentTime = handle?.getTime?.() ?? handle?.stageMetadata?.().startTimeCode ?? 0;
    this.isPlaying = handle?.isPlaying?.() ?? true;
    this.revision = 0;
    this.notice = null;
  }

  selectPath(path: string) {
    this.selectedPath = path;
    this.selectedPropertyPath = "";
  }

  selectProperty(path: string) {
    this.selectedPropertyPath = path;
  }

  selectLayer(identifier: string, source: string) {
    this.selectedLayerIdentifier = identifier;
    this.selectedLayerSource = source;
  }

  async setTime(timeCode: number) {
    if (!this.handle) return;
    await this.handle.setTime(timeCode);
    this.currentTime = this.handle.getTime();
    this.revision += 1;
  }

  setPlaying(playing: boolean) {
    this.handle?.setPlaying(playing);
    this.isPlaying = this.handle?.isPlaying?.() ?? playing;
  }

  tickTime() {
    if (!this.handle) return;
    const nextTime = this.handle.getTime();
    const nextPlaying = this.handle.isPlaying();
    if (nextTime !== this.currentTime) this.currentTime = nextTime;
    if (nextPlaying !== this.isPlaying) this.isPlaying = nextPlaying;
  }

  refresh() {
    this.revision += 1;
  }

  dispose() {
    this.#revokeObjectsChanged();
    this.#activeStage = null;
    this.stage = null;
    this.handle = null;
    this.selectedPath = "/";
    this.selectedPropertyPath = "";
    this.selectedLayerIdentifier = "";
    this.selectedLayerSource = "";
    this.currentTime = 0;
    this.isPlaying = true;
    this.revision = 0;
    this.notice = null;
  }

  snapshot(): UsdViewSnapshot {
    return {
      stage: this.stage,
      handle: this.handle,
      selectedPath: this.selectedPath,
      selectedPropertyPath: this.selectedPropertyPath,
      selectedLayerIdentifier: this.selectedLayerIdentifier,
      selectedLayerSource: this.selectedLayerSource,
      currentTime: this.currentTime,
      isPlaying: this.isPlaying,
      revision: this.revision,
      notice: this.notice,
    };
  }

  #revokeObjectsChanged() {
    if (this.#activeStage?.RevokeObjectsChanged && this.#activeListenerId !== null) {
      this.#activeStage.RevokeObjectsChanged(this.#activeListenerId);
    }
    this.#activeListenerId = null;
  }
}

export const usdViewState = new UsdViewState();
