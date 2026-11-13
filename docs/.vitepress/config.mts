import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Wander canvas',
  description: 'Document model, tools, input, and renderer.',
  themeConfig: {
    nav: [
      { text: 'Guides', link: '/guides/packages' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: [
      {
        text: 'Guides',
        items: [
          { text: 'Packages and imports', link: '/guides/packages' },
          { text: 'Engine', link: '/guides/engine' },
          { text: 'Document model', link: '/guides/document' },
          { text: 'Commands and history', link: '/guides/commands' },
          { text: 'Tools and brushes', link: '/guides/tools' },
          { text: 'Input', link: '/guides/input' },
          { text: 'Rendering', link: '/guides/rendering' },
          { text: 'Save, load, and PDF', link: '/guides/files' },
        ],
      },
    ],
  },
});
