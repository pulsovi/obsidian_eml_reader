# Email Reader

This Obsidian plugin allows you to preview in your note the content of a `*.eml` file as like as you con preview image with `*.png` or `*.jpg` file.

## Use cases

In my daily use of Obsidian, I sometimes need to insert information from an email.

I download the email in `*.eml` format and insert it into the note like an image.
When I switch to Preview mode, the file is transformed into a button which contains the name of the file `*.eml`, if I click on the button, the file opens on my default email reader app, this which is very upsetting, you will agree.

With this plugin the Obsidian Preview mode is able to directly display the content of the email as for an image.

## Usage

Just import the `*.eml` file [the same way you would an image](https://help.obsidian.md/Linking+notes+and+files/Embedding+file).

You can define the dimensions of the frame that will contain the email, again like for an image, by adding `|640x480` to the link destination, where 640 is the width and 480 is the height.

```md
![[last-news.eml|640x480]]
```

If you only specify one dimension, it will be used as the frame height. For example, `![[last-news.eml|100]].`

Each no specified dimension will be autodetected.

## Alternatives

### Emails

Allows you to import a `*.eml` file and transform it into markdown according to a customizable template and insert it into current note.

You can improve the result with the plugin [Email Block](obsidian://show-plugin?id=email-block-plugin)

The advantage is that the content of the email appears directly in your note and is therefore searchable in the global Obsidian search.

The downside is the same : _the content of the email appears directly in your note_.
Depending on this content, you can consider it as pollution or data lose. 
Either because you are not the author and want only _your_ words in your vault, or the email content is too big, or because you want to keep the exact traceability that the `*.eml` file provides but not the markdown.

You can get it at [github](https://github.com/SkepticMystic/email-templates)

### Obsidian Code Previews

Retrieves the contents of a text-like file and displays it in code block.

With this plugin, you can display a tiny portion of the `*.eml` file that contains the desired text with this code:

````
```preview
path: ../attachments/last-news.eml
start: number of the start line of the text
end: end line number of the text
```
````

But the rendering of non-[[ASCII]] characters sucks...

You can get it at [github](https://github.com/zjhcn/obsidian-code-preview)
Or in [Obsidian plugins catalog](obsidian://show-plugin?id=obsidian-code-preview)
