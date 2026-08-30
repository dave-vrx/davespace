# VRSpace

Open, cross-platform WebXR social worlds hosted on GitHub Pages. VRSpace uses Three.js/WebXR for rendering and Trystero/WebRTC for encrypted peer-to-peer presence, avatar pose synchronization, room chat, and voice.

## Unity world exporter contract

Native Unity AssetBundles cannot execute in a browser. A future Unity editor plugin should export a web-compatible `world.json` plus glTF/GLB assets:

```json
{"format":"vrspace-world","version":1,"id":"my-world","name":"My World","scene":"scene.glb","spawn":[0,1.7,0],"assets":[]}
```

The stable TypeScript contract and loader live in `src/world-package.ts`. Exported packages can be committed to GitHub and served with the platform without converting the app to Unity WebGL.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
