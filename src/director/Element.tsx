import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { VisualElement } from '../core/director/plan'
import { elementAnimationStyle, fitFontSize, plainCaption, revealText } from './animation'
import { componentRegistry } from './components/registry'

type ElementProps = {
  element: Exclude<VisualElement, { assetId: string }>
  width: number
  height: number
  accent: string
  durationFrames: number
  /** Global frame for shared/morph elements rendered outside their Sequence. */
  frameOverride?: number
}

export function Element({ element, width, height, accent, durationFrames, frameOverride }: ElementProps) {
  const localFrame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const ctx = { frame: frameOverride ?? localFrame, fps, durationFrames }
  const style = elementAnimationStyle(element, ctx)
  const boxWidth = element.width * width
  const boxHeight = element.height * height
  const wrapper = {
    position: 'absolute' as const, left: element.x * width, top: element.y * height, width: boxWidth, height: boxHeight,
    borderRadius: element.borderRadius, color: element.color, overflow: 'hidden',
    background: element.background === 'transparent' ? 'none' : element.background,
    opacity: style.opacity,
    transform: `translate(${style.translateX}px, ${style.translateY}px) scale(${style.scale}) rotate(${style.rotation}deg)`,
    filter: style.blur ? `blur(${style.blur}px)` : undefined,
    clipPath: style.clipPath,
  }

  if (element.kind === 'component') {
    const Component = componentRegistry[element.component]
    return <div data-director-component={element.component} data-shared-key={element.sharedKey} style={wrapper}>
      <Component element={element} ctx={ctx} width={width} height={height} accent={accent} />
    </div>
  }

  const text = element.kind === 'box' ? '' : revealText(plainCaption(element.text), element.animation, ctx)
  const fontSize = element.kind === 'box' ? element.fontSize
    : fitFontSize(plainCaption(element.text), boxWidth, boxHeight, element.fontSize)
  return <div data-shared-key={element.sharedKey} style={{ ...wrapper, display: 'flex', alignItems: 'center',
    justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre-wrap', fontSize, fontWeight: element.kind === 'number' ? 800 : 750 }}>
    {text}
  </div>
}
