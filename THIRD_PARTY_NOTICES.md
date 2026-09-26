# Third-party notices

This application bundles the following software. It is not affiliated with or
endorsed by Sony Interactive Entertainment. "PlayStation", "DualShock" and
"DualSense" are trademarks of their respective owners and are used here only to
describe the controllers the tool works with.

## dualshock-tools (the web interface and calibration logic)

<https://github.com/dualshock-tools/dualshock-tools.github.io> - MIT License.
Developers: the_al, Mathias Malmqvist. Board model detection: Battle Beaver
Customs. Color detection: romek77. Translations by the project's contributors.

```
MIT License

Copyright (c) 2024 the_al

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

A copy of this notice is also shipped inside the app (`web/UPSTREAM-LICENSE.txt`,
`web/UPSTREAM-CREDITS.md`).

## Vendored front-end libraries (copied from npm into `web/vendor/`)

| Package | Version | License |
|---|---|---|
| Bootstrap | 5.3.3 | MIT |
| jQuery | 3.7.1 | MIT |
| Font Awesome Free | 6.6.0 | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT |

License headers are preserved in the bundled CSS/JS files.

## Runtime

Electron (MIT) and Chromium. Their licenses are included in the installers as
`LICENSE.electron.txt` and `LICENSES.chromium.html`.
