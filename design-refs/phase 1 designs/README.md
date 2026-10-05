# design-refs

Visual source of truth for the modelwright desktop UI. Artboards are 1440×900, light mode, exported at 2x. Each PNG has a matching static .html with inline styles. Every colour, radius, spacing and shadow value comes from the token list below. Implement them as CSS custom properties.

## Files

- `01-picker-empty.png`: project picker as a modal over the empty shell, first run. Path field focused with placeholder, Open button, empty recents panel.
- `02-picker-recents.png`: picker modal with 5 recent projects (name, path, last opened). Row 2 is in hover state with its remove control. Path field shows the inline error "No folder at that path".
- `03-picker-initialise.png`: picker modal after opening a folder with no .design/. "Initialise modelwright in this folder" panel with focused project name field, Cancel and Initialise.
- `04-shell-erd.png`: shell with a project open in ERD view. Header has the project name in editing state, folder path, ERD · Flows · UI toggle, Reload and close icon. Empty dot-grid canvas with a floating toolbar (Add entity, zoom, Fit) and the save-status indicator bottom-left (Saved).
- `05-shell-empty-states.png`: empty states for all three views side by side. ERD "No entities yet", Flows "No screens yet", UI "No preview URL set". Header shows the project name at rest.
- `06-shell-validation-error.png`: ERD view when .design/erd.json is invalid. Problem list (path + message) replaces the canvas, with Reload and Copy problems. ERD segment carries a warning dot. Flows and UI stay usable.
- `07-components.png`: components and tokens sheet. Segmented toggle (each segment active, hover, warning), buttons (primary, secondary, quiet, icon × rest/hover/pressed), text input (default, focus, error), inline-editable name (rest, hover, editing), save status (Saved, Saving…, Unsaved changes, Couldn't save — retry), recents row (rest, hover), and the full token list.

Hover and press states are drawn as static states on 07. Interactions use `--duration-fast` with `--ease-out`. Pressed buttons scale to `--press-scale`.

## Tokens

### Colour

- `--color-bg`: `#F7F7F5`
- `--color-surface`: `#FFFFFF`
- `--color-surface-sunken`: `#F1F1EE`
- `--color-surface-hover`: `#EBEBE7`
- `--color-border`: `#E4E4E0`
- `--color-border-strong`: `#CFCFCA`
- `--color-dot`: `#D6D6D1`
- `--color-text`: `#1C1C1A`
- `--color-text-muted`: `#6A6A65`
- `--color-text-faint`: `#9B9B95`
- `--color-accent`: `#3E55CF`
- `--color-accent-hover`: `#3447B5`
- `--color-accent-subtle`: `#ECEFFB`
- `--color-on-accent`: `#FFFFFF`
- `--color-on-accent-muted`: `#C9D0F5`
- `--color-focus-ring`: `#3E55CF33`
- `--color-success`: `#2E7D50`
- `--color-warning`: `#A15C07`
- `--color-warning-subtle`: `#FBF3E6`
- `--color-error`: `#BF3A30`
- `--color-error-subtle`: `#FBEDEB`
- `--color-error-ring`: `#BF3A3026`
- `--color-scrim`: `#1C1C1A3D`

### Type

- `--font-mono`: `'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace`
- `--text-xs`: `11px / 16px`
- `--text-sm`: `12px / 18px`
- `--text-md`: `13px / 20px`
- `--text-lg`: `16px / 24px`
- `--text-xl`: `20px / 28px`
- `--weight-regular`: `400`
- `--weight-medium`: `500`
- `--weight-semibold`: `600`
- `--tracking-label`: `0.04em`

### Radius

- `--radius-sm`: `4px`
- `--radius-md`: `6px`
- `--radius-lg`: `10px`
- `--radius-full`: `999px`

### Size

- `--header-h`: `44px`
- `--control-h`: `28px`
- `--control-h-lg`: `36px`
- `--segment-h`: `24px`
- `--modal-w`: `960px`
- `--modal-h`: `640px`

### Spacing

- `--space-0`: `2px`
- `--space-1`: `4px`
- `--space-2`: `8px`
- `--space-3`: `12px`
- `--space-4`: `16px`
- `--space-5`: `24px`
- `--space-6`: `32px`
- `--space-7`: `48px`
- `--space-8`: `64px`
- `--space-9`: `96px`

### Shadow · motion

- `--shadow-sm`: `0 1px 2px #1C1C1A0F, 0 0 0 1px #1C1C1A0A`
- `--shadow-md`: `0 4px 16px #1C1C1A14, 0 1px 3px #1C1C1A0F`
- `--shadow-lg`: `0 24px 64px #1C1C1A29, 0 2px 8px #1C1C1A14`
- `--duration-fast`: `120ms`
- `--ease-out`: `cubic-bezier(.2,.8,.2,1)`
- `--press-scale`: `0.98`
