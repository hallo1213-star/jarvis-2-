// Tiny global toast bus – usable from anywhere (contexts, components, handlers)
const listeners = new Set()

export function toast(message, opts = {}) {
  const t = { id: Math.random().toString(36).slice(2), message, icon: opts.icon, action: opts.action, duration: opts.duration ?? 2400 }
  listeners.forEach((l) => l(t))
}

export function onToast(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
