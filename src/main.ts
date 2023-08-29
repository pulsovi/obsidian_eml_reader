import { Plugin } from 'obsidian';

import Email from './Email';

export default class EmlReader extends Plugin {
  public onload (): void {
    this.registerMarkdownPostProcessor((element, context) => {
      const files = element.querySelectorAll<HTMLSpanElement>('span.internal-embed[src$=".eml"]');
      if (files.length) console.info({ context, element, files });
      files.forEach(file => {
        context.addChild(new Email(file, context, this.app));
      });
    });
  }
}
