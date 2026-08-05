export class StorageMisconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageMisconfiguredError";
  }
}

export class StagedTraceNotFoundError extends Error {
  constructor() {
    super("Staged trace upload not found");
    this.name = "StagedTraceNotFoundError";
  }
}

export class DirectTraceUploadUnavailableError extends Error {
  constructor() {
    super("Direct upload route is unavailable");
    this.name = "DirectTraceUploadUnavailableError";
  }
}

export class StagedTraceAlreadyExistsError extends Error {
  constructor() {
    super("Staged trace upload already exists");
    this.name = "StagedTraceAlreadyExistsError";
  }
}
