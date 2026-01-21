import { Plugin } from 'obsidian';

import Email from './Email';
import { createEmlLivePreviewExtension, clearEmailCache } from './LivePreviewExtension';

export default class EmlReader extends Plugin {
  public onload (): void {
    // Register the Live Preview extension for editing mode
    this.registerEditorExtension(createEmlLivePreviewExtension(this.app));

    // Register the markdown post processor for Reading View
    this.registerMarkdownPostProcessor((element, context) => {
      const files = element.querySelectorAll<HTMLSpanElement>('span.internal-embed[src$=".eml"]');
      files.forEach(file => {
        context.addChild(new Email(file, context, this.app));
      });
    });

    // Clear cache when files change to ensure fresh content
    this.registerEvent(
      this.app.vault.on('modify', file => {
        if (file.path.endsWith('.eml')) {
          clearEmailCache();
        }
      })
    );
  }
}
