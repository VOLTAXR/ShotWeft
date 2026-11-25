import { geoEquirectangular, geoGraticule10, geoMercator, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { enterProgress, plainCaption } from '../animation'
import type { ComponentProps } from './registry'

/**
 * Geographic map with animated routes and city markers.
 * Projection and path generation come from d3-geo; the draw-on is frame-based
 * (pathLength = 1, dashoffset = 1 - progress), so every frame is reproducible.
 */
export function GeoMap({ element, ctx, width, height, accent }: ComponentProps) {
  const routes = element.routes ?? []
  const markers = element.markers ?? []
  const land = element.land ?? []
  const boxWidth = element.width * width
  const boxHeight = element.height * height
  const projection = (element.projection === 'mercator' ? geoMercator() : geoEquirectangular())
  const features: GeoPermissibleObjects[] = [
    ...routes.map(route => ({ type: 'Feature' as const, properties: {},
      geometry: { type: 'LineString' as const, coordinates: route.points } })),
    ...markers.map(marker => ({ type: 'Feature' as const, properties: {},
      geometry: { type: 'Point' as const, coordinates: [marker.lon, marker.lat] } })),
  ]
  if (!features.length) return null
  const padding = Math.min(boxWidth, boxHeight) * 0.08
  projection.fitExtent([[padding, padding], [Math.max(padding + 1, boxWidth - padding), Math.max(padding + 1, boxHeight - padding)]],
    { type: 'FeatureCollection', features } as never)
  const path = geoPath(projection)
  const progress = enterProgress(element.animation, ctx)
  const labelSize = Math.max(12, element.fontSize * 0.5)
  return <svg width={boxWidth} height={boxHeight} viewBox={`0 0 ${boxWidth} ${boxHeight}`}>
    {land.map(polygon => <path key={polygon.id} fill={element.color} fillOpacity={0.16} stroke={element.color} strokeOpacity={0.34}
      strokeWidth={1} d={path({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [polygon.points] } } as never) ?? ''} />)}
    {element.graticule !== false && <path d={path(geoGraticule10()) ?? ''} fill="none" stroke={element.color} strokeOpacity={0.12}
      strokeWidth={1} />}
    {routes.map((route, index) => {
      const p = Math.max(0, Math.min(1, progress * routes.length - index))
      const d = path({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: route.points } } as never) ?? ''
      return <g key={route.id}>
        <path d={d} fill="none" stroke={route.color ?? accent} strokeWidth={Math.max(2, element.strokeWidth ?? 3)}
          strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
        {route.label && <text x={boxWidth * 0.5} y={boxHeight - 6} fill={element.color} fillOpacity={0.65}
          fontSize={labelSize * 0.9} textAnchor="middle">{plainCaption(route.label)}</text>}
      </g>
    })}
    {markers.map((marker, index) => {
      const point = projection([marker.lon, marker.lat])
      if (!point) return null
      const local = marker.atFrame !== undefined ? ctx.frame >= marker.atFrame ? 1 : 0
        : Math.max(0, Math.min(1, progress * markers.length - index))
      return <g key={marker.id} opacity={local}>
        <circle cx={point[0]} cy={point[1]} r={8} fill={element.color} stroke={accent} strokeWidth={2} />
        <text x={point[0] + (point[0] > boxWidth * 0.72 ? -10 : 10)} y={point[1] - 8} fill={element.color}
          fontSize={labelSize} fontWeight={600} textAnchor={point[0] > boxWidth * 0.72 ? 'end' : 'start'}>
          {plainCaption(marker.label)}
        </text>
      </g>
    })}
  </svg>
}
