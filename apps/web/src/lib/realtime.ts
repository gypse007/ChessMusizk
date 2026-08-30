export type SSEEvent = {
  type: 'status';
  status: string;
  stageUpdatedAt: number;
} | {
  type: 'take_ready';
  takeId: string;
} | {
  type: 'error';
  message: string;
};

export class RealtimeConnection {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(jobId: string): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const url = `/api/jobs/${jobId}/stream`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        this.emit(data.type, data);
      } catch {
        // ignore parse errors
      }
    };

    this.eventSource.onerror = () => {
      this.emit('error', { message: 'Connection lost' });
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  on<T>(event: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as (data: unknown) => void);

    return () => {
      this.listeners.get(event)?.delete(callback as (data: unknown) => void);
    };
  }

  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}
