/**
 * Lets whichever page is currently editing a PCR draft (if any) veto/handle
 * an Electron app-close request - e.g. to prompt "save draft before closing?"
 * The close request itself is handled at the top level (AuthContext, since
 * it's always mounted regardless of route), which has no visibility into
 * PCRPage's form state, so PCRPage registers a handler here instead.
 */
type CloseHandler = () => Promise<boolean>

let activeHandler: CloseHandler | null = null

export function setPcrCloseHandler(handler: CloseHandler | null): void {
  activeHandler = handler
}

// Resolves true if it's OK to proceed with closing, false to cancel it.
export async function runPcrCloseHandler(): Promise<boolean> {
  if (!activeHandler) return true
  return activeHandler()
}
