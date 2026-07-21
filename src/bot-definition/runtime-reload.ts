import type { CloudBotModelSelection } from './cloud-client';

export interface CloudBotModelRuntimeReloadControllerOptions {
  initialRevision?: number;
  pullSelection(): Promise<CloudBotModelSelection | undefined>;
  isIdle(): boolean;
  applySelection(selection: CloudBotModelSelection): Promise<'applied' | 'deferred'>;
  onError?(error: unknown, selection?: CloudBotModelSelection): void;
}

/** Serializes cloud model polling and applies only the newest unhandled revision. */
export class CloudBotModelRuntimeReloadController {
  private handledRevision: number;
  private pendingSelection?: CloudBotModelSelection;
  private polling = false;

  constructor(private readonly options: CloudBotModelRuntimeReloadControllerOptions) {
    this.handledRevision = options.initialRevision ?? -1;
  }

  async pollOnce(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    let selection: CloudBotModelSelection | undefined;
    try {
      selection = await this.options.pullSelection();
      if (!selection) {
        this.pendingSelection = undefined;
        return;
      }
      if (selection.revision > this.handledRevision) {
        if (!this.pendingSelection || selection.revision >= this.pendingSelection.revision) {
          this.pendingSelection = selection;
        }
      }
      const pending = this.pendingSelection;
      if (!pending || !this.options.isIdle()) return;

      try {
        const outcome = await this.options.applySelection(pending);
        if (outcome === 'deferred') return;
        this.handledRevision = Math.max(this.handledRevision, pending.revision);
        if (this.pendingSelection?.revision === pending.revision) {
          this.pendingSelection = undefined;
        }
      } catch (error) {
        this.handledRevision = Math.max(this.handledRevision, pending.revision);
        if (this.pendingSelection?.revision === pending.revision) {
          this.pendingSelection = undefined;
        }
        this.options.onError?.(error, pending);
      }
    } catch (error) {
      this.options.onError?.(error, selection);
    } finally {
      this.polling = false;
    }
  }
}
