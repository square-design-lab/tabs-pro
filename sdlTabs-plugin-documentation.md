# sdlTabs — Squarespace Tabs Plugin Documentation

A comprehensive reference for the `sdlTabs` plugin: how it works, all available features, configuration options, and step-by-step installation instructions for Squarespace sites.

---

## Table of Contents

1. [Overview](#overview)
2. [How the Plugin Works](#how-the-plugin-works)
3. [Installation Methods](#installation-methods)
   - [Method 1: Source (Portfolio Collection)](#method-1-source-portfolio-collection)
   - [Method 2: Sections (Page Sections)](#method-2-sections-page-sections)
4. [Adding the Plugin to Squarespace](#adding-the-plugin-to-squarespace)
5. [Configuration Settings Reference](#configuration-settings-reference)
6. [Navigation Types](#navigation-types)
7. [Responsive Breakpoints](#responsive-breakpoints)
8. [CSS Customization Variables](#css-customization-variables)
9. [Advanced Features](#advanced-features)
10. [Data Attributes Quick Reference](#data-attributes-quick-reference)
11. [JavaScript Events & Hooks](#javascript-events--hooks)
12. [Accessibility](#accessibility)
13. [Edit Mode Behavior](#edit-mode-behavior)
14. [Nested Tabs](#nested-tabs)
15. [Troubleshooting](#troubleshooting)

---

## Overview

`sdlTabs` is a JavaScript class-based plugin that transforms Squarespace page content into an interactive tabbed interface. It pulls content from either a **Portfolio collection** (via an AJAX fetch) or directly from **Squarespace page sections** (by physically moving DOM elements into tab panels). It supports horizontal tabs, vertical tabs, accordion-style dropdowns, and a mobile-friendly select/dropdown navigation.

---

## How the Plugin Works

### Initialization Flow

1. The page loads and the IIFE at the bottom of `plugin.js` scans the DOM for all elements with `data-sdl-plugin="tabs"`.
2. For each matching element, a new `sdlTabs` instance is created.
3. The constructor reads the element's `data-*` attributes to build **instance settings**, merging them with default settings and any global `window.sdlTabsSettings` override.
4. Depending on whether a `data-source` attribute is present, the plugin chooses one of two content-loading strategies.
5. The HTML structure (nav, tab buttons, tab panels) is built and injected into the DOM.
6. Events are bound, the initial tab is opened, and the loading state is set to `"loaded"`.

### DOM Structure Produced

```
[data-sdl-plugin="tabs"]   ← your Code Block container
  └── .sdl-tabs
        └── .tabs-wrapper
              ├── .select-navigation-container   ← only when select nav is enabled
              │     └── .select-navigation
              │           ├── .select-button-container > button
              │           └── .select-items-container > .select-items-wrapper
              │                 └── button.select-item  (× N tabs)
              ├── .tabs-header
              │     ├── .scroll-indicator-container
              │     │     ├── button.scroll-indicator.indicator-start
              │     │     └── button.scroll-indicator.indicator-end
              │     └── .nav-container
              │           └── nav[role="tablist"]
              │                 ├── .indicator-track > span.active-indicator
              │                 └── button[role="tab"]  (× N tabs)
              └── .tabs-content
                    └── .tabs-content-wrapper
                          └── article.tab-panel[role="tabpanel"]  (× N tabs)
                                └── .tab-content
                                      └── (page sections / fetched HTML)
```

---

## Installation Methods

### Method 1: Source (Portfolio Collection)

Tab content is fetched from a **Portfolio collection page**. Each portfolio item becomes one tab:

- The portfolio item's **title** becomes the tab button label.
- The portfolio item's **body content** (page sections) becomes the tab panel content.
- The portfolio item's **thumbnail image** can optionally be shown in the tab button (`tabImages: true`).

**When to use:** You want to manage tab content through Squarespace's standard page editor without touching code. Each "tab" is a separate portfolio page.

**Trigger:** The presence of a `data-source` attribute pointing to a Portfolio collection URL path (e.g. `data-source="/portfolio-slug"`).

### Method 2: Sections (Page Sections)

Tab buttons are defined in a Code Block using plain `<button>` elements. Each button targets one or more existing **Squarespace page sections** which are physically moved into tab panels at runtime.

**When to use:** You want full Fluid Engine / Classic layout control inside each tab, and the content already exists as sections on the same page.

**Trigger:** The presence of `<button>` elements inside the Code Block, with optional `data-target` attributes pointing to specific sections.

---

## Adding the Plugin to Squarespace

### Step 1: Add CSS and JS Files

In Squarespace, go to **Settings → Advanced → Code Injection**.

In the `<head>` field, add:

```html
<!-- sdlTabs CSS -->
<link rel="stylesheet" href="/s/plugin.css">
```

In the footer (`</body>` injection) field, add:

```html
<!-- sdlTabs JS -->
<script src="/s/plugin.js"></script>
```

> **Note:** Upload `plugin.css` and `plugin.js` via **Settings → Advanced → File Storage** first, then reference them by their `/s/filename` URL.

Alternatively, paste the contents of each file directly into `<style>` and `<script>` tags in the code injection fields.

---

### Step 2: Set Up a Portfolio Collection (Method 1 only)

1. Create a **Portfolio** section in Squarespace pages.
2. Add one portfolio item per tab. Each item's title = tab label; its body = tab content.
3. Note the URL slug (e.g. `/my-tabs-content`).

---

### Step 3: Add a Code Block

On the page where you want the tabs to appear, add a **Code Block** and use one of the setups below.

#### Method 1 — Portfolio Source

```html
<div
  data-sdl-plugin="tabs"
  data-source="/your-portfolio-slug"
></div>
```

**With options:**

```html
<div
  data-sdl-plugin="tabs"
  data-source="/your-portfolio-slug"
  data-desktop-navigation-type="horizontal"
  data-mobile-navigation-type="select"
  data-tab-images="true"
  data-sticky-nav="true"
  data-update-url="true"
></div>
```

#### Method 2 — Page Sections

```html
<div data-sdl-plugin="tabs">
  <button>Tab One</button>
  <button>Tab Two</button>
  <button>Tab Three</button>
</div>
```

Each button automatically targets the next sibling page section. To target a specific section by ID:

```html
<div data-sdl-plugin="tabs">
  <button data-target="section[data-section-id='YOUR-SECTION-ID'].page-section">Tab One</button>
  <button data-target="section[data-section-id='YOUR-OTHER-ID'].page-section">Tab Two</button>
</div>
```

---

### Step 4: (Optional) Global Settings Override

To apply settings across all tab instances on the site, add a `<script>` block before the plugin script:

```html
<script>
  window.sdlTabsSettings = {
    triggerEvent: "click",
    stickyNav: true,
    updateUrl: true,
    breakpoints: {
      0: { navigationType: "select" },
      767: { navigationType: "horizontal" }
    }
  };
</script>
```

---

## Configuration Settings Reference

All settings can be set as `data-*` attributes on the container element, or globally via `window.sdlTabsSettings`. Data attributes use `__` as a separator for nested keys (e.g. `data-breakpoints__767__navigationType="vertical"`).

| Setting | Type | Default | Description |
|---|---|---|---|
| `tabImages` | Boolean | `false` | Show the portfolio item's thumbnail image inside each tab button. |
| `tabButtonTag` | String | `"h4"` | HTML tag wrapping the tab label text (e.g. `"h3"`, `"span"`). |
| `tabLimit` | Number / false | `false` | Limit the number of tabs rendered. |
| `updateUrl` | Boolean | `false` | Update the browser URL hash when a tab is opened. |
| `setInitialUrl` | Boolean | `false` | Set the URL hash on the initially loaded tab. |
| `triggerEvent` | `"click"` / `"hover"` | `"click"` | Open tabs on click or on mouse hover. |
| `stickyNav` | Boolean | `false` | Make the tab navigation bar sticky as the user scrolls. |
| `stickyNavThrottle` | Number | `100` | Scroll event throttle in ms for sticky nav. |
| `stickyNavOffset` | Number | `17` | Pixel offset from the top of the viewport for the sticky nav. |
| `scrollBackToTop` | Boolean | `true` | Scroll page back to the top of the tabs when switching tabs. |
| `scrollBackOffset` | Number | `150` | Pixel offset used when scrolling back to top. |
| `scrollBackBehavior` | `"auto"` / `"smooth"` | `"auto"` | Scroll behavior when returning to the top of the tabs. |
| `overflowIndicatorAction` | `"scroll"` / `"move"` | `"scroll"` | Overflow arrow buttons scroll the nav bar (`"scroll"`) or jump to next/previous tab (`"move"`). |
| `swipeThreshold` | Number | `50` | Minimum pixel distance for a swipe to register as a tab change. |
| `dragStartThreshold` | Number | `10` | Minimum pixel movement before a drag is initiated. |
| `slideTransitionDuration` | Number | `300` | Duration in ms for the slide transition animation. |
| `weglotPaths` | Array | `[]` | Array of Weglot language path prefixes for multilingual sites. |
| `allowClickAndDrag` | Boolean | `false` | Allow mouse click-and-drag to swipe between tabs. |
| `edgeToEdge` | Boolean | `false` | Extend full-width Fluid Engine sections to the screen edge inside tabs. |
| `allowTouchSwipe` | Boolean | `false` | Allow touch swipe gestures to navigate between tabs. |
| `disableAutoScroll` | Boolean | `false` | Disable automatic scrolling of the nav bar to the active tab button. |
| `enableAutoScrollOnLoad` | Boolean | `true` | Scroll the page to the tabs on load if a matching URL hash is found. |
| `centerActiveTab` | Boolean | `false` | Center the active tab button in the nav bar when scrolling. |
| `scrollTolerance` | Number | `3` | Pixel tolerance for nav overflow indicator detection. |
| `scrollTabActivateTolerance` | Number | `50` | Pixel tolerance before the nav auto-scrolls to reveal the active tab. |
| `isSectionsAdjusted` | Boolean | `false` | Internally tracked; set to `true` when sections installation method is used. |
| `accordionIcon` | HTML String | SVG arrow | SVG icon for the accordion expand/collapse button. |
| `overflowIndicatorStart` | HTML String | SVG left arrow | SVG icon for the left/top overflow scroll indicator. |
| `overflowIndicatorEnd` | HTML String | SVG right arrow | SVG icon for the right/bottom overflow scroll indicator. |
| `selectButtonIcon` | HTML String | SVG chevron | SVG icon for the select dropdown toggle button. |

---

## Navigation Types

The plugin supports four navigation layout types, configurable per breakpoint:

### `horizontal`
Classic top tab bar. Tab buttons are arranged in a horizontal scrollable row above the content. A slide indicator tracks the active tab. A border separates the nav from the content.

### `vertical`
Side tab bar. The layout switches to a CSS grid with the nav on the left and content on the right. The nav column width is controlled by `--vertical-tabs-navbar-width` (default `250px`).

### `select`
A dropdown select menu replaces the tab buttons. Clicking the main button opens a styled dropdown list of tab options. Best for mobile or for a compact UI. Supports sticky positioning.

### `accordion`
Tab panels expand and collapse inline using height animation. The tab button (with an expand icon) is prepended to each panel. Can be used alongside other navigation types at different breakpoints.

---

## Responsive Breakpoints

The `breakpoints` setting maps minimum viewport widths (in px) to a `navigationType`. The plugin evaluates breakpoints from smallest to largest and applies the matching navigation type.

**Default:**
```javascript
breakpoints: {
  0:   { navigationType: "select" },     // mobile: dropdown
  767: { navigationType: "horizontal" }  // desktop: tab bar
}
```

**Custom example (three breakpoints):**
```javascript
breakpoints: {
  0:    { navigationType: "accordion" },
  600:  { navigationType: "select" },
  1024: { navigationType: "vertical" }
}
```

**Shorthand data attributes:**
```html
data-desktop-navigation-type="vertical"
data-mobile-navigation-type="select"
```
These map to `breakpoints[767].navigationType` and `breakpoints[0].navigationType` respectively.

---

## CSS Customization Variables

All visual styling is controlled via CSS custom properties. Set them on the `.sdl-tabs` element or on a parent selector to scope per instance.

### Navigation

| Variable | Default | Description |
|---|---|---|
| `--tabs-nav-border-color` | 50% text opacity | Border color between nav and content |
| `--tabs-nav-border-width` | `2px` | Border thickness |
| `--tabs-header-gap` | `8px` | Gap between tab buttons |
| `--nav-padding-bottom` | `8px` | Padding below the nav bar |
| `--nav-padding-right` | `8px` | Padding to the right of the nav (vertical mode) |
| `--nav-justify-items` | `center` | Horizontal alignment of the nav container |
| `--nav-max-width` | Squarespace site max width | Maximum width of the nav bar |
| `--nav-border-radius` | `0px` | Border radius of the nav bar |
| `--nav-background-color` | `transparent` | Background of the nav bar |
| `--vertical-tabs-navbar-width` | `250px` | Width of the left nav in vertical mode |

### Tab Buttons

| Variable | Default | Description |
|---|---|---|
| `--tab-button-padding-y` | `8px` | Vertical padding inside buttons |
| `--tab-button-padding-x` | `18px` | Horizontal padding inside buttons |
| `--tab-button-font-size` | `inherit` | Font size of the tab label |
| `--tab-button-font-weight` | `inherit` | Font weight of the tab label |
| `--tab-button-font-family` | Heading font / inherit | Font family of the tab label |
| `--tab-button-text-transform` | _(unset)_ | Text transform (e.g. `uppercase`) |
| `--tab-button-border-radius` | `5px` | Button corner radius |
| `--tab-button-border-width` | `0px` | Button border thickness |
| `--tab-button-border-color` | `currentColor` | Button border color |
| `--tab-button-background` | `transparent` | Button background |
| `--tab-button-color` | `currentColor` | Button text/icon color |
| `--tab-button-hover-opacity` | `0.6` | Opacity of label on hover |
| `--tab-button-active-background` | `transparent` | Active button background |
| `--tab-button-active-color` | Accent inverse color | Active button text color |
| `--tab-button-active-border-color` | `currentColor` | Active button border color |
| `--tab-button-active-font-weight` | `inherit` | Font weight when active |
| `--tab-button-flex-direction` | `column` | Flex direction (image + label layout) |
| `--tab-button-align-items` | `center` | Flex align items |
| `--tab-button-justify-content` | `center` | Flex justify content |

### Active Indicator

| Variable | Default | Description |
|---|---|---|
| `--tab-indicator-display` | `block` | Show or hide the indicator (`none` to hide) |
| `--active-indicator-color` | Accent color | Color of the active indicator |
| `--active-indicator-border-radius` | Same as button radius | Indicator corner radius |
| `--active-indicator-border-width` | `0px` | Indicator border thickness |
| `--active-indicator-border-color` | `currentColor` | Indicator border color |
| `--tab-indicator-track-background` | `transparent` | Background of the full indicator track |
| `--tab-indicator-track-size` | `100%` | Height (horizontal) or width (vertical) of track |

### Tab Button Images

| Variable | Default | Description |
|---|---|---|
| `--tab-button-image-width` | `150px` | Width of the image in the tab button |
| `--tab-button-image-aspect-ratio` | `1` | Aspect ratio of the image (e.g. `16/9`) |
| `--tab-button-image-border-radius` | Same as button radius | Image corner radius |

### Select Navigation

| Variable | Default | Description |
|---|---|---|
| `--select-navigation-button-background` | `transparent` | Dropdown trigger background |
| `--select-navigation-button-color` | `currentColor` | Dropdown trigger text color |
| `--select-navigation-button-border-width` | `1px` | Dropdown trigger border |
| `--select-navigation-button-border-color` | 25% text opacity | Dropdown trigger border color |
| `--select-navigation-button-border-radius` | `5px` | Dropdown trigger corner radius |
| `--select-button-font-size` | `1rem` | Font size of dropdown trigger |
| `--select-button-padding-y` | `8px` | Vertical padding |
| `--select-button-padding-x` | `12px` | Horizontal padding |
| `--select-menu-background-color` | Site background | Dropdown panel background |
| `--select-menu-border-color` | Light accent | Dropdown panel border color |
| `--select-menu-border-width` | `1px` | Dropdown panel border thickness |
| `--select-button-hover-background` | 25% text opacity | Hover background for menu items |
| `--select-button-active-color` | Accent color | Color of the active/selected item |
| `--select-navigation-max-height` | `50vh` | Max height of the dropdown panel |

### Content Area

| Variable | Default | Description |
|---|---|---|
| `--tab-content-padding-start` | `8px` | Top padding between nav and content (horizontal/select) |
| `--tab-content-padding-top` | Inherits from `padding-start` | Override top padding specifically |
| `--tab-content-padding-left` | Inherits from `padding-start` | Override left padding (vertical mode) |
| `--tab-content-border-width` | `0px` | Border around the content area |
| `--tab-content-border-style` | `solid` | Border style |
| `--tab-content-border-color` | `currentColor` | Border color |

---

## Advanced Features

### Next / Prev Tab Links

Add `<a href="#next_tab">` or `<a href="#prev_tab">` links inside any tab panel to navigate programmatically:

```html
<!-- Inside a Text Block in your portfolio item or page section -->
<a href="#next_tab">Continue →</a>
<a href="#prev_tab">← Back</a>
```

The plugin automatically intercepts these links and navigates tabs without a page scroll.

### URL Hash Navigation

With `data-update-url="true"`, the URL hash updates to the active tab's ID on every tab switch. Users can share direct links to specific tabs. Tab IDs are auto-generated from the tab title (URL-encoded, lowercased, special characters replaced with hyphens).

On page load, if the URL contains a hash matching a tab ID, that tab opens automatically and the page scrolls to the tabs widget.

### Sticky Navigation

```html
data-sticky-nav="true"
```

The tab navigation bar sticks to the top of the viewport as the user scrolls down past the tabs widget. It automatically accounts for Squarespace fixed headers by reading the site's `tweak-fixed-header` setting.

### Tab Images

```html
data-tab-images="true"
```

When using the Portfolio source method, each tab button displays the portfolio item's thumbnail image above the title. Customize image size and aspect ratio with CSS variables.

### Edge-to-Edge Content

```html
data-edge-to-edge="true"
```

For full-width Fluid Engine sections inside tabs, this feature extends the sections to the screen edges by compensating for the column gap offset.

### Touch Swipe & Click-Drag

```html
data-allow-touch-swipe="true"
data-allow-click-and-drag="true"
```

Enable gesture-based tab navigation. Swiping or dragging horizontally on the content area navigates between tabs. Smart direction detection prevents interference with vertical scrolling.

### Tab Limit

```html
data-tab-limit="5"
```

Restricts the number of tabs rendered when using the Portfolio source method.

### Hover Trigger

```html
data-trigger-event="hover"
```

Opens tabs on mouse hover instead of click. The tab button click event remains active as a fallback.

### Weglot Multilingual Support

```javascript
window.sdlTabsSettings = {
  weglotPaths: ["/fr", "/de", "/es"]
};
```

Provides Weglot path prefixes so the plugin correctly resolves collection data URLs on translated pages.

---

## Data Attributes Quick Reference

All settings can be applied directly as `data-*` attributes on the container element. Nested settings use `__` as the separator:

```html
<div
  data-sdl-plugin="tabs"
  data-source="/portfolio-slug"

  <!-- Navigation -->
  data-desktop-navigation-type="horizontal"
  data-mobile-navigation-type="select"
  data-breakpoints__0__navigationType="accordion"
  data-breakpoints__767__navigationType="vertical"

  <!-- Behavior -->
  data-trigger-event="click"
  data-update-url="true"
  data-set-initial-url="false"
  data-tab-limit="6"

  <!-- Sticky Nav -->
  data-sticky-nav="true"
  data-sticky-nav-offset="20"

  <!-- Scroll -->
  data-scroll-back-to-top="true"
  data-scroll-back-offset="100"
  data-scroll-back-behavior="smooth"
  data-disable-auto-scroll="false"
  data-enable-auto-scroll-on-load="true"
  data-center-active-tab="true"

  <!-- Gestures -->
  data-allow-touch-swipe="true"
  data-allow-click-and-drag="false"
  data-swipe-threshold="50"

  <!-- Appearance -->
  data-tab-images="true"
  data-tab-button-tag="h3"
  data-edge-to-edge="false"

  <!-- Overflow Indicators -->
  data-overflow-indicator-action="scroll"
></div>
```

---

## JavaScript Events & Hooks

### Custom DOM Events

The plugin emits custom events on the `window` object at key lifecycle points:

| Event | Payload | Description |
|---|---|---|
| `sdlTabs:beforeInit` | — | Fires before the tabs structure is built |
| `sdlTabs:afterBuild` | — | Fires after the HTML structure is created |
| `sdlTabs:ready` | — | Fires when all content (including Squarespace blocks) is fully initialized |
| `sdlTabs:beforeOpenTab` | `{ tabId, instance }` | Fires before a tab is opened |
| `sdlTabs:afterOpenTab` | `{ tabId, instance }` | Fires after a tab is opened |

**Listen to events:**
```javascript
window.addEventListener('sdlTabs:afterOpenTab', (e) => {
  console.log('Tab opened:', e.detail.tabId);
  console.log('Instance:', e.detail.instance);
});
```

### Lifecycle Hooks

Use the `hooks` setting to run functions at specific lifecycle points:

```javascript
window.sdlTabsSettings = {
  hooks: {
    beforeInit: [
      function() { console.log('Initializing tabs...'); }
    ],
    afterInit: [
      function() { console.log('Tabs ready!'); }
    ],
    beforeOpenTab: [
      function(tabId) { console.log('About to open:', tabId); }
    ],
    afterOpenTab: [
      function(tabId) { console.log('Opened tab:', tabId); }
    ]
  }
};
```

### Programmatic API

After initialization, each tabs element has a `.sdlTabs` property exposing the instance:

```javascript
// Get instance
const tabsEl = document.querySelector('[data-sdl-plugin="tabs"]');
const instance = tabsEl.sdlTabs;

// Open a specific tab by ID
instance.openTab('tab-id-here');

// Go to next or previous tab
instance.nextTab();
instance.prevTab();

// Re-initialize all instances
window.sdlTabs.init();

// Destroy all instances (e.g. before re-init)
window.sdlTabs.deconstruct();
```

Access all instances:
```javascript
sdlTabs.instances.forEach(instance => {
  console.log(instance.activeTab);
});
```

---

## Accessibility

The plugin is built with ARIA roles and keyboard navigation baked in:

- The nav element has `role="tablist"`.
- Each tab button has `role="tab"`, `aria-selected`, and `aria-controls`.
- Each tab panel has `role="tabpanel"`, `aria-hidden`, and `tabindex`.
- Only the active tab button has `tabindex="0"`; all others have `tabindex="-1"` (roving tabindex pattern).
- **Keyboard controls on tab buttons:**
  - `ArrowRight` / `ArrowLeft` — move focus between tabs
  - `Home` — focus first tab
  - `End` — focus last tab
  - `Enter` / `Space` — activate focused tab
  - `Tab` — moves focus into the active panel (browser-native)

---

## Edit Mode Behavior

When a Squarespace editor opens the page in edit mode (`body.sqs-edit-mode-active`), the plugin automatically:

1. Detects the edit mode via a `MutationObserver` on `document.body`.
2. Calls `sdlTabs.deconstruct()` to remove all tab instances and restore sections to their original DOM positions.
3. Reloads the Squarespace lifecycle so the editor can work normally.

In edit mode, Code Blocks containing the tab plugin show a dashed border and a "Tabs Plugin Settings" label on hover, making them easy to identify.

---

## Nested Tabs

The plugin supports tabs nested inside other tabs. It guards against recursive initialization (a tabs element cannot be its own ancestor source). Events from nested tabs instances are automatically scoped and do not bubble incorrectly to parent instances.

When the active tab height changes in a nested instance, the parent instance's height is recalculated automatically.

---

## Troubleshooting

**Tabs are invisible on load**
The plugin sets `opacity: 0` on the container until `data-loading-state="loaded"` is set. If tabs never appear, check the browser console for JavaScript errors that may have stopped initialization.

**Content doesn't render correctly inside tabs**
The plugin re-triggers the Squarespace lifecycle (`sdl$?.reloadSquarespaceLifecycle`) after injecting content. If third-party blocks (video players, maps, etc.) don't initialize, ensure the `sdl$` helper library is loaded before the tabs plugin.

**Sections disappear after page refresh in edit mode**
This is expected. The plugin deconstructs on edit mode entry and reconstructs on page preview. Always use the preview mode to see the tabs.

**Tab heights are wrong**
Call `instance.setTabHeights()` manually after any content change that alters panel height (e.g. after an accordion inside a tab opens).

**URL hash opens the wrong tab or scrolls unexpectedly**
Ensure each tab title is unique (IDs are derived from titles). Set `data-enable-auto-scroll-on-load="false"` if the auto-scroll on hash load is not desired.

**Portfolio items don't load**
Confirm the `data-source` value exactly matches the portfolio's URL slug (e.g. `/my-portfolio`, not `my-portfolio`). The collection must be a Portfolio type, not a Blog or Gallery page.
