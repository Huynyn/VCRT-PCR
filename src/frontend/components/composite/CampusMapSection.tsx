import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapContainer, TileLayer, Marker, Polygon, Popup, Tooltip, useMap, useMapEvent } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, ExternalLink, Search, X } from 'lucide-react'
import { TitleBadge } from '@/components/ui'
import { cn } from '@/utils'
import { MAIN_CAMPUS_BUILDINGS, LEES_CAMPUS_BUILDINGS, OUTDOOR_SPACES, type CampusBuilding } from './campusBuildings'
import 'leaflet/dist/leaflet.css'

// Tailwind's content scanner only keeps a hand-written @layer rule if at
// least one of its class tokens shows up literally somewhere in a scanned
// file - these two ("leaflet-container", "leaflet-control-attribution")
// are Leaflet's own, added to the DOM by the library itself rather than
// through any className prop here, so they'd otherwise never be seen and
// the matching rule in index.css would get silently purged from the build.

const ALL_BUILDINGS: CampusBuilding[] = [...MAIN_CAMPUS_BUILDINGS, ...LEES_CAMPUS_BUILDINGS]

// Nudged south of Main Campus's own building-extent midpoint (~45.4248) so
// the "Main Campus" jump button's view sits a bit lower/south within the
// cluster rather than dead-centered on it.
const MAIN_CAMPUS_CENTER: [number, number] = [45.4221, -75.68332]
// Midpoint between Main and Lees Campus - paired with MIN_ZOOM (the map's
// farthest zoomed-out level) as the map's home view, so both campuses are
// visible together on load and whenever a search is cleared, rather than
// just Main Campus. A fixed center+zoom rather than fitBounds-ing the two
// campuses' combined extent: fitBounds' own computed zoom already floors to
// MIN_ZOOM for any realistic window width (the two campuses' combined
// north-south spread is the limiting dimension against this map's fixed
// height), so pinning it directly is equivalent and more predictable than
// relying on that calculation to land there.
const BOTH_CAMPUS_CENTER: [number, number] = [45.4229, -75.67735]
// The "Main Campus" / "Lees Campus" jump buttons fly to these fixed
// center+zoom pairs rather than fitBounds-ing the campus's full building
// extent - fitBounds picks whatever zoom makes the widest/tallest building
// span fit the container's aspect ratio, which for a wide card and a
// north-south-heavy building spread meant the computed view could need more
// room than MAX_BOUNDS allowed on one side, clipping that side once
// maxBoundsViscosity snapped it back in. A fixed, hand-picked view has no
// such surprise. Main Campus zooms in one step further than the default
// opening view for a closer look at the building cluster.
const MAIN_CAMPUS_ZOOM = 17
const LEES_CAMPUS_CENTER: [number, number] = [45.41605, -75.66757]
const LEES_CAMPUS_ZOOM = 17
// Keeps zooming out capped around "neighborhood" scale - this is a campus
// quick-reference, not a general-purpose map, so there's no reason to let
// users scroll out to city/country level.
const MIN_ZOOM = 15
const MAX_ZOOM = 18
// The one zoom level actually cached on disk (see public/tiles and
// scripts/download-campus-tiles.js). TileLayer's minNativeZoom/maxNativeZoom
// (set below) makes Leaflet reuse these same tiles at every other zoom in
// [MIN_ZOOM, MAX_ZOOM], CSS-scaling them up or down instead of fetching
// separate tiles per level - a full pyramid across that whole range would
// mean thousands of tiles; one level is a few hundred/low thousand. 16
// rather than 17 (which MAIN_CAMPUS_ZOOM/LEES_CAMPUS_ZOOM actually use) so
// the download script's BOUNDS can comfortably cover a wide/maximized
// window's full width at MIN_ZOOM without ballooning the tile count (each
// zoom level roughly triples the tiles needed for the same area) - a
// tighter area at zoom 17 left the sides of a wide window blank past its
// edge (real tiles just don't exist out there). The tradeoff is the reverse
// of that: the deliberate close-up campus views are a mild ~2x upscale of
// this zoom's tiles rather than pixel-native.
const NATIVE_ZOOM = 16
// Keeps panning within Main Campus + Lees Campus plus a comfortable margin -
// this isn't a general-purpose map, so there's no reason to let a drag
// wander off into the rest of Ottawa. This only restricts how far the pan
// CENTER can move - see scripts/download-campus-tiles.js's BOUNDS for why
// the actual tile coverage is (and needs to be) wider than this box.
// maxBoundsViscosity=1 makes the edge fully solid (no rubber-banding past
// it).
const MAX_BOUNDS: L.LatLngBoundsExpression = [
  [45.413, -75.698],
  [45.433, -75.656],
]

// Code-label visibility by zoom, to avoid overcrowding when zoomed out:
// nothing shows at MIN_ZOOM (outlines only), only larger buildings show one
// zoom step in, and everything shows from here on.
const LABEL_ZOOM_LARGE_ONLY = MIN_ZOOM + 1
const LABEL_ZOOM_ALL = MIN_ZOOM + 2
// Below this footprint area a building's code label counts as "crowded" and
// waits for LABEL_ZOOM_ALL rather than LABEL_ZOOM_LARGE_ONLY. Tuned against
// the actual campus footprints (small residences/annexes vs. halls like
// Morisset or Tabaret).
const SMALL_BUILDING_AREA_M2 = 3000

const OFFICIAL_MAP_URL = 'https://www.uottawa.ca/about-us/administration-services/facilities/campus-maps'

// Bundled offline copies of the CARTO tiles below (see public/tiles), served
// as plain static files instead of fetched from the CDN - the app needs to
// keep working with no wifi/network at all. Only NATIVE_ZOOM is actually
// downloaded (see scripts/download-campus-tiles.js), not a full pyramid.
// Relative paths so they resolve correctly both under the Vite dev server
// and from the file:// index.html Electron loads in production. No {s}
// subdomain or {r} retina variant - those were only ever about spreading
// load across a live CDN, which doesn't apply to local files.
const LIGHT_TILE_URL = './tiles/light/{z}/{x}/{y}.png'
const DARK_TILE_URL = './tiles/dark/{z}/{x}/{y}.png'
// Kept short (initials rather than the full copyright names) while still
// linking both - CARTO's and OSM's tile terms require attribution to stay
// visible even when the tiles themselves are served from a local cache.
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

// primary-600 from tailwind.config.js - Leaflet's vector styles need a real
// color value, not a Tailwind class name.
const OUTLINE_COLOR = '#334584'
// "Reduce transparency" on hover = more opaque/solid, not less.
const BASE_FILL_OPACITY = 0.35
const HOVER_FILL_OPACITY = 0.65

// Tracks the app's dark-mode toggle (a `dark` class on <html>, flipped by
// Layout/App) via MutationObserver, since this component has no direct prop
// path to that state.
function useIsDarkMode() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() => setIsDark(root.classList.contains('dark')))
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDark
}

// A small pill label showing the building's 3-letter code, used for
// buildings with no OSM outline to sit inside - a bare code floating on the
// basemap with nothing to anchor it would be much harder to spot.
function codeIcon(code: string) {
  return L.divIcon({
    className: 'campus-building-icon',
    html: `<span class="campus-building-icon__label">${code}</span>`,
    iconAnchor: [0, 0],
  })
}

// Plain-text code label for a building that DOES have an outline - no pill/
// box, since the shaded outline itself already sets it apart from the map.
function codeTextIcon(code: string) {
  return L.divIcon({
    className: 'campus-building-icon',
    html: `<span class="campus-building-code-label">${code}</span>`,
    iconAnchor: [0, 0],
  })
}

// A plain dot marker for an outdoor space - unlike buildings, these have no
// code to show and aren't part of the search/filter results, so there's
// nothing to label them with beyond the hover tooltip (see the Marker below).
function outdoorSpaceIcon() {
  return L.divIcon({
    className: 'campus-outdoor-icon',
    html: '<span class="campus-outdoor-icon__dot"></span>',
    iconAnchor: [0, 0],
  })
}

// True area-weighted polygon centroid (not just an average of the vertices,
// and not Leaflet's own bounds-center) so the code label lands inside the
// shape even for L-shaped/concave building footprints, where a bounding-box
// or vertex-average center can fall outside the outline entirely.
//
// Coordinates are recentered on the first point before the shoelace math:
// the formula subtracts near-equal cross products of the raw lat/lng values
// (~45, ~-75), and for a small building footprint the "real" signal is tiny
// next to that ~45/-75 offset - direct floating-point subtraction loses
// almost all precision (catastrophic cancellation), throwing the result off
// by tens of meters. Working in small offsets from a local origin keeps the
// arithmetic numerically stable; the origin is added back at the end.
function polygonCentroid(points: [number, number][]): [number, number] {
  const [ox, oy] = points[0]
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = points[i][0] - ox
    const y0 = points[i][1] - oy
    const x1 = points[i + 1][0] - ox
    const y1 = points[i + 1][1] - oy
    const cross = x0 * y1 - x1 * y0
    area += cross
    cx += (x0 + x1) * cross
    cy += (y0 + y1) * cross
  }
  area *= 0.5
  if (area === 0) {
    const n = points.length
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n]
  }
  return [cx / (6 * area) + ox, cy / (6 * area) + oy]
}

// Real-world footprint area in square metres, used to decide whether a
// building's code label counts as "crowded" at the intermediate zoom level.
// Converts lat/lng offsets to metres (111,320 m/degree latitude, scaled by
// cos(latitude) for longitude) before the shoelace formula - same
// recentering-on-the-first-point approach as polygonCentroid, for the same
// floating-point precision reason.
function polygonAreaM2(points: [number, number][]): number {
  const [oLat, oLng] = points[0]
  const mPerDegLat = 111320
  const mPerDegLng = 111320 * Math.cos((oLat * Math.PI) / 180)
  let area = 0
  for (let i = 0; i < points.length - 1; i++) {
    const x0 = (points[i][1] - oLng) * mPerDegLng
    const y0 = (points[i][0] - oLat) * mPerDegLat
    const x1 = (points[i + 1][1] - oLng) * mPerDegLng
    const y1 = (points[i + 1][0] - oLat) * mPerDegLat
    area += x0 * y1 - x1 * y0
  }
  return Math.abs(area / 2)
}

// Whether a building's code label should render at the current zoom - a
// selected (single search result) building always shows its label
// regardless of zoom, since the map has just flown in specifically to show
// it.
function shouldShowLabel(building: CampusBuilding, zoom: number, isSelected: boolean): boolean {
  if (isSelected) return true
  if (zoom >= LABEL_ZOOM_ALL) return true
  if (zoom < LABEL_ZOOM_LARGE_ONLY) return false
  // Point-fallback buildings have no outline to measure, so treat them as
  // "crowded" and hold them back to the fully-zoomed-in tier.
  if (!building.polygons) return false
  return polygonAreaM2(building.polygons[0]) >= SMALL_BUILDING_AREA_M2
}

// Lifts the map's current zoom level into React state - a plain function
// component can't reach the Leaflet map instance directly, so this lives
// inside <MapContainer> and reads it via useMap()/useMapEvent().
const ZoomTracker: React.FC<{ onZoomChange: (zoom: number) => void }> = ({ onZoomChange }) => {
  const map = useMap()

  useEffect(() => {
    onZoomChange(map.getZoom())
    // Only run once on mount to capture the initial zoom - zoomend below
    // handles every change after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useMapEvent('zoomend', () => onZoomChange(map.getZoom()))

  return null
}

// Pans/zooms the map to fit the current search results - a plain function
// component can't reach the Leaflet map instance directly, so this lives
// inside <MapContainer> and reads it via useMap().
const SearchFlyTo: React.FC<{ query: string; results: CampusBuilding[] }> = ({ query, results }) => {
  const map = useMap()
  // The map already opens on the both-campuses home view (see
  // BOTH_CAMPUS_CENTER/MIN_ZOOM) - without this, this effect's own initial
  // run (query is '' before anyone has typed anything) would immediately
  // re-fly it to that same view, causing a pointless animation on load.
  // Only an actual clear-after-searching should trigger the reset flyTo.
  const isFirstRun = useRef(true)

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      return
    }
    if (!query) {
      map.flyTo(BOTH_CAMPUS_CENTER, MIN_ZOOM, { duration: 0.5 })
      return
    }
    if (results.length === 0) return
    if (results.length === 1) {
      const only = results[0]
      if (only.polygons) {
        map.flyToBounds(L.latLngBounds(only.polygons.flat()), { padding: [60, 60], duration: 0.5 })
      } else {
        map.flyTo(only.position, 18, { duration: 0.5 })
      }
    } else {
      const points = results.flatMap(r => (r.polygons ? r.polygons.flat() : [r.position]))
      map.flyToBounds(L.latLngBounds(points), { padding: [40, 40], duration: 0.5 })
    }
    // Only re-run when the search query changes, not on every keystroke's
    // intermediate `results` array identity or map instance re-creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return null
}

// One building's outline, possibly made of several touching pieces (see
// campusBuildings.ts) that all highlight together on hover - `weight`/
// `fillOpacity` swap to the hover values regardless of which piece the
// pointer is actually over, so the whole building reads as one shape.
const BuildingOutline: React.FC<{
  building: CampusBuilding
  isHovered: boolean
  isSelected: boolean
  showLabel: boolean
  onHoverChange: (code: string | null) => void
}> = ({ building, isHovered, isSelected, showLabel, onHoverChange }) => {
  if (!building.polygons) return null

  const popup = (
    <Popup closeButton={false}>
      <span className="font-semibold">{building.code}</span> — {building.name}
      <br />
      <span className="text-gray-500">{building.address}</span>
    </Popup>
  )
  const pathOptions = {
    color: OUTLINE_COLOR,
    weight: 1,
    fillColor: OUTLINE_COLOR,
    fillOpacity: isHovered ? HOVER_FILL_OPACITY : BASE_FILL_OPACITY,
  }
  const eventHandlers = {
    mouseover: () => onHoverChange(building.code),
    mouseout: () => onHoverChange(null),
  }

  return (
    <>
      {building.polygons.map((ring, i) => (
        <Polygon key={i} positions={ring} pathOptions={pathOptions} eventHandlers={eventHandlers}>
          {/* Name only appears once a building is actually selected (a
              single search match) - not on hover. Hover still darkens the
              fill (isHovered/eventHandlers above) as a lighter affordance
              that the shape is interactive, but the name itself is reserved
              for a deliberate selection, same as the outdoor-space dots'
              click-only Popup. Only the main chunk (ring 0) carries it - a
              merged-in extension has no name of its own to show. */}
          {isSelected && i === 0 && (
            <Tooltip permanent direction="top" className="campus-hover-name-tooltip">
              {`${building.name} — ${building.address}`}
            </Tooltip>
          )}
          {popup}
        </Polygon>
      ))}
      {showLabel && (
        <Marker
          // The code label sits on whichever ring is physically biggest,
          // not always ring 0 (the primary/named match) - a merged-in
          // extension occasionally turns out larger than the building's
          // own matched footprint (e.g. NCL), and the label should read
          // as anchored to the building's dominant visible shape.
          position={polygonCentroid(
            building.polygons.reduce((biggest, ring) =>
              polygonAreaM2(ring) > polygonAreaM2(biggest) ? ring : biggest,
            ),
          )}
          icon={codeTextIcon(building.code)}
          interactive={false}
        />
      )}
    </>
  )
}

const CampusMapSection: React.FC = () => {
  const { t } = useTranslation()
  const isDark = useIsDarkMode()
  const [search, setSearch] = useState('')
  const [hoveredCode, setHoveredCode] = useState<string | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const mapRef = useRef<L.Map | null>(null)

  const query = search.trim().toLowerCase()
  const results = useMemo(() => {
    if (!query) return ALL_BUILDINGS
    return ALL_BUILDINGS.filter(
      b =>
        b.code.toLowerCase().includes(query) ||
        b.name.toLowerCase().includes(query) ||
        b.address.toLowerCase().includes(query),
    )
  }, [query])
  // A single matching result counts as "selected" - the map flies in on it
  // (see SearchFlyTo) and its label/address should stay visible regardless
  // of the zoom-based crowding rules.
  const selectedCode = results.length === 1 ? results[0].code : null

  const flyToCampus = (center: [number, number], targetZoom: number) => {
    mapRef.current?.flyTo(center, targetZoom, { duration: 0.6 })
  }

  return (
    <div className="card mt-4">
      <div className="card-header-flush">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Same width as one of the pills in the 3 middle dashboard tiles
              above: those sit inside a px-6 tile that's itself 1 of 3 equal
              grid columns (gap-4 apart) spanning this section's own
              container width, so this solves for that same final pill
              width relative to this pill's own (also px-6) container. */}
          <TitleBadge icon={<MapPin className="w-5 h-5" />} className="w-full md:w-[calc((100%+1rem)/3-3rem)]">
            {t('campusMap.title')}
          </TitleBadge>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('campusMap.searchPlaceholder')}
                className="w-full sm:w-80 rounded-md border border-gray-300 pl-9 pr-9 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('common.close')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <a
              href={OFFICIAL_MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {t('campusMap.openOfficial')}
            </a>
          </div>
        </div>
      </div>

      <div className="card-body">
        {query && (
          <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
            {results.length > 0
              ? t('campusMap.resultsCount', { count: results.length })
              : t('campusMap.noResults')}
          </p>
        )}

        <div
          className={cn(
            'relative h-[32rem] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700',
            isDark && 'campus-map-dark',
          )}
        >
          {/* Floating on top of the map itself (top-right, clear of Leaflet's
              own zoom control at top-left) rather than in the card header -
              these jump straight to a view of the map underneath them, so
              they read as map controls, not page chrome. */}
          <div className="absolute top-3 right-3 z-[1000] flex gap-2">
            <button
              type="button"
              onClick={() => flyToCampus(BOTH_CAMPUS_CENTER, MIN_ZOOM)}
              className="px-3 py-1.5 rounded-full bg-primary-600 text-white text-xs font-medium shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {t('campusMap.allCampuses')}
            </button>
            <button
              type="button"
              onClick={() => flyToCampus(MAIN_CAMPUS_CENTER, MAIN_CAMPUS_ZOOM)}
              className="px-3 py-1.5 rounded-full bg-primary-600 text-white text-xs font-medium shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {t('campusMap.mainCampus')}
            </button>
            <button
              type="button"
              onClick={() => flyToCampus(LEES_CAMPUS_CENTER, LEES_CAMPUS_ZOOM)}
              className="px-3 py-1.5 rounded-full bg-primary-600 text-white text-xs font-medium shadow-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              {t('campusMap.leesCampus')}
            </button>
          </div>

          <MapContainer
            ref={mapRef}
            center={BOTH_CAMPUS_CENTER}
            zoom={MIN_ZOOM}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            maxBounds={MAX_BOUNDS}
            maxBoundsViscosity={1.0}
            scrollWheelZoom={false}
            // Canvas instead of SVG for the building outlines - well over a
            // hundred polygons (Main + Lees) as individual SVG elements with
            // their own hover/tooltip listeners was the main source of the
            // map feeling sluggish while panning/zooming.
            preferCanvas
            className="h-full w-full"
          >
            <TileLayer
              attribution={TILE_ATTRIBUTION}
              url={isDark ? DARK_TILE_URL : LIGHT_TILE_URL}
              // Only NATIVE_ZOOM's tiles exist on disk - these two make
              // Leaflet reuse them at every other zoom in [MIN_ZOOM,
              // MAX_ZOOM] instead of requesting tiles that don't exist.
              minNativeZoom={NATIVE_ZOOM}
              maxNativeZoom={NATIVE_ZOOM}
            />
            <SearchFlyTo query={query} results={results} />
            <ZoomTracker onZoomChange={setZoom} />
            {results.map(building => {
              const isSelected = building.code === selectedCode
              return building.polygons ? (
                <BuildingOutline
                  key={building.code}
                  building={building}
                  isHovered={hoveredCode === building.code}
                  isSelected={isSelected}
                  showLabel={shouldShowLabel(building, zoom, isSelected)}
                  onHoverChange={setHoveredCode}
                />
              ) : (
                shouldShowLabel(building, zoom, isSelected) && (
                  <Marker key={building.code} position={building.position} icon={codeIcon(building.code)}>
                    {/* Name only on selection (see BuildingOutline above) - no
                        hover tooltip here either. */}
                    {isSelected && (
                      <Tooltip permanent className="campus-hover-name-tooltip">
                        {`${building.name} — ${building.address}`}
                      </Tooltip>
                    )}
                    <Popup closeButton={false}>
                      <span className="font-semibold">{building.code}</span> — {building.name}
                      <br />
                      <span className="text-gray-500">{building.address}</span>
                    </Popup>
                  </Marker>
                )
              )
            })}
            {/* Held back to LABEL_ZOOM_ALL (the same zoom step where every
                building's own code label shows) rather than always-on -
                24+ extra dots on top of the full building set at the
                zoomed-out home view would be too crowded to read. No
                Tooltip (unlike the building markers above) - the name
                should only show once a dot is actually clicked/selected,
                via the Popup below, not on every incidental hover. */}
            {zoom >= LABEL_ZOOM_ALL &&
              OUTDOOR_SPACES.map(space => (
                <Marker key={space.name} position={space.position} icon={outdoorSpaceIcon()}>
                  <Popup closeButton={false}>
                    {space.name}
                    {space.description && (
                      <>
                        <br />
                        <span className="text-gray-500">{space.description}</span>
                      </>
                    )}
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>
        <p className="mt-3 text-xs italic text-gray-400 dark:text-gray-500">{t('campusMap.approximateNote')}</p>
      </div>
    </div>
  )
}

export default CampusMapSection
