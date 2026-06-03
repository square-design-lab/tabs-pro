/*!
 * SDL Tabs Pro — v1.0.0
 * Squarespace Tabs Plugin
 * © 2026 SDL. All rights reserved.
 * Licensed via LemonSqueezy — one license per site.
 * Self-contained: no external helper library required.
 *
 * Documentation: https://sdlplugins.com/docs/tabs-pro
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Self-contained helper library (local `sdl$`)
   *  Replaces the external SDL Core Library so the plugin runs standalone.
   * ------------------------------------------------------------------ */
  const sdl$ = (function () {
    function isPlainObject(value) {
      return (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.prototype.toString.call(value) === '[object Object]'
      );
    }

    function deepMerge(target, ...sources) {
      sources.forEach(source => {
        if (!isPlainObject(source)) return;
        Object.keys(source).forEach(key => {
          const sourceVal = source[key];
          if (isPlainObject(sourceVal)) {
            if (!isPlainObject(target[key])) target[key] = {};
            deepMerge(target[key], sourceVal);
          } else if (sourceVal !== undefined) {
            target[key] = sourceVal;
          }
        });
      });
      return target;
    }

    // Convert a data-* string value into a real JS type (bool / number / JSON).
    function parseAttr(value) {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      if (trimmed === 'true') return true;
      if (trimmed === 'false') return false;
      if (trimmed === 'null') return null;
      if (trimmed !== '' && !isNaN(Number(trimmed)) && /^-?\d*\.?\d+$/.test(trimmed)) {
        return Number(trimmed);
      }
      if (
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          return value;
        }
      }
      return value;
    }

    function emitEvent(name, detail) {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail: detail || null, bubbles: true }));
      } catch (e) {
        /* no-op */
      }
    }

    // Leading + trailing throttle.
    function throttle(fn, wait) {
      let last = 0;
      let timer = null;
      return function (...args) {
        const now = Date.now();
        const remaining = wait - (now - last);
        if (remaining <= 0) {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          last = now;
          fn.apply(this, args);
        } else if (!timer) {
          timer = setTimeout(() => {
            last = Date.now();
            timer = null;
            fn.apply(this, args);
          }, remaining);
        }
      };
    }

    // Extract the page-section markup from an individual collection item's
    // HTML page. Squarespace 7.1 item pages render their sections inside an
    // <article> (or #sections / <main>). Returns a "<div id="sections">…</div>"
    // string so downstream code can locate the sections container uniformly.
    function extractSectionsFromPageHtml(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // Preferred containers, in priority order.
      const container =
        doc.querySelector('article #sections') ||
        doc.querySelector('#sections') ||
        doc.querySelector('article') ||
        doc.querySelector('main') ||
        doc.body;
      if (!container) return '';

      // Collect the actual page sections within the container.
      let sections = container.querySelectorAll(':scope > section.page-section, :scope > section[data-section-id]');
      if (!sections.length) {
        sections = container.querySelectorAll('section.page-section, section[data-section-id]');
      }

      const wrap = document.createElement('div');
      wrap.id = 'sections';
      if (sections.length) {
        sections.forEach(section => wrap.appendChild(section));
      } else {
        // Fallback: take the container's inner markup wholesale.
        wrap.innerHTML = container.innerHTML;
      }
      return wrap.outerHTML;
    }

    // Fetch a single item page and return its sections markup (best-effort).
    async function fetchItemSections(fullUrl) {
      try {
        const res = await fetch(fullUrl, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
        if (!res.ok) {
          console.error('sdlTabs: failed to fetch item page ' + fullUrl + ' (HTTP ' + res.status + ')');
          return '';
        }
        const html = await res.text();
        return extractSectionsFromPageHtml(html);
      } catch (e) {
        console.error('sdlTabs: error fetching item page ' + fullUrl, e);
        return '';
      }
    }

    // Fetch a Squarespace collection (e.g. Portfolio). The collection list JSON
    // does NOT embed each item's page sections, so for portfolio items we fetch
    // each item's individual page and pull the sections from its <article>.
    async function collectionData(source, options) {
      const opts = options || {};
      let path = source;

      // Weglot multi-language path rewriting (array or object map).
      if (opts.weglotPaths && typeof opts.weglotPaths === 'object') {
        const lang =
          document.documentElement.getAttribute('lang') ||
          (window.Weglot && window.Weglot.getCurrentLang && window.Weglot.getCurrentLang());
        if (lang && !Array.isArray(opts.weglotPaths) && opts.weglotPaths[lang]) {
          path = opts.weglotPaths[lang];
        } else if (lang && Array.isArray(opts.weglotPaths) && opts.weglotPaths.includes('/' + lang)) {
          path = '/' + lang + path;
        }
      }

      if (!/^https?:\/\//.test(path) && path[0] !== '/') path = '/' + path;
      const url = path + (path.indexOf('?') === -1 ? '?format=json' : '&format=json');

      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) {
        throw new Error('sdlTabs: failed to fetch collection ' + path + ' (HTTP ' + response.status + ')');
      }
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];

      let type = (data.collection && data.collection.typeName) || 'collection';
      // Robust portfolio detection: a portfolio of pages exposes a fullUrl per
      // item but no inline #sections body in the list JSON.
      const hasInlineSections = items.some(it => typeof it.body === 'string' && it.body.indexOf('id="sections"') !== -1);
      if (type !== 'portfolio' && !hasInlineSections && items.length && items.every(it => it.fullUrl)) {
        type = 'portfolio';
      }

      // For portfolio items without inline sections, fetch each item page and
      // pull its sections. Done in parallel to keep load time reasonable.
      if (type === 'portfolio' && !hasInlineSections) {
        await Promise.all(
          items.map(async item => {
            if (item.fullUrl) {
              item.body = await fetchItemSections(item.fullUrl);
            }
          })
        );
      }

      return { items, type };
    }

    // Re-run Squarespace's block / embed / commerce initialisation after the
    // tabs DOM has been (re)built and fetched content injected. Best-effort.
    async function reloadSquarespaceLifecycle() {
      try {
        const Y = window.Y;
        const SQS = window.Squarespace;
        if (SQS && Y) {
          const root = Y.one(document.body);
          if (typeof SQS.globalInit === 'function') SQS.globalInit(Y);
          if (typeof SQS.initializeLayoutBlocks === 'function') SQS.initializeLayoutBlocks(Y, root);
          if (typeof SQS.initializeCommerce === 'function') SQS.initializeCommerce(Y, root);
          if (typeof SQS.afterBodyLoad === 'function') SQS.afterBodyLoad(Y);
        }
      } catch (e) {
        /* best-effort — never break the page */
      }
      try {
        if (window.ImageLoader && typeof window.ImageLoader.load === 'function') {
          document.querySelectorAll('img[data-src]').forEach(img => window.ImageLoader.load(img, { load: true }));
        }
      } catch (e) {
        /* no-op */
      }
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('mercury:load'));
    }

    // Best-effort re-init of other SDL plugins on the page (no-op if none).
    function initializeAllPlugins() {
      /* intentionally minimal — fetched content is handled by reloadSquarespaceLifecycle */
    }

    return {
      deepMerge,
      parseAttr,
      emitEvent,
      throttle,
      collectionData,
      reloadSquarespaceLifecycle,
      initializeAllPlugins,
    };
  })();

  class sdlTabs {
    static pluginTitle = 'sdlTabs';
    static isEditModeEventListenerSet = false;
    static instances = [];
    static defaultSettings = {
      tabImages: false,
      tabButtonTag: 'h4',
      tabLimit: false,
      updateUrl: false,
      setInitialUrl: false,
      triggerEvent: 'click',
      stickyNav: false,
      stickyNavThrottle: 100,
      stickyNavOffset: 17,
      scrollBackToTop: true,
      scrollBackOffset: 150,
      scrollBackBehavior: 'auto',
      overflowIndicatorAction: 'scroll',
      swipeThreshold: 50,
      dragStartThreshold: 10,
      slideTransitionDuration: 300,
      weglotPaths: [],
      allowClickAndDrag: false,
      edgeToEdge: false,
      allowTouchSwipe: false,
      accordionIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75 12 3m0 0 3.75 3.75M12 3v18" />
      </svg>`,
      overflowIndicatorStart: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m11.25 9-3 3m0 0 3 3m-3-3h7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>`,
      overflowIndicatorEnd: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="m12.75 15 3-3m0 0-3-3m3 3h-7.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>`,
      selectButtonIcon: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>`,
      scrollTolerance: 3,
      scrollTabActivateTolerance: 50,
      centerActiveTab: false,
      breakpoints: {
        0: { navigationType: 'select' },
        767: { navigationType: 'horizontal' },
      },
      isSectionsAdjusted: false,
      hooks: {
        beforeInit: [],
        afterInit: [
          function () {
            sdl$?.initializeAllPlugins();
          },
        ],
        beforeOpenTab: [],
        afterOpenTab: [],
      },
      disableAutoScroll: false,
      enableAutoScrollOnLoad: true,
    };

    static get userSettings() {
      return window[sdlTabs.pluginTitle + 'Settings'] || {};
    }

    static deconstruct() {
      sdlTabs.instances.forEach(instance => {
        if (instance && typeof instance.destroy === 'function') {
          instance.destroy();
        }
      });
      sdlTabs.instances = [];
      if (sdlTabs.originalPositions) {
        sdlTabs.originalPositions.clear();
      }
      try {
        sdl$?.reloadSquarespaceLifecycle();
      } catch (error) {
        console.error('Error reloading Squarespace lifecycle:', error);
      }
    }

    constructor(el) {
      if (el.dataset.loadingState) return;
      el.dataset.loadingState = 'loading';
      this.el = el;
      this.source = el.dataset.source;
      if (this.el.parentElement.closest(`[data-sdl-plugin="tabs"][data-source="${this.source}"]`)) {
        console.error('Recursive tabs plugin detected');
        return;
      }
      this.loadingState = 'building';
      this.installationMethod;
      if (this.source) this.installationMethod = 'source';
      if (this.el.querySelector('button')) this.installationMethod = 'sections';
      this.settings = sdl$.deepMerge({}, sdlTabs.defaultSettings, sdlTabs.userSettings, this.instanceSettings);
      this.items, this.type;
      this.tabs = [];
      this._navigaitonType = '';
      this.hasLoaded = false;
      this.tweaks = (window.Static && window.Static.SQUARESPACE_CONTEXT && window.Static.SQUARESPACE_CONTEXT.tweakJSON) || {};
      this.hasAccordionInBreakpoints = Object.values(this.settings.breakpoints).some(
        bp => bp.navigationType === 'accordion'
      );
      this.hasSelectInBreakpoints = Object.values(this.settings.breakpoints).some(
        bp => bp.navigationType === 'select'
      );
      this.init();
    }

    async init() {
      this.runHooks('beforeInit');
      sdl$.emitEvent(`${sdlTabs.pluginTitle}:beforeInit`);
      this.el.dataset.navigationType = this.getNavigationType();
      this.buildStructure();
      if (this.source) {
        const { items, type } = await sdl$.collectionData(this.source, {
          weglotPaths: this.settings.weglotPaths,
        });
        this.items = items;
        this.type = type;
        const tabLimit =
          typeof this.settings.tabLimit === 'number'
            ? Math.min(this.settings.tabLimit, items.length)
            : items.length;
        this.tabs = items.slice(0, tabLimit).map(item => ({ item }));
        this.injectHTML();
      } else {
        this.moveFromTargets();
      }
      this.addEditModeObserver();
      sdl$.emitEvent(`${sdlTabs.pluginTitle}:afterBuild`);

      if (this.settings.edgeToEdge) {
        this.el.classList.add('edge-to-edge');
        this.tabs.forEach(tab => {
          const sections = tab.panel.querySelectorAll('section.page-section[data-fluid-engine-section]');
          sections.forEach(section => {
            const fluidEngine = section.querySelector('.fluid-engine');
            const columnGap = getComputedStyle(fluidEngine).columnGap;
            fluidEngine.style.setProperty('--sdl-column-gap', columnGap);
          });
        });
      }

      this.setStyles();
      this.setIsNavMaxWidth();
      this.bindEvents();
      this.handleTabsNavigationIndicatorsDisplay();
      this.setNavWidth();
      this.activeTab = this.tabs[this.getInitialTabIndex()];
      this.openTab(this.activeTab.id);
      this.setActiveIndicator();
      this.removeGlobalAnimations();
      this.el.dataset.loadingState = 'loaded';

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
          await handleDOMReady.call(this);
        });
      } else {
        await handleDOMReady.call(this);
      }

      async function handleDOMReady() {
        const sections = document.querySelector('#sections');
        const lastSection = document.querySelector('#sections > section:last-child .content-wrapper');
        let originalParent = this.el.parentNode;
        let wasAppended = false;

        if (!sections?.contains(this.el)) {
          this.el.classList.add('moving-tabs-for-initialization');
          lastSection?.appendChild(this.el);
          wasAppended = true;
          await sdl$?.reloadSquarespaceLifecycle([this.el]);
          window.dispatchEvent(new Event('resize'));
        } else {
          await sdl$?.reloadSquarespaceLifecycle([this.el]);
        }

        try {
          if (typeof sdl$.initializeCodeBlocks === 'function') await sdl$.initializeCodeBlocks(this.el);
          if (typeof sdl$.initializeEmbedBlocks === 'function') await sdl$.initializeEmbedBlocks(this.el);
          if (typeof sdl$.initializeThirdPartyPlugins === 'function') await sdl$.initializeThirdPartyPlugins(this.el);
          if (typeof sdl$.handleAddingMissingColorTheme === 'function') await sdl$.handleAddingMissingColorTheme();
        } catch (error) {
          console.error('Error during initialization:', error);
        }

        if (wasAppended) {
          originalParent.appendChild(this.el);
          this.el.classList.remove('moving-tabs-for-initialization');
        }

        sdl$?.emitEvent(`${sdlTabs.pluginTitle}:ready`);
        this.loadingState = 'complete';
      }

      this.setNavWidth();
      window.setTimeout(() => {
        this.openTab(this.activeTab.id);
        this.setActiveIndicator();
        this.setTabHeights();
        this.removeGlobalAnimations();
        this.hasLoaded = true;
      }, 650);
      this.runHooks('afterInit');
    }

    bindEvents() {
      this.addTabClickEvent();
      this.addTabsResizeEvent();
      if (this.tabs[0].selectItem) this.addSelectEvents();
      this.addTabNavigationScrollEvent();
      this.addTabNavigationClickEvent();
      this.addStickyNavScrollEvent();
      this.addNextAndPrevTabButtonEvents();
      this.addClickAndDragSwipeEvent();
      this.addGlobalLinkClickListener();
      this.hasAccordionInBreakpoints ? this.addAccordionButtonClickEvent() : null;
      this.addContentScrollReset();
      this.el.addEventListener('click', e => {
        if (!e.target.closest('.tab-panel')) return;
        if (this.isEventFromNestedTabs(e)) return;
        const clickedLink = e.target.closest("a[href*='#']");
        if (clickedLink) {
          this.handleAnchorLinkClickInTab(clickedLink, e);
          return;
        }
        this.setTabHeights();
      });
    }

    buildStructure() {
      this.elements = {};
      this.el.classList.add('sdl-tabs');
      this.el.dataset.overrideInitialGlobalAnimation = 'true';

      this.initialInnerEl = document.createDocumentFragment();
      while (this.el.firstChild) {
        this.initialInnerEl.appendChild(this.el.firstChild);
      }

      const wrapper = document.createElement('div');
      wrapper.classList.add('tabs-wrapper');
      this.elements.wrapper = wrapper;

      const header = document.createElement('div');
      header.classList.add('tabs-header');
      this.elements.header = header;

      const nav = document.createElement('nav');
      nav.setAttribute('role', 'tablist');
      this.elements.nav = nav;

      const navContainer = document.createElement('div');
      navContainer.classList.add('nav-container');
      this.elements.navContainer = navContainer;
      navContainer.appendChild(nav);

      const indicatorTrack = document.createElement('div');
      const activeIndicator = document.createElement('span');
      indicatorTrack.classList.add('indicator-track');
      activeIndicator.classList.add('active-indicator');
      indicatorTrack.appendChild(activeIndicator);
      this.elements.indicatorTrack = indicatorTrack;
      this.elements.activeIndicator = activeIndicator;
      this.elements.nav.appendChild(indicatorTrack);

      if (this.hasSelectInBreakpoints) {
        const selectNavigationContainer = document.createElement('div');
        selectNavigationContainer.classList.add('select-navigation-container');
        this.elements.selectNavigationContainer = selectNavigationContainer;

        const selectNavigation = document.createElement('div');
        selectNavigation.classList.add('select-navigation');
        this.elements.selectNavigation = selectNavigation;
        selectNavigationContainer.appendChild(selectNavigation);

        const selectButtonContainer = document.createElement('div');
        selectButtonContainer.classList.add('select-button-container');

        const selectButton = document.createElement('button');
        this.elements.selectButton = selectButton;

        const selectButtonText = document.createElement('span');
        selectButtonText.innerText = 'Options';
        this.elements.selectButtonText = selectButtonText;

        const selectItemsContainer = document.createElement('div');
        selectItemsContainer.classList.add('select-items-container');

        const selectItemsWrapper = document.createElement('div');
        selectItemsWrapper.classList.add('select-items-wrapper');
        this.elements.selectItemsWrapper = selectItemsWrapper;

        selectNavigation.appendChild(selectButtonContainer);
        selectButtonContainer.appendChild(selectButton);
        selectButton.appendChild(selectButtonText);
        selectButton.insertAdjacentHTML('beforeend', this.settings.selectButtonIcon);
        selectItemsContainer.appendChild(selectItemsWrapper);
        selectNavigation.appendChild(selectItemsContainer);
        wrapper.appendChild(selectNavigationContainer);
      }

      const scrollIndicatorContainer = document.createElement('div');
      this.elements.scrollIndicatorContainer = scrollIndicatorContainer;
      scrollIndicatorContainer.classList = 'scroll-indicator-container';
      const indicatorStart = document.createElement('button');
      this.elements.indicatorStart = indicatorStart;
      indicatorStart.classList = 'scroll-indicator indicator-start';
      indicatorStart.innerHTML = this.settings.overflowIndicatorStart;
      const indicatorEnd = document.createElement('button');
      this.elements.indicatorEnd = indicatorEnd;
      indicatorEnd.classList = 'scroll-indicator indicator-end';
      indicatorEnd.innerHTML = this.settings.overflowIndicatorEnd;
      scrollIndicatorContainer.appendChild(indicatorStart);
      scrollIndicatorContainer.appendChild(indicatorEnd);

      const content = document.createElement('div');
      content.classList.add('tabs-content');
      this.elements.tabsContent = content;

      const contentWrapper = document.createElement('div');
      contentWrapper.classList.add('tabs-content-wrapper');
      this.elements.tabsContentWrapper = contentWrapper;

      header.append(scrollIndicatorContainer);
      header.appendChild(navContainer);
      wrapper.appendChild(header);
      wrapper.appendChild(content);
      content.appendChild(contentWrapper);

      this.el.innerHTML = '';
      this.el.dataset.navigationIndicators = 'none';
      this.el.appendChild(wrapper);
    }

    injectHTML() {
      const contentFragment = document.createDocumentFragment();
      const tabButtonsFragment = document.createDocumentFragment();

      this.tabs.forEach(tab => {
        const item = tab.item;

        const tabPanel = document.createElement('article');
        tabPanel.classList.add('tab-panel');
        tabPanel.setAttribute('role', 'tabpanel');
        tabPanel.setAttribute('aria-hidden', 'true');
        tabPanel.setAttribute('tabindex', '-1');

        const tabContent = document.createElement('div');
        tabContent.classList.add('tab-content');

        if (this.type === 'portfolio') {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = item.body || '';
          const pageSectionsContainer = tempDiv.querySelector('#sections') || tempDiv;
          while (pageSectionsContainer.firstChild) {
            tabContent.appendChild(pageSectionsContainer.firstChild);
          }
        } else {
          tabContent.innerHTML = item.body;
        }

        tabPanel.appendChild(tabContent);
        contentFragment.appendChild(tabPanel);
        tab.panel = tabPanel;
        tab.content = tabContent;

        const tabButton = document.createElement('button');
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-controls', tabPanel.id);
        tabButton.setAttribute('aria-selected', 'false');
        tabButton.setAttribute('tabindex', '-1');

        const title = item.title;
        tab.innerText = item.title;
        if (this.settings.tabImages) {
          tabButton.innerHTML = `<div class="tab-button-image"><span class="img-spacer"></span><img src="${item.assetUrl}" width="150" height="150"/></div>`;
        }
        tabButton.innerHTML += `<${this.settings.tabButtonTag} class="tab-title">${title}</${this.settings.tabButtonTag}>`;
        tabButtonsFragment.appendChild(tabButton);
        tab.button = tabButton;
        tab.id = this.getHashValueFromText(tab.innerText);
        tabButton.dataset.id = tab.id;

        if (this.hasAccordionInBreakpoints) {
          const accordionTabButton = tabButton.cloneNode(true);
          accordionTabButton.classList.add('accordion-dropdown');
          const accordionIcon = document.createElement('span');
          accordionIcon.classList.add('sdl-icon');
          accordionIcon.innerHTML = this.settings.accordionIcon;
          accordionTabButton.appendChild(accordionIcon);
          tabPanel.prepend(accordionTabButton);
          tab.accordionButton = accordionTabButton;
        }

        if (this.hasSelectInBreakpoints) {
          const selectItem = document.createElement('button');
          selectItem.classList.add('select-item');
          selectItem.innerText = title;
          this.elements.selectItemsWrapper.append(selectItem);
          tab.selectItem = selectItem;
        }
      });

      this.elements.tabsContentWrapper.appendChild(contentFragment);
      this.elements.nav.appendChild(tabButtonsFragment);
      this.el.style.setProperty('--tabs-count', this.tabs.length);
    }

    moveFromTargets() {
      const contentFragment = document.createDocumentFragment();
      const tabButtonsFragment = document.createDocumentFragment();

      this.initialInnerEl.querySelectorAll('button').forEach(btn => {
        const tab = {};
        const tabButton = btn;

        const closestSection = this.el.closest('.page-section');
        if (!btn.dataset.target) {
          let nextSection = closestSection.nextElementSibling;
          while (
            nextSection &&
            (!nextSection.matches('.page-section') || nextSection.classList.contains('placeholder'))
          ) {
            nextSection = nextSection.nextElementSibling;
          }
          if (nextSection) {
            btn.dataset.target = `section[data-section-id="${nextSection.dataset.sectionId}"].page-section`;
          } else {
            console.warn('No valid next section found for button:', btn);
          }
        }

        let sections;
        if (btn.dataset.target?.includes('/')) {
          sections = '';
        } else {
          this.settings.isSectionsAdjusted = true;
          sections = document.querySelectorAll(btn.dataset.target);
        }

        const tabPanel = document.createElement('article');
        tabPanel.classList.add('tab-panel');
        tabPanel.setAttribute('role', 'tabpanel');
        tabPanel.setAttribute('aria-hidden', 'true');
        tabPanel.setAttribute('tabindex', '-1');

        const tabContent = document.createElement('div');
        tabContent.classList.add('tab-content');

        if (!sdlTabs.originalPositions) sdlTabs.originalPositions = new Map();

        sections.forEach(section => {
          const placeholder = document.createElement('div');
          placeholder.classList.add('placeholder');
          section.parentNode.insertBefore(placeholder, section);
          sdlTabs.originalPositions.set(section, {
            originalParent: section.parentNode,
            placeholder,
          });
          tabContent.appendChild(section);
        });

        tabPanel.appendChild(tabContent);
        contentFragment.appendChild(tabPanel);
        tab.panel = tabPanel;
        tab.content = tabContent;

        tabButtonsFragment.appendChild(tabButton);
        tab.button = tabButton;
        tab.innerText = tabButton.innerText;
        tab.id = this.getHashValueFromText(tab.innerText);
        tabButton.dataset.id = tab.id;
        tabButton.setAttribute('role', 'tab');
        tabButton.setAttribute('aria-controls', tabPanel.id);
        tabButton.setAttribute('aria-selected', 'false');
        tabButton.setAttribute('tabindex', '-1');

        const childNodes = Array.from(tabButton.childNodes);
        childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
            const span = document.createElement(this.settings.tabButtonTag);
            span.classList.add('tab-title');
            span.textContent = node.nodeValue;
            tabButton.replaceChild(span, node);
            tab.innerText = node.nodeValue;
          } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName.toLowerCase() === 'img') {
            const imageWrapper = document.createElement('div');
            imageWrapper.classList.add('tab-button-image');
            imageWrapper.append(node);
            tabButton.replaceChild(imageWrapper, node);
          }
        });

        if (this.hasAccordionInBreakpoints) {
          const accordionTabButton = tabButton.cloneNode(true);
          accordionTabButton.classList.add('accordion-dropdown');
          const accordionIcon = document.createElement('span');
          accordionIcon.classList.add('sdl-icon');
          accordionIcon.innerHTML = this.settings.accordionIcon;
          accordionTabButton.appendChild(accordionIcon);
          tabPanel.prepend(accordionTabButton);
          tab.accordionButton = accordionTabButton;
        }

        if (this.hasSelectInBreakpoints) {
          const selectItem = document.createElement('button');
          selectItem.classList.add('select-item');
          selectItem.innerText = tab.innerText;
          this.elements.selectItemsWrapper.append(selectItem);
          tab.selectItem = selectItem;
        }

        this.tabs.push(tab);
      });

      this.elements.tabsContentWrapper.appendChild(contentFragment);
      this.elements.nav.appendChild(tabButtonsFragment);
      this.el.style.setProperty('--tabs-count', this.tabs.length);
    }

    addStickyNavScrollEvent() {
      if (!this.settings.stickyNav) return;
      this.elements.pageHeader = document.querySelector('#header');
      this.el.style.setProperty('--top-offset', this.settings.stickyNavOffset + 'px');

      const onScroll = () => {
        const rect = this.el.getBoundingClientRect();
        if (this.tweaks['tweak-fixed-header'] === 'true') {
          const headerBottom = this.elements.pageHeader?.getBoundingClientRect().bottom || 0;
          const offsetAmt = this.settings.stickyNavOffset + headerBottom;
          rect.top <= offsetAmt ? this.el.classList.add('is-sticky') : this.el.classList.remove('is-sticky');
          this.el.style.setProperty('--nav-sticky-offset', headerBottom + 'px');
        } else {
          rect.top <= this.settings.stickyNavOffset
            ? this.el.classList.add('is-sticky')
            : this.el.classList.remove('is-sticky');
          this.el.style.setProperty('--nav-sticky-offset', '0px');
        }
      };

      let isScrolling = false;
      const onScrollWithAnimationFrame = () => {
        if (!isScrolling) {
          isScrolling = true;
          requestAnimationFrame(() => {
            onScroll();
            isScrolling = false;
          });
        }
      };

      window.addEventListener('scroll', onScrollWithAnimationFrame);
      onScroll();
    }

    scrollBackToTop() {
      if (!this.settings.scrollBackToTop) return;
      if (!this.hasLoaded) return;
      const elRect = this.el.getBoundingClientRect();
      if (elRect.top <= -1) {
        const targetScrollY = window.scrollY + elRect.top - this.settings.scrollBackOffset;
        const behavior = this.settings.scrollBackBehavior === 'smooth' ? 'smooth' : 'auto';
        window.scrollTo({ top: targetScrollY, behavior });
      }
    }

    getHashValueFromText(text) {
      const normalizeText = str => str.normalize('NFD').replace(/[̀-ͯ]/g, '');
      const normalizedText = normalizeText(text);
      const filteredText = normalizedText.replace(/[^a-zA-Z0-9_-]/g, '-');
      let encodedText = encodeURIComponent(filteredText.trim().toLowerCase());
      let num = 0;
      let newText = encodedText;
      while (document.querySelector(`button[data-id="${newText}"]`)) {
        num++;
        newText = `${encodedText}-${num}`;
      }
      return newText;
    }

    getInitialTabIndex() {
      if (!window.location.hash) return 0;
      const matchingTabIndex = this.tabs.findIndex(tab => window.location.hash === '#' + tab.id);
      if (matchingTabIndex !== -1) {
        if (this.settings.enableAutoScrollOnLoad) {
          const elRect = this.el.getBoundingClientRect();
          const targetScrollY = window.scrollY + elRect.top - this.settings.scrollBackOffset;
          window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
        }
        return matchingTabIndex;
      }
      return 0;
    }

    addTabClickEvent() {
      const handleClickEvent = activeTab => this.openTab(activeTab.id);

      this.tabs.forEach(tab => {
        tab.button.addEventListener('click', () => handleClickEvent(tab));

        tab.button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClickEvent(tab);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.focusNextTab();
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.focusPreviousTab();
          } else if (event.key === 'Home') {
            event.preventDefault();
            this.tabs[0].button.focus();
            this.updateTabindexValues();
          } else if (event.key === 'End') {
            event.preventDefault();
            this.tabs[this.tabs.length - 1].button.focus();
            this.updateTabindexValues();
          }
        });

        if (this.settings.triggerEvent === 'hover') {
          tab.button.addEventListener('mouseenter', () => handleClickEvent(tab));
        }
      });
    }

    setActiveIndicator() {
      const btn = this.activeTab.button;
      const width = btn.offsetWidth;
      const height = btn.offsetHeight - 1;
      const left = btn.offsetLeft;
      const top = btn.offsetTop + 0.5;

      const navPaddingInline = window.getComputedStyle(this.elements.nav).paddingInlineStart;
      const navPaddingBlock = window.getComputedStyle(this.elements.nav).paddingBlockStart;

      this.el.style.setProperty('--tab-button-active-width', width + 'px');
      this.el.style.setProperty('--tab-button-active-left', left - parseInt(navPaddingInline) + 'px');
      this.el.style.setProperty('--tab-button-active-top', top - parseInt(navPaddingBlock) + 'px');
      this.el.style.setProperty('--tab-button-active-height', height + 'px');
    }

    addSelectEvents() {
      const handleItemClick = activeTab => this.openTab(activeTab.id);
      const toggleMenu = () => this.elements.selectNavigation.classList.toggle('open');

      this.tabs.forEach(tab => {
        tab.selectItem.addEventListener('click', () => handleItemClick(tab));
      });

      this.elements.selectNavigation.addEventListener('click', toggleMenu);
    }

    addTabNavigationScrollEvent() {
      const throttledHandleScroll = sdl$.throttle(() => this.handleTabsNavigationIndicatorsDisplay(), 250);
      this.elements.nav.addEventListener('scroll', throttledHandleScroll);
    }

    addContentScrollReset() {
      this.elements.tabsContent.addEventListener('scroll', () => {
        this.elements.tabsContent.scrollLeft = 0;
        this.elements.tabsContent.scrollTop = 0;
      });
    }

    addTabNavigationClickEvent() {
      this.elements.indicatorStart.addEventListener('click', () => {
        this.settings.overflowIndicatorAction === 'move' ? this.prevTab() : this.moveTabsNavigation(-50);
      });
      this.elements.indicatorEnd.addEventListener('click', () => {
        this.settings.overflowIndicatorAction === 'move' ? this.nextTab() : this.moveTabsNavigation(50);
      });
    }

    handleTabsNavigationIndicatorsDisplay() {
      const nav = this.elements.nav;
      let indicatorLabel = 'none';

      if (this.navigationType === 'horizontal') {
        const scrollWidth = nav.scrollWidth - this.settings.scrollTolerance;
        const navWidth = nav.clientWidth;
        const leftPos = nav.scrollLeft - this.settings.scrollTolerance;
        const rightPos = leftPos + navWidth + this.settings.scrollTolerance;
        if (scrollWidth > navWidth) {
          if (leftPos > 0) indicatorLabel = 'start';
          if (rightPos < scrollWidth) indicatorLabel = 'end';
          if (leftPos > 0 && rightPos < scrollWidth) indicatorLabel = 'both';
        }
      }

      if (this.navigationType === 'vertical') {
        const scrollHeight = nav.scrollHeight - this.settings.scrollTolerance;
        const navHeight = nav.clientHeight;
        const topPos = nav.scrollTop - this.settings.scrollTolerance;
        const bottomPos = topPos + navHeight + this.settings.scrollTolerance;
        if (scrollHeight > navHeight) {
          if (topPos > 0) indicatorLabel = 'start';
          if (bottomPos < scrollHeight) indicatorLabel = 'end';
          if (topPos > 0 && bottomPos < scrollHeight) indicatorLabel = 'both';
        }
      }

      this.el.dataset.navigationIndicators = indicatorLabel;
    }

    moveTabsNavigation(amt) {
      if (this.navigationType === 'horizontal') {
        const scrollAmount = this.elements.nav.clientWidth * (amt / 100);
        this.elements.nav.scrollTo({
          left: this.elements.nav.scrollLeft + scrollAmount,
          behavior: 'smooth',
        });
      } else if (this.navigationType === 'vertical') {
        const scrollAmount = this.elements.nav.clientHeight * (amt / 100);
        this.elements.nav.scrollTo({
          top: this.elements.nav.scrollTop + scrollAmount,
          behavior: 'smooth',
        });
      }
    }

    scrollTabIntoView() {
      if (this.settings.disableAutoScroll) return;
      const tolerance = this.settings.scrollTabActivateTolerance;
      const nav = this.elements.nav;
      const activeTabButton = this.activeTab.button;

      if (this.navigationType === 'horizontal') {
        const activeLeft = activeTabButton.offsetLeft;
        const activeWidth = activeTabButton.clientWidth;
        const activeRight = activeLeft + activeWidth;
        const navBarLeft = nav.scrollLeft;
        const navBarWidth = nav.clientWidth;
        const navBarRight = navBarLeft + navBarWidth;

        if (this.settings.centerActiveTab) {
          const moveDistance = activeLeft + activeWidth / 2 - (navBarLeft + navBarWidth / 2);
          this.moveTabsNavigation((moveDistance / navBarWidth) * 100);
        } else {
          if (navBarLeft >= activeLeft - tolerance) this.moveTabsNavigation(-35);
          else if (navBarRight <= activeRight + tolerance) this.moveTabsNavigation(35);
        }
      } else if (this.navigationType === 'vertical') {
        const activeTop = activeTabButton.offsetTop;
        const activeHeight = activeTabButton.clientHeight;
        const activeBottom = activeTop + activeHeight;
        const navBarTop = nav.scrollTop;
        const navBarHeight = nav.clientHeight;
        const navBarBottom = navBarTop + navBarHeight;

        if (this.settings.centerActiveTab) {
          const moveDistance = activeTop + activeHeight / 2 - (navBarTop + navBarHeight / 2);
          this.moveTabsNavigation((moveDistance / navBarHeight) * 100);
        } else {
          if (navBarTop >= activeTop - tolerance) this.moveTabsNavigation(-35);
          else if (navBarBottom <= activeBottom + tolerance) this.moveTabsNavigation(35);
        }
      }
    }

    addAccordionButtonClickEvent() {
      const handleClickEvent = activeTab => {
        this.activeTab = activeTab;
        this.tabs.forEach(tab => {
          if (tab === activeTab) {
            tab.accordionButton.classList.add('active');
            tab.button.classList.add('active');
            tab.panel.classList.add('active');
            tab.panel.style.transform = 'translateX(0px)';
            tab.content.style.height = tab.content.scrollHeight + 'px';
            tab.content.style.maxHeight = '';
          } else {
            tab.active = false;
            tab.accordionButton.classList.remove('active');
            tab.button.classList.remove('active');
            tab.panel.classList.remove('active');
            tab.content.style.height = '0px';
            tab.content.style.maxHeight = '0px';
          }
        });
        this.setTabHeights();
      };

      this.tabs.forEach(tab => {
        tab.accordionButton.addEventListener('click', () => handleClickEvent(tab));
      });
    }

    addTabsResizeEvent() {
      const throttledResize = sdl$.throttle(() => {
        this.tabsOffset = this.activeTab.panel.offsetLeft;
        this.navigationType = this.getNavigationType();
        this.setNavWidth();
        this.setIsNavMaxWidth();
        this.setActiveIndicator();
        this.setTabHeights();
        this.scrollTabIntoView();
        this.handleTabsNavigationIndicatorsDisplay();
      }, 250);
      window.addEventListener('resize', throttledResize);
    }

    addClickAndDragSwipeEvent() {
      const tabsContentWrapper = this.elements.tabsContentWrapper;
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let currentTranslate = 0;
      let initialTranslate = 0;
      let animationID;
      let isHorizontalSwipe = false;
      const transitionDuration = this.settings.slideTransitionDuration;
      const dragThreshold = this.settings.dragStartThreshold;

      const setTranslateX = translate => {
        tabsContentWrapper.style.transform = `translateX(${translate}px)`;
      };

      const startSwipe = event => {
        if (event.target.closest('img, button, a') && event.type.includes('mouse')) return;
        if (event.target.closest('a, button, input, textarea, select') && event.type.includes('touch')) return;
        isDragging = true;
        startX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
        startY = event.type.includes('mouse') ? event.pageY : event.touches[0].clientY;
        initialTranslate = -1 * this.tabsOffset;
        currentTranslate = initialTranslate;
        tabsContentWrapper.classList.add('dragging');
        isHorizontalSwipe = false;
      };

      const swiping = event => {
        if (!isDragging) return;
        const currentX = event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
        const currentY = event.type.includes('mouse') ? event.pageY : event.touches[0].clientY;
        const deltaX = currentX - startX;
        const deltaY = currentY - startY;

        if (!isHorizontalSwipe && Math.abs(deltaX) < dragThreshold) return;
        if (!isHorizontalSwipe) {
          isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY);
          if (!isHorizontalSwipe) {
            isDragging = false;
            tabsContentWrapper.classList.remove('dragging');
            return;
          }
        }

        event.preventDefault();
        currentTranslate = initialTranslate + deltaX;
        setTranslateX(currentTranslate);
      };

      const endSwipe = () => {
        if (!isDragging) return;
        cancelAnimationFrame(animationID);
        isDragging = false;
        const movedBy = currentTranslate - initialTranslate;
        const swipeThreshold = this.settings.swipeThreshold || 20;

        const finalize = () => {
          window.setTimeout(() => {
            tabsContentWrapper.style.transition = '';
            tabsContentWrapper.classList.remove('dragging');
          }, transitionDuration);
        };

        tabsContentWrapper.style.transition = `transform ${transitionDuration}ms ease`;
        if (movedBy < -swipeThreshold && this.activeTab !== this.tabs[this.tabs.length - 1]) {
          this.nextTab();
        } else if (movedBy > swipeThreshold && this.activeTab !== this.tabs[0]) {
          this.prevTab();
        } else {
          setTranslateX(initialTranslate);
        }
        finalize();
      };

      if (this.settings.allowTouchSwipe) {
        tabsContentWrapper.addEventListener('touchstart', startSwipe.bind(this));
        tabsContentWrapper.addEventListener('touchmove', swiping.bind(this));
        tabsContentWrapper.addEventListener('touchend', endSwipe.bind(this));
      }

      if (this.settings.allowClickAndDrag) {
        tabsContentWrapper.addEventListener('mousedown', startSwipe.bind(this));
        tabsContentWrapper.addEventListener('mousemove', swiping.bind(this));
        tabsContentWrapper.addEventListener('mouseup', endSwipe.bind(this));
        tabsContentWrapper.addEventListener('mouseleave', endSwipe.bind(this));
      }
    }

    getNavigationType() {
      const { breakpoints } = this.settings;
      const width = window.innerWidth;
      let navigationType = breakpoints[0].navigationType;
      for (const breakpoint in breakpoints) {
        if (width >= breakpoint) navigationType = breakpoints[breakpoint].navigationType;
      }
      this.navigationType = navigationType;
      return navigationType;
    }

    setNavigationType(value) {
      this.el.dataset.navigationType = value;
      if (this.loadingState !== 'complete') return;
      if (value === 'accordion') {
        this.tabs.forEach(tab => (tab.panel.style.transform = 'initial'));
        this.elements.tabsContentWrapper.style.height = '';
        this.elements.tabsContentWrapper.style.transform = '';
      }
      if (value === 'tab') {
        this.tabs.forEach(tab => {
          tab.content.style.height = '';
          tab.content.style.maxHeight = '';
        });
      }
    }

    setTabHeights() {
      const setHeight = () => {
        this.elements.tabsContentWrapper.style.height = this.activeTab.content.clientHeight + 'px';
        if (this.el.parentElement.closest('[data-sdl-plugin="tabs"]')) {
          this.el.parentElement.closest('[data-sdl-plugin="tabs"]')?.sdlTabs?.setTabHeights();
        }
      };
      if (
        this.navigationType === 'horizontal' ||
        this.navigationType === 'vertical' ||
        this.navigationType === 'select'
      ) {
        setHeight();
        window.setTimeout(() => setHeight(), 650);
      }
    }

    setStyles() {
      const section = this.el.closest('section.page-section');
      const computedStyle = getComputedStyle(section);
      const colorMap = {
        '--sdl-accent-hsl': '--primaryButtonBackgroundColor',
        '--sdl-accent-inverse-hsl': '--primaryButtonTextColor',
        '--sdl-background-hsl': '--siteBackgroundColor',
        '--sdl-text-hsl': '--paragraphMediumColor',
      };
      const extractHSLValues = hslaValue => {
        const match = hslaValue.match(/hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
        return match ? `${match[1]},${match[2]}%,${match[3]}%` : '';
      };
      for (const [key, value] of Object.entries(colorMap)) {
        const sectionColorValue = computedStyle.getPropertyValue(value);
        const hslValues = extractHSLValues(sectionColorValue);
        this.el.style.setProperty(key, hslValues);
      }
    }

    setUrlHash(value) {
      location.hash = value;
    }

    setNavWidth() {
      this.elements.nav.style.setProperty('--nav-scroll-width', '0px');
      this.elements.nav.style.setProperty('--nav-scroll-height', '0px');
      this.elements.nav.style.setProperty('--nav-full-width', '0px');
      this.elements.nav.style.setProperty('--nav-full-height', '0px');

      requestAnimationFrame(() => {
        this.navWidth = this.elements.nav.offsetWidth - 1;
        this.navHeight = this.elements.nav.offsetHeight - 1;
        this.navFullWidth = this.elements.nav.scrollWidth - 1;
        this.navFullHeight = this.elements.nav.scrollHeight - 1;
      });
    }

    setIsNavMaxWidth() {
      const rect = this.el.getBoundingClientRect();
      const windowWidth = window.innerWidth || document.documentElement.clientWidth;
      Math.abs(rect.width - windowWidth) <= 3
        ? this.el.classList.add('full-width')
        : this.el.classList.remove('full-width');
    }

    addNextAndPrevTabButtonEvents() {
      const handleNextClick = e => {
        e.preventDefault();
        e.stopPropagation();
        this.nextTab();
      };
      const handlePrevClick = e => {
        e.preventDefault();
        e.stopPropagation();
        this.prevTab();
      };

      this.el.querySelectorAll('a[href="#next_tab"]').forEach(btn => {
        btn.setAttribute('href', 'javascript:void(0)');
        btn.addEventListener('click', handleNextClick, { once: true });
        btn.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            handleNextClick(event);
            this.activeTab.button.focus();
          }
        });
      });

      this.el.querySelectorAll('a[href="#prev_tab"]').forEach(btn => {
        btn.setAttribute('href', 'javascript:void(0)');
        btn.addEventListener('click', handlePrevClick, { once: true });
        btn.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            handlePrevClick(event);
            this.activeTab.button.focus();
          }
        });
      });
    }

    pauseAllVideos() {
      const videos = this.el.querySelectorAll('.sqs-block-video');
      videos.forEach(vid => {
        if (vid.$sdlPause && vid.querySelector('video')?.volume > 0 && !vid.querySelector('video')?.muted) {
          vid.$sdlPause();
        }
      });
    }

    nextTab() {
      const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTab.id);
      this.openTab(this.tabs[(currentIndex + 1) % this.tabs.length].id);
    }

    prevTab() {
      const currentIndex = this.tabs.findIndex(tab => tab.id === this.activeTab.id);
      this.openTab(this.tabs[(currentIndex - 1 + this.tabs.length) % this.tabs.length].id);
    }

    openTab(tabId) {
      if (!this.settings || !this.tabs || this.tabs.length === 0) {
        console.warn('sdlTabs instance not fully initialized. Cannot open tab:', tabId);
        return;
      }

      this.runHooks('beforeOpenTab', tabId);
      sdl$?.emitEvent(`${sdlTabs.pluginTitle}:beforeOpenTab`, { tabId, instance: this });

      const activeTab = this.tabs.find(tab => tab.id === tabId);
      if (!activeTab) console.debug('No Tab!');
      this.activeTab = activeTab;

      this.tabs.forEach(tab => {
        if (tab === activeTab) {
          tab.button?.classList.add('active');
          tab.button?.setAttribute('aria-selected', 'true');
          tab.panel.setAttribute('aria-hidden', 'false');
          tab.panel.classList.add('active');
          tab.selectItem?.classList.add('active');
          if (this.elements.selectButtonText) this.elements.selectButtonText.innerText = tab.innerText;
          this.setTabHeights();
        } else {
          tab.active = false;
          tab.button?.classList.remove('active');
          tab.button?.setAttribute('aria-selected', 'false');
          tab.panel.setAttribute('aria-hidden', 'true');
          tab.panel.classList.remove('active');
          tab.selectItem?.classList.remove('active');
        }
      });

      this.updateTabindexValues();

      const shouldUpdateUrl = this.settings.updateUrl && this.settings.setInitialUrl;
      this.settings.setInitialUrl = true;
      this.pauseAllVideos();
      this.scrollTabIntoView();
      this.scrollBackToTop();
      this.setActiveIndicator();
      this.tabsOffset = this.activeTab.panel.offsetLeft;

      if (shouldUpdateUrl) {
        requestAnimationFrame(() => this.setUrlHash(this.activeTab.id));
      }

      const isTabButtonFocused = this.tabs.some(tab => tab.button === document.activeElement);
      if (this.hasLoaded && !isTabButtonFocused) {
        this.activeTab.panel.focus({ preventScroll: true });
      }

      sdl$?.emitEvent(`${sdlTabs.pluginTitle}:afterOpenTab`, { tabId, instance: this });
      this.runHooks('afterOpenTab', tabId);
    }

    focusNextTab() {
      const focusedIndex = this.getFocusedTabIndex();
      if (focusedIndex !== -1) {
        this.tabs[(focusedIndex + 1) % this.tabs.length].button.focus();
        this.updateTabindexValues();
      }
    }

    focusPreviousTab() {
      const focusedIndex = this.getFocusedTabIndex();
      if (focusedIndex !== -1) {
        this.tabs[(focusedIndex - 1 + this.tabs.length) % this.tabs.length].button.focus();
        this.updateTabindexValues();
      }
    }

    getFocusedTabIndex() {
      return this.tabs.findIndex(tab => tab.button === document.activeElement);
    }

    updateTabindexValues() {
      this.tabs.forEach(tab => {
        tab.button?.setAttribute('tabindex', tab === this.activeTab ? '0' : '-1');
      });
    }

    isEventFromNestedTabs(event) {
      const closestTabs = event.target.closest('[data-sdl-plugin="tabs"]');
      return closestTabs && closestTabs !== this.el;
    }

    removeGlobalAnimations() {
      let els = this.el.querySelectorAll('.tabs-header .tab-title');
      const classesToRemove = ['slideIn', 'fadeIn', 'scaleIn', 'flexIn', 'preFade', 'preScale', 'preFlex', 'preSlide'];
      els.forEach(el => {
        el.setAttribute('data-override-initial-global-animation', '');
        el.removeAttribute('data-animation-role');
        el.classList.remove(...classesToRemove);
        el.style.transitionTimingFunction = '';
        el.style.transitionDelay = '';
        el.style.transitionDuration = '';
      });
    }

    addEditModeObserver() {
      const isBackend = window.self !== window.top;
      if (sdlTabs.isEditModeEventListenerSet || !isBackend) return;

      const bodyObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          if (mutation.attributeName === 'class') {
            if (document.body.classList.contains('sqs-edit-mode-active')) {
              sdlTabs.deconstruct();
              bodyObserver.disconnect();
            }
          }
        });
      });

      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
      sdlTabs.isEditModeEventListenerSet = true;
    }

    destroy() {
      if (sdlTabs.originalPositions && sdlTabs.originalPositions.size > 0) {
        this.tabs.forEach(tab => {
          const sections = tab.content.querySelectorAll('.page-section');
          sections.forEach(section => {
            const info = sdlTabs.originalPositions.get(section);
            if (info && info.placeholder && info.placeholder.parentNode) {
              info.placeholder.parentNode.insertBefore(section, info.placeholder);
              info.placeholder.remove();
              section.classList.remove('placeholder');
              sdlTabs.originalPositions.delete(section);
            }
          });
        });
      }
      if (this.source && this.el && this.el.parentNode) {
        this.el.remove();
      }
    }

    runHooks(hookName, ...args) {
      if (!this.settings || !this.settings.hooks) return;
      const hooks = this.settings.hooks[hookName] || [];
      hooks.forEach(callback => {
        if (typeof callback === 'function') callback.apply(this, args);
      });
    }

    handleAnchorLinkClickInTab(clickedLink, e) {
      const href = clickedLink.getAttribute('href');
      if (href && href.startsWith('#')) {
        const targetId = href.substring(1);
        const escapedTargetId = CSS.escape(targetId);
        const targetElement = this.activeTab.panel.querySelector(`#${escapedTargetId}, [name="${escapedTargetId}"]`);
        if (targetElement) {
          e.preventDefault();
          e.stopPropagation();
          const targetRect = targetElement.getBoundingClientRect();
          window.scrollTo({ top: window.scrollY + targetRect.top, behavior: 'smooth' });
        }
      }
    }

    get contentHeight() { return this._contentHeight; }
    set contentHeight(value) { this._contentHeight = value; }

    get navigationType() { return this._navigationType; }
    set navigationType(value) {
      this._navigationType = value;
      this.setNavigationType(value);
    }

    get activeTab() { return this.tabs.find(tab => tab.active); }
    set activeTab(activeTab) {
      this.tabs.forEach(tab => { tab.active = tab === activeTab; });
    }

    get instanceSettings() {
      const dataAttributes = {};
      if (this.el.dataset.desktopNavigationType) {
        this.el.dataset.breakpoints__767__navigationType = this.el.dataset.desktopNavigationType;
      }
      if (this.el.dataset.mobileNavigationType) {
        this.el.dataset.breakpoints__0__navigationType = this.el.dataset.mobileNavigationType;
      }
      const setNestedProperty = (obj, keyPath, value) => {
        const keys = keyPath.split('__');
        let current = obj;
        keys.forEach((key, index) => {
          if (index === keys.length - 1) {
            current[key] = sdl$.parseAttr(value);
          } else {
            current = current[key] = current[key] || {};
          }
        });
      };
      for (let [attrName, value] of Object.entries(this.el.dataset)) {
        setNestedProperty(dataAttributes, attrName, value);
      }
      return dataAttributes;
    }

    get tabsOffset() { return this._overflowTabsOffset; }
    set tabsOffset(offset) {
      requestAnimationFrame(() => {
        this._overflowTabsOffset = offset;
        this.elements.tabsContentWrapper.style.transform = `translateX(${offset * -1}px)`;
      });
    }

    get loadingState() { return this._loadingState; }
    set loadingState(value) { this._loadingState = value; }

    get navWidth() { return this._navWidth; }
    set navWidth(width) {
      this._navWidth = width;
      this.elements.nav.style.setProperty('--nav-scroll-width', this._navWidth + 'px');
    }

    get navFullWidth() { return this._navFullWidth; }
    set navFullWidth(width) {
      this._navFullWidth = width;
      this.elements.nav.style.setProperty('--nav-full-width', this._navFullWidth + 'px');
    }

    get navFullHeight() { return this._navFullHeight; }
    set navFullHeight(height) {
      this._navFullHeight = height;
      this.elements.nav.style.setProperty('--nav-full-height', this._navFullHeight + 'px');
    }

    get navHeight() { return this._navHeight; }
    set navHeight(height) {
      this._navHeight = height;
      this.elements.nav.style.setProperty('--nav-scroll-height', this._navHeight + 'px');
    }

    addGlobalLinkClickListener() {
      document.addEventListener('click', event => {
        const clickedElement = event.target.closest('a');
        if (!clickedElement) return;
        const href = clickedElement.getAttribute('href');
        if (!href) return;
        if (this.el.contains(clickedElement) && this.isEventFromNestedTabs(event)) return;

        const linkUrl = new URL(href, window.location.href);
        const currentUrl = new URL(window.location.href);
        if (linkUrl.pathname === currentUrl.pathname && linkUrl.hash) {
          const tabId = linkUrl.hash.substring(1);
          const matchingTab = this.tabs.find(tab => tab.id === tabId);
          if (matchingTab) {
            event.preventDefault();
            this.scrollToTabsAndOpen(tabId);
          }
        }
      });
    }

    scrollToTabsAndOpen(tabId) {
      this.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => this.openTab(tabId), 500);
    }
  }

  // Auto-initialize all [data-sdl-plugin="tabs"] elements
  (() => {
    function initTabs() {
      const els = document.querySelectorAll('[data-sdl-plugin="tabs"]');
      if (!els.length) return;
      els.forEach(el => {
        const instance = new sdlTabs(el);
        if (instance.settings && instance.tabs !== undefined) {
          el.sdlTabs = instance;
          sdlTabs.instances.push(instance);
        }
      });
    }

    window.sdlTabs = {
      init: () => initTabs(),
      deconstruct: () => sdlTabs.deconstruct(),
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTabs);
    } else {
      initTabs();
    }
    // Re-init on Squarespace AJAX page transitions (mercury). The constructor
    // guards against double-initialisation via el.dataset.loadingState.
    window.addEventListener('mercury:load', initTabs);
  })();

})();
