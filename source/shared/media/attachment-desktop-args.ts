export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeStageAttachmentRequest(filenameOrRequest: unknown, bytes?: unknown): { filename: unknown; bytes: unknown } {
  const record = asRecord(filenameOrRequest);
  if (record != null && "filename" in record) {
    return { filename: record.filename, bytes: record.bytes ?? record.bytesBase64 };
  }
  return { filename: filenameOrRequest, bytes };
}

export function normalizeCommitStagedRequest(pathsOrRequest: unknown, filenames?: unknown): { paths: unknown; filenames: unknown } {
  const record = asRecord(pathsOrRequest);
  if (record != null && "paths" in record) return { paths: record.paths, filenames: record.filenames };
  return { paths: pathsOrRequest, filenames };
}

export function normalizePathRequest(pathOrRequest: unknown): unknown {
  const record = asRecord(pathOrRequest);
  return record != null && "path" in record ? record.path : pathOrRequest;
}

function copyArrayBufferView(bytes: ArrayBufferView): Uint8Array {
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

export function coerceAttachmentBytes(bytes: unknown): Uint8Array | null {
  if (bytes == null) return null;
  if (typeof bytes === "string" && bytes.length > 0) {
    try {
      if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(bytes, "base64"));
      return Uint8Array.from(atob(bytes), (char) => char.charCodeAt(0));
    } catch {
      return null;
    }
  }
  if (typeof Buffer !== "undefined" && typeof Buffer.isBuffer === "function" && Buffer.isBuffer(bytes)) {
    return new Uint8Array(bytes);
  }
  // ArrayBuffer.isView is realm-safe; instanceof Uint8Array is not across contextBridge.
  if (ArrayBuffer.isView(bytes)) return copyArrayBufferView(bytes);
  if (typeof ArrayBuffer !== "undefined" && bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  const tag = Object.prototype.toString.call(bytes);
  if (tag === "[object Uint8Array]" || tag === "[object Buffer]" || tag === "[object Uint8ClampedArray]") {
    return Uint8Array.from(bytes as ArrayLike<number>);
  }
  const record = asRecord(bytes);
  if (record != null && record.type === "Buffer" && Array.isArray(record.data)) {
    return Uint8Array.from(record.data as number[]);
  }
  if (Array.isArray(bytes) && bytes.every((item) => typeof item === "number")) {
    return Uint8Array.from(bytes);
  }
  if (record != null && typeof record.byteLength === "number" && record.byteLength >= 0) {
    const copy = new Uint8Array(record.byteLength);
    for (let index = 0; index < copy.byteLength; index += 1) {
      const value = record[index];
      if (typeof value !== "number") return null;
      copy[index] = value;
    }
    return copy;
  }
  return null;
}
