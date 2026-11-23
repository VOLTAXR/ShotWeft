export const pages = ['board', 'script', 'shots', 'media', 'preview'] as const
export type Tab = typeof pages[number]
export const isTab = (value: string): value is Tab => pages.some(page => page === value)

