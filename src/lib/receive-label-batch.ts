/** Resume a partially received batch without receiving an item twice. */
export async function receiveLabelBatch({
  ids,
  operations,
  getState,
  receive,
  progress,
  invalidStateMessage,
}: {
  ids: string[];
  operations: Map<string, string>;
  getState: (id: string) => Promise<string>;
  receive: (id: string, operation: string) => Promise<unknown>;
  progress: (count: number) => void;
  invalidStateMessage: string;
}) {
  let completed = 0;
  progress(0);
  for (const id of ids) {
    const state = await getState(id);
    if (state === "expected") {
      const operation = operations.get(id) ?? crypto.randomUUID();
      operations.set(id, operation);
      await receive(id, operation);
    } else if (state !== "available") {
      throw new Error(invalidStateMessage);
    }
    progress(++completed);
  }
  return completed;
}
