import {
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';
import type { App, TFile } from 'obsidian';
import { Platform } from 'obsidian';
import PostalMime from 'postal-mime';
import type { Email as ParsedMail } from 'postal-mime';
import { encode as textToBase64 } from 'js-base64';
import { Converter as MdConverter } from 'showdown';

import { addressToHtml } from './util/html/email';
import { textToHtml } from './util/html/escape';

/** Cache for parsed emails to avoid re-parsing */
const emailCache = new Map<string, HTMLElement>();

/** Track which elements we've already processed */
const processedEmbeds = new WeakSet<HTMLElement>();

/** Unique ID counter for iframe size detection */
let embedCounter = 0;

type Size = Record<'height' | 'width', string>;

/**
 * ViewPlugin that watches for Obsidian's embed elements and replaces .eml ones with rendered emails
 * This works WITH Obsidian's embed system instead of fighting against it
 */
class EmlLivePreviewPlugin implements PluginValue {
  private readonly app: App;
  private readonly view: EditorView;
  private observer: MutationObserver | null = null;

  constructor(view: EditorView, app: App) {
    this.app = app;
    this.view = view;

    // Process any existing embeds
    this.processEmlEmbeds();

    // Watch for new embeds being added to the DOM
    this.setupObserver();
  }

  update(update: ViewUpdate): void {
    // Reprocess when document or viewport changes
    if (update.docChanged || update.viewportChanged) {
      // Use setTimeout to let Obsidian finish rendering first
      setTimeout(() => this.processEmlEmbeds(), 50);
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private setupObserver(): void {
    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        // Debounce processing
        setTimeout(() => this.processEmlEmbeds(), 10);
      }
    });

    this.observer.observe(this.view.dom, {
      childList: true,
      subtree: true,
    });
  }

  private processEmlEmbeds(): void {
    // Find all internal embeds for .eml files in the editor
    // In Live Preview, Obsidian creates: <div class="internal-embed file-embed mod-generic is-loaded" src="file.eml">
    const selectors = [
      'div.internal-embed.file-embed[src$=".eml"]',
      'div.internal-embed[src$=".eml"]',
    ];

    const embeds = this.view.dom.querySelectorAll<HTMLDivElement>(selectors.join(', '));

    embeds.forEach(embed => {
      // Skip if we've already processed this element
      if (processedEmbeds.has(embed)) {
        return;
      }

      const src = embed.getAttribute('src');

      if (!src || !src.toLowerCase().endsWith('.eml')) {
        return;
      }

      // Mark as processed
      processedEmbeds.add(embed);

      // Get dimensions from alt attribute if present
      const alt = embed.getAttribute('alt') || '';
      const size = this.parseSize(alt);

      // Render the email
      this.renderEmail(embed, src, size);
    });
  }

  private async renderEmail(embed: HTMLSpanElement, linkPath: string, size: Size): Promise<void> {
    // Resolve the file path
    const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, '');
    if (!file) {
      return; // File not found, let Obsidian handle it
    }

    const cacheKey = `${file.path}|${size.width}|${size.height}`;

    // Check cache first
    if (emailCache.has(cacheKey)) {
      const cached = emailCache.get(cacheKey)!;
      this.replaceWithEmail(embed, cached.cloneNode(true) as HTMLElement, file as TFile);
      return;
    }

    try {
      const content = await this.app.vault.cachedRead(file as TFile);
      const result = await new PostalMime().parse(content);

      // Create email content
      const emailEl = document.createElement('div');
      emailEl.className = 'embed-eml';

      // Stop click events from bubbling up to Obsidian's embed click handler
      // This prevents the email body from triggering the "open file" action
      emailEl.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      this.addHeaders(emailEl, result);
      this.addContent(emailEl, result, size);

      // Cache it
      emailCache.set(cacheKey, emailEl.cloneNode(true) as HTMLElement);

      // Replace the embed with our rendered email
      this.replaceWithEmail(embed, emailEl, file as TFile);
    }
    catch (error) {
      console.error('Failed to render email:', error);
    }
  }

  private replaceWithEmail(embed: HTMLElement, emailEl: HTMLElement, file?: TFile): void {
    // Clear the embed's contents
    embed.empty();

    // Ensure click events don't bubble up from the email content
    emailEl.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Add our email content
    embed.appendChild(emailEl);

    embed.classList.add('eml-processed');
  }

  /** Add email headers */
  private addHeaders(container: HTMLElement, mail: ParsedMail): void {
    const headers = ['from', 'date', 'to', 'subject'] as const;
    const headerEl = document.createElement('div');
    headerEl.className = 'eml-header';

    headers.forEach(key => {
      const row = document.createElement('div');
      row.className = `eml-header-row eml-header-row-${key}`;

      const label = document.createElement('span');
      label.className = `eml-head-label eml-head-label-${key}`;
      label.textContent = key;
      row.appendChild(label);

      const valueEl = document.createElement('span');
      valueEl.className = `eml-head-value eml-head-value-${key}`;

      const header = mail[key];

      if (typeof header === 'string') {
        if (key === 'date') valueEl.textContent = new Date(header).toLocaleString();
        else valueEl.textContent = header;
      }
      else if (header) valueEl.innerHTML = addressToHtml(header);

      row.appendChild(valueEl);
      headerEl.appendChild(row);
    });

    container.appendChild(headerEl);
  }

  /** Add email content */
  private addContent(container: HTMLElement, mail: ParsedMail, size: Size): void {
    if (!EmlLivePreviewPlugin.hasContent(mail)) {
      this.addVoidContent(container);
    }
    else if (Platform.isMobileApp || !EmlLivePreviewPlugin.hasHtml(mail)) {
      this.addMarkdownContent(container, mail, size);
    }
    else {
      this.addIframeContent(container, mail, size);
    }
  }

  private static hasContent(
    val: ParsedMail
  ): val is ParsedMail & ({ html: string } | { text: string }) {
    return Boolean(val.html ?? val.text);
  }

  private static hasHtml(val: ParsedMail): val is ParsedMail & { html: string } {
    return Boolean(val.html);
  }

  private addVoidContent(container: HTMLElement): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'eml-content eml-content-error';
    errorDiv.textContent = 'unable to parse the mail file';
    container.appendChild(errorDiv);
  }

  private addMarkdownContent(
    container: HTMLElement,
    mail: ParsedMail & ({ html: string } | { text: string }),
    size: Size
  ): void {
    let html = '';
    if (EmlLivePreviewPlugin.hasHtml(mail)) {
      const converter = new MdConverter();
      const cleanMail = mail.html.replace(/(<\/?)(?:table|tr|th|td|thead|tbody)/gu, '$1div');
      const markdown = converter.makeMarkdown(cleanMail);
      html = converter.makeHtml(markdown);
    }
    else {
      html = textToHtml(mail.text);
    }

    const content = document.createElement('div');
    content.className = 'eml-content mobile-eml-content';
    content.innerHTML = html;

    if (size.height !== 'auto') content.style.height = size.height;
    if (size.width !== 'auto') content.style.width = size.width;

    container.appendChild(content);
  }

  private addIframeContent(
    container: HTMLElement,
    mail: ParsedMail & { html: string },
    size: Size
  ): void {
    const { height, width } = size;
    const isAutoDetect = height === 'auto' || width === 'auto';
    const iframe = document.createElement('iframe');
    iframe.className = 'eml-content';

    if (isAutoDetect) {
      this.addSizeDetection(iframe, mail.html, size);
    } else {
      iframe.src = `data:text/html;base64,${textToBase64(mail.html)}`;
    }

    if (height !== 'auto') iframe.style.height = height;
    if (width !== 'auto') iframe.style.width = width;

    container.appendChild(iframe);
  }

  /** Add script which sends size of the content to the top window */
  private addSizeDetection(iframe: HTMLIFrameElement, html: string, size: Size): void {
    const id = `eml-live-${++embedCounter}`;
    const iframeSrc = html.replace('</head>', `
      <script>
      ;(function IIFE () {
        if (document.readyState === "complete") init();
        else document.addEventListener("DOMContentLoaded", init);

        function init () {
          window.top.postMessage({
            type: 'iframe size',
            id: '${id}',
            height: document.body.scrollHeight,
            width: document.body.scrollWidth,
          }, '*');
        }
      })();
      </script>
      </head>
    `).replace('<body', `<body style="color:${getComputedStyle(document.body).color}"`);

    window.addEventListener('message', event => {
      const data = event.data as unknown;
      if (!this.isIframeSizeMessage(data) || data.id !== id) return;
      if (size.height === 'auto' && typeof data.height === 'number')
        iframe.style.height = `${data.height}px`;
      if (size.width === 'auto' && typeof data.width === 'number')
        iframe.style.width = `${data.width}px`;
    });

    iframe.src = `data:text/html;base64,${textToBase64(iframeSrc)}`;
  }

  /** Type guard for iframe size message */
  private isIframeSizeMessage(data: unknown): data is {
    type: string;
    id: string;
    height?: number;
    width?: number;
  } {
    return typeof data === 'object' && data !== null &&
           'type' in data && (data as { type: unknown }).type === 'iframe size' &&
           'id' in data;
  }

  /** Parse dimensions from alt text like "640x480" or just "100" */
  private parseSize(alt: string): Size {
    // Extract dimensions from the end of alt text (after the filename)
    const sizeMatch = alt.match(/\|(\d+(?:px|em|vh)?)(?:x(\d+(?:px|em|vw)?))?$/);

    if (!sizeMatch) {
      return { height: 'auto', width: 'auto' };
    }

    const [, first, second] = sizeMatch;
    const height = second ?? first;
    const width = second ? first : 'auto';

    return {
      height: /^\d+$/.test(height) ? `${height}px` : height,
      width: /^\d+$/.test(width) ? `${width}px` : width,
    };
  }
}

/**
 * Create the Live Preview extension for EML files
 */
export function createEmlLivePreviewExtension(app: App): ViewPlugin<EmlLivePreviewPlugin> {
  return ViewPlugin.define(
    view => new EmlLivePreviewPlugin(view, app)
  );
}

/**
 * Clear the email cache (useful when files change)
 */
export function clearEmailCache(): void {
  emailCache.clear();
}
