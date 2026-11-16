import { defineConfig } from 'vitepress';
import type { Connect } from 'vite';

/** `/api/` is the VitePress route, which 404s. The TypeDoc site is the file. */
function redirectApiIndex(): Connect.NextHandleFunction {
  return (req, res, next) => {
    const path = req.url?.split('?')[0];
    if (path === '/api' || path === '/api/') {
      res.statusCode = 302;
      res.setHeader('Location', '/api/index.html');
      res.end();
      return;
    }
    next();
  };
}

export default defineConfig({
  title: 'Wander canvas',
  description: 'Document model, tools, input, and renderer.',
  vite: {
    plugins: [
      {
        name: 'typedoc-api-index',
        configureServer(server) {
          server.middlewares.use(redirectApiIndex());
        },
        configurePreviewServer(server) {
          server.middlewares.use(redirectApiIndex());
        },
      },
    ],
  },
  themeConfig: {
    nav: [
      { text: 'Guides', link: '/guides/packages' },
      { text: 'API', link: '/api/index.html', target: '_self' },
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
