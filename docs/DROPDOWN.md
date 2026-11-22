# Dropdown component (`frontend/src/Dropdown.jsx`)

An accessible single-select dropdown (WAI-ARIA select-only combobox) used for the HR case-type list (filter on the HR cases page and the "Type of case" field of a new case). The options are not typed anywhere in the component: they come from the existing translations (`case.type.*`, `All types`), exactly as in the original screenshot (12 options, Amharic).

Use it anywhere: `<Dropdown value onChange options={[[value, label], ...]} ariaLabel />`, or inside forms `<Field type="dropdown" label="..." required options={...} />` (same props as `type="select"`). Native selects elsewhere are unchanged.

* Keyboard: Enter / Space / Arrow keys open; Up, Down, Home, End, PageUp, PageDown move; Enter or Space selects; Escape closes (and does not close a surrounding dialog); Tab selects the highlighted option and moves on; typing the first letters selects (works with Ethiopic text).
* Mouse and touch: click to open and choose; a click outside closes. The selected option has a check mark, bold text and `aria-selected`; the highlighted option is blue like the screenshot.
* Small screens (up to 640 px): the list opens as a bottom sheet with 48 px touch targets and a dimmed background.
* Validation: a hidden native input carries `required`, so normal form validation blocks an empty submit and focuses the control.
* Amharic: long labels wrap; the existing Ethiopic font stack (`Noto Sans Ethiopic`, `Nyala`, `Abyssinica SIL`) is used.
* Tested in `frontend/scripts/smoke-render.mjs` (exact 12 Amharic options in order, End / Enter / Home / ArrowUp / typeahead / Escape / mouse selection, required validation).
