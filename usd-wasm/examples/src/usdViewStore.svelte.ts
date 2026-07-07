import type { USDObjectsChangedNotice, USDStageLike, USDStageMetadata } from "./usdViewModel";

export type USDHydraHandleLike = {
  setTime(timeCode: number): Promise<void>;
  getTime(): number;
  setPlaying(playing: boolean): void;
  isPlaying(): boolean;
  stageMetadata(): USDStageMetadata;
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

export class UsdViewState {
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
