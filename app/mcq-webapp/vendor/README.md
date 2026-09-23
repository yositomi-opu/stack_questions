# Bundled libraries

- `mathjax-tex-svg-3.2.2.js`: MathJax 3.2.2, `es5/tex-svg.js`, obtained from the published `mathjax@3.2.2` npm package via jsDelivr. See [MathJax](https://github.com/mathjax/MathJax/tree/3.2.2) and [Apache 2.0 license](MathJax-LICENSE.txt). Loaded only when a question preview is opened.
- `mathjax-boldsymbol-3.2.2.js`: MathJax 3.2.2, `es5/input/tex/extensions/boldsymbol.js`, from the same npm package via jsDelivr. The preview and CASText viewer load this local extension explicitly to render `\boldsymbol` without fetching a missing extension path. Covered by the same Apache 2.0 license.
- `xlsx.full.min.js`: Existing spreadsheet import library.
