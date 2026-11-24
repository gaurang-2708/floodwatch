# FloodWatch walkthrough: feature inventory, chapter plan and narration

Read by `scripts/record-walkthrough.mts`. Everything below the `narration` marker is the spoken script: each `### key`
section is one scene, and each line in it is one sentence (one TTS clip and one subtitle). Lines are written in their
display form; the recorder swaps in TTS-friendly spellings ("Flood Watch", "Socket I O", "Type Script") for the voice only.
A line starting with `[caption] ` is shown as a subtitle but not spoken (silence for 2.6 s).

## Feature inventory (from the code and README)

1. Header: brand, "Demo City · Road flood monitoring", live local clock, connection badge (Live · server stream / Offline demo · local simulator), info button
2. "About this dashboard" intro for first-time visitors: dismissible, remembered in localStorage, reopened with the info button
3. KPI cards: roads per severity (Critical, Warning, Watch, Normal) with a plain road-impact label and a 30-minute sparkline
4. "Roads affected now" card: Warning + Critical out of 25, with a stacked severity bar
5. Live map (Leaflet, label-free Esri dark grey basemap, no API key): 25 markers coloured by severity; Critical markers are larger, pulse and sit on top; selected marker grows
6. Marker hover tooltip: road name, depth in cm, road impact
7. Map legend "Water on the road": each level's depth threshold and road impact
8. Road list: worst first (severity, then depth), depth gauge per road, zone and road impact, count in the title, selected-row highlight
9. Sort toggle: Worst first / A to Z
10. Zone filter chips (All zones, Central, North, East, West): filter both the list and the map
11. Site detail drawer: zone and sensor ID, current depth, severity badge, depth bar, one-sentence explanation
12. 30-minute depth chart with labelled Watch/Warning/Critical bands, hover tooltip, live-appending readings (history from `GET /api/sites/:id/history`)
13. "How it is measured": ultrasonic sensor height, distance to water, last reading time
14. Drawer closes with the X button or Escape
15. Alert feed: empty state, new alert when a road rises into Warning or Critical (newest first, time, depth), "N this session" counter
16. Alert hysteresis: re-arms only after the level drops 5 cm below the threshold (no alert spam)
17. Click an alert to open that road
18. Real-time stream: Socket.IO `reading` event for every site every 3 s
19. Offline fallback: server unreachable, the browser runs the same simulator ("Offline demo" badge); automatic reconnect back to Live
20. Phone layout: stacked cards, full-width map and list, detail as a bottom sheet over a dimmed page, tap outside to close
21. Under the hood: shared TypeScript package (sensor model, severity rules, deterministic stateless simulator, staggered storms by zone, Vitest tests), Express REST API (`/api/sites`, `/api/sites/:id/history`), React + Vite + Tailwind client, react-leaflet, Recharts
22. Footer note: all sites and readings are simulated (said in the intro)

## Chapter plan

| # | Chapter | Covers (inventory #) |
|---|---------|----------------------|
| 01 | A control room at a glance | 1, 2, 22 |
| 02 | Severity in numbers | 3, 4 |
| 03 | The live map | 5, 6, 7 |
| 04 | Every road, sorted | 8, 9, 10 |
| 05 | Inspect a flooded road | 11, 12, 13, 14 |
| 06 | Alerts as water rises | 15, 16, 17 |
| 07 | Live, even when offline | 18, 19 |
| 08 | In the field, on a phone | 20 |
| 09 | Under the hood | 21 |
| Recap | Every feature + tech stack | all |

<!-- narration -->

### intro
[caption] Hi, I'm Gaurang Prajapati.
This is FloodWatch, a real-time flood monitoring dashboard for city roads and underpasses.

### c1
During the monsoon, low roads can flood within minutes, and a control room has to know which ones are under water right now.
FloodWatch answers that on one screen, for twenty-five simulated sensor sites in a fictional Demo City.
First-time visitors get a short, plain-English introduction.
Close it once and it stays closed, and the info button brings it back at any time.
The header shows the local time, and whether data is streaming live from the server.

### c2
Every road is graded on four levels, from Normal to Critical, and each level is written as a plain road impact.
Each card counts the roads at that level, with a thirty-minute trend line beside it.
And this card answers the real question: how many roads are affected right now.

### c3
The map shows every sensor site, coloured by severity.
Critical roads are larger, they pulse, and they always sit on top, so they're never hidden.
Hover any marker to see its name, its water depth, and what it means for traffic.
The legend spells out each colour, with the exact depth thresholds.

### c4
Beside the map, every road is listed worst first, with a depth gauge for each one.
One click switches the list to A to Z.
Zone filters narrow both the list and the map, so a team can focus on its own area.

### c5
Clicking a road opens its detail panel.
It shows the depth right now, a status badge, and one sentence on what it means for drivers.
The chart covers the last thirty minutes, with a labelled band for each threshold, and it keeps updating live.
Hover the line to read any past value.
Here is how the number is measured: an ultrasonic sensor above the road reports its distance to the water.
Depth is simply the sensor height minus that distance.
Press Escape, or the close button, to dismiss the panel.

### c6
The alert feed fills itself. When a road rises into Warning or Critical, a new alert appears at the top.
There's one now.
To avoid alert spam, a road only re-arms after the water drops five centimetres below the line.
Click an alert to jump straight to that road.

### c7
Readings stream from a Node server over Socket.IO, every three seconds.
But what if the server goes down?
The dashboard switches to offline demo mode, and runs the very same simulator in the browser, so the screen never freezes.
When the server comes back, it reconnects on its own and goes live again.

### c8
The same app works on a phone, for crews out in the field.
The cards stack, and the map and the road list are sized for a thumb.
Tapping a road opens its details as a bottom sheet, over a dimmed page.
Tap outside the sheet to close it.

### c9
Under the hood, it's TypeScript end to end, in three packages.
A shared package holds the sensor model, the severity rules and a deterministic simulator, all covered by unit tests.
Every reading is a pure function of the site and the time, so the server and the browser always agree.
Water level is never stored. It's derived from the raw sensor distance, so thresholds can change without rewriting any data.
An Express server adds a small REST API and the Socket.IO stream, and the React client draws the map with Leaflet and the charts with Recharts.

### recap
That's the full tour: a live map, severity cards, a filterable road list, road history, smart alerts, an offline fallback, and a phone layout.

### outro
[caption] I'm Gaurang Prajapati, a full-stack developer, available for freelance work. Thanks for watching.
