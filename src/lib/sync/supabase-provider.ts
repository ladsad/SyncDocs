import * as Y from "yjs";
import { awarenessProtocol } from "y-protocols";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface UserAwarenessState {
  user: {
    name: string;
    color: string;
  };
  cursor?: any;
}

export class SupabaseYjsProvider {
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness;
  public channel: RealtimeChannel | null = null;
  public isConnected = false;
  private supabase: SupabaseClient | null;
  private documentId: string;
  private onDocUpdateBound: (update: Uint8Array, origin: any) => void;
  private onAwarenessUpdateBound: ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => void;
  private statusListeners: Array<(status: { connected: boolean }) => void> = [];

  constructor(
    supabase: SupabaseClient | null,
    documentId: string,
    doc: Y.Doc = new Y.Doc()
  ) {
    this.supabase = supabase;
    this.documentId = documentId;
    this.doc = doc;
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.onDocUpdateBound = this.handleLocalDocUpdate.bind(this);
    this.onAwarenessUpdateBound = this.handleLocalAwarenessUpdate.bind(this);

    this.doc.on("update", this.onDocUpdateBound);
    this.awareness.on("update", this.onAwarenessUpdateBound);

    this.connect();
  }

  public onStatus(cb: (status: { connected: boolean }) => void) {
    this.statusListeners.push(cb);
    cb({ connected: this.isConnected });
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb);
    };
  }

  private notifyStatus(connected: boolean) {
    this.isConnected = connected;
    this.statusListeners.forEach((cb) => cb({ connected }));
  }

  private connect() {
    if (!this.supabase) {
      console.warn("Supabase client not initialized; running in local provider mode.");
      this.notifyStatus(false);
      return;
    }

    const channelName = `doc-room:${this.documentId}`;
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false,
          ack: false,
        },
      },
    });

    // 1. Handle incoming Yjs document binary updates from peers
    this.channel.on("broadcast", { event: "doc-update" }, ({ payload }) => {
      if (payload?.update) {
        try {
          const update = base64ToUint8Array(payload.update);
          Y.applyUpdate(this.doc, update, this);
        } catch (e) {
          console.error("Failed to apply incoming Yjs update:", e);
        }
      }
    });

    // 2. Handle initial state sync request (sync-step-1) from a new joining peer
    this.channel.on("broadcast", { event: "sync-step-1" }, ({ payload }) => {
      if (payload?.stateVector) {
        try {
          const remoteStateVector = base64ToUint8Array(payload.stateVector);
          const update = Y.encodeStateAsUpdate(this.doc, remoteStateVector);
          if (update.byteLength > 0 && this.channel) {
            this.channel.send({
              type: "broadcast",
              event: "sync-step-2",
              payload: {
                update: uint8ArrayToBase64(update),
              },
            });
          }
        } catch (e) {
          console.error("Failed to process sync-step-1:", e);
        }
      }
    });

    // 3. Handle initial sync reply (sync-step-2) with state updates from existing peers
    this.channel.on("broadcast", { event: "sync-step-2" }, ({ payload }) => {
      if (payload?.update) {
        try {
          const update = base64ToUint8Array(payload.update);
          Y.applyUpdate(this.doc, update, this);
        } catch (e) {
          console.error("Failed to process sync-step-2:", e);
        }
      }
    });

    // 4. Handle incoming cursor & presence awareness updates
    this.channel.on("broadcast", { event: "awareness-update" }, ({ payload }) => {
      if (payload?.awareness) {
        try {
          const awarenessBytes = base64ToUint8Array(payload.awareness);
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            awarenessBytes,
            this
          );
        } catch (e) {
          console.error("Failed to apply awareness update:", e);
        }
      }
    });

    this.channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        this.notifyStatus(true);
        // Announce presence and request missing updates via state vector
        const stateVector = Y.encodeStateVector(this.doc);
        this.channel?.send({
          type: "broadcast",
          event: "sync-step-1",
          payload: {
            stateVector: uint8ArrayToBase64(stateVector),
          },
        });

        // Broadcast initial awareness
        const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
          this.awareness,
          [this.doc.clientID]
        );
        this.channel?.send({
          type: "broadcast",
          event: "awareness-update",
          payload: {
            awareness: uint8ArrayToBase64(awarenessUpdate),
          },
        });
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        this.notifyStatus(false);
      }
    });
  }

  private handleLocalDocUpdate(update: Uint8Array, origin: any) {
    if (origin === this) return; // Do not echo incoming updates back
    if (this.channel && this.isConnected) {
      this.channel.send({
        type: "broadcast",
        event: "doc-update",
        payload: {
          update: uint8ArrayToBase64(update),
        },
      });
    }
  }

  private handleLocalAwarenessUpdate({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) {
    const changedClients = added.concat(updated).concat(removed);
    if (changedClients.length === 0) return;

    if (this.channel && this.isConnected) {
      const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
        this.awareness,
        changedClients
      );
      this.channel.send({
        type: "broadcast",
        event: "awareness-update",
        payload: {
          awareness: uint8ArrayToBase64(awarenessUpdate),
        },
      });
    }
  }

  public destroy() {
    this.doc.off("update", this.onDocUpdateBound);
    this.awareness.off("update", this.onAwarenessUpdateBound);

    // Remove local user from remote peers' awareness
    awarenessProtocol.removeAwarenessStates(
      this.awareness,
      [this.doc.clientID],
      this
    );

    if (this.channel && this.supabase) {
      this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    this.notifyStatus(false);
    this.statusListeners = [];
  }
}
