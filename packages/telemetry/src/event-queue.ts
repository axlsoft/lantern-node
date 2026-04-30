import type { Coverage } from "./generated/lantern/v1/coverage_pb.js";

export type DropPolicy = "dropOldest" | "dropNewest";

export class EventQueue {
  private readonly buf: Coverage[];
  private head = 0;
  private tail = 0;
  private size = 0;

  constructor(
    private readonly capacity: number,
    private readonly dropPolicy: DropPolicy
  ) {
    this.buf = new Array<Coverage>(capacity);
  }

  enqueue(event: Coverage): void {
    if (this.size === this.capacity) {
      if (this.dropPolicy === "dropNewest") return;
      // dropOldest: advance head past the oldest item
      this.head = (this.head + 1) % this.capacity;
      this.size--;
    }
    this.buf[this.tail] = event;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }

  enqueueAll(events: Coverage[]): void {
    for (const e of events) this.enqueue(e);
  }

  /** Dequeue up to `max` items. Returns the drained array. */
  drain(max: number): Coverage[] {
    const out: Coverage[] = [];
    while (out.length < max && this.size > 0) {
      out.push(this.buf[this.head] as Coverage);
      this.head = (this.head + 1) % this.capacity;
      this.size--;
    }
    return out;
  }

  drainAll(): Coverage[] {
    return this.drain(this.size);
  }

  get length(): number {
    return this.size;
  }

  get isEmpty(): boolean {
    return this.size === 0;
  }
}
