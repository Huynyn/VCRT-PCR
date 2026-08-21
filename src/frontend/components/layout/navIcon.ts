// Shared icon treatment for any "selectable" icon in the app chrome (sidebar
// nav items, the notification bell, etc.): a thinner stroke than lucide's
// default (2) reads as more precise/technical than the default's slightly
// soft, rounded look. When selected/active, the icon washes in with a light
// tint of the active color (Gmail/YouTube-style) rather than a solid fill -
// the stroke stays fully opaque so detail lines (e.g. FileText's text lines)
// stay visible instead of disappearing into the fill.
export const navIconProps = (isActive?: boolean) => ({
  strokeWidth: 1.75,
  fill: 'currentColor',
  fillOpacity: isActive ? 0.18 : 0,
})
