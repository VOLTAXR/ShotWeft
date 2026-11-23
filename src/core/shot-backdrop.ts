import type { Asset, Shot } from '../model'

export function shotBackdrop(shot: Shot, items: ReadonlyMap<string, Asset>): Blob | string | undefined {
  const main = items.get(shot.assetId ?? '')
  const poster = items.get(shot.posterId ?? '')
  const source = poster?.blob ?? (main?.kind === 'image' ? main.blob : main?.thumbnail) ?? shot.media
  if (!source && (shot.assetId || shot.posterId)) throw new Error('项目素材尚未读取')
  return source
}
