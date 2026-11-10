export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
