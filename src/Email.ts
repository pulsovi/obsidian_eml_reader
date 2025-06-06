import { encode as textToBase64 } from 'js-base64';
import { nanoid } from 'nanoid';
import { MarkdownRenderChild, Platform } from 'obsidian';
import type { App, MarkdownPostProcessorContext, TFile } from 'obsidian';
import PostalMime from 'postal-mime';
import type { Email as ParsedMail } from 'postal-mime';
import { Converter as MdConverter } from 'showdown';

import { addressToHtml } from './util/html/email';
import { textToHtml } from './util/html/escape';
import { isObject } from './util/types/object';

type Size = Record<'height' | 'width', string>;

export default class Email extends MarkdownRenderChild {
  /* eslint-disable @typescript-eslint/indent */
  public readonly app: App;
  public readonly file: TFile | null;

  private readonly id = nanoid();

  public constructor (elem: HTMLSpanElement, context: MarkdownPostProcessorContext, app: App) {
    super(elem);
    this.app = app;
    const link = this.containerEl.getAttr('src');
    if (link) this.file = app.metadataCache.getFirstLinkpathDest(link, context.sourcePath);
  }

  /**
   * Handle load event. Process the mail file and display it
   */
  public async onload (): Promise<void> {
    if (!this.file) return;
    const content = await this.app.vault.cachedRead(this.file);
    const result = await new PostalMime().parse(content);

    const emailEl = this.containerEl.createDiv({ cls: 'embed-eml' });
    this.containerEl.replaceWith(emailEl);
    emailEl.appendChild(this.containerEl);

    this.addHeaders(emailEl, result);
    this.addContent(emailEl, result);
  }

  /** Add email headers */
  private addHeaders (container: HTMLDivElement, mail: ParsedMail): void {
    const headers = ['from', 'date', 'to', 'subject'] as const;
    const headerEl = container.createEl('div', { cls: 'eml-header' });

    headers.forEach(key => {
      const row = headerEl.createDiv({ cls: `eml-header-row eml-header-row-${key}` });
      row.createSpan({ cls: `eml-head-label eml-head-label-${key}`, text: key });

      const valueEl = row.createSpan({ cls: `eml-head-value eml-head-value-${key}` });
      const header = mail[key];

      if (typeof header === 'string') {
        if (key === 'date') valueEl.setText(new Date(header).toLocaleString());
        else valueEl.setText(header);
      }
      else if (header) valueEl.innerHTML = addressToHtml(header);
    });
  }

  /** Add email content */
  private addContent (container: HTMLDivElement, mail: ParsedMail): void {
    if (!Email.hasContent(mail)) this.addVoidContent(container);
    else if (Platform.isMobileApp || !Email.hasHtml(mail)) this.addMarkdownContent(container, mail);
    else this.addIframeContent(container, mail);
  }

    private static hasContent (
      val: ParsedMail
    ): val is ParsedMail & ({ html: string } | { text: string }) {
      return Boolean(val.html ?? val.text);
    }

    private static hasHtml (val: ParsedMail): val is ParsedMail & { html: string } {
      return Boolean(val.html);
    }

    /** Add message "unable to parse the mail" at place of mail content */
    private addVoidContent (container: HTMLDivElement): void {
      container.createDiv({
        cls: 'eml-content eml-content-error',
        text: 'unable to parse the mail file',
      });
      container.appendChild(this.containerEl);
    }

    /** Add email content without format in div */
    private addMarkdownContent (
      container: HTMLDivElement, mail: ParsedMail & ({ html: string } | { text: string })
    ): void {
      const size = this.parseSize();
      let html = '';
      if (Email.hasHtml(mail)) {
        const converter = new MdConverter();
        const cleanMail = mail.html.replace(/(<\/?)(?:table|tr|th|td|thead|tbody)/gu, '$1div');
        const markdown = converter.makeMarkdown(cleanMail);
        html = converter.makeHtml(markdown);
      }
      else html = textToHtml(mail.text);
      const content = container.createDiv({ cls: 'eml-content mobile-eml-content' });

      content.innerHTML = html;
      Object.assign(content.style, size);
    }

    /** Add email content in IFrame */
    private addIframeContent (container: HTMLDivElement, mail: ParsedMail & { html: string }): void {
      const size = this.parseSize();
      const { height, width } = size;
      const isAutoDetect = height === 'auto' || width === 'auto';
      const iframe = container.createEl('iframe', { cls: 'eml-content' });

      if (isAutoDetect) this.addSizeDetection(iframe, mail.html, size);
      else iframe.setAttr('src', `data:text/html;base64,${textToBase64(mail.html)}`);

      if (height !== 'auto') iframe.style.height = height;
      if (width !== 'auto') iframe.style.width = width;
    }

    /** Add script which send size of the content to the top window */
    private addSizeDetection (iframe: HTMLIFrameElement, html: string, size: Size): void {
      const iframeSrc = html.replace('</head>', `
        <script>
        ;(function IIFE () {
          if (document.readyState === "complete") init();
          else document.addEventListener("DOMContentLoaded", init);

          function init () {
            window.top.postMessage({
              type: 'iframe size',
              id: '${this.id}',
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
        if (!isObject(data) || data.type !== 'iframe size' || data.id !== this.id) return;
        if (size.height === 'auto' && typeof data.height === 'number')
          iframe.style.height = `${data.height}px`;
        if (size.width === 'auto' && typeof data.width === 'number')
          iframe.style.width = `${data.width}px`;
      });

      iframe.setAttr('src', `data:text/html;base64,${textToBase64(iframeSrc)}`);
    }

      /** Parse custom size of the content iframe */
      private parseSize (): Size {
        const sizeRE = /^(?<first>\d+(?:px|em|vh)?)(?:x(?<second>\d+(?:px|em|vw)?))?$/u;
        const alt = this.containerEl.getAttr('alt') ?? '';
        const match = sizeRE.exec(alt);
        const pair = match?.groups ?? {
          first: this.containerEl.getAttr('width') ?? 'auto',
          second: this.containerEl.getAttr('height'),
        };
        const { first, second } = pair;
        const height = second ?? first;
        const width = second ? first : 'auto';
        const size = {
          height: (/^\d+$/u).test(height) ? `${height}px` : height,
          width: (/^\d+$/u).test(width) ? `${width}px` : width,
        };
        return size;
      }
}
