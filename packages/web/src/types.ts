export interface DataTransferState {
  readonly busy: boolean
  readonly working: { current: boolean }
  setBusy(busy: boolean): void
}
