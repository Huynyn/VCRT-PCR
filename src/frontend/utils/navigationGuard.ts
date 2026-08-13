/**
 * Lets whichever page is currently editing a PCR draft (if any) veto/handle
 * an in-app navigation away from it - e.g. to prompt "save draft before
 * leaving?" when the sidebar is used to jump to another page. The nav click
 * itself is handled at the top level (App.tsx), which has no visibility into
 * PCRPage's form state, so PCRPage registers a handler here instead.
 *
 * Mirrors electronCloseGuard.ts, which does the same thing for the Electron
 * app-close case.
 */
type NavigationHandler = () => Promise<boolean>

let activeHandler: NavigationHandler | null = null

export function setPcrNavigationGuard(handler: NavigationHandler | null): void {
  activeHandler = handler
}

// Resolves true if it's OK to proceed with navigating away, false to cancel it.
export async function runPcrNavigationGuard(): Promise<boolean> {
  if (!activeHandler) return true
  return activeHandler()
}
